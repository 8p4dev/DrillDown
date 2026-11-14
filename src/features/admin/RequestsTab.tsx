// 요청 탭 — ① 정보주체 요청 큐(열람·정정·삭제·처리정지·미성년·기타, 관리자 수동 입력, 기한 10일 D-N, 초과 빨강, 완료 → audit dsr.<kind>) — T2 #25
//          ② 저작권 게시중단 큐(접수→숨김·소유자 통보→재개 예정 통보→재개/소 제기, 재개 요구 기한 30일 D-N, 확정·기각) — T2 #23. 서버: server/account/legal.ts
import { useState } from 'react'
import type { DsrKind, DsrRequest, Takedown, TakedownState } from '../../core/api'
import { eye } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import { ymd } from '../../core/fmt'
import { date, DAY, guard, post, useGet, when } from './shared'
import { Dday, Loading, TreeLink } from './widgets'

const KIND: Record<DsrKind, string> = { access: '열람', correct: '정정', delete: '삭제', suspend: '처리정지', minor: '미성년', other: '기타' }
const CHANNEL: Record<string, string> = { email: '이메일', app: '앱', other: '기타' }
const TD_STATE: Record<TakedownState, string> = { received: '접수 — 트리 없음', hidden: '숨김 · 소유자 통보됨', resume_notified: '재개 예정 통보됨', resumed: '재개', litigation: '소 제기 · 숨김 유지', confirmed: '확정 — 재개 요구 없음', rejected: '기각' }
const today = () => ymd(Date.now())

export default function RequestsTab() {
  const [all, setAll] = useState(false)
  const q = all ? '?status=all' : ''
  const [reqs, setReqs] = useGet<{ items: DsrRequest[] }>('/api/admin/requests' + q)
  const [tds, setTds] = useGet<{ items: Takedown[] }>('/api/admin/takedowns' + q)
  const [f, setF] = useState({ kind: 'access' as DsrKind, channel: 'email', received_at: today(), target_type: '', target_id: '', note: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.value }))
  const add = (e: React.FormEvent) => {
    e.preventDefault()
    void post<{ request: DsrRequest }>('/api/admin/requests', {
      kind: f.kind, channel: f.channel, received_at: new Date(`${f.received_at}T00:00:00`).getTime(), // 로컬 자정(SystemTab dayStart 와 같게) — 'YYYY-MM-DD' 만 주면 UTC
      target_type: f.target_type || undefined, target_id: f.target_id.trim() || undefined, note: f.note.trim() || undefined,
    }).then((r) => { setReqs((p) => ({ items: [...(p?.items ?? []), r.request].sort((a, b) => a.due_at - b.due_at) })); setF((x) => ({ ...x, target_id: '', note: '' })); toast('접수됨 · 기한 10일') }, guard)
  }
  const settle = (r: DsrRequest, action: 'done' | 'rejected') =>
    void post<{ request: DsrRequest }>(`/api/admin/requests/${r.id}`, { action }).then((x) => {
      setReqs((p) => p && { items: all ? p.items.map((i) => (i.id === r.id ? x.request : i)) : p.items.filter((i) => i.id !== r.id) })
      toast(action === 'done' ? `${KIND[r.kind]} 요청 완료 · 감사 기록 dsr.${r.kind}` : '반려')
    }, guard)
  const tdAct = (k: Takedown, action: 'resume_notify' | 'resume' | 'litigation' | 'confirm' | 'reject') =>
    void post<{ takedown: Takedown }>(`/api/admin/takedowns/${k.id}`, { action }).then((x) => {
      setTds((p) => p && { items: all || !x.takedown.resolved_at ? p.items.map((i) => (i.id === k.id ? x.takedown : i)) : p.items.filter((i) => i.id !== k.id) })
      toast(TD_STATE[x.takedown.state])
    }, guard)
  const openReqs = (reqs?.items ?? []).filter((r) => !r.resolved_at).length
  const openTds = (tds?.items ?? []).filter((k) => !k.resolved_at).length
  return (
    <>
      <label className="toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> 처리된 것도 보기 (90일 보관)</label>

      <h2>정보주체 요청 {openReqs}건 <span className="muted">— 기한 10일(영 §41·43·44). 이메일로 온 요청을 여기 적는다</span></h2>
      <form className="dsr-form" onSubmit={add}>
        <select aria-label="요청 종류" value={f.kind} onChange={set('kind')}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="접수 경로" value={f.channel} onChange={set('channel')}>{Object.entries(CHANNEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <label>접수일 <input type="date" aria-label="접수일" required max={today()} value={f.received_at} onChange={set('received_at')} /></label>
        <select aria-label="대상 종류" value={f.target_type} onChange={set('target_type')}><option value="">대상 없음</option><option value="user">사용자</option><option value="tree">트리</option></select>
        <input aria-label="대상 id" placeholder="대상 id(선택)" maxLength={64} value={f.target_id} onChange={set('target_id')} disabled={!f.target_type} />
        <label className="admin-search"><input aria-label="메모" placeholder="메모 (300자 · 개인정보 최소)" maxLength={300} value={f.note} onChange={set('note')} /></label>
        <button type="submit" className="primary">접수</button>
      </form>
      {!reqs ? <Loading /> : reqs.items.length === 0 ? <p className="muted">요청 없음</p> : (
        <table>
          <thead><tr><th>종류</th><th>경로</th><th>접수</th><th>기한</th><th>대상</th><th>메모</th><th aria-label="동작" /></tr></thead>
          <tbody>
            {reqs.items.map((r) => (
              <tr key={r.id} data-state={r.state}>
                <td data-l="종류" className="name">{KIND[r.kind]}{r.resolved_at && <span className="muted"> · {r.state === 'done' ? '완료' : '반려'} {date(r.resolved_at)}</span>}</td>
                <td data-l="경로">{CHANNEL[r.channel] ?? r.channel}</td>
                <td data-l="접수" className="tnum">{date(r.received_at)}</td>
                <td data-l="기한" className="tnum">{date(r.due_at)} {!r.resolved_at && <Dday at={r.due_at} />}</td>
                <td data-l="대상">{r.target_type ? `${r.target_type === 'user' ? '사용자' : '트리'} ${r.target_id?.slice(0, 8) ?? ''}` : '—'}</td>
                <td data-l="메모">{r.note ?? '—'}</td>
                <td className="act">
                  {!r.resolved_at && <>
                    <TwoStep label="완료" confirmLabel="정말 완료" verb={`${KIND[r.kind]} 요청 완료`} onConfirm={() => settle(r, 'done')} />
                    <TwoStep label="반려" confirmLabel="정말 반려" onConfirm={() => settle(r, 'rejected')} />
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>저작권 게시중단 요청 {openTds}건 <span className="muted">— 저작권법 §103. 접수 즉시 숨김·소유자 앱 내 통보. 재개 요구(소명) 기한 30일, 재개 예정일 = 통보 후 7일</span></h2>
      {!tds ? <Loading /> : tds.items.length === 0 ? <p className="muted">없음 · 요구자는 #/takedown 폼으로 보낸다</p> : (
        <ul className="reports takedowns">
          {tds.items.map((k) => (
            <li key={k.id} data-state={k.state}>
              <span className="grow">
                <strong>{k.tree ? k.tree.title : `/t/${k.slug}`}</strong> {k.tree && <TreeLink slug={k.tree.slug} />} · {TD_STATE[k.state]}
                {k.state === 'hidden' && k.hidden_at && <> · 재개 요구 기한 <Dday at={k.hidden_at + 30 * DAY} /></>}
                {k.state === 'resume_notified' && k.resume_due && <> · 재개 예정 {date(k.resume_due)} <Dday at={k.resume_due} /></>}
                {k.appealed_at && !k.resolved_at && <span className="sub"><Icon d={eye} /> 소유자 재개 요구(소명) {when(k.appealed_at)} — 공개 트리 탭 소명 큐에서 본문 확인</span>}
                <span className="sub">접수 {when(k.received_at)} · 접수번호 <span className="tnum">{k.id.slice(0, 8)}</span> · {k.claimant_name} · {k.claimant_contact || '(연락처 삭제됨)'}</span>
                <span className="sub claim">{k.claim}</span>
              </span>
              {k.state === 'received' && <TwoStep label="기각" confirmLabel="정말 기각" onConfirm={() => tdAct(k, 'reject')} />}
              {k.state === 'hidden' && <>
                <button type="button" title="소유자의 재개 요구를 권리자에게 알렸음(연락처로 직접) → 재개 예정일 7일 뒤" disabled={!k.appealed_at} onClick={() => tdAct(k, 'resume_notify')}>재개 예정 통보</button>
                <TwoStep label="확정" confirmLabel="정말 확정" verb="게시중단 확정" onConfirm={() => tdAct(k, 'confirm')} />
                <TwoStep label="기각" confirmLabel="정말 기각" verb="기각(숨김 해제)" onConfirm={() => tdAct(k, 'reject')} />
              </>}
              {k.state === 'resume_notified' && <>
                <TwoStep label={<><Icon d={eye} /> 재개</>} confirmLabel="정말 재개" verb="재개(공개 복귀)" onConfirm={() => tdAct(k, 'resume')} />
                <TwoStep label="소 제기" confirmLabel="정말 소 제기" verb="소 제기 접수(숨김 유지)" onConfirm={() => tdAct(k, 'litigation')} />
              </>}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
