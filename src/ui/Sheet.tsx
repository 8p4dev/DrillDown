// 하단 시트 — 02 §3.2 규칙 4(a): 바닥 고정, bottom: var(--kb), max-height = 100dvh − kb − nav. 바깥 탭·Esc 닫기, role=dialog,
// 열릴 때 첫 포커스 가능 요소로, 닫힐 때 원래 자리로. body 스크롤 잠금 없음(시트 자체가 overscroll-behavior: contain).
import { useEffect, useRef, type ReactNode } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  // 포커스 이동은 open 이 바뀔 때만(부모 재렌더로 입력 포커스를 뺏지 않게)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement
    const el = ref.current
    ;(el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus()
    return () => { if (prev instanceof HTMLElement) prev.focus() }
  }, [open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </>
  )
}
