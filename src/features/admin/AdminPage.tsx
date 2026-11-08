// 관리자 #/admin(/users|trees|system) — 03 §3.4 화면 표·권한, 02 §3.1 관리자 와이어(PC 표 + sticky 헤더, ≤760 카드), 01 §3.5 관리자 행·§3.6 #22.
// 데이터는 전부 src/core/mock/admin.ts. 비관리자는 #/ 로. 파괴 동작(정지·삭제·숨김)은 TwoStep + 사유 입력(I14, 포커스 중 타이머 정지).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AdminTree, AdminUser, Report, ReportReason } from '../../core/api'
import { deleteUser, hideTree, putSettings, resolveReport, restoreTree, suspendUser, unhideTree, unsuspendUser, useAdmin } from '../../core/mock/admin'
import { useMe } from '../../core/mock/me'
import { href, type AdminTab } from '../../router'
import { I } from '../../ui/icons'
import { ban, database, eye, eyeOff, hardDrive, megaphone, search, undo2 } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { ProviderLogo } from '../account/providers'
import { toast } from '../Toast'
import './admin.css'

const TABS: [AdminTab, string][] = [['dashboard', '대시보드'], ['users', '사용자'], ['trees', '공개 트리'], ['system', '시스템']]
const REASON: Record<ReportReason, string> = { copyright: '저작권', spam: '스팸', abuse: '욕설·혐오', other: '기타' }
const p2 = (n: number) => String(n).padStart(2, '0')
const date = (t: number) => { const d = new Date(t); return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}` }
const when = (t: number) => { const d = new Date(t); return `${date(t)} ${p2(d.getHours())}:${p2(d.getMinutes())}` }
const bytes = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`)
const dur = (s: number) => `${Math.floor(s / 86400)}일 ${Math.floor((s % 86400) / 3600)}시간`

export default function AdminPage({ tab }: { tab: AdminTab }) {
  const me = useMe()
  const ok = me?.user.role === 'admin'
  useEffect(() => { if (!ok) location.hash = href.trees() }, [ok])
  if (!ok) return null
  return (
    <section className="admin" data-tab={tab}>
      <header className="admin-head">
        <h1>관리자</h1>
        <nav className="seg admin-tabs" aria-label="관리자 탭">
          {TABS.map(([t, label]) => <a key={t} href={href.admin(t)} aria-current={t === tab ? 'page' : undefined}>{label}</a>)}
        </nav>
      </header>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <Users meId={me.user.id} />}
      {tab === 'trees' && <Trees />}
      {tab === 'system' && <System />}
    </section>
  )
}

// ---- 대시보드 ----
const Card = ({ icon, label, value, sub }: { icon: string; label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="stat-card">
    <span className="stat-label"><Icon d={icon} /> {label}</span>
    <strong className="tnum">{value}</strong>
    {sub && <span className="stat-sub tnum">{sub}</span>}
  </div>
)
function Dashboard() {
  const { stats: s } = useAdmin()
  const used = 1 - s.disk.free / s.disk.total
  const [now] = useState(() => Date.now())
  const max = Math.max(1, ...s.users.signups_14d)
  return (
    <>
      <div className="stat-grid">
        <Card icon={I.user} label="가입자" value={s.users.total} sub={`오늘 ${s.users.today} · 7일 ${s.users.d7}`} />
        <Card icon={I.calendarCheck} label="활성" value={s.users.active7} sub={`30일 ${s.users.active30}`} />
        <Card icon={I.listTree} label="트리" value={s.trees.total} sub={<><Icon d={I.globe} /> 공개 {s.trees.public} · 숨김 {s.trees.hidden}</>} />
        <Card icon={hardDrive} label="디스크" value={`${Math.round(used * 100)}%`} sub={`여유 ${bytes(s.disk.free)}`} />
        <Card icon={database} label="백업" value={when(s.backup.at)} sub={<><span className="dot" data-ok={s.backup.ok} /> {bytes(s.backup.bytes)}</>} />
        <Card icon={I.refreshCw} label="일일 작업" value={when(s.daily.at)} sub={<><span className="dot" data-ok={s.daily.ok} /> 세션 {s.daily.purged_sessions} · 톰스톤 {s.daily.purged_tombstones}</>} />
        <Card icon={I.check} label="가동" value={dur(s.uptime_s)} sub={`RSS ${bytes(s.rss)}`} />
        <Card icon={ban} label="정지 · 탈퇴 대기" value={`${s.users.suspended} · ${s.users.pending_delete}`} />
      </div>
      <figure className="signups" role="img" aria-label={`최근 14일 가입: ${s.users.signups_14d.join(', ')}`}>
        <figcaption>14일 가입</figcaption>
        <div className="bars">
          {s.users.signups_14d.map((n, i) => {
            const d = date(now - (13 - i) * 86400_000)
            return <span key={i} className="bar" style={{ height: `${Math.max(4, (n / max) * 100)}%` }} data-tip={`${d} · ${n}명`} tabIndex={0} aria-label={`${d} ${n}명`} />
          })}
        </div>
      </figure>
    </>
  )
}

// ---- 사용자 ----
function Users({ meId }: { meId: string }) {
  const { users } = useAdmin()
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = needle ? users.filter((u) => u.nickname.toLowerCase().includes(needle) || u.id.includes(needle)) : users
  return (
    <>
      <label className="search">
        <Icon d={search} /><input type="search" aria-label="사용자 검색" placeholder="닉네임 · UUID" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <table>
        <thead><tr><th>닉네임</th><th>제공자</th><th>가입</th><th>마지막 접속</th><th>트리</th><th>상태</th><th aria-label="동작" /></tr></thead>
        <tbody>
          {rows.map((u) => <UserRow key={u.id} u={u} self={u.id === meId} />)}
        </tbody>
      </table>
      {rows.length === 0 && <p className="muted">결과 없음</p>}
    </>
  )
}
function UserRow({ u, self }: { u: AdminUser; self: boolean }) {
  const reason = useRef<HTMLInputElement>(null)
  const [arming, setArming] = useState<'suspend' | 'delete' | null>(null)
  const [purge, setPurge] = useState(false)
  const status = u.deleted_at ? ['탈퇴 대기', false] as const : u.suspended_at ? ['정지', false] as const : u.role === 'admin' ? ['관리자', true] as const : ['정상', true] as const
  const take = (ref: typeof reason) => { const v = ref.current?.value.trim(); setArming(null); return v || undefined }
  return (
    <tr>
      <td data-l="닉네임" className="name"><ProviderLogo provider={u.provider} size={14} /> {u.nickname}</td>
      <td data-l="제공자">{u.provider}</td>
      <td data-l="가입" className="tnum">{date(u.created_at)}</td>
      <td data-l="마지막 접속" className="tnum">{date(u.last_seen_at)}</td>
      <td data-l="트리" className="tnum">{u.tree_count}</td>
      <td data-l="상태"><span className="dot" data-ok={status[1]} /> {status[0]}</td>
      <td className="act">
        {arming === 'suspend' && !u.suspended_at && <input ref={reason} className="reason" aria-label="정지 사유" placeholder="사유(선택)" maxLength={200} />}
        {arming === 'delete' && <label className="toggle"><input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} /> 즉시</label>}
        <span onClickCapture={() => setArming('suspend')}>
          {u.suspended_at
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => { unsuspendUser(u.id); setArming(null) }} />
            : <TwoStep label="정지" confirmLabel="정말 정지" disabled={self || !!u.deleted_at} pauseWhileFocused={reason}
                onConfirm={() => { suspendUser(u.id, take(reason)); toast(`${u.nickname} 정지`) }} />}
        </span>
        <span onClickCapture={() => setArming('delete')}>
          <TwoStep label="삭제" confirmLabel="정말 삭제" disabled={self} onConfirm={() => { deleteUser(u.id, purge); setArming(null); toast(purge ? '삭제됨' : '7일 뒤 삭제') }} />
        </span>
      </td>
    </tr>
  )
}

// ---- 공개 트리 ----
function Trees() {
  const { trees, reports } = useAdmin()
  const live = trees.filter((t) => !t.deleted_at)
  const open = reports.filter((r) => !r.resolved_at)
  const deleted = trees.filter((t) => t.deleted_at)
  return (
    <>
      <table>
        <thead><tr><th>제목</th><th>소유자</th><th>노드</th><th>갱신</th><th>신고</th><th aria-label="동작" /></tr></thead>
        <tbody>{live.map((t) => <TreeRow key={t.id} t={t} />)}</tbody>
      </table>
      <h2>신고 {open.length}건</h2>
      {open.length === 0 ? <p className="muted">열린 신고 없음</p> : (
        <ul className="reports">
          {open.map((r: Report) => (
            <li key={r.id}>
              <span className="grow"><strong>{r.tree.title}</strong> · {REASON[r.reason]}{r.note && <><br /><span className="muted">{r.note}</span></>}</span>
              <button type="button" onClick={() => resolveReport(r.id, 'hidden')}><Icon d={eyeOff} /> 숨김</button>
              <button type="button" onClick={() => resolveReport(r.id, 'dismissed')}>기각</button>
            </li>
          ))}
        </ul>
      )}
      <h2>삭제된 트리 (7일)</h2>
      {deleted.length === 0 ? <p className="muted">없음</p> : (
        <ul className="reports">
          {deleted.map((t) => (
            <li key={t.id}>
              <span className="grow"><strong>{t.title}</strong> · {t.owner.nickname}<br /><span className="muted">{when(t.deleted_at!)} 삭제</span></span>
              <button type="button" onClick={() => { restoreTree(t.id); toast('복구됨') }}><Icon d={undo2} /> 복구</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
function TreeRow({ t }: { t: AdminTree }) {
  const reason = useRef<HTMLInputElement>(null)
  const [arming, setArming] = useState(false)
  const hidden = !!t.hidden_by_admin_at
  return (
    <tr>
      <td data-l="제목" className="name">{hidden && <Icon d={eyeOff} />} {t.title}</td>
      <td data-l="소유자">{t.owner.nickname}</td>
      <td data-l="노드" className="tnum">{t.node_count}</td>
      <td data-l="갱신" className="tnum">{date(t.updated_at)}</td>
      <td data-l="신고" className="tnum">{t.open_reports}</td>
      <td className="act">
        {arming && !hidden && <input ref={reason} className="reason" aria-label="숨김 사유" placeholder="사유(선택)" maxLength={200} />}
        <span onClickCapture={() => setArming(true)}>
          {hidden
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => { unhideTree(t.id); setArming(false) }} />
            : <TwoStep label="숨김" confirmLabel="정말 숨김" pauseWhileFocused={reason}
                onConfirm={() => { hideTree(t.id, reason.current?.value.trim() || undefined); setArming(false) }} />}
        </span>
      </td>
    </tr>
  )
}

// ---- 시스템 ----
function System() {
  const { settings, audit } = useAdmin()
  const [text, setText] = useState(settings.notice.text)
  const [enabled, setEnabled] = useState(settings.notice.enabled)
  return (
    <>
      <form className="notice-form" onSubmit={(e) => { e.preventDefault(); putSettings({ ...settings, notice: { text, enabled } }); toast('게시됨') }}>
        <label className="search">
          <Icon d={megaphone} /><input aria-label="공지" placeholder="공지 한 줄 (80자)" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 켜기</label>
        <button type="submit" className="primary"><Icon d={megaphone} /> 게시</button>
      </form>
      <label className="toggle">
        <input type="checkbox" checked={settings.maintenance.enabled} onChange={(e) => putSettings({ ...settings, maintenance: { enabled: e.target.checked } })} />
        점검 모드 (켜면 동기화 중단 배너)
      </label>
      <h2>감사 로그</h2>
      <table className="audit">
        <thead><tr><th>시각</th><th>동작</th><th>대상</th><th>메모</th></tr></thead>
        <tbody>
          {audit.slice(0, 50).map((a) => (
            <tr key={a.id}>
              <td data-l="시각" className="tnum">{when(a.ts)}</td>
              <td data-l="동작">{a.action}</td>
              <td data-l="대상" className="tnum">{a.target_type ? `${a.target_type} ${a.target_id?.slice(-6) ?? ''}` : '—'}</td>
              <td data-l="메모" className="muted">{a.meta ? JSON.stringify(a.meta).slice(0, 60) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted"><Icon d={eye} /> 숨김 트리는 공유 보기·갤러리에서 보이지 않습니다</p>
    </>
  )
}
