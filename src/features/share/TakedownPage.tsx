// 저작권 게시중단 요청 폼 #/takedown — 저작권법 §103 ①(소명)·영 §40, 약관 5. 비로그인 가능, IP 당 3/시(서버 메모리 버킷, IP 저장 없음).
// POST /api/takedown → 접수번호(= #/report/<id> 로 상태 조회). 연락처는 이 요청 통보에만 쓰고 처리 후 90일 삭제(legalDaily). T2 #23
import { useState } from 'react'
import { api, ApiError } from '../../core/api'
import { href } from '../../router'
import '../account/account.css'
import './legal.css'

export default function TakedownPage() {
  const [f, setF] = useState({ url: '', name: '', contact: '', claim: '', attest: false })
  const [done, setDone] = useState<string | null>(null)
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try { setDone((await api<{ id: string }>('/api/takedown', { body: f })).id) } catch (x) {
      setErr(x instanceof ApiError ? { field: x.field, message: x.message } : { message: '보내지 못했습니다 · 다시 시도해 주세요' })
    } finally { setBusy(false) }
  }
  if (done) {
    return (
      <section className="account privacy">
        <h1>게시중단 요청 접수</h1>
        <p>접수번호 <strong className="receipt">{done}</strong></p>
        <p>해당 트리가 있으면 즉시 숨김 처리되었고 작성자에게 앱 안에서 알렸습니다. 작성자가 <strong>30일</strong> 안에 재개를 요구하면 재개 예정일을 적어 주신 연락처로 알립니다.</p>
        <p><a href={href.report(done)}>처리 상태 보기</a> — 이 주소를 적어 두세요. 연락처 없이 상태만 보입니다.</p>
      </section>
    )
  }
  const bad = (k: string) => err?.field === k || undefined
  return (
    <section className="account privacy">
      <h1>저작권 게시중단 요청</h1>
      <p className="muted">저작권법 제103조에 따른 복제·전송 중단 요구입니다. 해당 트리는 접수 즉시 숨겨지고 작성자에게 알립니다. 부당한 요구로 생긴 손해는 요구자가 집니다(같은 조 ⑥). 저작권이 아닌 신고(스팸·욕설)는 공유 화면의 ⋯ 메뉴 → 신고를 쓰세요.</p>
      <form className="legal-form" onSubmit={submit}>
        <label>트리 주소<input required inputMode="url" placeholder="https://…/t/XXXXXXXXXXX 또는 11자 코드" maxLength={300} value={f.url} onChange={set('url')} aria-invalid={bad('url')} /></label>
        <label>권리자 성명(또는 대리인)<input required maxLength={40} autoComplete="name" value={f.name} onChange={set('name')} aria-invalid={bad('name')} /></label>
        <label>연락처(이메일 또는 전화)<input required maxLength={120} autoComplete="email" value={f.contact} onChange={set('contact')} aria-invalid={bad('contact')} />
          <span className="stat">이 요청의 통보에만 쓰고 처리 후 90일 뒤 지웁니다.</span></label>
        <label>권리 소명<textarea required rows={5} maxLength={1000} placeholder="저작물 이름, 등록 번호 또는 원본 주소, 침해라고 보는 이유 (1000자)" value={f.claim} onChange={set('claim')} aria-invalid={bad('claim')} /></label>
        <label className="toggle"><input type="checkbox" required checked={f.attest} onChange={set('attest')} /> 위 내용이 사실이며 제가 권리자 또는 그 대리인임을 확인합니다.</label>
        {err && <p className="form-error" role="alert">{err.message}</p>}
        <button type="submit" className="primary" disabled={busy}>요청 보내기</button>
      </form>
      <p className="stat">절차는 <a href={href.terms()}>이용약관 5</a>를 따릅니다. 로그인은 필요하지 않습니다.</p>
    </section>
  )
}
