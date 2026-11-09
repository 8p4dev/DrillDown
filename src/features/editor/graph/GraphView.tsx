import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { ID, TreeNode } from '../../../core/types'
import { haptic } from '../../feel'
import { isOpen, layout, type Box, type Size } from './layout'

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
  /** 자식을 그릴지(접기·보기 깊이). 안 주면 collapsed 만 본다 */
  open?: (n: TreeNode, depth: number) => boolean
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
  const open = p.open ?? isOpen
  const g = useMemo(() => layout(shown, p.rootId, (n) => sizes.get(n.id) ?? FALLBACK, open), [shown, p.rootId, sizes, open])
  const byId = useMemo(() => new Map(shown.map((n) => [n.id, n])), [shown])

  // 위치 정착한 카드 id. 처음엔 FALLBACK 크기로 놓였다가 측정 후 옮겨지므로, 정착 전엔 미끄러지지 않게 still
  const [known, setKnown] = useState<Set<ID>>(new Set())
  const dragId = drag?.id
  // 끄는 카드와 그 하위. 자식 Map 한 번 → O(n) (childrenOf 반복은 O(n²), R5-P9)
  const moving = useMemo(() => {
    if (!dragId) return null
    const kids = new Map<ID, ID[]>()
    for (const n of p.nodes) {
      if (!n.parentId) continue
      const k = kids.get(n.parentId)
      if (k) k.push(n.id)
      else kids.set(n.parentId, [n.id])
    }
    const out = new Set([dragId])
    for (const id of out) for (const k of kids.get(id) ?? []) out.add(k) // Set 순회는 추가된 것까지 돈다
    return out
  }, [p.nodes, dragId])
  const still = (id: ID) => !known.has(id) || !!moving?.has(id)

  // 너비 트랜지션·편집 입력칸 등 렌더 없이 크기가 바뀌는 것은 ResizeObserver 가 잡는다 (transitionend 에 의존하지 않음)
  const ro = useRef<ResizeObserver | null>(null)
  // 관찰 중인 카드 요소·마지막으로 잰 노드 객체. 둘 다 같으면 다시 재지 않는다(R5-P6: 렌더마다 전체 offsetWidth 제거)
  const seen = useRef(new Map<ID, { el: HTMLElement; node: TreeNode | undefined }>())
  // 주어진 카드만 재서 바뀐 것만 반영. 크기가 같으면 이전 Map 그대로 → 리렌더 없음
  function measure(els: Iterable<HTMLElement>) {
    const now = [...els].map((el) => [el.dataset.nodeId!, { w: el.offsetWidth, h: el.offsetHeight }] as const)
    if (!now.length) return
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
  // 매 렌더 후 새로 생긴(또는 다시 마운트된) 카드와 노드 내용이 바뀐 카드만 잰다 (페인트 전에 재배치되므로 깜빡임 없음).
  // 의존성 없음이 의도: 무엇이 바뀌어도 확인한다(확인은 Map 조회뿐, 강제 레이아웃은 잰 카드 수만큼).
  // 크기 변화가 없는 패스에서 새 카드를 정착으로 표시 → 위치가 같은 렌더에서 still 이 풀려 미끄러짐이 없다
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const els = ref.current?.querySelectorAll<HTMLElement>('[data-node-id]') ?? []
    const next = new Map<ID, { el: HTMLElement; node: TreeNode | undefined }>()
    const dirty: HTMLElement[] = []
    for (const el of els) {
      const id = el.dataset.nodeId!
      const node = byId.get(id)
      const old = seen.current.get(id)
      if (old?.el !== el) ro.current?.observe(el)
      if (old?.el !== el || old.node !== node || !sizes.has(id)) dirty.push(el)
      next.set(id, { el, node })
    }
    for (const [id, { el }] of seen.current) if (next.get(id)?.el !== el) ro.current?.unobserve(el) // 사라진 카드: 분리된 요소를 붙잡지 않게
    seen.current = next
    measure(dirty)
    const ids = [...g.boxes.keys()]
    if ((known.size !== ids.length || ids.some((id) => !known.has(id))) && ids.every((id) => sizes.has(id))) {
      // oxlint-disable-next-line react/set-state-in-effect -- 측정 완료 후 정착 표시
      setKnown(new Set(ids))
      const r = g.boxes.get(p.rootId)
      if (r) p.onSettled?.(g.width, g.height, r.x + r.w / 2)
    }
  })
  useEffect(() => {
    // 페인트 전에 반영(flushSync): 입력칸 전환처럼 렌더와 같은 프레임에 크기가 바뀌어도 한 프레임 겹쳐 보이지 않게
    ro.current = new ResizeObserver((es) => flushSync(() => measure(es.map((e) => e.target as HTMLElement))))
    return () => ro.current?.disconnect()
  }, []) // oxlint-disable-line react-hooks/exhaustive-deps

  // 두 손가락 핀치. capture 단계에서 먼저 받아, 시작되면 카드 드래그·패닝을 취소하고 손가락이 모두 떨어질 때까지 막는다
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; zoom: number; cx: number; cy: number } | null>(null)
  const spread = () => {
    const [a, b] = [...touches.current.values()]
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }
  }
  // 터치로 누른 실제 자리의 요소. 폰 축소 배율에서 작은 카드를 탭하면 브라우저 터치 보정이 이벤트 대상을 옆의 접기 배지로
  // 옮겨(pointerdown 대상까지) 가지가 접힌다. 좌표는 보정되지 않으므로 그 자리가 배지가 아니었으면 click 을 카드 선택으로 돌린다
  // (탭 = 선택, 접기 = 배지를 정확히 누르거나 구조 바)
  const touchAt = useRef<Element | null>(null)
  function onTapClick(e: React.MouseEvent) {
    const hit = touchAt.current
    touchAt.current = null
    const card = (e.target as HTMLElement).closest('.badge')?.closest<HTMLElement>('[data-node-id]')
    if (!hit || !card || hit.closest('.badge')) return
    e.stopPropagation()
    card.click()
  }
  function onTouchDown(e: React.PointerEvent) {
    touchAt.current = e.pointerType === 'touch' ? document.elementFromPoint(e.clientX, e.clientY) : null
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

  // 선 수천 개: 입력처럼 배치가 그대로인 렌더에서는 다시 만들지 않는다
  const edges = useMemo(
    () => (
      <svg className="graph-edges" width={g.width} height={g.height} aria-hidden>
        {g.edges.map(([a, b]) => {
          const pa = g.boxes.get(a)!
          const pb = g.boxes.get(b)!
          const [x1, y1, x2, y2] = [pa.x + pa.w / 2, pa.y + pa.h, pb.x + pb.w / 2, pb.y]
          const my = (y1 + y2) / 2
          return <path key={b} className={`${a === p.rootId ? 'from-root ' : ''}${still(a) || still(b) ? 'still' : ''}`} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />
        })}
      </svg>
    ),
    [g, known, moving, p.rootId], // oxlint-disable-line react-hooks/exhaustive-deps -- still 은 known·moving 으로 정해진다
  )

  return (
    <div className={`graph-pan${panning ? ' panning' : ''}`} onPointerDownCapture={onTouchDown} onPointerMoveCapture={onTouchMove} onPointerUpCapture={onTouchEnd} onPointerCancelCapture={onTouchEnd} onPointerDown={onPanDown} onPointerMove={onPanMove} onPointerUp={endPan} onPointerCancel={endPan}>
    <div className="graph-zoom" style={{ width: g.width * z, height: g.height * z }}>
    <div
      ref={ref}
      className={`graph${drag ? ' dragging' : ''}`}
      style={{ width: g.width, height: g.height, transform: z === 1 ? undefined : `scale(${z})` }}
      onPointerDown={onPointerDown}
      onClickCapture={onTapClick}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => ((start.current = null), setDrag(null))}
    >
      {edges}
      {[...g.boxes].map(([id, box]) => p.renderNode(byId.get(id)!, box, { still: still(id), lifted: drag?.id === id, spawn: known.size > 0 && !known.has(id) }))}
    </div>
    </div>
    </div>
  )
}
