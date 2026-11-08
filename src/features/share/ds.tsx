// [임시 폴백 — DS 머지 후 삭제] 이 워크트리에는 DS 의 src/ui/Sheet·Avatar 가 아직 없다(plan §3.2 신규).
// 같은 시그니처로 최소 구현해 두고, 머지 때 import 를 '../../ui/Sheet'·'../../ui/Avatar' 로 바꾼다. 모양은 share.css 의 .sheet·.avatar(scoped).
import { useEffect, type ReactNode } from 'react'
import { initialOf, toneOf } from '../../core/avatar'

export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label={label} className="sheet">{children}</div>
    </>
  )
}

export function Avatar({ name, url, size = 32 }: { name: string; url?: string | null; size?: number }) {
  return (
    <span className="avatar" data-tone={toneOf(name)} style={{ width: size, height: size, fontSize: size * 0.5 }} aria-hidden>
      {url ? <img src={url} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} /> : initialOf(name)}
    </span>
  )
}
