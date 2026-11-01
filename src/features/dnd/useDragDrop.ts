// pointer 드래그(마우스·터치) + 탭 선택 → 탭 놓기. 페이지 루트에 handlers 를 펼쳐 이벤트 위임.
// 카드 = [data-card="<id>"], 놓을 곳 = [data-drop="<id|tray>"] (둘 다 가진 요소도 가능)
import { useRef, useState } from 'react'

const DRAG_MIN = 4 // 이보다 적게 움직이면 탭

export interface DragState { id: string; x: number; y: number; ox: number; oy: number; w: number; over: string | null }

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
  const st = useRef<{ el: HTMLElement; d: DragState; moved: boolean; x0: number; y0: number } | null>(null)
  const skipClick = useRef(false)

  const handlers = {
    onPointerDown(e: React.PointerEvent) {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-card]')
      if (!enabled || e.button !== 0 || !el) return
      const r = el.getBoundingClientRect()
      const d = { id: el.dataset.card!, x: e.clientX, y: e.clientY, ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width, over: null }
      st.current = { el, d, moved: false, x0: e.clientX, y0: e.clientY }
      skipClick.current = false
      el.setPointerCapture(e.pointerId)
    },
    onPointerMove(e: React.PointerEvent) {
      const s = st.current
      if (!s || (!s.moved && Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < DRAG_MIN)) return
      s.moved = true
      setDrag({ ...s.d, x: e.clientX, y: e.clientY, over: dropAt(e.clientX, e.clientY, s.el) })
    },
    onPointerUp(e: React.PointerEvent) {
      const s = st.current
      st.current = null
      if (!s?.moved) return
      skipClick.current = true // 드래그 끝의 click 은 탭이 아님
      setDrag(null)
      setSel(null)
      const t = dropAt(e.clientX, e.clientY, s.el)
      if (t) onDrop(s.d.id, t)
    },
    onPointerCancel() {
      st.current = null
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
      } else setSel(card && card !== sel ? card : null)
    },
  }
  return { drag, sel, handlers }
}
