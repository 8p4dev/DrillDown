// 테마 3상태 — 01_design_system.md §3.7. 저장값 localStorage 'theme' ∈ {light, dark} 또는 없음(=auto).
// 동기화 4개: <html data-theme>(auto 는 제거) · CSS color-scheme(index.css 가 data-theme 로) · <meta theme-color> content · localStorage.
// 부팅 시 첫 페인트 전 적용은 index.html 의 인라인 스크립트가 한다(같은 규칙).
import { useSyncExternalStore } from 'react'

export type Theme = 'auto' | 'light' | 'dark'
const KEY = 'theme'
const BG = { light: '#f4f4f4', dark: '#121212' }
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const subs = new Set<() => void>()

const read = (): Theme => {
  try {
    const t = localStorage.getItem(KEY)
    return t === 'light' || t === 'dark' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

/** 저장값 → DOM(data-theme·theme-color) */
function apply() {
  const t = read()
  const root = document.documentElement
  // 1프레임 동안 모든 transition 을 끈다(index.css [data-theme-switch]) — 요소마다 색 보간 타이밍이 달라 얼룩지는 것 방지(01 §3.6 #2)
  root.dataset.themeSwitch = ''
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
  void root.offsetWidth // 스타일 확정 뒤에 속성을 풀어야 보간이 시작되지 않는다
  requestAnimationFrame(() => delete root.dataset.themeSwitch)
  const dark = t === 'auto' ? !!mq?.matches : t === 'dark'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? BG.dark : BG.light)
}
const emit = () => {
  apply()
  subs.forEach((f) => f())
}

let wired = false
function subscribe(f: () => void) {
  subs.add(f)
  if (!wired) {
    wired = true
    mq?.addEventListener('change', emit)
    addEventListener('storage', (e) => {
      if (e.key === KEY || e.key === null) emit()
    })
  }
  return () => void subs.delete(f)
}

export function setTheme(t: Theme) {
  try {
    if (t === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, t)
  } catch { /* 사생활 모드 등 — 메모리 상태 없이 DOM 만 갱신 */ }
  emit()
}

export function useTheme(): { theme: Theme; set: (t: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, read, () => 'auto' as Theme)
  return { theme, set: setTheme }
}
