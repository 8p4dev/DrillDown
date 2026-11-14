// 신고·게시중단 접수 상태 #/report/<id> — GET /api/report/:id (상태·시각만, 연락처·트리 정보 없음). 신고자(§103 ② 권리주장자)에게 결과를 알리는 앱 내 경로. T2 #26
import { useEffect, useState } from 'react'
import { api, ApiError, type ReportStatus } from '../../core/api'
import { hm, ymd } from '../../core/fmt'
import { href } from '../../router'
import '../account/account.css'
import './legal.css'

const when = (t: number) => `${ymd(t)} ${hm(t)}`
/** "<kind>.<state>" → [제목, 설명]. 없으면 kind 무관 state 로 */
const TEXT: Record<string, [string, string]> = {
  'report.open': ['검토 중', '운영자가 검토 중입니다. 임시 숨김 30일 안에 결정합니다.'],
  'report.hidden': ['숨김 처리', '검토 결과 트리를 숨김 처리했습니다.'],
  'report.dismissed': ['기각', '검토 결과 조치하지 않았습니다.'],
  'takedown.received': ['접수', '적어 주신 주소에 해당하는 트리를 찾지 못해 운영자가 확인 중입니다.'],
  'takedown.hidden': ['중단(숨김) · 작성자 통보', '트리를 즉시 숨기고 작성자에게 알렸습니다. 작성자는 통보일부터 30일 안에 재개를 요구할 수 있습니다.'],
  'takedown.resume_notified': ['재개 예정 통보', '작성자가 재개를 요구해 재개 예정일을 알렸습니다. 그 전에 소 제기를 알리지 않으면 예정일에 재개됩니다.'],
  'takedown.resumed': ['재개', '트리가 다시 공개되었습니다.'],
  'takedown.litigation': ['소 제기 · 숨김 유지', '소 제기 통보를 받아 재개하지 않습니다.'],
  'takedown.confirmed': ['확정', '30일 안에 재개 요구가 없어 숨김이 확정되었습니다.'],
  'takedown.rejected': ['기각', '요구가 요건을 갖추지 못했거나 트리를 찾을 수 없어 조치하지 않았습니다.'],
}

export default function ReportStatusPage({ id }: { id: string }) {
  const [s, setS] = useState<ReportStatus | { fail: string } | null>(null)
  useEffect(() => {
    let on = true
    api<ReportStatus>(`/api/report/${encodeURIComponent(id)}`).then(
      (r) => { if (on) setS(r) },
      (e: unknown) => { if (on) setS({ fail: e instanceof ApiError && e.status === 404 ? '접수번호를 찾을 수 없습니다. 처리 후 90일이 지나면 기록이 지워집니다.' : e instanceof ApiError ? e.message : '불러오지 못했습니다' }) })
    return () => { on = false }
  }, [id])
  const [title, desc] = s && !('fail' in s) ? TEXT[`${s.kind}.${s.state}`] ?? [s.state, ''] : ['', '']
  return (
    <section className="account privacy">
      <h1>접수 상태</h1>
      <p className="stat">접수번호 <span className="receipt">{id}</span></p>
      {!s ? <p className="muted" aria-busy="true">확인 중…</p> : 'fail' in s ? <p role="alert">{s.fail}</p> : (
        <>
          <h2>{s.kind === 'report' ? '신고' : '저작권 게시중단 요청'} — {title}</h2>
          <p>{desc}</p>
          <ul className="muted">
            <li><span className="grow">접수</span> <span className="tnum">{when(s.received_at)}</span></li>
            {s.updated_at && <li><span className="grow">최근 처리</span> <span className="tnum">{when(s.updated_at)}</span></li>}
          </ul>
        </>
      )}
      <p className="stat">연락처 없이 상태만 보여 줍니다. 절차는 <a href={href.terms()}>이용약관 4·5</a>.</p>
    </section>
  )
}
