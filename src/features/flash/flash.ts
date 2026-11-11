// 플래시카드 순수 로직 (DOM·DB 없음). 점검: npx tsx src/features/flash/flash.check.ts
import { descendantsOf } from '../../core/repo'
import type { ID, NodeSrs, TreeNode } from '../../core/types'

/** 범위 안 개념(자식 있는 노드) id, 전위 순서 — 진행 n/m 의 m(U30) */
export function conceptsIn(nodes: TreeNode[], scopeId: ID): ID[] {
  const hasKids = new Set(nodes.map((n) => n.parentId))
  return [scopeId, ...descendantsOf(nodes, scopeId).map((n) => n.id)].filter((id) => hasKids.has(id))
}

/** S9 약점 집중: 범위 개념 중 자식의 miss 합이 0 보다 큰 것만, 많이 틀린 순(동률은 전위 순서) */
export function weakQueue(nodes: TreeNode[], srs: Map<ID, NodeSrs>, scopeId: ID): ID[] {
  const heat = new Map<ID, number>()
  for (const n of nodes) if (n.parentId !== null) heat.set(n.parentId, (heat.get(n.parentId) ?? 0) + (srs.get(n.id)?.miss ?? 0))
  return conceptsIn(nodes, scopeId).filter((id) => heat.get(id)! > 0).sort((a, b) => heat.get(b)! - heat.get(a)!)
}

/** 미니맵용: 접힘·마우스 offset 무시하고 전체 트리를 그린다 */
export const minimapNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes.map((n) => ({ ...n, collapsed: false, offset: undefined }))

/** 내용(note) 평문화: 형광펜 마커 ==p:텍스트== → 텍스트. 줄·불릿은 그대로 */
export const plainNote = (note = ''): string => note.replace(/==[pyb]:(.*?)==/g, '$1').trim()

/** U38: 플래시 진행(트리+범위별 localStorage). queue = 출제 순서, base = 재출제 붙기 전 길이, tally = 하위 노드별 마지막 평가, sub = 부분 큐(모름만·약점만) */
export interface Progress { queue: ID[]; base: number; pos: number; tally: [ID, boolean][]; shuffled: boolean; at: number; sub?: boolean }
export const PROGRESS_TTL = 7 * 86_400_000

/** 저장본 → 쓸 수 있으면 Progress. 7일 지남·깨짐·트리가 바뀌어 개념 집합이 다름 → null. 부분 큐(sub)는 개념 수 검사를 하지 않는다(S4) */
export function readProgress(raw: string | null, concepts: ID[], now: number): Progress | null {
  try {
    const p = JSON.parse(raw ?? '') as Progress
    const ok = new Set(concepts)
    if (!(now - p.at < PROGRESS_TTL) || !p.queue.every((id) => ok.has(id)) || (!p.sub && new Set(p.queue).size !== ok.size) || !(p.pos < p.queue.length)) return null
    return p
  } catch {
    return null
  }
}

/** U40: 큐 끝(pos 가 마지막)에서 한 번만 — 모름 하위가 있던 개념을 큐 순서대로 다시 붙인다. 끝이 아니거나 이미 붙였으면(길이 > base) 그대로 */
export const requeueMissed = (queue: ID[], base: number, pos: number, missed: Set<ID>): ID[] =>
  pos < queue.length - 1 || queue.length > base ? queue : [...queue, ...queue.filter((id) => missed.has(id))]

/** 모름으로 평가한 하위의 부모 = 다시 낼 개념 */
export const missedConcepts = (byId: Map<ID, TreeNode>, tally: Iterable<[ID, boolean]>): Set<ID> =>
  new Set([...tally].flatMap(([id, k]) => { const p = byId.get(id)?.parentId; return !k && p ? [p] : [] }))
