import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TreeNode } from '../../core/types'

export interface NodeRowProps {
  node: TreeNode
  depth: number
  /** 그래프 캔버스 안 위치(px) */
  x: number
  y: number
  hasChildren: boolean
  /** 접혀서 숨은 하위 노드 수 (펼쳐져 있으면 0) */
  hiddenCount: number
  selected: boolean
  cut: boolean
  /** 편집 중이면 입력값, 아니면 null */
  draft: string | null
  onDraft: (v: string) => void
  onEditKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlurEdit: () => void
  onSelect: () => void
  onStartEdit: () => void
  onToggle: () => void
  colorClassOf: (nodeId: string) => string
}

/** 그래프 노드 카드. 클래스 이름 node-row·c-*·node-title 은 E2E 계약(plan §3) */
export default function NodeRow(p: NodeRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = p.draft !== null
  // 편집 중 들여쓰기·내어쓰기로 카드가 DOM 에서 옮겨지면 포커스를 되찾는다
  useLayoutEffect(() => {
    if (editing && document.activeElement !== inputRef.current) inputRef.current?.focus()
  }, [editing, p.depth, p.node.parentId, p.node.order])
  // 선택되거나 편집 중 카드가 늘어나면 보이도록 스크롤
  const grow = editing ? p.draft : null
  useEffect(() => {
    if (p.selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [p.selected, grow])

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={p.hasChildren ? !p.node.collapsed : undefined}
      data-node-id={p.node.id}
      className={`node-row ${p.colorClassOf(p.node.id)}${p.selected ? ' selected' : ''}${p.cut ? ' cut' : ''}${p.depth === 0 ? ' root' : ''}`}
      style={{ left: p.x, top: p.y }}
      onClick={p.onSelect}
      onDoubleClick={p.onStartEdit}
    >
      {editing ? (
        // 입력 텍스트만큼 카드가 늘어나도록 숨은 사본(::after)이 폭을 정한다
        <span className="grow" data-value={p.draft}>
          <input
            ref={inputRef}
            aria-label="노드 제목"
            size={1}
            value={p.draft ?? ''}
            onChange={(e) => p.onDraft(e.target.value)}
            onKeyDown={p.onEditKey}
            // 카드 이동에 의한 일시적 blur 는 무시: 한 틱 뒤에도 포커스가 돌아오지 않았을 때만 편집 종료
            onBlur={() =>
              setTimeout(() => {
                if (inputRef.current && document.activeElement !== inputRef.current) p.onBlurEdit()
              })
            }
          />
        </span>
      ) : (
        <span className="node-title">{p.node.title || ' '}</span>
      )}
      {p.node.note ? <span className="has-note" title="메모 있음">✎</span> : null}
      {p.hasChildren && (
        <span
          className={`badge${p.hiddenCount ? ' folded' : ''}`}
          role="button"
          aria-label={p.hiddenCount ? `펼치기 (하위 ${p.hiddenCount}개)` : '접기'}
          title={p.hiddenCount ? '펼치기 (H)' : '접기 (H)'}
          onClick={(e) => (stop(e), p.onToggle())}
          onDoubleClick={stop}
        >
          {p.hiddenCount ? `+${p.hiddenCount}` : '−'}
        </span>
      )}
    </div>
  )
}
