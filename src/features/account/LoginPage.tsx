// 로그인 화면 #/login — 02 §3.1 로그인 와이어(모바일 상단 1/3 블록, PC 360px 카드), 03 §3.2 인앱 브라우저·§3.6 ?e= 오류, 01 §4 로그인 행.
// 버튼 = 같은 창 이동 /api/auth/:provider/start?return_to=#/… (standalone 규칙). 설정 안 된 제공자는 비활성(GET /api/auth/providers).
import { useEffect } from 'react'
import type { Provider } from '../../core/api'
import { chromeIntentHref, isInApp, isIOS } from '../../core/inapp'
import { login, useProviders } from '../../core/me'
import { href } from '../../router'
import { toast } from '../Toast'
import { PROVIDER_LABEL, ProviderLogo } from './providers'
import './account.css'

const ERR: Record<string, string> = { denied: '로그인이 취소되었어요', suspended: '정지된 계정이에요', state: '다시 시도해 주세요' }
const UNSET = '운영자 설정 필요'

export default function LoginPage({ e, r, returnTo }: { e?: string; r?: string; returnTo?: string }) {
  const inapp = isInApp()
  const prov = useProviders()
  useEffect(() => { if (e && ERR[e]) toast(ERR[e]) }, [e])
  const off = (p: 'google' | 'kakao') => prov !== null && !prov[p]
  const go = (p: Provider, as?: 'user' | 'admin') => login(p, returnTo, { as })
  return (
    <section className="login">
      <div className="login-card">
        <div className="login-brand"><span className="brand-mark" aria-hidden /> Drill Down</div>
        <p className="muted login-tag">트리를 저장하고 어디서나</p>
        <button type="button" className="oauth oauth-google" disabled={inapp || off('google')} data-tip={off('google') ? UNSET : undefined}
          onClick={() => go('google')}>
          <ProviderLogo provider="google" /> {PROVIDER_LABEL.google}로 계속
        </button>
        <button type="button" className="oauth oauth-kakao" disabled={off('kakao')} data-tip={off('kakao') ? UNSET : undefined}
          onClick={() => go('kakao')}>
          <ProviderLogo provider="kakao" fill="#000000" /> {PROVIDER_LABEL.kakao}로 계속
        </button>
        {(off('google') || off('kakao')) && <span className="stat">{UNSET}</span>}{/* r3 L5: disabled 버튼의 data-tip 은 키보드·SR·터치가 못 읽는다 */}
        {inapp && (
          <p className="login-inapp" role="status">
            외부 브라우저에서 열어 주세요
            {isIOS() ? <span className="muted"> · 우측 하단 ⋯ → Safari로 열기</span> : <> · <a href={chromeIntentHref()}>Chrome으로 열기</a></>}
          </p>
        )}
        {e === 'suspended' && (
          <p className="login-inapp" role="alert">
            정지된 계정이에요{r && <> · 사유: {r}</>}
            <span className="muted"> · 이의가 있으면 {prov?.privacy_contact || '운영자'}에게 알려 주세요 (<a href={href.terms()}>약관</a>)</span>
          </p>
        )}
        <a className="login-skip" href={href.trees()}>로그인 없이 계속 ›</a>
        <p className="login-foot muted">
          <a href={href.privacy()}>개인정보 처리방침</a> · <a href={href.terms()}>이용약관</a>
          {prov?.fake && (
            <span className="login-demo">
              개발용 로그인:{' '}
              <button type="button" className="link" onClick={() => go('fake', 'user')}>사용자</button>{' / '}
              <button type="button" className="link" onClick={() => go('fake', 'admin')}>관리자</button>
            </span>
          )}
        </p>
      </div>
    </section>
  )
}
