// 2단계 버튼 — 01 §3.6 #22. 같은 자리 [라벨] → [확인 라벨](danger 채움) → 3초 안에 한 번 더 = 실행, 지나면·Esc·포커스 이탈 = 복귀.
// 폭은 두 글자를 같은 칸에 겹쳐(.ts-labels) 고정 — 레이아웃 이동 0. pauseWhileFocused 안에 포커스가 있으면(사유 입력) 타이머 정지.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { haptic } from '../features/feel'

export function TwoStep(p: {
  label: ReactNode; confirmLabel: ReactNode; onConfirm: () => void
  className?: string; disabled?: boolean; pauseWhileFocused?: RefObject<HTMLElement | null>
  /** 확인 없이 풀렸을 때(3초·Esc·포커스 이탈) — 호출자가 사유 입력칸 등을 접는다 */
  onDisarm?: () => void
  /** aria-live 문장의 동사(기본: label 이 문자열이면 그 글자). 예: "탈퇴" → "한 번 더 누르면 탈퇴" */
  verb?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef(0)
  const pause = p.pauseWhileFocused
  const disarm = useRef(p.onDisarm) // 콜백 identity 가 바뀌어도 타이머를 다시 걸지 않게 ref 로
  useEffect(() => { disarm.current = p.onDisarm })
  const cancel = () => { setArmed(false); disarm.current?.() }

  useEffect(() => {
    if (!armed) return
    const start = () => { clearTimeout(timer.current); timer.current = window.setTimeout(cancel, 3000) }
    const stop = () => clearTimeout(timer.current)
    const el = pause?.current
    if (el?.contains(document.activeElement)) stop()
    else start()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel() }
    el?.addEventListener('focusin', stop)
    el?.addEventListener('focusout', start)
    document.addEventListener('keydown', onKey)
    return () => {
      stop()
      el?.removeEventListener('focusin', stop)
      el?.removeEventListener('focusout', start)
      document.removeEventListener('keydown', onKey)
    }
  }, [armed, pause])

  const verb = p.verb ?? (typeof p.label === 'string' ? p.label : '실행')
  return (
    <>
      <button
        type="button" className={`danger two-step ${p.className ?? ''}`} disabled={p.disabled} data-armed={armed || undefined}
        onClick={() => {
          if (armed) { setArmed(false); p.onConfirm() }
          else { setArmed(true); haptic('warn') }
        }}
        onBlur={(e) => {
          const next = e.relatedTarget
          if (armed && !(next instanceof Node && pause?.current?.contains(next))) cancel()
        }}
      >
        <span className="ts-labels">
          <span aria-hidden={armed || undefined}>{p.label}</span>
          <span aria-hidden={!armed || undefined}>{p.confirmLabel}</span>
        </span>
      </button>
      <span className="sr-only" aria-live="polite">{armed ? `한 번 더 누르면 ${verb}` : ''}</span>
    </>
  )
}
