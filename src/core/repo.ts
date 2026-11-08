// 트리 저장소 — 공유 계약 §4.2 (에이전트 A 소유)
import type { SharedTree } from './api'
import { db, newId } from './db'
import { bump } from './mock/sync'
import { mockIssueSlug } from './mock/shared'
import type { ID, Tree, TreeNode, Visibility } from './types'

export async function createTree(title: string): Promise<Tree> {
  const now = Date.now()
  const tree: Tree = { id: newId(), title, createdAt: now, updatedAt: now }
  const root: TreeNode = { id: newId(), treeId: tree.id, parentId: null, order: 0, title, aliases: [], updatedAt: now }
  await db.transaction('rw', db.trees, db.nodes, async () => {
    await db.trees.add(tree)
    await db.nodes.add(root)
  })
  bump()
  return tree
}

export async function renameTree(treeId: ID, title: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.trees, db.nodes, async () => {
    await db.trees.update(treeId, { title, updatedAt: now })
    // parentId null 은 IndexedDB 인덱스에 안 잡힌다 → treeId 로 읽어 직접 찾는다
    const root = (await db.nodes.where('treeId').equals(treeId).toArray()).find((n) => n.parentId === null)
    if (root) await db.nodes.update(root.id, { title, updatedAt: now })
  })
  bump()
}

/** 하드 삭제(트리·노드·학습 기록). 화면은 markTreeDeleted → purgeDeletedTrees 경로를 쓴다 (04 §3.10) */
export async function deleteTree(treeId: ID): Promise<void> {
  await db.transaction('rw', [db.trees, db.nodes, db.srs, db.attempts], async () => {
    await db.trees.delete(treeId)
    await db.nodes.where('treeId').equals(treeId).delete()
    await db.srs.where('treeId').equals(treeId).delete()
    await db.attempts.where('treeId').equals(treeId).delete()
  })
}

/** 소프트 삭제: 목록에서 숨기고 되돌리기 토스트(10초) 동안 보존 (04 §3.10, 02 D9) */
export async function markTreeDeleted(treeId: ID): Promise<number> {
  const n = await db.trees.update(treeId, { deletedAt: Date.now() })
  bump()
  return n
}
/** 되돌리기 */
export async function restoreTree(treeId: ID): Promise<number> {
  const n = await db.trees.update(treeId, { deletedAt: undefined })
  bump()
  return n
}
/** 토스트 종료·앱 시작 때 호출: deletedAt 이 있는 트리를 하드 삭제. treeId 를 주면 그 트리만 */
export async function purgeDeletedTrees(treeId?: ID): Promise<void> {
  const victims = (await db.trees.toArray()).filter((t) => t.deletedAt && (!treeId || t.id === treeId))
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
  await db.transaction('rw', db.trees, db.nodes, async () => {
    await db.nodes.bulkPut(nodes)
    for (const treeId of new Set(nodes.map((n) => n.treeId))) {
      const root = nodes.find((n) => n.treeId === treeId && n.parentId === null)
      await db.trees.update(treeId, root ? { updatedAt: now, title: root.title } : { updatedAt: now })
    }
  })
  bump()
}

/** 노드와 해당 srs 를 함께 지운다 (하위 노드는 호출자가 ids 에 포함) */
export async function deleteNodes(ids: ID[]): Promise<void> {
  if (!ids.length) return
  const now = Date.now()
  await db.transaction('rw', [db.trees, db.nodes, db.srs], async () => {
    const found = await db.nodes.bulkGet(ids)
    await db.nodes.bulkDelete(ids)
    await db.srs.bulkDelete(ids)
    for (const treeId of new Set(found.flatMap((n) => (n ? [n.treeId] : [])))) {
      await db.trees.update(treeId, { updatedAt: now })
    }
  })
  bump()
}

export async function addAlias(nodeId: ID, alias: string): Promise<void> {
  const a = alias.trim()
  if (!a) return
  const n = await db.nodes.get(nodeId)
  if (!n || n.aliases.includes(a)) return
  await putNodes([{ ...n, aliases: [...n.aliases, a], updatedAt: Date.now() }])
}

// ── 공유·복제 (04 §3.3·§3.4.3) ─────────────────────────────

/** 공유 트리를 내 로컬 트리로 복제: 새 id·노드 id 재발급·parentId 매핑, private, slug 없음, SRS 비움 */
export async function copyTree(shared: SharedTree): Promise<Tree> {
  const now = Date.now()
  const tree: Tree = { id: newId(), title: shared.title, createdAt: now, updatedAt: now, visibility: 'private', slug: null, sourceTreeId: shared.slug }
  const idMap = new Map(shared.nodes.map((n) => [n.id, newId()]))
  const nodes: TreeNode[] = shared.nodes.map((n) => ({ ...n, id: idMap.get(n.id)!, treeId: tree.id, parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null, updatedAt: now }))
  await db.transaction('rw', db.trees, db.nodes, async () => {
    await db.trees.add(tree)
    await db.nodes.bulkAdd(nodes)
  })
  bump()
  return tree
}

/** 공개 범위 전이(04 §3.3 전이표): unlisted/public 으로 가면 slug 없을 때 발급, private 으로 가면 회수 */
export async function setVisibility(treeId: ID, v: Visibility): Promise<Tree> {
  const t = await db.trees.get(treeId)
  if (!t) throw new Error('tree missing')
  const slug = v === 'private' ? null : (t.slug ?? mockIssueSlug())
  await db.trees.update(treeId, { visibility: v, slug })
  bump()
  return { ...t, visibility: v, slug }
}

/** 링크 재발급: 새 slug, 옛 링크는 즉시 무효 */
export async function reissueSlug(treeId: ID): Promise<Tree> {
  const t = await db.trees.get(treeId)
  if (!t) throw new Error('tree missing')
  const slug = mockIssueSlug()
  await db.trees.update(treeId, { slug })
  bump()
  return { ...t, slug }
}
