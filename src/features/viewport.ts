// 모바일 키보드·시각 뷰포트 — 계약 docs/specs/02_layout_mobile.md §3.3 (LM 소유)
// kb = 키보드 높이(px). :root 에 --kb·--vv-h 를 쓰고 data-kb 를 토글한다. 읽는 선택자는 ≤6개(02 §3.7), 노드 카드에서는 읽지 않는다.
import { useSyncExternalStore } from 'react'

export type Viewport = { kb: number; height: number; open: boolean }

const MIN_KB = 100 // URL 바 접힘·iOS 26 24px 잔차는 키보드가 아니다
let state: Viewport = { kb: 0, height: typeof innerHeight === 'number' ? innerHeight : 0, open: false }
const subs = new Set<(v: Viewport) => void>()
let started = false
let raf = 0

function compute(): Viewport {
  const vv = window.visualViewport
  const h = vv ? vv.height : innerHeight
  let kb = vv ? Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) : 0
  if (kb < MIN_KB) kb = 0
  return { kb, height: Math.round(h), open: kb > 0 }
}
function flush() {
  raf = 0
  const next = compute()
  if (next.kb === state.kb && next.height === state.height) return
  state = next
  const root = document.documentElement
  root.style.setProperty('--kb', `${next.kb}px`)
  root.style.setProperty('--vv-h', `${next.height}px`)
  root.toggleAttribute('data-kb', next.open)
  subs.forEach((f) => f(next))
  // --kb 가 바뀐 시점: iOS 는 포커스 → 키보드 애니메이션 뒤에야 resize 가 온다 (02 §3.2 규칙 3)
  if (document.activeElement && document.activeElement !== document.body) ensureVisible(document.activeElement)
}
const schedule = () => {
  if (!raf) raf = requestAnimationFrame(flush)
}

/** 리스너 설치. 여러 화면이 불러도 1회만 */
export function startViewport() {
  if (started || typeof window === 'undefined') return
  started = true
  const vv = window.visualViewport
  vv?.addEventListener('resize', schedule, { passive: true })
  vv?.addEventListener('scroll', schedule, { passive: true })
  document.addEventListener('focusin', (e) => {
    schedule()
    if (e.target instanceof Element) ensureVisible(e.target)
  })
  document.addEventListener('focusout', schedule)
}

export function subscribeViewport(cb: (v: Viewport) => void): () => void {
  subs.add(cb)
  return () => void subs.delete(cb)
}
const subscribe = (f: () => void) => subscribeViewport(f)
export function useVisualViewport(): Viewport {
  return useSyncExternalStore(subscribe, () => state)
}

const isScroller = (el: Element) => {
  const o = getComputedStyle(el).overflowY
  return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight
}
/** 입력칸(캐럿 줄)이 키보드 위 보이는 영역 안에 오도록 가장 가까운 스크롤러를 조정 */
export function ensureVisible(el: Element, margin = 16): void {
  if (!(el instanceof HTMLElement) || !el.isConnected) return
  const limit = innerHeight - state.kb - margin
  // 캐럿이 있는 contenteditable 은 캐럿 줄 기준 (I5)
  let bottom = el.getBoundingClientRect().bottom
  if (el.isContentEditable) {
    const r = getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).getBoundingClientRect() : null
    if (r && r.height) bottom = r.bottom
  }
  if (bottom <= limit && el.getBoundingClientRect().top >= 0) return
  // 가장 가까운 스크롤러(없으면 window)를 차액만큼
  let p: Element | null = el.parentElement
  while (p && p !== document.body && !isScroller(p)) p = p.parentElement
  const dy = bottom - limit
  if (p && p !== document.body) {
    if (dy > 0) p.scrollTop += dy
    else el.scrollIntoView({ block: 'nearest' })
  } else if (dy > 0) scrollBy(0, dy)
  else el.scrollIntoView({ block: 'nearest' })
}
