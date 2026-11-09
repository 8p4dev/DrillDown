// 트리 카드의 공개 상태 아이콘 1개(비공개는 표시 없음, 링크=link, 공개=globe) + aria-label. 04 §3.10 "카드 표식".
// 로그인 여부와 무관하게 로컬 값을 보인다. 호출: TreeListPage(LM) 제목 오른쪽 ⋯ 앞 <VisibilityBadge tree={t} />
import type { Tree } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import './share-list.css'

export default function VisibilityBadge({ tree }: { tree: Tree }) {
  const v = tree.visibility
  // U60·R7-S12: 운영 숨김은 공개 범위와 무관하게 경고 배지(pull 로 받은 서버 값)
  if ((tree as Tree & { hiddenByAdmin?: boolean }).hiddenByAdmin) return <span className="vis-badge vis-hidden">운영 숨김</span>
  if (!v || v === 'private') return null
  const label = v === 'public' ? '공개' : '링크'
  return (
    <span className="vis-badge" role="img" aria-label={label} data-tip={label}>
      <Icon d={v === 'public' ? I.globe : I.link} />
    </span>
  )
}
