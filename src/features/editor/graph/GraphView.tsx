import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { descendantsOf } from '../../../core/repo'
import type { ID, TreeNode } from '../../../core/types'
import { haptic } from '../../feel'
import { layout, type Box, type Size } from './layout'

const DRAG_MIN = 4 // 이보다 적게 움직이면 클릭
const FALLBACK: Size = { w: 64, h: 34 }
const offsetOf = (n: TreeNode, dx: number, dy: number) => ({ x: (n.offset?.x ?? 0) + dx, y: (n.offset?.y ?? 0) + dy })

/**
 * 위→아래 트리 그래프. 카드 크기는 렌더된 DOM 을 재서 layout 에 주입하고,
 * 드래그 중에는 로컬 상태로 미리보기 → 놓을 때 onMove 1회.
 */
export default function GraphView(p: {
  nodes: TreeNode[]
  rootId: ID
  /** still = 위치 트랜지션 끔(측정 전·드래그로 따라오는 중), lifted = 끌고 있는 카드, spawn = 진입 뒤에 새로 생긴 카드 */
  renderNode: (n: TreeNode, box: Box, m: { still: boolean; lifted: boolean; spawn: boolean }) => ReactNode
  onMove: (id: ID, offset: { x: number; y: number }) => void
  /** 확대 배율 (1 = 100%). 배치·측정은 배율과 무관한 원래 px, 화면에만 scale */
  zoom?: number
  /** 핀치: 화면 좌표 (cx, cy) 를 기준점으로 배율 변경 */
  onZoomAt?: (zoom: number, cx: number, cy: number) => void
  /** 실측 크기로 배치를 마칠 때마다 (카드 구성이 바뀐 뒤 1회) */
  onSettled?: (width: number, height: number, rootX: number) => void
}) {
  const z = p.zoom ?? 1
  const ref = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState<Map<ID, Size>>(new Map())
  const [drag, setDrag] = useState<{ id: ID; dx: number; dy: number } | null>(null)
  const start = useRef<{ id: ID; x: number; y: number; moved: boolean; el: HTMLElement; pointer: number } | null>(null)

  const shown = useMemo(
    () => (drag ? p.nodes.map((n) => (n.id === drag.id ? { ...n, offset: offsetOf(n, drag.dx, drag.dy) } : n)) : p.nodes),
    [p.nodes, drag],
  )
  const g = useMemo(() => layout(shown, p.rootId, (n) => sizes.get(n.id) ?? FALLBACK), [shown, p.rootId, sizes])
  const byId = useMemo(() => new Map(shown.map((n) => [n.id, n])), [shown])

  // 위치 정착한 카드 id. 처음엔 FALLBACK 크기로 놓였다가 측정 후 옮겨지므로, 정착 전엔 미끄러지지 않게 still
  const [known, setKnown] = useState<Set<ID>>(new Set())
  const dragId = drag?.id
  const moving = useMemo(
    () => (dragId ? new Set([dragId, ...descendantsOf(p.nodes, dragId).map((n) => n.id)]) : null),
    [p.nodes, dragId],
  )
  const still = (id: ID) => !known.has(id) || !!moving?.has(id)

  // 너비 트랜지션 등 렌더 없이 크기가 바뀌는 동안에도 다시 재서 배치 (transitionend 에 의존하지 않음)
  const ro = useRef<ResizeObserver | null>(null)
  // 카드 크기를 재서 바뀐 것만 반영. 크기가 같으면 이전 Map 그대로 → 리렌더 없음
  function measure() {
    const els = ref.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? []
    const now = [...els].map((el) => [el.dataset.nodeId!, { w: el.offsetWidth, h: el.offsetHeight }] as const)
    setSizes((prev) => {
      let changed = false
      const next = new Map(prev)
      for (const [id, s] of now) {
        const old = next.get(id)
        if (!old || old.w !== s.w || old.h !== s.h) {
          next.set(id, s)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }
  // 매 렌더 후 측정 (페인트 전에 재배치되므로 깜빡임 없음). 의존성 없음이 의도: 무엇이 바뀌어도 다시 잰다.
  // 크기 변화가 없는 패스에서 새 카드를 정착으로 표시 → 위치가 같은 렌더에서 still 이 풀려 미끄러짐이 없다
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    measure()
    const els = ref.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? []
    for (const el of els) ro.current?.observe(el)
    const ids = [...g.boxes.keys()]
    if ((known.size !== ids.length || ids.some((id) => !known.has(id))) && [...els].every((el) => sizes.has(el.dataset.nodeId!))) {
      // oxlint-disable-next-line react/set-state-in-effect -- 측정 완료 후 정착 표시
      setKnown(new Set(ids))
      const r = g.boxes.get(p.rootId)
      if (r) p.onSettled?.(g.width, g.height, r.x + r.w / 2)
    }
  })
  useEffect(() => {
    ro.current = new ResizeObserver(measure)
    return () => ro.current?.disconnect()
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps

  // 두 손가락 핀치. capture 단계에서 먼저 받아, 시작되면 카드 드래그·패닝을 취소하고 손가락이 모두 떨어질 때까지 막는다
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null)
  const spread = () => {
    const [a, b] = [...touches.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  function onTouchDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (touches.current.size !== 2) return
    start.current = null
    setDrag(null)
    endPan()
    pinch.current = { ...spread(), zoom: z }
  }
  function onTouchMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!touches.current.has(e.pointerId)) return
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = pinch.current
    if (!s || touches.current.size !== 2) return
    const { dist, cx, cy } = spread()
    p.onZoomAt?.((s.zoom * dist) / s.dist, cx, cy)
    // 두 손가락을 함께 옮기면 화면도 따라간다
    const scroller = e.currentTarget.parentElement!
    scroller.scrollLeft -= cx - s.cx
    scroller.scrollTop -= cy - s.cy
    s.cx = cx
    s.cy = cy
  }
  function onTouchEnd(e: React.PointerEvent) {
    touches.current.delete(e.pointerId)
    if (!touches.current.size) pinch.current = null
  }

  function onPointerDown(e: React.PointerEvent) {
    const t = e.target as HTMLElement
    const card = t.closest<HTMLElement>('[data-node-id]')
    if (pinch.current || e.button !== 0 || !card || t.closest('input, .badge, .w-handle, [contenteditable]')) return
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
    if (n && (drag.dx || drag.dy)) {
      p.onMove(n.id, offsetOf(n, drag.dx, drag.dy))
      haptic('tap')
    }
  }

  // 빈 배경을 끌면 스크롤(패닝). 카드 위에서는 카드 드래그가 우선
  const pan = useRef<{ x: number; y: number; left: number; top: number; el: HTMLElement } | null>(null)
  const [panning, setPanning] = useState(false)
  function onPanDown(e: React.PointerEvent<HTMLDivElement>) {
    const scroller = e.currentTarget.parentElement
    if (pinch.current || e.button !== 0 || !scroller || (e.target as HTMLElement).closest('[data-node-id]')) return
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
    <div className={`graph-pan${panning ? ' panning' : ''}`} onPointerDownCapture={onTouchDown} onPointerMoveCapture={onTouchMove} onPointerUpCapture={onTouchEnd} onPointerCancelCapture={onTouchEnd} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan} onPointerCancel={endPan}>
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
          return <path key={b} className={`${a === p.rootId ? 'from-root ' : ''}${still(a) || still(b) ? 'still' : ''}`} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />
        })}
      </svg>
      {[...g.boxes].map(([id, box]) => p.renderNode(byId.get(id)!, box, { still: still(id), lifted: drag?.id === id, spawn: known.size > 0 && !known.has(id) }))}
    </div>
    </div>
    </div>
  )
}
