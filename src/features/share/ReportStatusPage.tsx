// 신고·게시중단 접수 상태 #/report/<id> — 접수번호로 처리 결과 조회(연락처 없이). T2 #26
export default function ReportStatusPage({ id }: { id: string }) {
  return <section className="account"><h1>접수 상태</h1><p className="muted">{id} — 준비 중</p></section>
}
