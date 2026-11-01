// 스텁 — Wave 1 담당 에이전트가 교체 (docs/plans/orchestration_modes.md)
import TreeHeader from '../TreeHeader'

export default function FlashPage({ treeId }: { treeId: string; rootId?: string }) {
  return (
    <section>
      <TreeHeader treeId={treeId} active="flash" />
      <p className="muted">플래시카드 — 준비 중</p>
    </section>
  )
}
