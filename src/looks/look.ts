// 디자인 시안 전환 — 사용자가 하나를 고르면 선택기와 나머지 CSS 를 지운다 (docs/plans/orchestration_liquid_glass.md §6)
import './lens.css'
import './depth.css'
import './frost.css'

export const LOOKS: Record<string, string> = { '': '기존', lens: 'A 렌즈', depth: 'B 깊이', frost: 'C 서리' }
const KEY = 'look'
const root = document.documentElement

export const currentLook = () => root.dataset.look ?? ''

export function setLook(look: string) {
  if (look) root.dataset.look = look
  else delete root.dataset.look
  try {
    localStorage.setItem(KEY, look)
  } catch { /* 저장 불가면 새로고침 시 기존 디자인으로 돌아갈 뿐 */ }
}

function stored() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
const initial = new URLSearchParams(location.search).get('look') ?? stored() ?? ''
if (Object.hasOwn(LOOKS, initial)) setLook(initial)

// backdrop-filter: url() 은 Chromium 만 그린다. Safari 는 @supports 를 통과하고 아무것도 그리지 않으므로 UA 신호로 가른다 (R5 5단계)
if ('userAgentData' in navigator) root.dataset.refract = ''
