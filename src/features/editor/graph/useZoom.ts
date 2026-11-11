// 그래프 캔버스 확대·축소 — 편집기(EditorPage)와 공유 보기(SharedPage)가 같이 쓴다. 공유 계약 C2(orchestration_editor_share.md §4).
// box = 스크롤러 요소(.outline). 그 안에 .graph(transform: scale) 와 [data-node-id] 카드가 있어야 한다.
// 배치·측정은 배율과 무관한 원래 px(GraphView), 화면에만 scale. 확대는 CSS transform, 이동은 스크롤.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import type { ID } from '../../../core/types'

export const clampZoom = (z: number) => Math.min(2, Math.max(0.3, Math.round(z * 100) / 100))
/** DOM 스크롤 위치 변경(React 상태가 아님). 훅 인자에서 얻은 요소를 훅 안에서 직접 고치면 react(immutability) 경고가 나서 밖으로 뺐다 */
const scrollBy = (el: HTMLElement, dx: number, dy: number) => {
  el.scrollLeft += dx
  el.scrollTop += dy
}

/**
 * initial = 시작 배율, active = 휠 리스너를 붙일 수 있을 때(box 가 마운트된 뒤) true.
 * zoomRef·setZoom 을 그대로 내주는 이유: 레이아웃 이펙트 안(onSettled)에서는 flushSync 를 못 써서 호출자가 직접 배율을 놓고 다음 이펙트에서 스크롤한다.
 */
export function useZoom(box: RefObject<HTMLElement | null>, initial = 1, active = true) {
  const [zoom, setZoom] = useState(() => clampZoom(initial))
  const zoomRef = useRef(zoom)
  const graph = () => box.current?.querySelector<HTMLElement>('.graph')

  /** 화면 좌표 (cx, cy) 아래의 그래프 지점을 그대로 둔 채 배율 변경. 기준점을 안 주면 캔버스 중앙 */
  function zoomTo(next: number, cx?: number, cy?: number) {
    const el = box.current
    const g = graph()
    const z = zoomRef.current
    next = clampZoom(next)
    if (!el || !g || next === z) return
    const b = el.getBoundingClientRect()
    const x = cx ?? b.left + el.clientWidth / 2
    const y = cy ?? b.top + el.clientHeight / 2
    const r = g.getBoundingClientRect()
    const [gx, gy] = [(x - r.left) / z, (y - r.top) / z]
    zoomRef.current = next
    flushSync(() => setZoom(next))
    const r2 = g.getBoundingClientRect()
    scrollBy(el, r2.left + gx * next - x, r2.top + gy * next - y)
  }
  const zoomBy = (f: number) => zoomTo(zoomRef.current * f)
  /** 카드 중심을 캔버스 가운데로. 카드 rect 는 재배치 트랜지션 중일 수 있어 목표 좌표(style left/top)를 쓴다 */
  function centerOn(id: ID) {
    const el = box.current
    const g = graph()
    const card = el?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(id)}"]`)
    if (!el || !g || !card) return
    const [r, b, z] = [g.getBoundingClientRect(), el.getBoundingClientRect(), zoomRef.current]
    scrollBy(el, r.left + (parseFloat(card.style.left) + card.offsetWidth / 2) * z - (b.left + el.clientWidth / 2), r.top + (parseFloat(card.style.top) + card.offsetHeight / 2) * z - (b.top + el.clientHeight / 2))
  }
  /** 그래프 전체가 보이게(최대 100%) 배율을 맞추고, centerId 가 있으면 그 카드를 가운데로 */
  function fit(centerId?: ID) {
    const el = box.current
    const g = graph()
    if (!el || !g) return
    zoomTo(Math.min(1, (el.clientWidth - 16) / g.offsetWidth, (el.clientHeight - 16) / g.offsetHeight))
    if (centerId) centerOn(centerId)
  }
  useEffect(() => {
    const el = box.current
    if (!el || !active) return
    // 휠 = 확대·축소(수정자 없이도, 커서 기준). 휠 스크롤은 없다(이동은 빈 곳 드래그·핀치·터치). Ctrl/⌘+휠·트랙패드 핀치도 같은 경로.
    // React 의 wheel 리스너는 passive 라 preventDefault 가 안 된다 → 직접 등록
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomTo(zoomRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [active]) // oxlint-disable-line react-hooks/exhaustive-deps -- zoomTo 는 ref 와 setState 만 쓴다
  return { zoom, zoomRef, setZoom, zoomTo, zoomBy, fit, centerOn }
}
