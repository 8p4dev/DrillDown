// [스텁 — DS 가 교체] 테마 3상태 토글. 계약: 01_design_system.md §3.7 (auto/light/dark, :root[data-theme], localStorage 'theme')
import { I } from './icons'
import { Icon } from './Icon'

export default function ThemeToggle() {
  return (
    <div role="group" aria-label="테마" className="theme-toggle">
      <button type="button" className="ghost" aria-pressed="true" aria-label="자동"><Icon d={I.sunMoon} size={20} /></button>
    </div>
  )
}
