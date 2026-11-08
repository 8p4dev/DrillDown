// 트리 저장소 — 공유 계약 §4.2 (에이전트 A 소유)
import { db, newId } from './db'
import type { ID, Tree, TreeNode } from './types'

export async function createTree(title: string): Promise<Tree> {
  const now = Date.now()
  const tree: Tree = { id: newId(), title, createdAt: now, updatedAt: now }
  const root: TreeNode = { id: newId(), treeId: tree.id, parentId: null, order: 0, title, aliases: [], updatedAt: now }
  await db.transaction('rw', db.trees, db.nodes, async () => {
    await db.trees.add(tree)
    await db.nodes.add(root)
  })
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
export function markTreeDeleted(treeId: ID): Promise<number> {
  return db.trees.update(treeId, { deletedAt: Date.now() })
}
/** 되돌리기 */
export function restoreTree(treeId: ID): Promise<number> {
  return db.trees.update(treeId, { deletedAt: undefined })
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
}

export async function addAlias(nodeId: ID, alias: string): Promise<void> {
  const a = alias.trim()
  if (!a) return
  const n = await db.nodes.get(nodeId)
  if (!n || n.aliases.includes(a)) return
  await putNodes([{ ...n, aliases: [...n.aliases, a], updatedAt: Date.now() }])
}
