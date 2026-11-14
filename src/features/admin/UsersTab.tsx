// 사용자 탭 — 검색·정지/해제·삭제(7일 유예 또는 즉시). 03 §3.4 사용자 행·권한 매트릭스. 상세 패널(세션·트리·UUID)은 T3 #34.
import { useEffect, useRef, useState } from 'react'
import type { AdminUser } from '../../core/api'
import { search } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { ProviderLogo } from '../account/providers'
import { toast } from '../Toast'
import { date, guard, post, usePaged } from './shared'
import { Loading, More } from './widgets'

type Update = (id: string, p: Partial<AdminUser> | null) => void
export default function UsersTab({ meId }: { meId: string }) {
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  useEffect(() => { const t = setTimeout(() => setNeedle(q.trim().slice(0, 40)), 300); return () => clearTimeout(t) }, [q])
  const { items: rows, loaded, next, more, patch } = usePaged<AdminUser>(`/api/admin/users?limit=50${needle ? `&q=${encodeURIComponent(needle)}` : ''}`)
  const update: Update = (id, p) => patch((xs) => (p ? xs.map((u) => (u.id === id ? { ...u, ...p } : u)) : xs.filter((u) => u.id !== id)))
  return (
    <>
      <label className="admin-search">
        <Icon d={search} /><input type="search" aria-label="사용자 검색" placeholder="닉네임 · UUID · provider:sub" maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <table>
        <thead><tr><th>닉네임</th><th>제공자</th><th>가입</th><th>마지막 접속</th><th>트리</th><th>상태</th><th aria-label="동작" /></tr></thead>
        <tbody>
          {rows.map((u) => <UserRow key={u.id} u={u} self={u.id === meId} update={update} />)}
        </tbody>
      </table>
      {!loaded && <Loading />}
      {loaded && rows.length === 0 && <p className="muted">결과 없음</p>}
      <More next={next} more={more} />
    </>
  )
}
function UserRow({ u, self, update }: { u: AdminUser; self: boolean; update: Update }) {
  const reason = useRef<HTMLInputElement>(null)
  const purgeBox = useRef<HTMLLabelElement>(null) // "즉시" 체크박스 — TwoStep 의 포커스 범위에 넣어 체크해도 풀리지 않게
  const [arming, setArming] = useState<'suspend' | 'delete' | null>(null)
  const [purge, setPurge] = useState(false)
  const status = u.deleted_at ? ['탈퇴 대기', false] as const : u.suspended_at ? ['정지', false] as const : u.role === 'admin' ? ['관리자', true] as const : ['정상', true] as const
  const disarm = () => { setArming(null); setPurge(false) }
  const take = () => { const v = reason.current?.value.trim(); setArming(null); return v || undefined }
  const act = (a: 'suspend' | 'unsuspend', why?: string) =>
    void post<{ user: AdminUser }>(`/api/admin/users/${u.id}/${a}`, why ? { reason: why } : {})
      .then((r) => { update(u.id, r.user); if (a === 'suspend') toast(`${u.nickname} 정지`) }, guard)
  const del = () => {
    setArming(null)
    void post(`/api/admin/users/${u.id}/delete`, { purge_now: purge })
      .then(() => { update(u.id, purge ? null : { deleted_at: Date.now() }); toast(purge ? '삭제됨' : '7일 뒤 삭제') }, guard)
  }
  return (
    <tr>
      <td data-l="닉네임" className="name" title={u.id}><ProviderLogo provider={u.provider} size={14} /> {u.nickname}</td>
      <td data-l="제공자">{u.provider}</td>
      <td data-l="가입" className="tnum">{date(u.created_at)}</td>
      <td data-l="마지막 접속" className="tnum">{date(u.last_seen_at)}</td>
      <td data-l="트리" className="tnum">{u.tree_count}</td>
      <td data-l="상태"><span className="dot" data-ok={status[1]} /> {status[0]}</td>
      <td className="act">
        {arming === 'suspend' && !u.suspended_at && <input ref={reason} className="reason" aria-label="정지 사유" placeholder="사유(선택 · 개인정보 금지)" maxLength={200} />}
        {arming === 'delete' && <label ref={purgeBox} className="toggle"><input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} /> 즉시</label>}
        <span onClickCapture={() => setArming('suspend')}>
          {u.suspended_at
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => { setArming(null); act('unsuspend') }} onDisarm={disarm} />
            : <TwoStep label="정지" confirmLabel="정말 정지" disabled={self || !!u.deleted_at} pauseWhileFocused={reason} onDisarm={disarm}
                onConfirm={() => act('suspend', take())} />}
        </span>
        <span onClickCapture={() => setArming('delete')} data-tip={self ? '본인 계정은 계정 화면에서 탈퇴' : undefined}>
          <TwoStep label="삭제" confirmLabel="정말 삭제" disabled={self} pauseWhileFocused={purgeBox} onDisarm={disarm} onConfirm={del} />
        </span>
      </td>
    </tr>
  )
}

