// D&D 퀴즈 순수 로직 — 셔플·배치 상태 변경·채점 (DOM·Dexie 없음, dnd.check.ts 로 검증)
import { ancestorsOf, byOrder } from '../../core/path'
import type { BlankAttempt, ID, TreeNode } from '../../core/types'
import { layout, MARGIN, type Box, type Graph } from '../editor/graph/layout'

export const CARD = { w: 148, h: 44 } // 모든 칸 고정 크기(제목 2줄 말줄임)

/** 좁은 화면용 좌→우 트리: layout 의 형제 배치를 세로축으로 쓰고, 깊이별 열은 폭(avail)에 맞춰 카드 폭을 정한다. 원본 offset 무시 */
export function sideLayout(nodes: TreeNode[], rootId: ID, avail: number): Graph {
  const PAD = 8
  const GAP = 18
  const g = layout(nodes.map((n) => ({ ...n, offset: undefined })), rootId, () => ({ w: CARD.h, h: 1 }))
  const cols = Math.max(...[...g.boxes.values()].map((b) => b.depth)) + 1
  const w = Math.max(96, Math.min(CARD.w, Math.floor((avail - PAD * 2 - GAP * (cols - 1)) / cols)))
  const boxes = new Map<ID, Box>()
  for (const [id, b] of g.boxes)
    boxes.set(id, { x: PAD + b.depth * (w + GAP), y: PAD + b.x - MARGIN, w, h: CARD.h, depth: b.depth })
  return { boxes, edges: g.edges, width: PAD * 2 + cols * w + GAP * (cols - 1), height: PAD * 2 + g.width - MARGIN * 2 }
}

export function shuffle<T>(a: T[], rand = Math.random): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** 범위 루트(parentId=null 로 바꿈) + 자손, 전위 순서·형제는 order 순 */
export function scopeOf(nodes: TreeNode[], rootId: ID): TreeNode[] {
  const root = nodes.find((n) => n.id === rootId)
  if (!root) return []
  const kids = new Map<ID, TreeNode[]>()
  for (const n of nodes) if (n.parentId !== null) kids.set(n.parentId, [...(kids.get(n.parentId) ?? []), n])
  const out: TreeNode[] = [{ ...root, parentId: null }]
  const walk = (id: ID) => {
    for (const c of (kids.get(id) ?? []).sort(byOrder)) {
      out.push(c)
      walk(c.id)
    }
  }
  walk(rootId)
  return out
}

/** 루트를 제외한, 자식 없는 노드 */
export function leavesOf(scope: TreeNode[]): TreeNode[] {
  const parents = new Set(scope.map((n) => n.parentId))
  return scope.filter((n) => n.parentId !== null && !parents.has(n.id))
}

/** (키, id) 목록을 기대 키 멀티셋에 차례로 소비 → id 별 정답 여부. 순서 무관 + 같은 키끼리 교환 가능 */
function matchPairs(expected: string[], actual: [string, ID][]): Record<ID, boolean> {
  const left = new Map<string, number>()
  for (const k of expected) left.set(k, (left.get(k) ?? 0) + 1)
  const out: Record<ID, boolean> = {}
  for (const [k, id] of actual) {
    const c = left.get(k) ?? 0
    out[id] = c > 0
    if (c > 0) left.set(k, c - 1)
  }
  return out
}

/** placed = 사용자가 놓은 카드 id — 비어 있으면 채점 결과를 SRS 에 기록하지 않는다(U35) */
export interface Score { ok: Record<ID, boolean>; correct: number; total: number; placed: ID[] }
/** 채점 1회 → attempts 행(id 는 소스가 붙인다). 빈칸·백지는 자동 채점만이라 recall = edge = 정답률, self/overridden 0 */
export const attemptOf = (treeId: ID, rootId: ID, startedAt: number, s: Score, completedAt = Date.now()): Omit<BlankAttempt, 'id'> =>
  ({ treeId, rootId, startedAt, completedAt, nodeRecall: s.correct / s.total, edgeAccuracy: s.correct / s.total, autoGradedCount: s.total, selfGradedCount: 0, overriddenCount: 0 })

// ── D1: 뼈대 + 리프 빈칸 ─────────────────────────────────────

/** 슬롯 id(= 정답 리프 id) → 놓인 카드(리프) id */
export type Place = Record<ID, ID>

/** 카드를 슬롯(또는 'tray')으로. 찬 슬롯이면 교환, 트레이에서 왔으면 기존 카드는 트레이로 */
export function moveCard(place: Place, card: ID, to: ID | 'tray'): Place {
  const next = { ...place }
  const from = Object.keys(next).find((s) => next[s] === card)
  if (from) delete next[from]
  if (to !== 'tray') {
    const other = next[to]
    if (other && from) next[from] = other
    next[to] = card
  }
  return next
}

/** ok = 카드(리프) id 별. 같은 부모 아래 슬롯이면 정답(순서 무관, 같은 제목 교환 가능). 미배치 = 오답 */
export function gradeDnd(scope: TreeNode[], place: Place): Score {
  const byId = new Map(scope.map((n) => [n.id, n]))
  const leaves = leavesOf(scope)
  const key = (parent: ID | null, title: string) => `${parent}\u0000${title}`
  const ok = matchPairs(
    leaves.map((l) => key(l.parentId, l.title)),
    leaves.flatMap((slot) => {
      const c = place[slot.id]
      return c ? [[key(slot.parentId, byId.get(c)!.title), c] as [string, ID]] : []
    }),
  )
  for (const l of leaves) ok[l.id] ??= false
  const placed = leaves.map((l) => place[l.id]).filter(Boolean)
  return { ok, correct: Object.values(ok).filter(Boolean).length, total: leaves.length, placed }
}

// ── D2: 백지 캔버스 ─────────────────────────────────────────

/** 배치된 노드 → 사용자가 붙인 부모. 삽입 순서 = 형제 순서 */
export type Links = Map<ID, ID>

export function isUnder(links: Links, id: ID, ancestor: ID): boolean {
  for (let p = links.get(id); p !== undefined; p = links.get(p)) if (p === ancestor) return true
  return false
}

/** id 를 target 의 자식으로(자손 함께 이동). 루트 이동·자기/자기 자손 아래·미배치 대상은 무시 */
export function attach(links: Links, id: ID, target: ID, rootId: ID): Links {
  if (id === rootId || id === target || isUnder(links, target, id)) return links
  if (target !== rootId && !links.has(target)) return links
  const next = new Map(links)
  next.delete(id) // 맨 뒤 형제로
  next.set(id, target)
  return next
}

/** id 와 그 자손을 트레이로 */
export function detach(links: Links, id: ID): Links {
  return new Map([...links].filter(([x]) => x !== id && !isUnder(links, x, id)))
}

/** layout 입력: 루트 + 배치된 노드(사용자 부모, 삽입 순서). 원본 offset·접힘 제거 */
export function placedTree(scope: TreeNode[], links: Links): TreeNode[] {
  const byId = new Map(scope.map((n) => [n.id, n]))
  const plain = (n: TreeNode) => ({ ...n, offset: undefined, collapsed: false })
  return [
    plain(scope[0]),
    ...[...links].map(([id, p], i) => ({ ...plain(byId.get(id)!), parentId: p, order: i })),
  ]
}

/** ok = 루트 제외 전 노드. (조상 제목 사슬, 제목)이 원본과 맞으면 정답 — 같은 제목은 같은 것이되(교환 가능),
 * 사용자 트리에서 다른 공격의 '방법' 아래에 붙이면 오답(U36). 트레이 잔여 = 오답 */
export function gradeBlank(scope: TreeNode[], links: Links): Score {
  const key = (byId: Map<ID, TreeNode>, id: ID) => ancestorsOf(byId, id).map((n) => n.title).join('\u0000')
  const orig = new Map(scope.map((n) => [n.id, n]))
  const mine = new Map(placedTree(scope, links).map((n) => [n.id, n])) // 사용자가 붙인 부모 기준
  const rest = scope.slice(1)
  const ok = matchPairs(
    rest.map((n) => key(orig, n.id)),
    [...links.keys()].map((id) => [key(mine, id), id]),
  )
  for (const n of rest) ok[n.id] ??= false
  const placed = rest.filter((n) => links.has(n.id)).map((n) => n.id)
  return { ok, correct: Object.values(ok).filter(Boolean).length, total: rest.length, placed }
}
