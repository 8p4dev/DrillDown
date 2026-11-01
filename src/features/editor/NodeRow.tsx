import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { TreeNode } from '../../core/types'
import { parse, toHtml } from './content/format'

/** 너비 단계별 카드 폭(px) */
const WIDTH_PX = { 1: 180, 2: 260, 3: 360 } as const
type Step = keyof typeof WIDTH_PX
const nearestStep = (px: number) =>
  ([1, 2, 3] as Step[]).reduce((a, b) => (Math.abs(WIDTH_PX[b] - px) < Math.abs(WIDTH_PX[a] - px) ? b : a))

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
  /** 오답 농도 0..1 (core/srs missHeat) */
  heat: number
  /** 제목 편집 중이면 입력값, 아니면 null */
  draft: string | null
  onDraft: (v: string) => void
  onEditKey: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlurEdit: () => void
  /** 내용 인라인 편집기 (편집 중일 때만) */
  noteEditor: ReactNode
  onSelect: () => void
  onStartEdit: () => void
  onStartNoteEdit: () => void
  onToggle: () => void
  onWidth: (w: Step) => void
}

/** 그래프 노드 카드: 제목 + 내용. 클래스 이름 node-row·node-title 은 E2E 계약 */
export default function NodeRow(p: NodeRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = p.draft !== null
  const step: Step = p.node.width ?? 1
  const [liveW, setLiveW] = useState<number | null>(null) // 너비 핸들 드래그 중 미리보기 폭
  const drag = useRef<{ x: number; side: 1 | -1; z: number } | null>(null) // z = 그래프 확대 배율
  // 편집 중 들여쓰기·내어쓰기로 카드가 DOM 에서 옮겨지면 포커스를 되찾는다
  useLayoutEffect(() => {
    if (editing && document.activeElement !== inputRef.current) inputRef.current?.focus()
  }, [editing, p.depth, p.node.parentId, p.node.order])
  // 선택되거나 편집 중 카드가 늘어나면 보이도록 스크롤
  useEffect(() => {
    if (p.selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [p.selected, p.draft, p.node.note])

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const handle = (side: 1 | -1) => (
    <span
      className={`w-handle ${side > 0 ? 'r' : 'l'}`}
      aria-label="너비 조절"
      title="끌어서 너비 조절 (3단계)"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const card = e.currentTarget.parentElement!
        drag.current = { x: e.clientX, side, z: card.getBoundingClientRect().width / card.offsetWidth || 1 }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        // 카드는 가운데 정렬로 배치되므로 양쪽이 함께 늘어난다 → 포인터 이동의 2배
        if (d) setLiveW(Math.min(Math.max(WIDTH_PX[step] + d.side * ((e.clientX - d.x) / d.z) * 2, 120), 440))
      }}
      onPointerUp={() => {
        if (!drag.current) return
        drag.current = null
        const to = liveW === null ? step : nearestStep(liveW)
        setLiveW(null)
        if (to !== step) p.onWidth(to)
      }}
      onPointerCancel={() => ((drag.current = null), setLiveW(null))}
      onClick={stop}
      onDoubleClick={stop}
    />
  )

  return (
    <div
      ref={ref}
      role="treeitem"
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={p.hasChildren ? !p.node.collapsed : undefined}
      data-node-id={p.node.id}
      data-width={step}
      data-miss={p.heat}
      className={`node-row${p.selected ? ' selected' : ''}${p.cut ? ' cut' : ''}${p.depth === 0 ? ' root' : ''}${liveW !== null ? ' resizing' : ''}`}
      style={{ left: p.x, top: p.y, width: liveW ?? WIDTH_PX[step], '--heat': p.heat } as React.CSSProperties}
      onClick={p.onSelect}
      onDoubleClick={p.onStartEdit}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="title-input"
          aria-label="노드 제목"
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
      ) : (
        <div className="node-title">{p.node.title || ' '}</div>
      )}
      {p.noteEditor ? (
        <div className="node-note" onDoubleClick={stop}>{p.noteEditor}</div>
      ) : p.node.note ? (
        <div
          className="node-note"
          title="더블클릭하여 내용 편집"
          onDoubleClick={(e) => (stop(e), p.onStartNoteEdit())}
          // 저장 형식 → HTML (텍스트는 이스케이프됨)
          dangerouslySetInnerHTML={{ __html: toHtml(parse(p.node.note)) }}
        />
      ) : p.selected && !editing ? (
        // 내용이 없는 카드: 선택 시 카드 아래에 겹쳐 뜨는 추가 버튼 (배치 높이에 영향 없음)
        <button type="button" className="add-note" onClick={(e) => (stop(e), p.onStartNoteEdit())} onDoubleClick={stop}>
          + 내용
        </button>
      ) : null}
      {handle(-1)}
      {handle(1)}
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
