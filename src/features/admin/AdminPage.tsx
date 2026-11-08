// [스텁 — AA 가 교체] 관리자 #/admin(/users|trees|system). 계약: 03 §3.4, 02 §3.1 관리자 와이어. 비관리자는 #/ 로.
import { useEffect } from 'react'
import { useMe } from '../../core/mock/me'
import { href, type AdminTab } from '../../router'

export default function AdminPage({ tab }: { tab: AdminTab }) {
  const me = useMe()
  const ok = me?.user.role === 'admin'
  useEffect(() => { if (!ok) location.hash = href.trees() }, [ok])
  if (!ok) return null
  return (
    <section className="admin">
      <h1>관리자</h1>
      <p>{tab}</p>
    </section>
  )
}
