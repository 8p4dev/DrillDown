// 공유 보기 그래프의 읽기 전용 카드 — NodeRow 의 DOM 구조(.node-row .node-title .node-note .badge)만 같고 편집 장치(입력칸·너비 손잡이·+ 내용·툴팁)는 없다.
// 스타일은 editor.css 를 그대로 받는다(계약 C6). 너비 px 는 NodeRow 의 WIDTH_PX·WIDTH_PX_NARROW 와 같은 값(editor/** 를 수정하지 않으므로 복사).
import { memo, useSyncExternalStore } from 'react'
import type { TreeNode } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { chevronDown } from '../../ui/icons.all'
import { parse, toHtml } from '../editor/content/format'

const WIDTH_PX = { 1: 180, 2: 260, 3: 360 } as const
const WIDTH_PX_NARROW = { 1: 120, 2: 190, 3: 280 } as const
const narrowMq = matchMedia('(max-width: 760px)')
const subscribeNarrow = (cb: () => void) => {
  narrowMq.addEventListener('change', cb)
  return () => narrowMq.removeEventListener('change', cb)
}

export interface ShareCardProps {
  node: TreeNode
  depth: number
  x: number
  y: number
  hasChildren: boolean
  /** 접혀서 숨은 하위 노드 수 (펼쳐져 있으면 0) */
  hiddenCount: number
  selected: boolean
  still: boolean
  onSelect: () => void
  onToggle: () => void
}

function ShareCard(p: ShareCardProps) {
  const step = p.node.width ?? 1
  const widths = useSyncExternalStore(subscribeNarrow, () => narrowMq.matches) ? WIDTH_PX_NARROW : WIDTH_PX
  return (
    <div
      role="treeitem"
      aria-label={p.node.title || '제목 없음'}
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={p.hasChildren ? !p.hiddenCount : undefined}
      data-node-id={p.node.id}
      data-width={step}
      className={`node-row${p.selected ? ' selected' : ''}${p.depth === 0 ? ' root' : ''}${p.still ? ' still' : ''}`}
      style={{ left: p.x, top: p.y, width: widths[step] }}
      tabIndex={p.selected ? 0 : -1}
      onClick={p.onSelect}
      onKeyDown={(e) => { // 키보드: Enter/Space 선택, ←/→ 접기·펼치기(접기 배지는 aria-hidden — 카드가 대신 받는다)
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.onSelect() }
        else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && p.hasChildren) { e.preventDefault(); p.onToggle() }
      }}
    >
      <div className="node-title" title={p.node.title}>{p.node.title || ' '}</div>
      {p.node.note && <div className="node-note" dangerouslySetInnerHTML={{ __html: toHtml(parse(p.node.note)) }} />}
      {p.hasChildren && (
        <span
          className={`badge${p.hiddenCount ? ' folded' : ''}`}
          aria-hidden
          onClick={(e) => (e.stopPropagation(), p.onToggle())}
        >
          <Icon d={chevronDown} />{p.hiddenCount ? p.hiddenCount : null}
        </span>
      )}
    </div>
  )
}

/** 데이터 prop 이 같으면 다시 그리지 않는다(핀치·확대 때 카드 수백 장). 콜백은 setState 만 쓰므로 비교하지 않는다 */
export default memo(ShareCard, (a, b) => (Object.keys(b) as (keyof ShareCardProps)[]).every((k) => k.startsWith('on') || a[k] === b[k]))
