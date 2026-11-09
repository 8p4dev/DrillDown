// 백업 가져오기 (U04) — 계정 화면 '데이터 내보내기' JSON(trees·nodes·srs)을 로컬에 넣는다.
// 같은 id 트리(또는 노드)가 이미 있으면 새 id 로 복사(노드 parentId·srs nodeId 재매핑, 학습 기록 유지), 없으면 그대로.
// 모든 행의 updatedAt 은 가져온 시각(F18) — 서버에 더 나중 톰스톤·수정이 있어도 LWW 에서 지지 않고 "지금 가져온 것"이 이긴다.
// 쓰기는 repo.ts 와 같은 방식: 한 rw 트랜잭션 + db.track(로그인이면 outbox → push, 비로그인이면 no-op).
import { db, newId, track } from './db'
import { CAP, type ID, type NodeSrs, type Tree, type TreeNode } from './types'

export interface Backup { trees: Tree[]; nodes: TreeNode[]; srs: NodeSrs[] }

const isStr = (x: unknown): x is string => typeof x === 'string'

/** 형식·한도 검사. 문제가 있으면 한 줄 오류 문구를 throw(Error.message) */
export function parseBackup(text: string, localTrees: number): Backup {
  let o: Partial<Backup>
  try { o = JSON.parse(text) } catch { throw new Error('백업 파일이 아닙니다(JSON 형식 아님)') }
  if (!o || !Array.isArray(o.trees) || !Array.isArray(o.nodes) || !Array.isArray(o.srs)) throw new Error('백업 파일이 아닙니다(trees·nodes·srs 없음)')
  const trees = o.trees.filter((t) => isStr(t?.id) && isStr(t.title) && !t.deletedAt)
  const ids = new Set(trees.map((t) => t.id))
  const nodes = o.nodes.filter((n) => isStr(n?.id) && ids.has(n.treeId) && isStr(n.title) && (n.parentId === null || isStr(n.parentId)))
  const srs = o.srs.filter((s) => isStr(s?.nodeId) && ids.has(s.treeId))
  if (!trees.length) throw new Error('가져올 트리가 없습니다')
  if (localTrees + trees.length > CAP.treesPerUser) throw new Error(`트리는 ${CAP.treesPerUser}개까지입니다 — 지금 ${localTrees}개, 파일 ${trees.length}개`)
  const per = new Map<ID, number>()
  for (const n of nodes) {
    per.set(n.treeId, (per.get(n.treeId) ?? 0) + 1)
    if (n.title.length > CAP.title || (n.note?.length ?? 0) > CAP.note) throw new Error(`제목(${CAP.title}자)·메모(${CAP.note}자)가 너무 긴 항목이 있습니다`)
  }
  if ([...per.values()].some((c) => c > CAP.nodesPerTree)) throw new Error(`노드가 ${CAP.nodesPerTree.toLocaleString()}개를 넘는 트리가 있습니다`)
  for (const t of trees) if (!per.has(t.id)) throw new Error(`노드가 없는 트리가 있습니다: ${t.title}`)
  return { trees, nodes, srs }
}

/** 쓸 행 계산(순수). taken = 이미 있는 트리 id(노드 id 충돌 포함) → 새 id 로 복사. 모든 행 updatedAt=now (F18) */
export function planImport(b: Backup, taken: Set<ID>, now: number, mkId: () => ID = newId): Backup & { copied: number } {
  const treeMap = new Map<ID, ID>()
  const nodeMap = new Map<ID, ID>()
  for (const t of b.trees) treeMap.set(t.id, taken.has(t.id) ? mkId() : t.id)
  for (const n of b.nodes) nodeMap.set(n.id, treeMap.get(n.treeId) === n.treeId ? n.id : mkId())
  let copied = 0
  const trees: Tree[] = b.trees.map(({ deletedAt: _d, ...t }) => {
    const id = treeMap.get(t.id)!
    if (id === t.id) return { ...t, updatedAt: now }
    copied++
    return { ...t, id, createdAt: now, updatedAt: now, visibility: 'private', slug: null }
  })
  const nodes: TreeNode[] = b.nodes.map((n) => n.id === nodeMap.get(n.id) ? { ...n, updatedAt: now }
    : { ...n, id: nodeMap.get(n.id)!, treeId: treeMap.get(n.treeId)!, parentId: n.parentId && (nodeMap.get(n.parentId) ?? null), updatedAt: now })
  const srs: NodeSrs[] = b.srs.filter((s) => nodeMap.has(s.nodeId)).map((s) => ({ ...s, nodeId: nodeMap.get(s.nodeId)!, treeId: treeMap.get(s.treeId)!, updatedAt: now }))
  return { trees, nodes, srs, copied }
}

/** 가져온 트리 수·그중 새 id 로 복사한 수 */
export async function importBackup(b: Backup): Promise<{ trees: number; copied: number }> {
  let copied = 0
  await db.transaction('rw', [db.trees, db.nodes, db.srs, db.outbox, db.meta], async () => {
    const taken = new Set((await db.trees.bulkGet(b.trees.map((t) => t.id))).filter(Boolean).map((t) => t!.id))
    ;(await db.nodes.bulkGet(b.nodes.map((n) => n.id))).forEach((x, i) => x && taken.add(b.nodes[i].treeId)) // 노드 id 충돌도 복사로
    const plan = planImport(b, taken, Date.now())
    copied = plan.copied
    const { trees, nodes, srs } = plan
    await db.trees.bulkAdd(trees)
    await db.nodes.bulkAdd(nodes)
    await db.srs.bulkPut(srs)
    await track([
      ...trees.map((t) => ({ kind: 'tree' as const, id: t.id, treeId: t.id, op: 'put' as const })),
      ...nodes.map((n) => ({ kind: 'node' as const, id: n.id, treeId: n.treeId, op: 'put' as const })),
      ...srs.map((s) => ({ kind: 'srs' as const, id: s.nodeId, treeId: s.treeId, op: 'put' as const })),
    ])
  })
  return { trees: b.trees.length, copied }
}
