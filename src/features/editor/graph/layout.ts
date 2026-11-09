// 트리 그래프 배치 — 순수 함수 (DOM 없음). 크기 측정은 주입받는다.
// dir 'down' = 위→아래(깊이 = 행), 'right' = 왼→오른(깊이 = 열, 형제는 세로로 쌓임 — 세로 보기). right 는 down 을 축만 바꿔 계산한다
import { byOrder } from '../../../core/path'
import type { ID, TreeNode } from '../../../core/types'

export interface Size { w: number; h: number }
export interface Box extends Size { x: number; y: number; depth: number }
export interface Graph {
  boxes: Map<ID, Box> // 보이는 노드만, 전위 순서
  edges: [ID, ID][] // [부모, 자식]
  width: number
  height: number
  dir?: Dir // 없음 = down
}
export type Dir = 'down' | 'right'

export const HGAP = 24 // 형제 서브트리 사이 가로 간격
export const VGAP = 56 // 깊이 행 사이 세로 간격
export const MARGIN = 32
const RIGHT_GAP = { sib: 10, depth: 44 } // 세로 보기: 형제 사이 세로 간격 · 깊이 열 사이 가로 간격

/**
 * 서브트리 폭 = max(노드 폭, 자식 서브트리 폭 합 + 간격). 부모 중심 = 첫·마지막 자식 중심의 가운데.
 * 접힌 노드의 하위는 제외. offset 은 경로상 누적(서브트리 함께 이동) 후 최소 좌표가 MARGIN 이 되게 평행이동.
 * open(n, depth) = 그 노드의 자식을 그릴지 (기본: 접히지 않았으면). 보기 깊이(C3)는 여기로 들어온다.
 */
export const isOpen = (n: TreeNode) => !n.collapsed
export function layout(nodes: TreeNode[], rootId: ID, measure: (n: TreeNode) => Size, open: (n: TreeNode, depth: number) => boolean = isOpen, dir: Dir = 'down'): Graph {
  if (dir === 'down') return core(nodes, rootId, measure, open, HGAP, VGAP)
  // 축 바꾸기: 크기·offset 을 뒤집어 down 으로 배치한 뒤 좌표를 되돌린다(화면 offset 은 그대로 화면 축)
  const t = core(
    nodes.map((n) => (n.offset ? { ...n, offset: { x: n.offset.y, y: n.offset.x } } : n)), rootId,
    (n) => { const s = measure(n); return { w: s.h, h: s.w } }, open, RIGHT_GAP.sib, RIGHT_GAP.depth,
  )
  for (const b of t.boxes.values()) [b.x, b.y, b.w, b.h] = [b.y, b.x, b.h, b.w]
  return { ...t, width: t.height, height: t.width, dir }
}

function core(nodes: TreeNode[], rootId: ID, measure: (n: TreeNode) => Size, open: (n: TreeNode, depth: number) => boolean, hgap: number, vgap: number): Graph {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const kidsOf = new Map<ID, TreeNode[]>()
  for (const n of nodes) {
    if (n.parentId === null) continue
    const k = kidsOf.get(n.parentId)
    if (k) k.push(n)
    else kidsOf.set(n.parentId, [n])
  }
  for (const k of kidsOf.values()) k.sort(byOrder)
  const visibleKids = (n: TreeNode, depth: number) => (open(n, depth) ? (kidsOf.get(n.id) ?? []) : [])

  // 1패스(후위): 서브트리 폭, 서브트리 왼쪽 기준 노드 중심, 자식 서브트리의 상대 x
  const size = new Map<ID, Size>()
  const sub = new Map<ID, { width: number; center: number; kidX: number[] }>()
  const rowH: number[] = []
  const measureSub = (n: TreeNode, depth: number) => {
    const s = measure(n)
    size.set(n.id, s)
    rowH[depth] = Math.max(rowH[depth] ?? 0, s.h)
    const kids = visibleKids(n, depth)
    if (!kids.length) return void sub.set(n.id, { width: s.w, center: s.w / 2, kidX: [] })
    let x = 0
    const kidX = kids.map((k) => {
      measureSub(k, depth + 1)
      const at = x
      x += sub.get(k.id)!.width + hgap
      return at
    })
    const total = x - hgap
    const first = sub.get(kids[0].id)!.center
    const last = kidX[kidX.length - 1] + sub.get(kids[kids.length - 1].id)!.center
    const mid = (first + last) / 2
    const left = Math.min(0, mid - s.w / 2)
    const right = Math.max(total, mid + s.w / 2)
    sub.set(n.id, { width: right - left, center: mid - left, kidX: kidX.map((v) => v - left) })
  }
  const root = byId.get(rootId)
  if (!root) return { boxes: new Map(), edges: [], width: 0, height: 0, dir: 'down' }
  measureSub(root, 0)
  const rowY = [0]
  for (let d = 1; d < rowH.length; d++) rowY[d] = rowY[d - 1] + rowH[d - 1] + vgap

  // 2패스(전위): 절대 좌표 + 누적 offset
  const boxes = new Map<ID, Box>()
  const edges: [ID, ID][] = []
  const place = (n: TreeNode, left: number, depth: number, ox: number, oy: number) => {
    const s = size.get(n.id)!
    const o = sub.get(n.id)!
    ox += n.offset?.x ?? 0
    oy += n.offset?.y ?? 0
    boxes.set(n.id, { ...s, x: left + o.center - s.w / 2 + ox, y: rowY[depth] + oy, depth })
    visibleKids(n, depth).forEach((k, i) => {
      edges.push([n.id, k.id])
      place(k, left + o.kidX[i], depth + 1, ox, oy)
    })
  }
  place(root, 0, 0, 0, 0)

  const all = [...boxes.values()]
  const dx = MARGIN - Math.min(...all.map((b) => b.x))
  const dy = MARGIN - Math.min(...all.map((b) => b.y))
  for (const b of all) {
    b.x += dx
    b.y += dy
  }
  return {
    boxes,
    edges,
    width: Math.max(...all.map((b) => b.x + b.w)) + MARGIN,
    height: Math.max(...all.map((b) => b.y + b.h)) + MARGIN,
    dir: 'down',
  }
}
