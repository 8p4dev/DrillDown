// [스텁 — AA 가 교체] 로그인 화면 #/login. 계약: 03 §3.2·§4, 02 §3.1 로그인 와이어. UI-First: 버튼은 mockLogin 호출.
import { mockLogin } from '../../core/mock/me'
import { href } from '../../router'

export default function LoginPage({ e, returnTo }: { e?: string; returnTo?: string }) {
  const go = () => (location.hash = returnTo && returnTo.startsWith('#/') ? returnTo : href.trees())
  return (
    <section className="login">
      <h1>로그인</h1>
      {e && <p role="alert">{e}</p>}
      <button type="button" onClick={() => (mockLogin('google'), go())}>Google로 계속</button>
      <button type="button" onClick={() => (mockLogin('kakao'), go())}>카카오로 계속</button>
    </section>
  )
}
