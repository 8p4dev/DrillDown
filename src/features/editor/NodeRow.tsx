import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TreeNode } from '../../core/types'

export interface NodeRowProps {
  node: TreeNode
  depth: number
  hasChildren: boolean
  selected: boolean
  cut: boolean
  /** 편집 중이면 입력값, 아니면 null */
  draft: string | null
  onDraft: (v: string) => void
  onEditKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlurEdit: () => void
  onSelect: () => void
  onStartEdit: () => void
  /** 학습 상태 색 클래스 — Wave 2 에서 EditorPage 가 colorMap 으로 채운다 */
  colorClassOf?: (nodeId: string) => string
}

const none = () => 'c-none'

export default function NodeRow(p: NodeRowProps) {
  const colorClassOf = p.colorClassOf ?? none
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = p.draft !== null
  // 편집 중 들여쓰기·내어쓰기로 행이 DOM 에서 옮겨지면 포커스를 되찾는다
  useLayoutEffect(() => {
    if (editing && document.activeElement !== inputRef.current) inputRef.current?.focus()
  }, [editing, p.depth, p.node.parentId, p.node.order])
  useEffect(() => {
    if (p.selected) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [p.selected])

  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={p.hasChildren ? !p.node.collapsed : undefined}
      data-node-id={p.node.id}
      className={`node-row ${colorClassOf(p.node.id)}${p.selected ? ' selected' : ''}${p.cut ? ' cut' : ''}`}
      style={{ paddingLeft: `${p.depth * 1.5 + 0.25}rem` }}
      onClick={p.onSelect}
      onDoubleClick={p.onStartEdit}
    >
      <span className="twisty" aria-hidden>
        {p.hasChildren ? (p.node.collapsed ? '▸' : '▾') : '·'}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          aria-label="노드 제목"
          value={p.draft ?? ''}
          onChange={(e) => p.onDraft(e.target.value)}
          onKeyDown={p.onEditKey}
          // 행 이동에 의한 일시적 blur 는 무시: 한 틱 뒤에도 포커스가 돌아오지 않았을 때만 편집 종료
          onBlur={() =>
            setTimeout(() => {
              if (inputRef.current && document.activeElement !== inputRef.current) p.onBlurEdit()
            })
          }
        />
      ) : (
        <span className="node-title">{p.node.title || ' '}</span>
      )}
      {p.node.note ? <span className="has-note" title="메모 있음">✎</span> : null}
    </div>
  )
}
