import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ID, TreeNode } from '../../../core/types'
import { layout, type Box, type Size } from './layout'

const DRAG_MIN = 4 // 이보다 적게 움직이면 클릭
const FALLBACK: Size = { w: 64, h: 34 }

/**
 * 위→아래 트리 그래프. 카드 크기는 렌더된 DOM 을 재서 layout 에 주입하고,
 * 드래그 중에는 로컬 상태로 미리보기 → 놓을 때 onMove 1회.
 */
export default function GraphView(p: {
  nodes: TreeNode[]
  rootId: ID
  renderNode: (n: TreeNode, box: Box) => ReactNode
  onMove: (id: ID, offset: { x: number; y: number }) => void
  /** 확대 배율 (1 = 100%). 배치·측정은 배율과 무관한 원래 px, 화면에만 scale */
  zoom?: number
}) {
  const z = p.zoom ?? 1
  const ref = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState<Map<ID, Size>>(new Map())
  const [drag, setDrag] = useState<{ id: ID; dx: number; dy: number } | null>(null)
  const start = useRef<{ id: ID; x: number; y: number; moved: boolean; el: HTMLElement; pointer: number } | null>(null)

  const offsetOf = (n: TreeNode, dx: number, dy: number) => ({ x: (n.offset?.x ?? 0) + dx, y: (n.offset?.y ?? 0) + dy })
  const shown = drag ? p.nodes.map((n) => (n.id === drag.id ? { ...n, offset: offsetOf(n, drag.dx, drag.dy) } : n)) : p.nodes
  const g = layout(shown, p.rootId, (n) => sizes.get(n.id) ?? FALLBACK)
  const byId = new Map(shown.map((n) => [n.id, n]))

  // 매 렌더 후 카드 크기를 재서 바뀐 것만 반영 (페인트 전에 재배치되므로 깜빡임 없음).
  // 의존성 없음이 의도: 제목·편집·접기 등 무엇이 바뀌어도 다시 잰다. 크기가 같으면 setState 안 함 → 무한 갱신 없음
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const els = ref.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? []
    let changed = false
    const next = new Map(sizes)
    for (const el of els) {
      const id = el.dataset.nodeId!
      const s = { w: el.offsetWidth, h: el.offsetHeight }
      const old = next.get(id)
      if (!old || old.w !== s.w || old.h !== s.h) {
        next.set(id, s)
        changed = true
      }
    }
    // oxlint-disable-next-line react/set-state-in-effect -- DOM 측정 결과 반영
    if (changed) setSizes(next)
  })

  function onPointerDown(e: React.PointerEvent) {
    const t = e.target as HTMLElement
    const card = t.closest<HTMLElement>('[data-node-id]')
    if (e.button !== 0 || !card || t.closest('input, .badge, .w-handle, [contenteditable]')) return
    start.current = { id: card.dataset.nodeId!, x: e.clientX, y: e.clientY, moved: false, el: card, pointer: e.pointerId }
  }
  function onPointerMove(e: React.PointerEvent) {
    const s = start.current
    if (!s) return
    const dx = (e.clientX - s.x) / z // 화면 px → 배치 px
    const dy = (e.clientY - s.y) / z
    if (!s.moved && Math.hypot(dx, dy) < DRAG_MIN) return
    // 실제로 끌기 시작할 때만 캡처: 미리 캡처하면 카드 안 요소(내용 영역)의 클릭·더블클릭 대상이 카드로 바뀐다
    if (!s.moved) s.el.setPointerCapture(s.pointer)
    s.moved = true
    setDrag({ id: s.id, dx, dy })
  }
  function onPointerUp() {
    const s = start.current
    start.current = null
    if (!s?.moved || !drag) return setDrag(null)
    const n = p.nodes.find((x) => x.id === s.id)
    setDrag(null)
    if (n && (drag.dx || drag.dy)) p.onMove(n.id, offsetOf(n, drag.dx, drag.dy))
  }

  // 빈 배경을 끌면 스크롤(패닝). 카드 위에서는 카드 드래그가 우선
  const pan = useRef<{ x: number; y: number; left: number; top: number; el: HTMLElement } | null>(null)
  const [panning, setPanning] = useState(false)
  function onPanDown(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = e.currentTarget.parentElement
    if (e.button !== 0 || !scroller || (e.target as HTMLElement).closest('[data-node-id]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    pan.current = { x: e.clientX, y: e.clientY, left: scroller.scrollLeft, top: scroller.scrollTop, el: scroller }
  }
  function onPanMove(e: React.PointerEvent) {
    const s = pan.current
    if (!s) return
    if (!panning && Math.hypot(e.clientX - s.x, e.clientY - s.y) >= DRAG_MIN) setPanning(true)
    s.el.scrollLeft = s.left - (e.clientX - s.x)
    s.el.scrollTop = s.top - (e.clientY - s.y)
  }
  const endPan = () => ((pan.current = null), setPanning(false))

  return (
    <div className={`graph-pan${panning ? ' panning' : ''}`} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan} onPointerCancel={endPan}>
    <div className="graph-zoom" style={{ width: g.width * z, height: g.height * z }}>
    <div
      ref={ref}
      className={`graph${drag ? ' dragging' : ''}`}
      style={{ width: g.width, height: g.height, transform: z === 1 ? undefined : `scale(${z})` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
    >
      <svg className="graph-edges" width={g.width} height={g.height} aria-hidden>
        {g.edges.map(([a, b]) => {
          const pa = g.boxes.get(a)!
          const pb = g.boxes.get(b)!
          const [x1, y1, x2, y2] = [pa.x + pa.w / 2, pa.y + pa.h, pb.x + pb.w / 2, pb.y]
          const my = (y1 + y2) / 2
          return <path key={b} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />
        })}
      </svg>
      {[...g.boxes].map(([id, box]) => p.renderNode(byId.get(id)!, box))}
    </div>
    </div>
    </div>
  )
}
