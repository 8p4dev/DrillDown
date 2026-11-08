// [스텁 — AA 가 교체] 계정 화면 #/account. 계약: 03 §3.3, 02 §3.1 계정 와이어.
import { useEffect } from 'react'
import { mockLogout, useMe } from '../../core/mock/me'
import { href } from '../../router'

export default function AccountPage() {
  const me = useMe()
  useEffect(() => { if (!me) location.hash = href.login(href.account()) }, [me])
  if (!me) return null
  return (
    <section className="account">
      <h1>계정</h1>
      <p>{me.user.nickname}</p>
      <button type="button" onClick={() => (mockLogout(), (location.hash = href.trees()))}>로그아웃</button>
    </section>
  )
}
