// [임시 shim — DS 머지 후 삭제] 계약 orchestration_ui_first.md §3.2 의 DS 공용 컴포넌트가 아직 없어 AA 화면이 빌드되도록 같은 시그니처로 둔 것.
// 교체 방법: 이 파일과 ds-shim.css 를 지우고, import 를 '../../ui/TwoStep' '../../ui/Avatar' '../../ui/Sheet' '../Toast'(hint) 로 바꾼다.
// 클래스 이름(.two-step .avatar[data-tone] .sheet)은 계약과 같아 DS 의 index.css 규칙이 그대로 입혀진다.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { initialOf, toneOf } from '../../core/avatar'
import { toast } from '../Toast'
import './ds-shim.css'

/** 1회성 힌트(01 §3.5): localStorage 'hint:<id>' 가 없을 때만 토스트 1번 */
// oxlint-disable-next-line react/only-export-components -- DS Toast.tsx 와 같은 구성(hint 는 토스트 API)
export function hint(id: string, text: string) {
  const k = `hint:${id}`
  try {
    if (localStorage.getItem(k)) return
    localStorage.setItem(k, '1')
  } catch { /* 저장 불가 → 매번 보여도 무해 */ }
  toast(text)
}

/** 생성 아바타(01 §4 목록 행): 정사각 이니셜 + 톤 0~5. url 이 있으면 <img>, 로드 실패하면 이니셜로 폴백 */
export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: 32 | 36 | 72 }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const showImg = !!url && brokenUrl !== url
  return (
    <span className="avatar" data-tone={toneOf(name)} data-size={size} aria-hidden>
      {showImg ? <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBrokenUrl(url)} /> : initialOf(name)}
    </span>
  )
}

/** 2단계 버튼(01 §3.6 #22): 1탭 → [confirmLabel](danger 채움) 3초, 2탭 = 실행. 시간 초과·포커스 이탈·Esc 는 복귀.
 *  pauseWhileFocused: 그 요소(사유 입력칸)에 포커스가 있는 동안 타이머를 멈춘다(02 §3.1 관리자). */
export function TwoStep({ label, confirmLabel, onConfirm, className, pauseWhileFocused, disabled }: {
  label: string; confirmLabel: string; onConfirm: () => void; className?: string
  pauseWhileFocused?: RefObject<HTMLElement | null>; disabled?: boolean
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const start = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setArmed(false), 3000) }
  useEffect(() => {
    if (!armed) return
    start()
    const el = pauseWhileFocused?.current
    const pause = () => clearTimeout(timer.current)
    el?.addEventListener('focus', pause)
    el?.addEventListener('blur', start)
    return () => { clearTimeout(timer.current); el?.removeEventListener('focus', pause); el?.removeEventListener('blur', start) }
  }, [armed, pauseWhileFocused])
  return (
    <span className="two-step">
      <button type="button" className={`${className ?? ''} ${armed ? 'danger armed' : ''}`.trim()} disabled={disabled}
        aria-live="polite"
        onClick={() => { if (armed) { setArmed(false); onConfirm() } else setArmed(true) }}
        onKeyDown={(e) => e.key === 'Escape' && setArmed(false)}
        onBlur={(e) => {
          // 사유 입력칸으로 가는 포커스는 복귀시키지 않는다(입력 뒤 돌아와 2탭)
          if (pauseWhileFocused?.current && e.relatedTarget === pauseWhileFocused.current) return
          setArmed(false)
        }}>
        <span className="two-step-label" aria-hidden>{label}</span>
        <span className="two-step-confirm" aria-hidden>{confirmLabel}</span>
        <span className="sr-only">{armed ? `한 번 더 누르면 ${label}` : label}</span>
      </button>
    </span>
  )
}

/** 하단 시트(02 §3.2 규칙 4(a)): bottom: var(--kb), max-height 는 키보드·상단 바를 뺀 높이. 배경 탭 = onClose */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
