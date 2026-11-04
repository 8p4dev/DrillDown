// pointer 드래그(마우스·터치) + 탭 선택 → 탭 놓기. 페이지 루트에 handlers 를 펼쳐 이벤트 위임.
// 카드 = [data-card="<id>"], 놓을 곳 = [data-drop="<id|tray>"] (둘 다 가진 요소도 가능)
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../feel'
import { CARD } from './dnd'

const DRAG_MIN = 4 // 이보다 적게 움직이면 탭
const TILT_MAX = 4 // 고스트 기울기 한계(도)
const GHOST_NARROW = 112

export interface DragState { id: string; x: number; y: number; ox: number; oy: number; w: number; h: number; over: string | null; tilt: number }

/** el 자신과 그 안을 제외하고 (x,y) 아래 가장 가까운 [data-drop] */
function dropAt(x: number, y: number, el: HTMLElement): string | null {
  for (const e of document.elementsFromPoint(x, y)) {
    if (el.contains(e)) continue
    const d = e.closest<HTMLElement>('[data-drop]')
    if (d) return d.dataset.drop!
  }
  return null
}

export function useDragDrop(onDrop: (card: string, target: string) => void, enabled = true) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  // d = 마지막으로 그린 상태, (x,y) = 최신 포인터. 프레임마다 d 를 따라잡는다
  const st = useRef<{ el: HTMLElement; d: DragState; moved: boolean; x0: number; y0: number; x: number; y: number } | null>(null)
  const raf = useRef(0)
  const skipClick = useRef(false)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // 드래그 동안만 도는 루프: 포인터 이동을 프레임당 한 번으로 묶고, 멈추면 기울기를 0으로 되돌린다
  const frame = () => {
    const s = st.current
    if (!s) return
    const { d } = s
    const dx = s.x - d.x
    const goal = Math.max(-TILT_MAX, Math.min(TILT_MAX, dx * 0.5))
    const tilt = Math.abs(goal - d.tilt) < 0.1 ? goal : d.tilt + (goal - d.tilt) * 0.3
    const moved = dx !== 0 || s.y !== d.y
    if (moved || tilt !== d.tilt) {
      s.d = { ...d, x: s.x, y: s.y, tilt, over: moved ? dropAt(s.x, s.y, s.el) : d.over }
      setDrag(s.d)
    }
    raf.current = requestAnimationFrame(frame)
  }

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')
      if (!enabled || e.button !== 0 || !el) return
      const r = el.getBoundingClientRect()
      // 모바일 트레이 카드(2열 유동)는 빈칸보다 넓다 → 고스트는 빈칸에 맞는 크기로, 잡은 지점 비율은 유지
      const w = r.width > CARD.w ? GHOST_NARROW : r.width
      const d = { id: el.dataset.card!, x: e.clientX, y: e.clientY, ox: ((e.clientX - r.left) * w) / r.width, oy: e.clientY - r.top, w, h: r.height, over: null, tilt: 0 }
      st.current = { el, d, moved: false, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }
      skipClick.current = false
      el.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current
      if (!s) return
      s.x = e.clientX
      s.y = e.clientY
      if (s.moved || Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < DRAG_MIN) return
      s.moved = true
      haptic('tap')
      raf.current = requestAnimationFrame(frame)
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current
      st.current = null
      cancelAnimationFrame(raf.current)
      if (!s?.moved) return
      skipClick.current = true // 드래그 끝의 click 은 탭이 아님
      setDrag(null)
      setSel(null)
      const t = dropAt(e.clientX, e.clientY, s.el) // 프레임 상태가 아니라 이 이벤트의 좌표로 판정
      if (t) onDrop(s.d.id, t)
    },
    onPointerCancel() {
      st.current = null
      cancelAnimationFrame(raf.current)
      setDrag(null)
    },
    onClick(e: React.MouseEvent) {
      if (skipClick.current) return void (skipClick.current = false)
      if (!enabled) return
      const t = e.target as HTMLElement
      const card = t.closest<HTMLElement>('[data-card]')?.dataset.card ?? null
      const drop = t.closest<HTMLElement>('[data-drop]')?.dataset.drop ?? null
      // 트레이 안의 다른 카드를 탭하면 놓기가 아니라 선택 바꾸기
      if (sel && drop && card !== sel && !(card && drop === 'tray')) {
        onDrop(sel, drop)
        setSel(null)
      } else {
        const next = card && card !== sel ? card : null
        if (next) haptic('tap')
        setSel(next)
      }
    },
  }
  return { drag, sel, handlers }
}
