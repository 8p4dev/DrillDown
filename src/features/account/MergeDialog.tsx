// 로그인 직후 로컬 트리 병합 확인 — 03 §3.3 "로그인 전 로컬 트리 UX", evidence/aa/flows.md §5. Sheet 1개, 버튼은 [저장] 하나(닫기 X 없음, "이 기기 것만 유지" 없음).
// (L>0,S=0) 한 줄 / (L>0,S>0) 두 줄. (L=0,S>0) 은 호출자가 토스트만. mock: 저장 = 즉시 완료. 계정 전환(M3)·커서 만료(M4) 문구는 서버 단계.
import { Sheet } from './ds-shim'

export default function MergeDialog({ local, server, onDone, onClose }: { local: number; server: number; onDone: () => void; onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} label="트리 저장">
      <p className="merge-line">이 기기의 트리 {local}개를 계정에 저장합니다</p>
      {server > 0 && <p className="merge-line muted">+ 계정의 트리 {server}개를 가져옵니다</p>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="primary" autoFocus onClick={onDone}>저장</button>
      </div>
    </Sheet>
  )
}
