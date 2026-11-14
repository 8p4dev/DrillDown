// 시스템 탭 — 공지·점검(NoticeForm) + 사건 대응(전 세션 폐기·운영 기록) + 서버(버전·재시작·수동 백업/일일·WAL checkpoint, T3 #31·#32·#38)
// + 관리자 목록(#33) + OAuth 상태(#36) + 복원 안내·백업 파일 목록(#37) + 감사 로그 필터·CSV(#35). 03 §3.4 시스템 행, 런북 §4·§5.
import { useEffect, useState } from 'react'
import { refreshMe } from '../../core/me'
import { api, ApiError, type AdminStats, type AuditRow, type OpsJobs, type OpsStats, type Settings } from '../../core/api'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { database, eye, hardDrive, rotateCcw, shield } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import NoticeForm from './NoticeForm'
import { ACTION, bytes, DAY, guard, post, TARGET, useGet, usePaged, when } from './shared'
import { Loading, More } from './widgets'

const NOTE_KIND: [string, string][] = [['incident', '사건'], ['restore', '복원'], ['note', '메모']]
const metaText = (m: Record<string, unknown> | null) =>
  !m ? '' : typeof m.reason === 'string' ? `사유: ${m.reason}` : typeof m.text === 'string' ? m.text : 'after' in m ? `→ ${JSON.stringify(m.after)}`
    : typeof m.appeal_id === 'string' ? `소명 ${m.appeal_id.slice(0, 8)}` : typeof m.report_id === 'string' ? `신고 ${m.report_id.slice(0, 8)}` : JSON.stringify(m).slice(0, 80)
export default function SystemTab() {
  const [tick, setTick] = useState(0)
  const [res, setRes] = useGet<{ settings: Settings }>('/api/admin/settings')
  const [stats] = useGet<AdminStats>('/api/admin/stats', tick)
  const bump = () => setTick((t) => t + 1)
  if (!res) return <Loading />
  const saved = (settings: Settings) => { setRes({ settings }); bump(); void refreshMe() }
  return (
    <>
      <NoticeForm settings={res.settings} onSaved={saved} />
      <Ops onDone={bump} />
      {stats ? <Server s={stats} onDone={bump} /> : <Loading />}
      <Admins />
      {stats && <OAuthStatus o={stats.ops} />}
      {stats && <Restore o={stats.ops} />}
      <AuditLog tick={tick} />
    </>
  )
}

/** 사건 대응(런북 §5, 유출 72시간): 화면에서 되는 두 가지 + 기록. 나머지(cloudflared 중지·시크릿 재발급)는 SSH·외부 콘솔 */
function Ops({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState('incident')
  const [note, setNote] = useState('')
  const record = () =>
    void post('/api/admin/ops/note', { kind, text: note.trim() }).then(() => { setNote(''); onDone(); toast('기록됨') }, guard)
  // 전 세션 폐기: 관리자 본인도 빠지므로 끝나면 로그인 화면으로
  const revokeAll = () =>
    void post<{ count: number }>('/api/admin/ops/revoke-sessions').then((r) => { toast(`${r.count}개 세션 폐기 · 다시 로그인하세요`); return refreshMe() }).then(() => { location.hash = href.login(href.admin('system')) }, guard)
  return (
    <>
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
    </>
  )
}

/** 서버: 버전·재시작 필요·[재시작](exit 1 → systemd 가 되살림) · [지금 백업]/[일일 작업](자식 프로세스, 실행 중엔 10초마다 가벼운 jobs 폴링) · [WAL checkpoint] */
function Server({ s, onDone }: { s: AdminStats; onDone: () => void }) {
  const o = s.ops, j = o.jobs
  const busy = j.backup || j.daily
  // 내 브라우저가 받은 진입 번들(index-<hash>.js) — 서버 dist 와 다르면 "새 빌드 있음"(w2 #9)
  const mine = Array.from(document.scripts, (x) => /index-([\w-]+)\.js/.exec(x.src)?.[1]).find(Boolean) ?? null
  // 작업 중 폴링은 GET /api/admin/ops/jobs(계약 C) — stats 는 readdir·stat 을 다 하므로 Pi 가 가장 바쁠 때 피한다. 끝났을 때만 stats 를 다시 읽는다. 라우트가 없으면(404) stats 폴링으로
  useEffect(() => {
    if (!busy) return
    const t = setInterval(() => void api<OpsJobs>('/api/admin/ops/jobs').then(
      (j) => { if (!j.running.backup && !j.running.daily) onDone() },
      (e) => { if (e instanceof ApiError && e.status === 404) onDone() },
    ), 10_000)
    return () => clearInterval(t)
  }, [busy, onDone])
  const run = (job: 'backup' | 'daily') => void post(`/api/admin/ops/run/${job}`).then(() => { toast(job === 'backup' ? '백업 시작 · 끝나면 대시보드 "백업" 이 갱신돼요' : '일일 작업 시작'); onDone() }, guard)
  const checkpoint = () => void post<{ log: number; checkpointed: number }>('/api/admin/ops/checkpoint').then((r) => { toast(r.log < 0 ? 'checkpoint 완료' : `checkpoint 완료 · WAL ${r.checkpointed}/${r.log} 프레임`); onDone() }, guard)
  const restart = () => void post('/api/admin/ops/restart').then(() => {
    toast('재시작 중… 5초 뒤 되살아납니다', undefined, 8000)
    let tries = 0
    const poll = () => void fetch('/api/health').then((r) => r.ok ? (toast('서버가 다시 떴어요'), onDone()) : retry(), retry)
    const retry = () => { if (++tries < 30) setTimeout(poll, 2000); else toast('아직 응답이 없어요 · SSH 로 systemctl status 확인') }
    setTimeout(poll, 3000)
  }, guard)
  return (
    <>
      <h2>서버</h2>
      <div className="ops">
        <dl className="kv">
          <dt>커밋</dt><dd><code>{o.build.git ?? '알 수 없음'}</code></dd>
          <dt>빌드</dt><dd><code>{o.build.asset ?? '없음'}</code> <span className="muted">· 내 브라우저 {mine ?? '?'}{mine && o.build.asset && mine !== o.build.asset && ' — 새 빌드가 있어요, 새로고침'}</span></dd>
          <dt>시작</dt><dd>{when(o.build.started_at)} · <span className="dot" data-ok={!o.build.restart_needed} /> {o.build.restart_needed ? '재시작 필요 — dist 또는 server 가 시작 뒤 바뀌었어요' : '최신 코드로 실행 중'}</dd>
          <dt>WAL</dt><dd>{bytes(o.db.wal)} <span className="muted">· DB {bytes(o.db.file)} · 빈 페이지 {o.db.freelist}</span></dd>
        </dl>
        <div className="btn-row">
          <button type="button" disabled={j.backup} onClick={() => run('backup')}><Icon d={database} /> {j.backup ? '백업 실행 중…' : '지금 백업'}</button>
          <button type="button" disabled={j.daily} onClick={() => run('daily')}><Icon d={I.refreshCw} /> {j.daily ? '일일 작업 실행 중…' : '일일 작업 실행'}</button>
          <button type="button" onClick={checkpoint}><Icon d={hardDrive} /> WAL checkpoint</button>
          <TwoStep label={<><Icon d={rotateCcw} /> 서버 재시작</>} confirmLabel="정말 재시작" verb="재시작" onConfirm={restart} />
          <span className="muted">재시작하면 "재시작 이후" 카운터·레이트 리밋이 초기화됩니다 (약 5초 중단)</span>
        </div>
      </div>
    </>
  )
}

/** admins.json(읽기 전용) + 내 식별자. 편집은 /etc 가 읽기 전용이라 SSH */
function Admins() {
  const [a] = useGet<{ file: string; list: string[]; me: string }>('/api/admin/ops/admins')
  if (!a) return <><h2>관리자 목록</h2><Loading /></>
  const listed = a.list.includes(a.me)
  return (
    <>
      <h2>관리자 목록</h2>
      <div className="ops">
        <dl className="kv">
          <dt>파일</dt><dd><code>{a.file}</code> <span className="muted">· 편집은 SSH (저장 즉시 다음 로그인부터 반영)</span></dd>
          <dt>내 식별자</dt><dd><code>{a.me}</code> {!listed && <span className="muted">· 목록에 없음 (AUTH_FAKE 또는 역할 캐시)</span>}</dd>
          <dt>목록 {a.list.length}</dt><dd>{a.list.length ? <ul className="trees">{a.list.map((x) => <li key={x}><code>{x}</code>{x === a.me && ' (나)'}</li>)}</ul> : <span className="muted">비어 있음 · 파일이 없거나 JSON 이 아님</span>}</dd>
        </dl>
      </div>
    </>
  )
}

/** OAuth 제공자: id·secret 설정 여부, 제공자별 마지막 접속, 재시작 이후 콜백 실패(state·token·userinfo) */
function OAuthStatus({ o }: { o: OpsStats }) {
  const k = o.counters
  return (
    <>
      <h2>OAuth 제공자</h2>
      <table className="audit">
        <thead><tr><th>제공자</th><th>클라이언트 ID</th><th>시크릿</th><th>마지막 접속</th><th>콜백 실패 (재시작 이후)</th></tr></thead>
        <tbody>
          {(['google', 'kakao'] as const).map((p) => {
            const c = o.oauth[p]
            const fails = (['state', 'token', 'userinfo'] as const).map((s) => [s, k[`oauth.${p}.${s}`] ?? 0] as const)
            const nf = fails.reduce((a, [, v]) => a + v, 0)
            return (
              <tr key={p}>
                <td data-l="제공자" className="name">{p}</td>
                <td data-l="클라이언트 ID"><span className="dot" data-ok={c.id} /> {c.id ? '설정됨' : '없음'}</td>
                <td data-l="시크릿"><span className="dot" data-ok={c.secret} /> {c.secret ? '설정됨' : '없음'}</td>
                <td data-l="마지막 접속" className="tnum">{c.last_seen_at ? when(c.last_seen_at) : '—'}</td>
                <td data-l="콜백 실패 (재시작 이후)" className="tnum"><span className="dot" data-ok={nf === 0} /> {nf ? fails.filter(([, v]) => v).map(([s, v]) => `${s} ${v}`).join(' · ') : '0'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="muted"><Icon d={shield} /> 시크릿 만료일은 코드로 알 수 없어요 — 회전 뒤에는 각 제공자로 한 번 로그인해 실패 수가 0 인지 봅니다</p>
    </>
  )
}

/** 복원 안내(런북 §4) + 로컬 백업 파일 목록. 다운로드 없음(평문 DB = 개인정보) */
function Restore({ o }: { o: OpsStats }) {
  const [now] = useState(() => Date.now())
  return (
    <>
      <h2>복원</h2>
      <div className="ops">
        <ol className="muted">
          <li>복원은 서버를 멈추고 파일을 바꾸는 작업 — 화면에서는 못 하고 SSH 로 런북 §4 (목표 60분)</li>
          <li><code>rclone copy &lt;remote&gt;/app-YYYYMMDD.db.age</code> → <code>age -d</code> → <code>PRAGMA integrity_check</code> = ok</li>
          <li>기동 뒤 대시보드 "백업·가입자" 가 백업 시점과 맞는지 확인 → 공지 켜기(24시간) → 위 "운영 기록" 에 <b>복원</b> 으로 남기면 대시보드 "복원 리허설" 이 갱신됩니다</li>
        </ol>
        <table className="audit">
          <thead><tr><th>로컬 백업 파일 ({o.db.backups.length}개, 14개 보관)</th><th>크기</th><th>만든 시각</th></tr></thead>
          <tbody>
            {o.db.backups.map((f) => (
              <tr key={f.name}>
                <td data-l="파일" className="name"><code>{f.name}</code></td>
                <td data-l="크기" className="tnum">{bytes(f.bytes)}</td>
                <td data-l="만든 시각" className="tnum">{when(f.at)}{now - f.at < DAY && ' · 오늘'}</td>
              </tr>
            ))}
            {o.db.backups.length === 0 && <tr><td colSpan={3} className="muted">아직 백업 파일이 없어요 — 위 [지금 백업]</td></tr>}
          </tbody>
        </table>
        <p className="muted"><Icon d={I.lock} /> 백업 파일은 내려받을 수 없어요(평문 DB). 외부 사본은 B2 콘솔에서 확인</p>
      </div>
    </>
  )
}

const dayStart = (s: string) => (s ? new Date(`${s}T00:00:00`).getTime() : 0)
function AuditLog({ tick }: { tick: number }) {
  const [draft, setDraft] = useState({ action: '', target_id: '', from: '', to: '' })
  const [f, setF] = useState(draft)
  useEffect(() => { const t = setTimeout(() => setF(draft), 300); return () => clearTimeout(t) }, [draft])
  const qs = new URLSearchParams()
  if (f.action.trim()) qs.set('action', f.action.trim())
  if (f.target_id.trim()) qs.set('target_id', f.target_id.trim())
  if (dayStart(f.from)) qs.set('from', String(dayStart(f.from)))
  if (dayStart(f.to)) qs.set('to', String(dayStart(f.to) + DAY)) // 종료일 포함
  const q = qs.toString()
  const { items, next, more, loaded } = usePaged<AuditRow>(`/api/admin/audit?limit=50${q ? `&${q}` : ''}`, tick)
  const set = (k: keyof typeof draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  // 최신순(06 QA #22) — 서버가 이미 ts DESC 여도 무해
  const audit = [...items].sort((a, b) => b.ts - a.ts)
  return (
    <>
      <h2>감사 로그</h2>
      <form className="filters" onSubmit={(e) => e.preventDefault()}>
        <label className="admin-search"><Icon d={eye} /><input list="audit-actions" aria-label="동작 (접두 일치)" placeholder="동작 · 예 user. / tree.hide" maxLength={40} value={draft.action} onChange={set('action')} /></label>
        <datalist id="audit-actions">{Object.keys(ACTION).sort().map((a) => <option key={a} value={a}>{ACTION[a]}</option>)}</datalist>
        <label className="admin-search"><Icon d={I.listTree} /><input aria-label="대상 ID" placeholder="대상 ID (UUID · 트리 id)" maxLength={64} value={draft.target_id} onChange={set('target_id')} /></label>
        <label className="toggle">부터 <input type="date" aria-label="시작일" value={draft.from} onChange={set('from')} /></label>
        <label className="toggle">까지 <input type="date" aria-label="종료일" value={draft.to} onChange={set('to')} /></label>
        <a className="btn" href={`/api/admin/audit?format=csv${q ? `&${q}` : ''}`} download="audit.csv"><Icon d={I.download} /> CSV (5,000행)</a>
      </form>
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
      {!loaded && <Loading />}
      {loaded && audit.length === 0 && <p className="muted">조건에 맞는 기록 없음</p>}
      <More next={next} more={more} />
      <p className="muted"><Icon d={eye} /> 숨김 트리는 공유 보기·공개 트리에서 보이지 않습니다</p>
    </>
  )
}
