// 공지(복수·기간·링크·대상)·점검 모드(수동 + 예약 시작·종료)·신고 자동 숨김 기준 — T2 #28·#29. 짝: admin.ts PUT /api/admin/settings(저장은 notices·maintenance{manual,from,until}·auto_hide_reports).
// 스케줄러 없음: 서버가 요청 시각으로 enabled(점검)·유효 공지를 판정한다. 시각 입력은 네이티브 <input type="datetime-local">.
import { useState } from 'react'
import { api, type Notice, type Settings } from '../../core/api'
import { megaphone, x } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import { guard, p2, when } from './shared'

/** epoch ms ↔ datetime-local 값(로컬 시각, 분 단위) */
const toLocal = (t?: number | null) => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}` }
const fromLocal = (s: string) => (s ? new Date(s).getTime() : null)
const newId = () => Math.random().toString(36).slice(2, 10)
const status = (n: Notice, now = Date.now()) => (n.from && n.from > now ? '예정' : n.until && n.until <= now ? '종료' : n.audience === 'users' ? '게시 중 · 로그인만' : '게시 중')
const maintLabel = (m: Settings['maintenance'], now = Date.now()) => m.enabled ? `켜짐(${m.manual ? '수동' : '예약'}) — 관리자 외 모든 /api 가 503, 동기화 중단`
  : m.from && m.from > now ? `예약됨 · ${when(m.from)} ~ ${m.until ? when(m.until) : '수동 종료'} (사용자에게 예고 배너)` : '꺼짐'

export default function NoticeForm({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [base, setBase] = useState(settings)
  const [list, setList] = useState<Notice[]>(settings.notices)
  const [sched, setSched] = useState({ from: toLocal(settings.maintenance.from), until: toLocal(settings.maintenance.until) })
  const [auto, setAuto] = useState(settings.auto_hide_reports)
  if (base !== settings) { // 저장 응답(id 부여·정규화)으로 편집 상태를 다시 맞춘다
    setBase(settings); setList(settings.notices); setSched({ from: toLocal(settings.maintenance.from), until: toLocal(settings.maintenance.until) }); setAuto(settings.auto_hide_reports)
  }
  const save = (patch: Record<string, unknown>, msg: string) =>
    void api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: patch }).then((r) => { onSaved(r.settings); toast(msg) }, guard)
  const edit = (i: number, patch: Partial<Notice>) => setList((xs) => xs.map((n, j) => (j === i ? { ...n, ...patch } : n)))
  const m = settings.maintenance
  return (
    <>
      <form className="notices" onSubmit={(e) => { e.preventDefault(); save({ notices: list }, '공지 저장됨') }}>
        {list.length === 0 && <p className="muted">공지 없음</p>}
        {list.map((n, i) => (
          <div key={n.id} className="notice-row">
            <label className="admin-search">
              <Icon d={megaphone} /><input aria-label="공지 내용" placeholder="공지 (160자)" maxLength={160} required value={n.text} onChange={(e) => edit(i, { text: e.target.value })} />
            </label>
            <input type="url" aria-label="링크" placeholder="링크(선택) https://" maxLength={200} value={n.url ?? ''} onChange={(e) => edit(i, { url: e.target.value || undefined })} />
            <label>시작 <input type="datetime-local" aria-label="공지 시작" value={toLocal(n.from)} onChange={(e) => edit(i, { from: fromLocal(e.target.value) })} /></label>
            <label>종료 <input type="datetime-local" aria-label="공지 종료" value={toLocal(n.until)} onChange={(e) => edit(i, { until: fromLocal(e.target.value) })} /></label>
            <select aria-label="공지 대상" value={n.audience} onChange={(e) => edit(i, { audience: e.target.value as Notice['audience'] })}>
              <option value="all">전체</option><option value="users">로그인만</option>
            </select>
            <span className="muted">{status(n)}</span>
            <button type="button" className="ghost" aria-label="공지 삭제" data-tip="삭제" onClick={() => setList((xs) => xs.filter((_, j) => j !== i))}><Icon d={x} /></button>
          </div>
        ))}
        <div className="notice-actions">
          <button type="button" onClick={() => setList((xs) => [...xs, { id: newId(), text: '', audience: 'all' }])} disabled={list.length >= 10}>공지 추가</button>
          <button type="submit" className="primary"><Icon d={megaphone} /> 공지 저장</button>
        </div>
      </form>
      {/* 점검 모드: 한 번에 전 사용자 503 이라 2단계. 끄기 = 수동·예약 모두 해제 */}
      <div className="maint-row">
        <span className="dot" data-ok={!m.enabled} /> 점검 모드 {maintLabel(m)}
        <TwoStep label={m.enabled ? '점검 끄기' : '점검 켜기'} confirmLabel={m.enabled ? '정말 끄기' : '정말 켜기'} verb={m.enabled ? '점검 종료' : '점검 시작'}
          onConfirm={() => save({ maintenance: m.enabled ? { manual: false, from: null, until: null } : { manual: true, from: m.from, until: m.until } }, m.enabled ? '점검 모드 꺼짐' : '점검 모드 켜짐 · 사용자 동기화가 멈춥니다')} />
      </div>
      {/* 예약도 지정 시각에 전 사용자 503 이라 2단계. 시작 시각이 없으면 비활성 */}
      <div className="maint-row">
        <label>예약 시작 <input type="datetime-local" aria-label="점검 시작" value={sched.from} onChange={(e) => setSched((s) => ({ ...s, from: e.target.value }))} /></label>
        <label>종료 <input type="datetime-local" aria-label="점검 종료" value={sched.until} min={sched.from || undefined} onChange={(e) => setSched((s) => ({ ...s, until: e.target.value }))} /></label>
        <TwoStep label="예약 저장" confirmLabel="정말 예약" verb="점검 예약" disabled={!sched.from}
          onConfirm={() => save({ maintenance: { manual: m.manual, from: fromLocal(sched.from), until: fromLocal(sched.until) } }, `점검 예약 저장됨 · ${when(fromLocal(sched.from)!)} 시작`)} />
        {m.from != null && <button type="button" onClick={() => save({ maintenance: { manual: m.manual, from: null, until: null } }, '점검 예약 취소')}>예약 취소</button>}
      </div>
      <form className="maint-row" onSubmit={(e) => { e.preventDefault(); save({ auto_hide_reports: auto }, '자동 숨김 기준 저장됨') }}>
        <label>열린 신고 <input type="number" aria-label="자동 숨김 기준" min={0} max={20} value={auto} onChange={(e) => setAuto(Math.max(0, Math.min(20, Math.floor(Number(e.target.value)) || 0)))} /> 건이면 자동 임시 숨김 30일 (0 = 끔)</label>
        <button type="submit" disabled={auto === settings.auto_hide_reports}>저장</button>
      </form>
    </>
  )
}
