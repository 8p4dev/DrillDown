// 로그인 직후 로컬 트리 병합 확인 — 03 §3.3 "로그인 전 로컬 트리 UX", evidence/aa/flows.md §5, 04 §3.8 M1~M3. Sheet 1개(닫기 X 없음, "이 기기 것만 유지" 없음).
// 선택 전에는 닫히지 않는다(onClose 없음): 닫으면 동기화가 시작되지 않은 채 남는다(F6).
// otherAccount 있으면 계정 전환(M3): "이전 계정 트리 지우고 시작(기본) / 이 계정으로 복제". 아니면 (L>0) [저장] 1개, S>0 이면 한 줄 추가.
import type { MergeChoice, MergePlan } from '../../core/me'
import { Sheet } from '../../ui/Sheet'

export default function MergeDialog({ plan, onChoose }: { plan: MergePlan; onChoose: (c: MergeChoice) => void }) {
  if (plan.otherAccount) {
    return (
      <Sheet open label="계정 전환">
        <p className="merge-line">이 기기에 {plan.otherAccount}의 트리 {plan.local}개가 있어요</p>
        <div className="actions" style={{ justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onChoose('copy_other')}>이 계정으로 복제</button>
          <button type="button" className="primary" autoFocus onClick={() => onChoose('wipe_other')}>이전 계정 트리 지우고 시작</button>
        </div>
      </Sheet>
    )
  }
  return (
    <Sheet open label="트리 저장">
      <p className="merge-line">이 기기의 트리 {plan.local}개를 계정에 저장합니다</p>
      {plan.server > 0 && <p className="merge-line muted">+ 계정의 트리 {plan.server}개를 가져옵니다</p>}
      <div className="actions" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="primary" autoFocus onClick={() => onChoose('upload')}>저장</button>
      </div>
    </Sheet>
  )
}
