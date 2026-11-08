// 아바타 — 01 §4 목록 행 · §3.3. 정사각 반경 0, 생성 아바타 = 이니셜 + 무채색 6톤(toneOf), 이미지는 object-fit cover, 깨지면 이니셜로 폴백.
import { useState, type CSSProperties } from 'react'
import { initialOf, toneOf } from '../core/avatar'

export function Avatar({ name, url, size = 36, className }: { name: string; url?: string | null; size?: 32 | 36 | 72; className?: string }) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const showImg = !!url && brokenUrl !== url
  return (
    <span
      className={`avatar ${className ?? ''}`} data-tone={toneOf(name)} role="img" aria-label={name}
      style={{ '--avatar-size': `${size}px` } as CSSProperties}
    >
      {showImg
        ? <img key={url} src={url} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setBrokenUrl(url)} />
        : initialOf(name)}
    </span>
  )
}
