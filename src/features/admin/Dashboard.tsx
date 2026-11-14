// 대시보드 탭 — 운영 안전 카드(백업·일일·5xx·AUTH_FAKE) + 14일 가입. 03 §3.4 대시보드 행. 운영 지표 확장은 docs/research/admin/00_synthesis.md T1·T3.
import { useState } from 'react'
import type { AdminStats } from '../../core/api'
import { I } from '../../ui/icons'
import { ban, database, hardDrive } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { bytes, dur, date, H26, useGet, when } from './shared'
import { Card, Loading } from './widgets'

export default function Dashboard() {
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

