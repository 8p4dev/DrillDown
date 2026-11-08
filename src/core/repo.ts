// 트리 저장소 — 공유 계약 §4.2. 쓰기 함수는 같은 트랜잭션에서 outbox 를 남긴다(04 §3.1 쓰기 훅 표, db.track)
import { api, type SharedTree } from './api'
import { db, newId, track, type OutboxRow } from './db'
import { flush } from './sync'
import type { ID, Tree, TreeNode, Visibility } from './types'

/** 쓰기 훅 트랜잭션에 들어가는 테이블 */
const W = () => [db.trees, db.nodes, db.outbox, db.meta]
type Row = Omit<OutboxRow, 'seq' | 'at'>
const treeRow = (id: ID, op: Row['op'] = 'put'): Row => ({ kind: 'tree', id, treeId: id, op })
const nodeRow = (n: Pick<TreeNode, 'id' | 'treeId'>, op: Row['op'] = 'put'): Row => ({ kind: 'node', id: n.id, treeId: n.treeId, op })

export async function createTree(title: string): Promise<Tree> {
  const now = Date.now()
  const tree: Tree = { id: newId(), title, createdAt: now, updatedAt: now }
  const root: TreeNode = { id: newId(), treeId: tree.id, parentId: null, order: 0, title, aliases: [], updatedAt: now }
  await db.transaction('rw', W(), async () => {
    await db.trees.add(tree)
    await db.nodes.add(root)
    await track([treeRow(tree.id), nodeRow(root)])
  })
  return tree
}

export async function renameTree(treeId: ID, title: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', W(), async () => {
    await db.trees.update(treeId, { title, updatedAt: now })
    // parentId null 은 IndexedDB 인덱스에 안 잡힌다 → treeId 로 읽어 직접 찾는다
    const root = (await db.nodes.where('treeId').equals(treeId).toArray()).find((n) => n.parentId === null)
    if (root) await db.nodes.update(root.id, { title, updatedAt: now })
    await track(root ? [treeRow(treeId), nodeRow(root)] : [treeRow(treeId)])
  })
}

/** 하드 삭제(트리·노드·학습 기록), outbox 없음. 화면은 markTreeDeleted → purgeDeletedTrees 경로를 쓴다 (04 §3.10) */
export async function deleteTree(treeId: ID): Promise<void> {
  await db.transaction('rw', [db.trees, db.nodes, db.srs, db.attempts], async () => {
    await db.trees.delete(treeId)
    await db.nodes.where('treeId').equals(treeId).delete()
    await db.srs.where('treeId').equals(treeId).delete()
    await db.attempts.where('treeId').equals(treeId).delete()
  })
}

/** 소프트 삭제: 목록에서 숨기고 휴지통에 7일 보존 (04 §3.10, 02 D9, P0 C2). outbox 는 tree del 1행만 */
export function markTreeDeleted(treeId: ID): Promise<number> {
  return db.transaction('rw', W(), async () => {
    const n = await db.trees.update(treeId, { deletedAt: Date.now() })
    if (n) await track([treeRow(treeId, 'del')])
    return n
  })
}
/** 되돌리기. updatedAt 을 올려 이미 올라간 톰스톤보다 나중 쓰기가 되게 한다(LWW) */
export function restoreTree(treeId: ID): Promise<number> {
  return db.transaction('rw', W(), async () => {
    const n = await db.trees.update(treeId, { deletedAt: undefined, updatedAt: Date.now() })
    if (n) await track([treeRow(treeId)])
    return n
  })
}
/** 휴지통 보존 기간(C2). 이보다 오래 전에 지운 트리만 하드 삭제된다 */
export const TRASH_MS = 7 * 86_400_000
/** 앱 시작 때 호출: deletedAt 이 7일보다 오래된 트리만 하드 삭제 */
export async function purgeDeletedTrees(now = Date.now()): Promise<void> {
  const victims = (await db.trees.toArray()).filter((t) => t.deletedAt && t.deletedAt < now - TRASH_MS)
  for (const t of victims) await deleteTree(t.id)
}

/** 소프트 삭제된 트리는 제외 */
export async function listTrees(): Promise<Tree[]> {
  return (await db.trees.orderBy('updatedAt').reverse().toArray()).filter((t) => !t.deletedAt)
}

export function getTreeNodes(treeId: ID): Promise<TreeNode[]> {
  return db.nodes.where('treeId').equals(treeId).toArray()
}

export function getRoot(nodes: TreeNode[]): TreeNode {
  const root = nodes.find((n) => n.parentId === null)
  if (!root) throw new Error('root node missing')
  return root
}

export function childrenOf(nodes: TreeNode[], parentId: ID): TreeNode[] {
  // (order, id) 안정 정렬 — 기기 간 동기화 뒤에도 같은 순서 (04 §5(b))
  return nodes.filter((n) => n.parentId === parentId).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
}

/** rootId 제외, 전위 순회 */
export function descendantsOf(nodes: TreeNode[], rootId: ID): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (id: ID) => {
    for (const c of childrenOf(nodes, id)) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(rootId)
  return out
}

/** upsert + tree.updatedAt 갱신. 루트 title 이 들어오면 tree.title 도 맞춘다 */
export async function putNodes(nodes: TreeNode[]): Promise<void> {
  if (!nodes.length) return
  const now = Date.now()
  await db.transaction('rw', W(), async () => {
    await db.nodes.bulkPut(nodes)
    const treeIds = [...new Set(nodes.map((n) => n.treeId))]
    for (const treeId of treeIds) {
      const root = nodes.find((n) => n.treeId === treeId && n.parentId === null)
      await db.trees.update(treeId, root ? { updatedAt: now, title: root.title } : { updatedAt: now })
    }
    await track([...nodes.map((n) => nodeRow(n)), ...treeIds.map((id) => treeRow(id))])
  })
}

/** 노드와 해당 srs 를 함께 지운다 (하위 노드는 호출자가 ids 에 포함) */
export async function deleteNodes(ids: ID[]): Promise<void> {
  if (!ids.length) return
  const now = Date.now()
  await db.transaction('rw', [...W(), db.srs], async () => {
    const found = (await db.nodes.bulkGet(ids)).filter((n) => !!n)
    await db.nodes.bulkDelete(ids)
    await db.srs.bulkDelete(ids)
    const treeIds = [...new Set(found.map((n) => n.treeId))]
    for (const treeId of treeIds) await db.trees.update(treeId, { updatedAt: now })
    // node del × n (srs 는 서버 cascade), tree put
    await track([...found.map((n) => nodeRow(n, 'del')), ...treeIds.map((id) => treeRow(id))])
  })
}

export async function addAlias(nodeId: ID, alias: string): Promise<void> {
  const a = alias.trim()
  if (!a) return
  const n = await db.nodes.get(nodeId)
  if (!n || n.aliases.includes(a)) return
  await putNodes([{ ...n, aliases: [...n.aliases, a], updatedAt: Date.now() }])
}

// ── 공유·복제 (04 §3.3·§3.4.3) ─────────────────────────────

/** 공유 트리를 내 로컬 트리로 복제: 새 id·노드 id 재발급·parentId 매핑, private, slug 없음, SRS 비움. 로그인이면 outbox 가 올린다 */
export async function copyTree(shared: SharedTree): Promise<Tree> {
  const now = Date.now()
  const tree: Tree = { id: newId(), title: shared.title, createdAt: now, updatedAt: now, visibility: 'private', slug: null, sourceTreeId: shared.id }
  const idMap = new Map(shared.nodes.map((n) => [n.id, newId()]))
  const nodes: TreeNode[] = shared.nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, treeId: tree.id, parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null, updatedAt: now }))
  await db.transaction('rw', W(), async () => {
    await db.trees.add(tree)
    await db.nodes.bulkAdd(nodes)
    await track([treeRow(tree.id), ...nodes.map((n) => nodeRow(n))])
  })
  return tree
}

/** 공개 범위 전이(04 §3.3) — 서버가 진실. 트리가 아직 서버에 없을 수 있어 먼저 push 를 끝낸다. 오프라인이면 ApiError(0) */
export async function setVisibility(treeId: ID, v: Visibility): Promise<Tree> {
  await flush()
  const r = await api<{ visibility: Visibility; slug: string | null }>(`/api/trees/${treeId}/visibility`, { method: 'PUT', body: { visibility: v } })
  return patchLocal(treeId, { visibility: r.visibility, slug: r.slug })
}

/** 링크 재발급: 새 slug, 옛 링크는 즉시 무효 */
export async function reissueSlug(treeId: ID): Promise<Tree> {
  await flush()
  const r = await api<{ slug: string }>(`/api/trees/${treeId}/slug`, { method: 'POST' })
  return patchLocal(treeId, { slug: r.slug })
}

/** 서버 응답을 로컬에 반영(outbox 없음 — 서버 값이 진실) */
async function patchLocal(treeId: ID, patch: Partial<Tree>): Promise<Tree> {
  await db.trees.update(treeId, patch)
  const t = await db.trees.get(treeId)
  if (!t) throw new Error('tree missing')
  return t
}
