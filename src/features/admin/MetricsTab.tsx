// 지표 탭 — 학습·성장 지표 카드(K2·회독별 재현율·자기채점·구조 오답·FSRS 유지율·활성화율·제공자·신고 SLA·1년 미접속·DB/사용자), daily_stats 선그래프(SVG 직접),
// 운영 기준(사고 72h·재시작), 운영 스위치(flags)·추천 고정, 시드 트리 큐레이션, 소유자·신고자 신고 집계 — T4 #40·#41·#44·#45·#49. docs/plans/orchestration_admin_stage3.md §3
import { useState } from 'react'
import { api, type DailyStat, type ProductFlags, type ProductMetrics, type ProductSettings, type ProductTree, type ReportAgg } from '../../core/api'
import { refreshMe } from '../../core/me'
import { I } from '../../ui/icons'
import { database, eyeOff, star, userX } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { toast } from '../Toast'
import { ACTION, bytes, guard, REASON, useGet, when } from './shared'
import { Card, Loading, TreeLink } from './widgets'

Object.assign(ACTION, { 'settings.flags': '운영 스위치 변경', 'settings.featured': '추천 트리 변경' })

const PERIODS: [number, string][] = [[30, '30일'], [90, '90일'], [0, '전체']]
const pct = (r: number | null, d = 0) => (r === null ? '—' : `${(r * 100).toFixed(d)}%`)
const size = (b: number) => (b >= 1e6 ? bytes(b) : `${Math.round(b / 1e3)} KB`)
const FLAG_LABEL: Record<keyof ProductFlags, string> = { gallery: '공개 트리 목록(갤러리)', report: '신고 버튼', rating: '별점', publish: '공개 전환' }
type SettingsRes = { settings: ProductSettings }

export default function MetricsTab() {
  const [days, setDays] = useState(30)
  const [m] = useGet<ProductMetrics>(`/api/admin/product/metrics?days=${days}`)
  const [res, setRes] = useGet<SettingsRes>('/api/admin/product/settings')
  // 낙관적 반영(체크박스가 응답 전까지 되돌아가지 않게) → 실패하면 서버 값으로 되돌린다. refreshMe 로 상단 바(갤러리 탭)도 따라간다
  const save = (patch: Partial<ProductSettings>) => {
    setRes((p) => (p ? { settings: { ...p.settings, ...patch } } : p))
    api<SettingsRes>('/api/admin/product/settings', { method: 'PUT', body: patch }).then((r) => { setRes(r); toast('저장됨'); void refreshMe() },
      (e) => { guard(e); api<SettingsRes>('/api/admin/product/settings').then(setRes, () => {}) })
  }
  return (
    <>
      <div className="seg" role="group" aria-label="기간">
        {PERIODS.map(([d, l]) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>{l}</button>)}
      </div>
      {!m ? <Loading /> : (
        <>
          <Learning m={m} />
          <h2>추이 (일별 스냅샷 04:00)</h2>
          <Chart title="활성 사용자" rows={m.daily} series={[{ key: 'dau', label: '24h' }, { key: 'wau', label: '7일', color: 'var(--muted)' }, { key: 'mau', label: '30일', dash: '4 3' }, { key: 'retrieval_active', label: '7일 백지 인출', color: 'var(--ok)' }]} />
          <Chart title="증가" rows={m.daily} series={[{ key: 'new_users', label: '가입' }, { key: 'new_trees', label: '새 트리', color: 'var(--muted)' }, { key: 'attempts', label: '백지 완료', color: 'var(--ok)' }, { key: 'open_reports', label: '열린 신고', dash: '4 3' }]} />
          <Chart title="유입 (일별 증분)" rows={m.daily} series={[{ key: 'share_views', label: '공유 조회', delta: true }, { key: 'copies', label: '복제', color: 'var(--muted)', delta: true }, { key: 'gallery_hits', label: '갤러리 요청', color: 'var(--ok)', delta: true }]} />
          <OpsBase m={m} />
        </>
      )}
      <h2>운영 스위치</h2>
      {!res ? <Loading /> : (
        <div className="flags">
          {(Object.keys(FLAG_LABEL) as (keyof ProductFlags)[]).map((k) => (
            <label key={k} className="toggle">
              <input type="checkbox" checked={res.settings.flags[k]} onChange={(e) => void save({ flags: { ...res.settings.flags, [k]: e.target.checked } })} /> {FLAG_LABEL[k]}
            </label>
          ))}
          <span className="muted">끄면 서버가 거절합니다(갤러리 404 · 신고/별점/공개 전환 403). 배포 없이 기능을 내리는 용도</span>
        </div>
      )}
      <Curation featured={res?.settings.featured_slugs ?? []} onFeatured={(slugs) => save({ featured_slugs: slugs })} />
      <ReportAggView />
      <p className="muted">보류 — 결정 필요: 후원 막대 · user_activity 코호트(W1/W4) · 허용 표현 승인 큐 · 익명 핑 · 태그·카테고리 · 웹 푸시 · UTM</p>
    </>
  )
}

/** #40 학습·성장 카드. 임계값은 11_cost_recovery §5(측정 전 고정) */
function Learning({ m }: { m: ProductMetrics }) {
  const prov = Object.entries(m.providers)
  const r = m.reports
  return (
    <div className="stat-grid">
      <Card icon={I.refreshCw} label="K2 · 14일 내 같은 트리 백지 2회" value={pct(m.k2.rate)} sub={`${m.k2.users} / 활성 ${m.active_users}명 · 킬 기준 20% 미만`} />
      <Card icon={I.listTree} label="회독별 재현율 1 → 3회차 (중앙값)" value={`${pct(m.recall.r1)} → ${pct(m.recall.r3)}`} sub={`1회차 ${m.recall.n1} · 3회차 ${m.recall.n3} · 목표 +15%p`} />
      <Card icon={I.pencil} label="자기채점 비율" value={pct(m.grading.self_rate)} sub={`뒤집기 ${pct(m.grading.override_rate, 1)} · 자동 ${m.grading.auto} · 자기 ${m.grading.self} · 신호 30% 초과`} />
      <Card icon={I.squareDashed} label="구조 오답" value={pct(m.structure_error, 1)} sub={`1 − edge_accuracy 평균 · 백지 ${m.attempts}회`} />
      <Card icon={I.calendarCheck} label="FSRS 평균 예측 기억률" value={pct(m.fsrs.avg_r)} sub={`카드 ${m.fsrs.cards} · 평균 90% 미만 사용자 ${m.fsrs.users_below_90}`} />
      <Card icon={I.check} label="활성화율 (가입 72h 내 백지 완료)" value={pct(m.activation.rate)} sub={`${m.activation.activated} / 가입 ${m.activation.signups} · 목표 40%`} />
      <Card icon={I.user} label="제공자별 가입" value={prov.reduce((a, [, n]) => a + n, 0)} sub={prov.length ? prov.map(([p, n]) => `${p} ${n}`).join(' · ') : '없음'} />
      <Card icon={I.circleAlert} label="신고 SLA" value={`열림 ${r.open}`} sub={<>{r.oldest_open_h !== null && `최장 대기 ${Math.round(r.oldest_open_h)}h · `}7일 내 처리 {pct(r.within_7d_rate)} ({r.resolved}건)<br />{(Object.keys(REASON) as (keyof typeof REASON)[]).map((k) => `${REASON[k]} ${r.by_reason[k]}`).join(' · ')}</>} />
      <Card icon={userX} label="1년 미접속" value={m.inactive_1y} sub="deleted_at 없음 · last_seen_at 365일 전" />
      <Card icon={database} label="DB 크기 / 사용자" value={size(m.db.bytes)} sub={`사용자당 ${size(m.db.per_user)} · 가정 1MB`} />
    </div>
  )
}

type Series = { key: keyof DailyStat; label: string; color?: string; dash?: string; delta?: boolean }
/** 선그래프 — SVG 직접(라이브러리 금지). delta = 누계 열의 일별 증분(첫날 제외). 색은 무채색+초록만 */
function Chart({ title, rows, series }: { title: string; rows: DailyStat[]; series: Series[] }) {
  const W = 600, H = 120, P = 4
  const vals = series.map((s) => rows.map((r, i) => (s.delta ? (i ? Math.max(0, Number(r[s.key]) - Number(rows[i - 1][s.key])) : null) : Number(r[s.key]))))
  const max = Math.max(1, ...vals.flat().filter((v): v is number => v !== null))
  const x = (i: number) => (rows.length > 1 ? P + (i * (W - 2 * P)) / (rows.length - 1) : W / 2)
  const y = (v: number) => H - P - (v / max) * (H - 2 * P)
  const last = (k: number) => vals[k].findLast((v) => v !== null) ?? null
  return (
    <figure className="chart">
      <figcaption>{title}{rows.length > 0 && <> · {rows[0].day.slice(5)} ~ {rows[rows.length - 1].day.slice(5)} · 최대 {max}</>}</figcaption>
      {rows.length < 2 ? <p className="muted">일별 스냅샷이 2일 이상 쌓이면 선이 그려집니다 (지금 {rows.length}일)</p> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${series.map((s, k) => `${s.label} 마지막 ${last(k) ?? '—'}`).join(', ')}`}>
          <line x1={0} y1={H - P} x2={W} y2={H - P} stroke="var(--border)" />
          {vals.map((vs, k) => (
            <polyline key={series[k].key} fill="none" strokeWidth={1.5} stroke={series[k].color ?? 'var(--text)'} strokeDasharray={series[k].dash}
              points={vs.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ')} />
          ))}
        </svg>
      )}
      <ul className="chart-legend">
        {series.map((s, k) => <li key={s.key}><span className="swatch" style={{ borderColor: s.color ?? 'var(--text)', borderStyle: s.dash ? 'dashed' : 'solid' }} />{s.label} <strong className="tnum">{last(k) ?? '—'}</strong></li>)}
      </ul>
    </figure>
  )
}

/** #49 운영 기준: 사고 기록(72h 신고 기한 카운트다운)·재시작(가용성 대용) */
function OpsBase({ m }: { m: ProductMetrics }) {
  const [now] = useState(() => Date.now())
  const restarts = m.daily.reduce((a, d) => a + d.restarts, 0) + m.restarts_today
  const left = (ts: number) => { const h = Math.round((ts + 72 * 3_600_000 - now) / 3_600_000); return h > 0 ? `${h}시간 남음` : '72시간 지남' }
  return (
    <>
      <h2>운영 기준</h2>
      <div className="stat-grid">
        <Card icon={I.refreshCw} label="서버 재시작 (기간)" value={restarts} sub={`오늘 ${m.restarts_today} · 가용성 99% 대용 지표`} />
        <Card icon={I.circleAlert} label="사고 기록" value={m.incidents.length} sub="O2 손실·O3 유출 1회면 재판정 · 유출은 72시간 안에 신고" />
      </div>
      {m.incidents.length > 0 && (
        <ul className="reports">
          {m.incidents.map((i) => (
            <li key={i.ts}><span className="grow"><strong>{when(i.ts)}</strong> — {i.text}</span><span className="tnum muted">{left(i.ts)}</span></li>
          ))}
        </ul>
      )}
    </>
  )
}

/** #45 시드(소유자 admin) 표식·필터, 추천 고정 토글, 조회·복제·별점·신고, 복제 계보 원본 */
function Curation({ featured, onFeatured }: { featured: string[]; onFeatured: (slugs: string[]) => void }) {
  const [seed, setSeed] = useState(false)
  const [res] = useGet<{ items: ProductTree[] }>(`/api/admin/product/trees${seed ? '?seed=1' : ''}`)
  const toggle = (t: ProductTree) => onFeatured(featured.includes(t.slug) ? featured.filter((s) => s !== t.slug) : [...featured, t.slug])
  return (
    <>
      <h2>공개 트리 큐레이션 <label className="toggle"><input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} /> 시드(운영자) 트리만</label></h2>
      {!res ? <Loading /> : res.items.length === 0 ? <p className="muted">공개 트리 없음</p> : (
        <table>
          <thead><tr><th>제목</th><th>소유자</th><th>조회</th><th>복제</th><th>별점</th><th>신고</th><th>원본</th><th aria-label="추천" /></tr></thead>
          <tbody>
            {res.items.map((t) => {
              const on = featured.includes(t.slug)
              return (
                <tr key={t.id}>
                  <td data-l="제목" className="name">{t.seed && <span className="badge">시드</span>} {on && <span className="badge">추천</span>} {t.title} <TreeLink slug={t.slug} /></td>
                  <td data-l="소유자">{t.owner}</td>
                  <td data-l="조회" className="tnum">{t.view_count}</td>
                  <td data-l="복제" className="tnum">{t.copy_count}</td>
                  <td data-l="별점" className="tnum"><Icon d={star} /> {t.rating_avg === null ? '—' : `${t.rating_avg.toFixed(1)} (${t.rating_count})`}</td>
                  <td data-l="신고" className="tnum">{t.open_reports}</td>
                  <td data-l="원본" className="muted">{t.source_title ?? '—'}</td>
                  <td className="act"><button type="button" aria-pressed={on} aria-label={`${t.title} 추천 ${on ? '해제' : '고정'}`} disabled={!on && featured.length >= 20} onClick={() => toggle(t)}>{on ? <><Icon d={eyeOff} /> 추천 해제</> : <><Icon d={star} /> 추천</>}</button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}

/** #45 소유자·신고자 단위 집계(반복 위반·반복 신고자). 소유자에게는 노출 금지(R7 S10) — 관리자 전용 */
function ReportAggView() {
  const [agg] = useGet<ReportAgg>('/api/admin/product/reports')
  if (!agg) return <Loading />
  return (
    <>
      <h2>신고 집계 — 소유자 {agg.owners.length} · 신고자 {agg.reporters.length}</h2>
      {agg.owners.length === 0 && agg.reporters.length === 0 ? <p className="muted">신고 없음</p> : (
        <div className="agg">
          <ul className="reports">
            {agg.owners.map((o) => <li key={o.id}><span className="grow"><strong>{o.nickname}</strong> <span className="sub">트리 {o.trees}개 · 신고 {o.reports}건 · 열림 {o.open}</span></span></li>)}
          </ul>
          <ul className="reports">
            {agg.reporters.map((r) => <li key={r.id ?? 'anon'}><span className="grow"><strong>{r.nickname ?? (r.id ? r.id.slice(0, 8) : '비로그인·탈퇴')}</strong> <span className="sub">신고 {r.reports}건</span></span></li>)}
          </ul>
        </div>
      )}
    </>
  )
}
