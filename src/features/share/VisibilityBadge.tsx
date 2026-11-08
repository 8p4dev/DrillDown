// [스텁 — SH 가 교체] 트리 카드의 공개 상태 아이콘 1개(비공개는 표시 없음, 링크=link, 공개=globe) + aria-label. 04 §3.10 "카드 표식".
// 호출: TreeListPage(LM) 제목 오른쪽 ⋯ 앞 <VisibilityBadge tree={t} />
import type { Tree } from '../../core/types'

export default function VisibilityBadge({ tree }: { tree: Tree }) {
  if (!tree.visibility || tree.visibility === 'private') return null
  return <span className="vis-badge" aria-label={tree.visibility === 'public' ? '공개' : '링크'}>{tree.visibility}</span>
}
