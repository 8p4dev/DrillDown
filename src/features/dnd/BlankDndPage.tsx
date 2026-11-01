// 스텁 — Wave 1 담당 에이전트가 교체 (docs/plans/orchestration_modes.md)
import TreeHeader from '../TreeHeader'

export default function BlankDndPage({ treeId }: { treeId: string; rootId?: string }) {
  return (
    <section>
      <TreeHeader treeId={treeId} active="blank" />
      <p className="muted">백지 드래그 앤 드롭 퀴즈 — 준비 중</p>
    </section>
  )
}
