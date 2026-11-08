// 로그인 화면 #/login — 02 §3.1 로그인 와이어(모바일 상단 1/3 블록, PC 360px 카드), 03 §3.2 인앱 브라우저·§3.6 ?e= 오류, 01 §4 로그인 행.
// UI-First: 버튼은 mockLogin → return_to(#/ 로 시작하는 해시만). "관리자로 로그인(데모)" 는 plan A2.
import { useEffect } from 'react'
import type { Provider } from '../../core/api'
import { chromeIntentHref, isInApp, isIOS } from '../../core/inapp'
import { mockLogin } from '../../core/mock/me'
import { href } from '../../router'
import { toast } from '../Toast'
import { PROVIDER_LABEL, ProviderLogo } from './providers'
import './account.css'

const ERR: Record<string, string> = { denied: '로그인이 취소되었어요', suspended: '정지된 계정이에요', state: '다시 시도해 주세요' }

export default function LoginPage({ e, returnTo }: { e?: string; returnTo?: string }) {
  const inapp = isInApp()
  useEffect(() => { if (e && ERR[e]) toast(ERR[e]) }, [e])
  const go = () => (location.hash = returnTo && returnTo.startsWith('#/') ? returnTo : href.trees())
  const login = (p: Provider, admin = false) => { mockLogin(p, { admin }); go() }
  return (
    <section className="login">
      <div className="login-card">
        <div className="login-brand"><span className="brand-mark" aria-hidden /> Drill Down</div>
        <p className="muted login-tag">트리를 저장하고 어디서나</p>
        <button type="button" className="oauth oauth-google" disabled={inapp} onClick={() => login('google')}>
          <ProviderLogo provider="google" /> {PROVIDER_LABEL.google}로 계속
        </button>
        <button type="button" className="oauth oauth-kakao" onClick={() => login('kakao')}>
          <ProviderLogo provider="kakao" fill="#000000" /> {PROVIDER_LABEL.kakao}로 계속
        </button>
        {inapp && (
          <p className="login-inapp" role="status">
            외부 브라우저에서 열어 주세요
            {isIOS() ? <span className="muted"> · 우측 하단 ⋯ → Safari로 열기</span> : <> · <a href={chromeIntentHref()}>Chrome으로 열기</a></>}
          </p>
        )}
        <a className="login-skip" href={href.trees()}>로그인 없이 계속 ›</a>
        <p className="login-foot muted">
          <a href="#/">개인정보</a> · <a href="#/">약관</a>
          <button type="button" className="link login-demo" onClick={() => login('google', true)}>관리자로 로그인(데모)</button>
        </p>
      </div>
    </section>
  )
}
