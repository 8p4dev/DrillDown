// 관리자 #/admin(/users|trees|system) — 03 §3.4 화면 표·권한, 02 §3.1 관리자 와이어(PC 표 + sticky 헤더, ≤760 카드), 01 §3.5 관리자 행·§3.6 #22.
// 데이터는 전부 /api/admin/*(03 §3.6). 목록은 cursor "더 보기". 비관리자·API 404 는 #/ 로. 파괴 동작(정지·삭제·숨김)은 TwoStep + 사유 입력(I14, 포커스 중 타이머 정지).
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { api, ApiError, type AdminStats, type AdminTree, type AdminUser, type AuditRow, type Page, type Report, type ReportReason, type Settings } from '../../core/api'
import { refreshMe, useMe, useMeReady } from '../../core/me'
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

// ---- 데이터: GET 1회 / cursor 페이지. 404(권한 없음 숨김) → #/ ----
const guard = (e: unknown) => {
  if (e instanceof ApiError && e.status === 404) location.hash = href.trees()
  else toast(e instanceof ApiError && e.status === 0 ? '오프라인이에요' : '실패했어요 · 다시 시도해 주세요')
}
function useGet<T>(path: string, tick = 0): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [v, set] = useState<T | null>(null)
  useEffect(() => {
    let on = true
    api<T>(path).then((r) => { if (on) set(r) }, guard)
    return () => { on = false }
  }, [path, tick])
  return [v, set]
}
function usePaged<T>(path: string, tick = 0) {
  const [page, setPage] = useGet<Page<T>>(path, tick)
  const more = () => {
    if (!page?.next) return
    api<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(page.next)}`)
      .then((r) => setPage((p) => ({ items: [...(p?.items ?? []), ...r.items], next: r.next })), guard)
  }
  const patch = (f: (xs: T[]) => T[]) => setPage((p) => (p ? { ...p, items: f(p.items) } : p))
  return { items: page?.items ?? [], loaded: !!page, next: page?.next ?? null, more, patch }
}
const More = ({ next, more }: { next: string | null; more: () => void }) =>
  next ? <button type="button" className="more" onClick={more}>더 보기</button> : null
const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })

export default function AdminPage({ tab }: { tab: AdminTab }) {
  const me = useMe()
  const ready = useMeReady()
  const ok = me?.user.role === 'admin'
  useEffect(() => { if (ready && !ok) location.hash = href.trees() }, [ready, ok])
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
  const [s] = useGet<AdminStats>('/api/admin/stats')
  const [now] = useState(() => Date.now())
  if (!s) return null
  const used = s.disk.total ? 1 - s.disk.free / s.disk.total : 0
  const max = Math.max(1, ...s.users.signups_14d)
  return (
    <>
      <div className="stat-grid">
        <Card icon={I.user} label="가입자" value={s.users.total} sub={`오늘 ${s.users.today} · 7일 ${s.users.d7}`} />
        <Card icon={I.calendarCheck} label="활성" value={s.users.active7} sub={`30일 ${s.users.active30}`} />
        <Card icon={I.listTree} label="트리" value={s.trees.total} sub={<><Icon d={I.globe} /> 공개 {s.trees.public} · 숨김 {s.trees.hidden}</>} />
        <Card icon={hardDrive} label="디스크" value={`${Math.round(used * 100)}%`} sub={`여유 ${bytes(s.disk.free)}`} />
        <Card icon={database} label="백업" value={s.backup.at ? when(s.backup.at) : '—'} sub={<><span className="dot" data-ok={s.backup.ok} /> {bytes(s.backup.bytes)}</>} />
        <Card icon={I.refreshCw} label="일일 작업" value={s.daily.at ? when(s.daily.at) : '—'} sub={<><span className="dot" data-ok={s.daily.ok} /> 세션 {s.daily.purged_sessions} · 톰스톤 {s.daily.purged_tombstones}</>} />
        <Card icon={I.check} label="가동" value={dur(s.uptime_s)} sub={`RSS ${bytes(s.rss)}`} />
        <Card icon={ban} label="정지 · 탈퇴 대기" value={`${s.users.suspended} · ${s.users.pending_delete}`} />
      </div>
      <figure className="signups">
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
type Update = (id: string, p: Partial<AdminUser> | null) => void
function Users({ meId }: { meId: string }) {
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  useEffect(() => { const t = setTimeout(() => setNeedle(q.trim().slice(0, 40)), 300); return () => clearTimeout(t) }, [q])
  const { items: rows, loaded, next, more, patch } = usePaged<AdminUser>(`/api/admin/users?limit=50${needle ? `&q=${encodeURIComponent(needle)}` : ''}`)
  const update: Update = (id, p) => patch((xs) => (p ? xs.map((u) => (u.id === id ? { ...u, ...p } : u)) : xs.filter((u) => u.id !== id)))
  return (
    <>
      <label className="search">
        <Icon d={search} /><input type="search" aria-label="사용자 검색" placeholder="닉네임 · UUID · provider:sub" maxLength={40} value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <table>
        <thead><tr><th>닉네임</th><th>제공자</th><th>가입</th><th>마지막 접속</th><th>트리</th><th>상태</th><th aria-label="동작" /></tr></thead>
        <tbody>
          {rows.map((u) => <UserRow key={u.id} u={u} self={u.id === meId} update={update} />)}
        </tbody>
      </table>
      {loaded && rows.length === 0 && <p className="muted">결과 없음</p>}
      <More next={next} more={more} />
    </>
  )
}
function UserRow({ u, self, update }: { u: AdminUser; self: boolean; update: Update }) {
  const reason = useRef<HTMLInputElement>(null)
  const [arming, setArming] = useState<'suspend' | 'delete' | null>(null)
  const [purge, setPurge] = useState(false)
  const status = u.deleted_at ? ['탈퇴 대기', false] as const : u.suspended_at ? ['정지', false] as const : u.role === 'admin' ? ['관리자', true] as const : ['정상', true] as const
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
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => { setArming(null); act('unsuspend') }} />
            : <TwoStep label="정지" confirmLabel="정말 정지" disabled={self || !!u.deleted_at} pauseWhileFocused={reason}
                onConfirm={() => act('suspend', take())} />}
        </span>
        <span onClickCapture={() => setArming('delete')}>
          <TwoStep label="삭제" confirmLabel="정말 삭제" disabled={self} onConfirm={del} />
        </span>
      </td>
    </tr>
  )
}

// ---- 공개 트리 ----
function Trees() {
  const { items: trees, next, more, patch } = usePaged<AdminTree>('/api/admin/trees')
  const [reports, setReports] = useGet<{ items: Report[] }>('/api/admin/reports?status=open')
  const live = trees.filter((t) => !t.deleted_at)
  const open = (reports?.items ?? []).filter((r) => !r.resolved_at)
  const deleted = trees.filter((t) => t.deleted_at)
  const put = (t: AdminTree) => patch((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const resolve = (r: Report, resolution: 'hidden' | 'dismissed') =>
    void post<{ report: Report }>(`/api/admin/reports/${r.id}/resolve`, { resolution }).then(() => {
      setReports((p) => (p ? { items: p.items.filter((x) => x.id !== r.id) } : p))
      patch((xs) => xs.map((t) => (t.id !== r.tree.id ? t
        : { ...t, open_reports: Math.max(0, t.open_reports - 1), hidden_by_admin_at: resolution === 'hidden' ? Date.now() : t.hidden_by_admin_at })))
    }, guard)
  const restore = (t: AdminTree) =>
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/restore`).then((r) => { put({ ...r.tree, deleted_at: null }); toast('복구됨') }, guard)
  return (
    <>
      <table>
        <thead><tr><th>제목</th><th>소유자</th><th>노드</th><th>갱신</th><th>신고</th><th aria-label="동작" /></tr></thead>
        <tbody>{live.map((t) => <TreeRow key={t.id} t={t} put={put} />)}</tbody>
      </table>
      <More next={next} more={more} />
      <h2>신고 {open.length}건</h2>
      {open.length === 0 ? <p className="muted">열린 신고 없음</p> : (
        <ul className="reports">
          {open.map((r) => (
            <li key={r.id}>
              <span className="grow"><strong>{r.tree.title}</strong> · {REASON[r.reason]}{r.note && <><br /><span className="muted">{r.note}</span></>}</span>
              <button type="button" aria-label={`${r.tree.title} 숨김`} onClick={() => resolve(r, 'hidden')}><Icon d={eyeOff} /> 숨김</button>
              <button type="button" aria-label={`${r.tree.title} 신고 기각`} onClick={() => resolve(r, 'dismissed')}>기각</button>
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
              <button type="button" aria-label={`${t.title} 복구`} onClick={() => restore(t)}><Icon d={undo2} /> 복구</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
function TreeRow({ t, put }: { t: AdminTree; put: (t: AdminTree) => void }) {
  const reason = useRef<HTMLInputElement>(null)
  const [arming, setArming] = useState(false)
  const hidden = !!t.hidden_by_admin_at
  const act = (a: 'hide' | 'unhide', why?: string) => {
    setArming(false)
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/${a}`, why ? { reason: why } : {}).then((r) => put(r.tree), guard)
  }
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
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => act('unhide')} />
            : <TwoStep label="숨김" confirmLabel="정말 숨김" pauseWhileFocused={reason} onConfirm={() => act('hide', reason.current?.value.trim() || undefined)} />}
        </span>
      </td>
    </tr>
  )
}

// ---- 시스템 ----
function System() {
  const [tick, setTick] = useState(0)
  const [res, setRes] = useGet<{ settings: Settings }>('/api/admin/settings')
  const audit = usePaged<AuditRow>('/api/admin/audit?limit=50', tick)
  if (!res) return null
  const saved = (settings: Settings) => { setRes({ settings }); setTick((t) => t + 1); void refreshMe() }
  return <SystemForm settings={res.settings} audit={audit} onSaved={saved} />
}
function SystemForm({ settings, audit: { items, next, more }, onSaved }: {
  settings: Settings; audit: { items: AuditRow[]; next: string | null; more: () => void }; onSaved: (s: Settings) => void
}) {
  const [text, setText] = useState(settings.notice.text)
  const [enabled, setEnabled] = useState(settings.notice.enabled)
  const save = (s: Settings, msg?: string) =>
    void api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: s }).then((r) => { onSaved(r.settings); if (msg) toast(msg) }, guard)
  // 최신순(06 QA #22) — 서버가 이미 ts DESC 여도 무해
  const audit = [...items].sort((a, b) => b.ts - a.ts)
  return (
    <>
      <form className="notice-form" onSubmit={(e) => { e.preventDefault(); save({ ...settings, notice: { text: text.trim(), enabled } }, '게시됨') }}>
        <label className="search">
          <Icon d={megaphone} /><input aria-label="공지" placeholder="공지 한 줄 (80자)" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 켜기</label>
        <button type="submit" className="primary"><Icon d={megaphone} /> 게시</button>
      </form>
      <label className="toggle">
        <input type="checkbox" checked={settings.maintenance.enabled} onChange={(e) => save({ ...settings, maintenance: { enabled: e.target.checked } })} />
        점검 모드 (켜면 동기화 중단 배너)
      </label>
      <h2>감사 로그</h2>
      <table className="audit">
        <thead><tr><th>시각</th><th>동작</th><th>대상</th><th>메모</th></tr></thead>
        <tbody>
          {audit.map((a) => (
            <tr key={a.id}>
              <td data-l="시각" className="tnum">{when(a.ts)}</td>
              <td data-l="동작">{a.action}</td>
              <td data-l="대상" className="tnum">{a.target_type ? `${a.target_type} ${a.target_id?.slice(-6) ?? ''}` : '—'}</td>
              <td data-l="메모" className="muted">{a.meta ? JSON.stringify(a.meta).slice(0, 60) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <More next={next} more={more} />
      <p className="muted"><Icon d={eye} /> 숨김 트리는 공유 보기·갤러리에서 보이지 않습니다</p>
    </>
  )
}
