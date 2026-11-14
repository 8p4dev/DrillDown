// 대시보드 탭 — 운영 안전 카드(백업·일일·5xx·AUTH_FAKE) + 운영 지표(DB·WAL·세션·429·동기화·클라이언트 오류·복원 리허설, T1 #13·#15·#16, T4 #48·#49) + 14일 가입. 03 §3.4 대시보드 행.
import { useState } from 'react'
import type { AdminStats } from '../../core/api'
import { I } from '../../ui/icons'
import { ban, database, hardDrive, network } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { bytes, DAY, dur, date, H26, useGet, when } from './shared'
import { Card, Loading } from './widgets'

/** 복원 리허설은 월 1회(런북 §3) — 45일 넘으면 빨강 */
const REHEARSAL_DAYS = 45
const sum = (o: Record<string, number>, prefix: string) => Object.entries(o).reduce((a, [k, v]) => (k.startsWith(prefix) ? a + v : a), 0)

export default function Dashboard() {
  const [s] = useGet<AdminStats>('/api/admin/stats')
  const [now] = useState(() => Date.now())
  if (!s) return <Loading />
  const used = s.disk.total ? 1 - s.disk.free / s.disk.total : 0
  const max = Math.max(1, ...s.users.signups_14d)
  // 백업: 로컬 파일 ok 만으로는 부족 — 외부 업로드가 설정돼 있으면 올라갔어야 초록. 26시간 넘게 안 돌았어도 빨강. at=0 은 "아직" (실패와 구분)
  const b = s.backup, d = s.daily, o = s.ops, k = o.counters
  const bStale = b.at > 0 && now - b.at > H26, dStale = d.at > 0 && now - d.at > H26
  const bOk = b.ok && !bStale && (b.uploaded || !b.configured)
  const last = s.errors.recent[0], ce = o.client_errors.recent[0]
  const rssPct = o.rss_max ? Math.round((s.rss / o.rss_max) * 100) : null // systemd MemoryMax 없음(개발) → 한도 없음
  const r429 = sum(k, '429:'), pulls = sum(k, 'sync.pull'), pushes = sum(k, 'sync.push')
  const rehearsal = o.restore_at ? Math.floor((now - o.restore_at) / DAY) : null
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
        <Card icon={I.check} label="가동" value={dur(s.uptime_s)} sub={<><span className="dot" data-ok={rssPct === null || rssPct < 80} /> RSS {bytes(s.rss)} · {rssPct === null ? '한도 없음' : `${rssPct}% / ${Math.round(o.rss_max / 1048576)} MiB`}</>} />
        <Card icon={database} label="DB 파일" value={bytes(o.db.file)}
          sub={<><span className="dot" data-ok={o.db.wal < 64e6} /> WAL {bytes(o.db.wal)} · 페이지 {o.db.page_count.toLocaleString()} × {(o.db.page_size / 1024).toFixed(0)}K · 빈 페이지 {o.db.freelist.toLocaleString()}<br />백업 폴더 {bytes(o.db.backups_bytes)} ({o.db.backups.length}개)</>} />
        <Card icon={I.logIn} label="세션" value={o.sessions.total} sub={`만료 대기 ${o.sessions.expired} · 관리자 ${o.sessions.admin}`} />
        <Card icon={ban} label="정지 · 탈퇴 대기" value={`${s.users.suspended} · ${s.users.pending_delete}`} />
        <Card icon={I.pencil} label="열린 피드백" value={s.product.feedback_open} sub="피드백 탭에서 처리" />
        <Card icon={I.circleAlert} label="서버 오류 (재시작 이후)" value={s.errors.count} sub={last ? `${when(last.ts)} ${last.method} ${last.path}` : '없음'} />
        <Card icon={I.circleAlert} label="클라이언트 오류 (재시작 이후)" value={o.client_errors.count} sub={ce ? `${when(ce.ts)} ${ce.message.slice(0, 60)}` : '없음'} />
        <Card icon={I.lock} label="429 (재시작 이후)" value={r429} sub={r429 ? Object.entries(k).filter(([n]) => n.startsWith('429:')).map(([n, v]) => `${n.slice(4)} ${v}`).join(' · ') : '없음'} />
        <Card icon={network} label="동기화 (재시작 이후)" value={`${pushes} · ${pulls}`}
          sub={<>push · pull<br />410 {k['sync.pull.410'] ?? 0} · 밀림 {k['sync.superseded'] ?? 0} · 버림 {k['sync.dropped'] ?? 0}</>} />
        <Card icon={I.refreshCw} label="복원 리허설" value={rehearsal === null ? '기록 없음' : `${rehearsal}일 전`}
          sub={<><span className="dot" data-ok={rehearsal !== null && rehearsal <= REHEARSAL_DAYS} /> {o.restore_at ? when(o.restore_at) : '매월 1회(런북 §4) · 시스템 탭에서 "복원" 기록'}</>} />
      </div>
      {s.errors.recent.length > 0 && (
        <details className="errors">
          <summary>최근 서버 오류 {s.errors.recent.length}건</summary>
          <ul>{s.errors.recent.map((e, i) => <li key={i}>{when(e.ts)} {e.method} {e.path} · {e.name}</li>)}</ul>
        </details>
      )}
      {o.client_errors.recent.length > 0 && (
        <details className="errors">
          <summary>최근 클라이언트 오류 {o.client_errors.recent.length}건</summary>
          <ul>{o.client_errors.recent.map((e, i) => <li key={i}>{when(e.ts)} {e.version || '?'} · {e.message}</li>)}</ul>
        </details>
      )}
      {Object.keys(k).length > 0 && (
        <details className="errors">
          <summary>카운터 전체 (재시작 이후, {Object.keys(k).length}개)</summary>
          <ul>{Object.entries(k).map(([n, v]) => <li key={n}>{n} · {v}</li>)}</ul>
        </details>
      )}
      <figure className="signups">
        <figcaption>14일 가입 · {date(now - 13 * DAY)} ~ {date(now)}<span className="sr-only"> · 일별 {s.users.signups_14d.join(', ')}명</span></figcaption>
        <div className="bars" aria-hidden="true">
          {s.users.signups_14d.map((n, i) => <span key={i} className="bar" style={{ height: `${Math.max(4, (n / max) * 100)}%` }} data-tip={`${date(now - (13 - i) * DAY)} · ${n}명`} />)}
        </div>
      </figure>
    </>
  )
}
