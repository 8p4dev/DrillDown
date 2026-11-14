// 사용자 탭 — 검색·상태 필터·정지/해제·삭제(7일 유예 또는 즉시) + 상세 패널(세션·트리·UUID·provider:sub·세션 전부 폐기·탈퇴 취소, T3 #34). 03 §3.4 사용자 행·권한 매트릭스.
// 다른 관리자는 정지·삭제 버튼 비활성(서버도 403, w1 §8).
import { useEffect, useRef, useState } from 'react'
import type { AdminUser, AdminUserDetail } from '../../core/api'
import { copy, logOut, search } from '../../ui/icons.all'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { ProviderLogo } from '../account/providers'
import { toast } from '../Toast'
import { ACTION, date, guard, post, useGet, usePaged, when } from './shared'
import { More } from './widgets'

Object.assign(ACTION, { 'user.sessions_revoke': '사용자 세션 전부 폐기' })

type Update = (id: string, p: Partial<AdminUser> | null) => void
type Status = 'ok' | 'suspended' | 'deleted' | 'admin'
const STATUS: [Status | '', string][] = [['', '전체'], ['ok', '정상'], ['suspended', '정지'], ['deleted', '탈퇴 대기'], ['admin', '관리자']]
const statusOf = (u: AdminUser): Status => u.deleted_at ? 'deleted' : u.suspended_at ? 'suspended' : u.role === 'admin' ? 'admin' : 'ok'
const LABEL: Record<Status, string> = { ok: '정상', suspended: '정지', deleted: '탈퇴 대기', admin: '관리자' }

export default function UsersTab({ meId }: { meId: string }) {
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  const [st, setSt] = useState<Status | ''>('')
  const [tick, setTick] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => setNeedle(q.trim().slice(0, 40)), 300); return () => clearTimeout(t) }, [q])
  const { items, loaded, next, more, patch } = usePaged<AdminUser>(`/api/admin/users?limit=50${needle ? `&q=${encodeURIComponent(needle)}` : ''}`, tick)
  const update: Update = (id, p) => patch((xs) => (p ? xs.map((u) => (u.id === id ? { ...u, ...p } : u)) : xs.filter((u) => u.id !== id)))
  // ponytail: 상태 필터는 받아 온 페이지 안에서만 거른다(서버 users 라우트는 다른 워커 소유). 수백 명 규모면 "더 보기" 로 충분
  const rows = st ? items.filter((u) => statusOf(u) === st) : items
  return (
    <>
      <div className="filters">
        <label className="admin-search">
          <Icon d={search} /><input type="search" aria-label="사용자 검색" placeholder="닉네임 · UUID · provider:sub" maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select aria-label="상태 필터" value={st} onChange={(e) => setSt(e.target.value as Status | '')}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <table>
        <thead><tr><th>닉네임</th><th>제공자</th><th>가입</th><th>마지막 접속</th><th>트리</th><th>상태</th><th aria-label="동작" /></tr></thead>
        <tbody>
          {rows.map((u) => (
            <UserRow key={u.id} u={u} self={u.id === meId} update={update} open={open === u.id} toggle={() => setOpen(open === u.id ? null : u.id)} />
          ))}
        </tbody>
      </table>
      {!loaded && <p className="muted" aria-busy="true">불러오는 중… <button type="button" className="link" onClick={() => setTick((t) => t + 1)}>다시 시도</button></p>}
      {loaded && rows.length === 0 && <p className="muted">결과 없음{st && items.length > 0 && ' (이 페이지 안에서) '}{next && <button type="button" className="link" onClick={more}>더 불러오기</button>}</p>}
      <More next={next} more={more} />
    </>
  )
}
function UserRow({ u, self, update, open, toggle }: { u: AdminUser; self: boolean; update: Update; open: boolean; toggle: () => void }) {
  const reason = useRef<HTMLInputElement>(null)
  const purgeBox = useRef<HTMLLabelElement>(null) // "즉시" 체크박스 — TwoStep 의 포커스 범위에 넣어 체크해도 풀리지 않게
  const [arming, setArming] = useState<'suspend' | 'delete' | null>(null)
  const [purge, setPurge] = useState(false)
  const status = statusOf(u)
  const locked = u.role === 'admin' && !self // 다른 관리자: 상호 잠금(서버 403)
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
  const tip = self ? '본인 계정은 계정 화면에서 탈퇴' : locked ? '다른 관리자는 정지·삭제 불가 (admins.json 에서 빼고 SSH)' : undefined
  return (
    <>
      <tr>
        <td data-l="닉네임" className="name" title={u.id}><ProviderLogo provider={u.provider} size={14} /> {u.nickname}</td>
        <td data-l="제공자">{u.provider}</td>
        <td data-l="가입" className="tnum">{date(u.created_at)}</td>
        <td data-l="마지막 접속" className="tnum">{date(u.last_seen_at)}</td>
        <td data-l="트리" className="tnum">{u.tree_count}</td>
        <td data-l="상태"><span className="dot" data-ok={status === 'ok' || status === 'admin'} /> {LABEL[status]}</td>
        <td className="act">
          <button type="button" className="ghost" aria-expanded={open} aria-label={`${u.nickname} 상세`} onClick={toggle}><Icon d={open ? I.x : I.ellipsis} /></button>
          {arming === 'suspend' && !u.suspended_at && <input ref={reason} className="reason" aria-label="정지 사유" placeholder="사유(선택 · 개인정보 금지)" maxLength={200} />}
          {arming === 'delete' && <label ref={purgeBox} className="toggle"><input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} /> 즉시</label>}
          <span onClickCapture={() => setArming('suspend')} data-tip={locked ? tip : undefined}>
            {u.suspended_at
              ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => { setArming(null); act('unsuspend') }} onDisarm={disarm} />
              : <TwoStep label="정지" confirmLabel="정말 정지" disabled={self || locked || !!u.deleted_at} pauseWhileFocused={reason} onDisarm={disarm}
                  onConfirm={() => act('suspend', take())} />}
          </span>
          <span onClickCapture={() => setArming('delete')} data-tip={tip}>
            <TwoStep label="삭제" confirmLabel="정말 삭제" disabled={self || locked} pauseWhileFocused={purgeBox} onDisarm={disarm} onConfirm={del} />
          </span>
        </td>
      </tr>
      {open && <tr className="row-detail"><td colSpan={7}><UserDetail u={u} update={update} /></td></tr>}
    </>
  )
}

/** 상세: GET /api/admin/users/:id (조회도 감사 user.view 로 남는다). 상태(정지·탈퇴)는 행(u)이 최신이라 거기서 읽는다. 세션 전부 폐기는 정지 없이 끊기만, 탈퇴 취소는 유예 중 트리도 복원 */
function UserDetail({ u, update }: { u: AdminUser; update: Update }) {
  const [tick, setTick] = useState(0)
  const [d, setD] = useGet<AdminUserDetail>(`/api/admin/users/${u.id}`, tick)
  const copyId = () => void navigator.clipboard.writeText(u.id).then(() => toast('UUID 복사됨'), () => toast('복사 실패 · 닉네임에 마우스를 올리면 보여요'))
  const revoke = () => void post<{ count: number }>(`/api/admin/users/${u.id}/revoke-sessions`).then((r) => { toast(`${r.count}개 세션 폐기`); setD((x) => (x ? { ...x, sessions: 0 } : x)) }, guard)
  const undelete = () => void post(`/api/admin/users/${u.id}/undelete`).then(() => { update(u.id, { deleted_at: null }); toast('탈퇴 취소됨 · 트리 복원'); setTick((t) => t + 1) }, guard)
  if (!d) return <p className="muted" aria-busy="true">불러오는 중… <button type="button" className="link" onClick={() => setTick((t) => t + 1)}>다시 시도</button></p>
  return (
    <div className="user-detail">
      <dl className="kv">
        <dt>UUID</dt><dd><code>{d.id}</code> <button type="button" className="ghost" aria-label="UUID 복사" onClick={copyId}><Icon d={copy} /></button></dd>
        <dt>식별자</dt><dd><code>{d.provider}:{d.provider_sub}</code> <span className="muted">(admins.json 형식)</span></dd>
        <dt>세션</dt><dd>{d.sessions}개</dd>
        {u.suspended_at && <><dt>정지</dt><dd>{when(u.suspended_at)}</dd></>}
        {u.deleted_at && <><dt>탈퇴 요청</dt><dd>{when(u.deleted_at)} · 7일 뒤 완전 삭제</dd></>}
        <dt>트리 {d.trees.length}</dt>
        <dd>{d.trees.length ? <ul className="trees">{d.trees.map((t) => <li key={t.id}>{t.title || '(제목 없음)'} <span className="muted">· {t.visibility} · {date(t.updated_at)}</span></li>)}</ul> : <span className="muted">없음{u.deleted_at ? ' (유예 중 트리는 탈퇴 취소 뒤 보임)' : ''}</span>}</dd>
      </dl>
      <div className="btn-row">
        <TwoStep label={<><Icon d={logOut} /> 세션 전부 폐기</>} confirmLabel="정말 폐기" verb="세션 폐기" disabled={d.sessions === 0} onConfirm={revoke} />
        {u.deleted_at && <TwoStep label="탈퇴 취소" confirmLabel="정말 취소" verb="탈퇴 취소" onConfirm={undelete} />}
        <span className="muted">세션 폐기는 정지 없이 모든 기기에서 로그아웃만 시킵니다</span>
      </div>
    </div>
  )
}
