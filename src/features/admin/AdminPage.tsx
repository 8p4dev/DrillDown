// 관리자 #/admin(/users|trees|system) — 03 §3.4 화면 표·권한, 02 §3.1 관리자 와이어(PC 표 + sticky 헤더, ≤760 카드), 01 §3.5 관리자 행·§3.6 #22.
// 데이터는 전부 /api/admin/*(03 §3.6). 목록은 cursor "더 보기". 비관리자·API 404 는 #/ 로. 파괴 동작(정지·삭제·숨김·점검)은 TwoStep + 사유 입력(I14, 포커스 중 타이머 정지).
// 입력칸 클래스는 .admin-search — 에디터의 전역 .search{position:absolute} 와 겹치면 안 된다(docs/research/admin/w1_gap.md B1).
import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { api, ApiError, type AdminStats, type AdminTree, type AdminUser, type Appeal, type AuditRow, type Page, type Report, type ReportReason, type Settings } from '../../core/api'
import { refreshMe, useMe, useMeReady } from '../../core/me'
import { href, type AdminTab } from '../../router'
import { I } from '../../ui/icons'
import { ban, database, externalLink, eye, eyeOff, hardDrive, megaphone, search, undo2 } from '../../ui/icons.all'
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
const H26 = 26 * 3600_000 // 하루 1회 작업이 "오늘 안 돌았다" 기준

// ---- 데이터: GET 1회 / cursor 페이지. 404(권한 없음 숨김) → #/ . 오류는 서버 메시지·필드 그대로(WCAG 3.3.1) ----
const guard = (e: unknown) => {
  if (e instanceof ApiError && e.status === 404) location.hash = href.trees()
  else if (e instanceof ApiError && e.status === 0) toast('오프라인이에요')
  else if (e instanceof ApiError) toast(`${e.message}${e.field ? ` (${e.field})` : ''}`)
  else toast('실패했어요 · 다시 시도해 주세요')
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
const Loading = () => <p className="muted" aria-busy="true">불러오는 중…</p>
const post = <T,>(path: string, body: unknown = {}) => api<T>(path, { method: 'POST', body })
const treeLink = (slug: string | null) => slug && <a href={`/t/${slug}`} target="_blank" rel="noreferrer" aria-label="트리 보기(새 탭)"><Icon d={externalLink} /> 보기</a>

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
  if (!s) return <Loading />
  const used = s.disk.total ? 1 - s.disk.free / s.disk.total : 0
  const max = Math.max(1, ...s.users.signups_14d)
  // 백업: 로컬 파일 ok 만으로는 부족 — 외부 업로드가 설정돼 있으면 올라갔어야 초록. 26시간 넘게 안 돌았어도 빨강. at=0 은 "아직" (실패와 구분)
  const b = s.backup, d = s.daily
  const bStale = b.at > 0 && now - b.at > H26, dStale = d.at > 0 && now - d.at > H26
  const bOk = b.ok && !bStale && (b.uploaded || !b.configured)
  const last = s.errors.recent[0]
  return (
    <>
      {s.flags.auth_fake && <div className="warn" role="alert"><Icon d={I.circleAlert} /> AUTH_FAKE 가 켜져 있어요 — 누구나 관리자로 로그인할 수 있습니다. 운영에서는 꺼야 합니다</div>}
      <div className="stat-grid">
        <Card icon={I.user} label="가입자" value={s.users.total} sub={`오늘 ${s.users.today} · 7일 ${s.users.d7}`} />
        <Card icon={I.calendarCheck} label="활성" value={s.users.active7} sub={`30일 ${s.users.active30}`} />
        <Card icon={I.listTree} label="트리" value={s.trees.total} sub={<><Icon d={I.globe} /> 공개 {s.trees.public} · 숨김 {s.trees.hidden}</>} />
        <Card icon={hardDrive} label="디스크" value={`${Math.round(used * 100)}%`} sub={`여유 ${bytes(s.disk.free)}`} />
        <Card icon={database} label="백업" value={b.at ? when(b.at) : '아직 없음'}
          sub={b.at ? <><span className="dot" data-ok={bOk} /> {bytes(b.bytes)} · {b.uploaded ? '외부 업로드됨' : b.configured ? '외부 업로드 안 됨' : '로컬만'}{bStale && ' · 26시간 초과'}{b.error && <><br />{b.error}</>}</> : '백업 타이머가 아직 돌지 않았어요'} />
        <Card icon={I.refreshCw} label="일일 작업" value={d.at ? when(d.at) : '아직 없음'}
          sub={d.at ? <><span className="dot" data-ok={d.ok && !dStale} /> 세션 {d.purged_sessions} · 톰스톤 {d.purged_tombstones} · 탈퇴 {d.purged_users}{dStale && ' · 26시간 초과'}{d.error && <><br />{d.error}</>}</> : '일일 타이머가 아직 돌지 않았어요'} />
        <Card icon={I.check} label="가동" value={dur(s.uptime_s)} sub={`RSS ${bytes(s.rss)}`} />
        <Card icon={ban} label="정지 · 탈퇴 대기" value={`${s.users.suspended} · ${s.users.pending_delete}`} />
        <Card icon={I.circleAlert} label="서버 오류 (재시작 이후)" value={s.errors.count} sub={last ? `${when(last.ts)} ${last.method} ${last.path}` : '없음'} />
      </div>
      {s.errors.recent.length > 0 && (
        <details className="errors">
          <summary>최근 오류 {s.errors.recent.length}건</summary>
          <ul>{s.errors.recent.map((e, i) => <li key={i}>{when(e.ts)} {e.method} {e.path} · {e.name}</li>)}</ul>
        </details>
      )}
      <figure className="signups">
        <figcaption>14일 가입 · {date(now - 13 * 86400_000)} ~ {date(now)}<span className="sr-only"> · 일별 {s.users.signups_14d.join(', ')}명</span></figcaption>
        <div className="bars" aria-hidden="true">
          {s.users.signups_14d.map((n, i) => <span key={i} className="bar" style={{ height: `${Math.max(4, (n / max) * 100)}%` }} data-tip={`${date(now - (13 - i) * 86400_000)} · ${n}명`} />)}
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

// ---- 공개 트리 ----
function Trees() {
  const { items: trees, loaded, next, more, patch } = usePaged<AdminTree>('/api/admin/trees')
  const [reports, setReports] = useGet<{ items: Report[] }>('/api/admin/reports?status=open')
  const [appeals, setAppeals] = useGet<{ items: Appeal[] }>('/api/admin/appeals?status=open')
  const openAppeals = appeals?.items ?? []
  // 소명 처리: 수용 = 숨김 해제(서버가 같은 트리 소명 전부 처리), 기각 = 당사자 공유 화면에 표시
  const decide = (a: Appeal, resolution: 'accepted' | 'rejected') =>
    void post<{ appeal: Appeal }>(`/api/admin/appeals/${a.id}/resolve`, { resolution }).then(() => {
      setAppeals((p) => (p ? { items: p.items.filter((x) => x.tree.id !== a.tree.id) } : p))
      if (resolution === 'accepted') patch((xs) => xs.map((t) => (t.id === a.tree.id ? { ...t, hidden_by_admin_at: null } : t)))
      toast(resolution === 'accepted' ? '숨김 해제' : '소명 기각')
    }, guard)
  const live = trees.filter((t) => !t.deleted_at)
  const open = (reports?.items ?? []).filter((r) => !r.resolved_at)
  // 같은 트리의 신고를 한 묶음으로 — 서버도 숨김 때 그 트리의 열린 신고를 전부 처리한다(admin.ts resolve)
  const groups = Object.values(open.reduce<Record<string, Report[]>>((m, r) => ((m[r.tree.id] ??= []).push(r), m), {}))
  const deleted = trees.filter((t) => t.deleted_at)
  const put = (t: AdminTree) => patch((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const resolve = (r: Report, resolution: 'hidden' | 'dismissed') =>
    void post<{ report: Report }>(`/api/admin/reports/${r.id}/resolve`, { resolution }).then(() => {
      const gone = (x: Report) => (resolution === 'hidden' ? x.tree.id === r.tree.id : x.id === r.id)
      setReports((p) => (p ? { items: p.items.filter((x) => !gone(x)) } : p))
      patch((xs) => xs.map((t) => (t.id !== r.tree.id ? t
        : { ...t, open_reports: resolution === 'hidden' ? 0 : Math.max(0, t.open_reports - 1), hidden_by_admin_at: resolution === 'hidden' ? Date.now() : t.hidden_by_admin_at })))
      toast(resolution === 'hidden' ? '숨김' : '기각')
    }, guard)
  // 복구된 트리는 비공개일 수 있어 공개 표에 섞지 않는다 — 목록에서 빼고, 공개면 다음 로드에 나타난다
  const restore = (t: AdminTree) =>
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/restore`).then(() => { patch((xs) => xs.filter((x) => x.id !== t.id)); toast('복구됨') }, guard)
  return (
    <>
      <table>
        <thead><tr><th>제목</th><th>소유자</th><th>노드</th><th>갱신</th><th>신고</th><th aria-label="동작" /></tr></thead>
        <tbody>{live.map((t) => <TreeRow key={t.id} t={t} put={put} />)}</tbody>
      </table>
      {!loaded && <Loading />}
      {loaded && live.length === 0 && <p className="muted">공개 트리 없음</p>}
      <More next={next} more={more} />
      <h2>신고 {open.length}건</h2>
      {!reports ? <Loading /> : groups.length === 0 ? <p className="muted">열린 신고 없음</p> : (
        <ul className="reports">
          {groups.map((rs) => {
            const t = rs[0].tree
            return (
              <li key={t.id}>
                <span className="grow">
                  <strong>{t.title}</strong> {treeLink(t.slug)}{t.hidden_by_admin_at && <> · <Icon d={eyeOff} /> 숨김 중</>}
                  {rs.map((r) => (
                    <span key={r.id} className="sub">
                      {when(r.created_at)} · {REASON[r.reason]}{r.note && ` — ${r.note}`}{' '}
                      <button type="button" className="link" aria-label={`${t.title} 신고 기각`} onClick={() => resolve(r, 'dismissed')}>기각</button>
                    </span>
                  ))}
                </span>
                <button type="button" aria-label={`${t.title} 숨김`} onClick={() => resolve(rs[0], 'hidden')}><Icon d={eyeOff} /> 숨김</button>
              </li>
            )
          })}
        </ul>
      )}
      <h2>소명 {openAppeals.length}건</h2>
      {!appeals ? <Loading /> : openAppeals.length === 0 ? <p className="muted">검토할 소명 없음</p> : (
        <ul className="reports">
          {openAppeals.map((a) => (
            <li key={a.id}>
              <span className="grow">
                <strong>{a.tree.title}</strong> {treeLink(a.tree.slug)} · {a.owner}
                <span className="sub">{when(a.created_at)} — {a.text}</span>
              </span>
              <button type="button" aria-label={`${a.tree.title} 소명 수용`} onClick={() => decide(a, 'accepted')}><Icon d={eye} /> 숨김 해제</button>
              <button type="button" aria-label={`${a.tree.title} 소명 기각`} onClick={() => decide(a, 'rejected')}>기각</button>
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
      <td data-l="제목" className="name" title={hidden ? `${when(t.hidden_by_admin_at!)} 숨김` : undefined}>{hidden && <Icon d={eyeOff} />} {t.title} {treeLink(t.slug)}</td>
      <td data-l="소유자">{t.owner.nickname}</td>
      <td data-l="노드" className="tnum">{t.node_count}</td>
      <td data-l="갱신" className="tnum">{date(t.updated_at)}</td>
      <td data-l="신고" className="tnum">{t.open_reports}</td>
      <td className="act">
        {arming && !hidden && <input ref={reason} className="reason" aria-label="숨김 사유" placeholder="사유(선택 · 개인정보 금지)" maxLength={200} />}
        <span onClickCapture={() => setArming(true)}>
          {hidden
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => act('unhide')} />
            : <TwoStep label="숨김" confirmLabel="정말 숨김" pauseWhileFocused={reason} onDisarm={() => setArming(false)} onConfirm={() => act('hide', reason.current?.value.trim() || undefined)} />}
        </span>
      </td>
    </tr>
  )
}

// ---- 시스템 ----
const ACTION: Record<string, string> = {
  'user.suspend': '사용자 정지', 'user.unsuspend': '정지 해제', 'user.delete': '사용자 삭제(7일 유예)', 'user.purge': '사용자 삭제(즉시)', 'user.restore': '탈퇴 취소',
  'user.delete_requested': '탈퇴 요청(본인)', 'tree.hide': '트리 숨김', 'tree.unhide': '숨김 해제', 'tree.restore': '트리 복구', 'report.dismiss': '신고 기각',
  'settings.notice': '공지 변경', 'settings.maintenance': '점검 모드 변경', 'admin.login': '관리자 로그인',
  'user.search': '사용자 검색', 'user.view': '사용자 상세 조회', 'tree.appeal': '소명 접수(소유자)', 'appeal.reject': '소명 기각',
  'system.sessions_revoke_all': '전 세션 폐기', 'system.incident': '사건 기록', 'system.restore': '복원 기록', 'system.note': '운영 메모',
}
const NOTE_KIND: [string, string][] = [['incident', '사건'], ['restore', '복원'], ['note', '메모']]
const TARGET: Record<string, string> = { user: '사용자', tree: '트리', report: '신고', settings: '설정' }
const metaText = (m: Record<string, unknown> | null) =>
  !m ? '' : typeof m.reason === 'string' ? `사유: ${m.reason}` : typeof m.text === 'string' ? m.text : 'after' in m ? `→ ${JSON.stringify(m.after)}`
    : typeof m.appeal_id === 'string' ? `소명 ${m.appeal_id.slice(0, 8)}` : typeof m.report_id === 'string' ? `신고 ${m.report_id.slice(0, 8)}` : JSON.stringify(m).slice(0, 80)
function System() {
  const [tick, setTick] = useState(0)
  const [res, setRes] = useGet<{ settings: Settings }>('/api/admin/settings')
  const audit = usePaged<AuditRow>('/api/admin/audit?limit=50', tick)
  if (!res) return <Loading />
  const saved = (settings: Settings) => { setRes({ settings }); setTick((t) => t + 1); void refreshMe() }
  return <SystemForm settings={res.settings} audit={audit} onSaved={saved} />
}
function SystemForm({ settings, audit: { items, next, more }, onSaved }: {
  settings: Settings; audit: { items: AuditRow[]; next: string | null; more: () => void }; onSaved: (s: Settings) => void
}) {
  const [text, setText] = useState(settings.notice.text)
  const [enabled, setEnabled] = useState(settings.notice.enabled)
  const [kind, setKind] = useState('incident')
  const [note, setNote] = useState('')
  const record = () =>
    void post('/api/admin/ops/note', { kind, text: note.trim() }).then(() => { setNote(''); onSaved(settings); toast('기록됨') }, guard)
  // 전 세션 폐기: 관리자 본인도 빠지므로 끝나면 로그인 화면으로
  const revokeAll = () =>
    void post<{ count: number }>('/api/admin/ops/revoke-sessions').then((r) => { toast(`${r.count}개 세션 폐기 · 다시 로그인하세요`); return refreshMe() }).then(() => { location.hash = href.login(href.admin('system')) }, guard)
  const save = (s: Settings, msg?: string) =>
    void api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: s }).then((r) => { onSaved(r.settings); if (msg) toast(msg) }, guard)
  const maint = settings.maintenance.enabled
  // 최신순(06 QA #22) — 서버가 이미 ts DESC 여도 무해
  const audit = [...items].sort((a, b) => b.ts - a.ts)
  return (
    <>
      <form className="notice-form" onSubmit={(e) => { e.preventDefault(); save({ ...settings, notice: { text: text.trim(), enabled } }, '게시됨') }}>
        <label className="admin-search">
          <Icon d={megaphone} /><input aria-label="공지" placeholder="공지 한 줄 (80자)" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 켜기</label>
        <button type="submit" className="primary"><Icon d={megaphone} /> 게시</button>
      </form>
      {/* 점검 모드: 한 번에 전 사용자 503 이라 2단계 */}
      <div className="maint-row">
        <span className="dot" data-ok={!maint} /> 점검 모드 {maint ? '켜짐 — 관리자 외 모든 /api 가 503, 동기화 중단' : '꺼짐'}
        <TwoStep label={maint ? '점검 끄기' : '점검 켜기'} confirmLabel={maint ? '정말 끄기' : '정말 켜기'} verb={maint ? '점검 종료' : '점검 시작'}
          onConfirm={() => save({ ...settings, maintenance: { enabled: !maint } }, maint ? '점검 모드 꺼짐' : '점검 모드 켜짐 · 사용자 동기화가 멈춥니다')} />
      </div>
      {/* 사건 대응(런북 §5, 유출 72시간): 화면에서 되는 두 가지 + 기록. 나머지(cloudflared 중지·시크릿 재발급)는 SSH·외부 콘솔 */}
      <h2>사건 대응</h2>
      <div className="ops">
        <ol className="muted">
          <li>점검 모드 켜기(위) → 외부 접근은 Cloudflare 대시보드에서 Tunnel 비활성</li>
          <li>전 세션 폐기 → OAuth 시크릿·Kakao Admin 키·B2 키 재발급(SSH, 런북 §5)</li>
          <li>영향 범위·시각을 사건 기록으로 남기고 72시간 안에 개인정보보호위원회 신고·당사자 통지(상단 공지)</li>
        </ol>
        <div className="maint-row">
          <TwoStep label="전 세션 폐기" confirmLabel="정말 폐기" verb="전 세션 폐기" onConfirm={revokeAll} />
          <span>모든 사용자(관리자 포함)가 로그아웃됩니다</span>
        </div>
        <form className="notice-form" onSubmit={(e) => { e.preventDefault(); if (note.trim()) record() }}>
          <select aria-label="기록 종류" value={kind} onChange={(e) => setKind(e.target.value)}>{NOTE_KIND.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="admin-search">
            <Icon d={I.circleAlert} /><input aria-label="기록 내용" placeholder="기록 (200자, 개인정보 금지)" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button type="submit" disabled={!note.trim()}>기록</button>
        </form>
      </div>
      <h2>감사 로그</h2>
      <table className="audit">
        <thead><tr><th>시각</th><th>행위자</th><th>동작</th><th>대상</th><th>메모</th></tr></thead>
        <tbody>
          {audit.map((a) => (
            <tr key={a.id}>
              <td data-l="시각" className="tnum">{when(a.ts)}</td>
              <td data-l="행위자">{a.actor ?? (a.actor_id ? a.actor_id.slice(0, 8) : '시스템')}</td>
              <td data-l="동작">{ACTION[a.action] ?? a.action}</td>
              <td data-l="대상" className="tnum" title={a.target_id ?? undefined}>
                {a.target_type ? `${TARGET[a.target_type]} ${a.target_type === 'settings' ? a.target_id ?? '' : a.target_id?.slice(0, 8) ?? ''}` : '—'}
              </td>
              <td data-l="메모" className="muted">{metaText(a.meta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <More next={next} more={more} />
      <p className="muted"><Icon d={eye} /> 숨김 트리는 공유 보기·공개 트리에서 보이지 않습니다</p>
    </>
  )
}
