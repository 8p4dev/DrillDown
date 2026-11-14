// 시스템 탭 — 공지·점검(NoticeForm) + 사건 대응(전 세션 폐기·운영 기록) + 감사 로그. 03 §3.4 시스템 행, 런북 §5.
// 버전·재시작·수동 백업·checkpoint·관리자 목록·OAuth 상태·복원 안내·감사 필터/CSV 는 T3 #31~#38(이 파일에서 확장).
import { useState } from 'react'
import { refreshMe } from '../../core/me'
import { type AuditRow, type Settings } from '../../core/api'
import { href } from '../../router'
import { I } from '../../ui/icons'
import { eye } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import NoticeForm from './NoticeForm'
import { ACTION, guard, post, TARGET, useGet, usePaged, when } from './shared'
import { Loading, More } from './widgets'

const NOTE_KIND: [string, string][] = [['incident', '사건'], ['restore', '복원'], ['note', '메모']]
const metaText = (m: Record<string, unknown> | null) =>
  !m ? '' : typeof m.reason === 'string' ? `사유: ${m.reason}` : typeof m.text === 'string' ? m.text : 'after' in m ? `→ ${JSON.stringify(m.after)}`
    : typeof m.appeal_id === 'string' ? `소명 ${m.appeal_id.slice(0, 8)}` : typeof m.report_id === 'string' ? `신고 ${m.report_id.slice(0, 8)}` : JSON.stringify(m).slice(0, 80)
export default function SystemTab() {
  const [tick, setTick] = useState(0)
  const [res, setRes] = useGet<{ settings: Settings }>('/api/admin/settings')
  const audit = usePaged<AuditRow>('/api/admin/audit?limit=50', tick)
  if (!res) return <Loading />
  const saved = (settings: Settings) => { setRes({ settings }); setTick((t) => t + 1); void refreshMe() }
  return (
    <>
      <NoticeForm settings={res.settings} onSaved={saved} />
      <Ops onDone={() => setTick((t) => t + 1)} />
      <AuditLog {...audit} />
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

function AuditLog({ items, next, more }: { items: AuditRow[]; next: string | null; more: () => void }) {
  // 최신순(06 QA #22) — 서버가 이미 ts DESC 여도 무해
  const audit = [...items].sort((a, b) => b.ts - a.ts)
  return (
    <>
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
