// OAuth 제공자 로고 — 각사 가이드 모양을 단순화해 직접 그린 인라인 SVG(외부 요청 0). 브랜드 색은 4색 규칙 예외(00 §6 D5, plan A6).
import type { Provider } from '../../core/api'

// oxlint-disable-next-line react/only-export-components -- 라벨 상수와 로고를 한 파일에
export const PROVIDER_LABEL: Record<Provider, string> = { google: 'Google', kakao: '카카오', fake: '개발용' }

/** fill: 카카오 말풍선 색. 버튼 안은 브랜드 검정(#000000), 그 밖(표·연결 행)은 currentColor 로 다크에서도 보이게 */
export function ProviderLogo({ provider, size = 18, fill = 'currentColor' }: { provider: Provider; size?: number; fill?: string }) {
  if (provider === 'fake') return null
  if (provider === 'google') {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    )
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path fill={fill} d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.33 4.66 6.75L5.6 21.6c-.1.36.3.65.62.45l4.44-2.96c.44.05.88.08 1.34.08 5.52 0 10-3.58 10-8S17.52 3 12 3z" />
    </svg>
  )
}
