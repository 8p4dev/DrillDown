import { memo, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { CAP, type TreeNode } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { chevronDown, x } from '../../ui/icons.all'
import { ensureVisible } from '../viewport'
import { parse, toHtml } from './content/format'

/** 너비 단계별 카드 폭(px) */
const WIDTH_PX = { 1: 180, 2: 260, 3: 360 } as const
type Step = keyof typeof WIDTH_PX
/** 모바일 폭: 최소 배율(.5)에서도 루트와 1단계 카드가 390px 화면에 들어오도록 좁힌다 */
const WIDTH_PX_NARROW: Record<Step, number> = { 1: 120, 2: 190, 3: 280 }
const nearestStep = (px: number, w: Record<Step, number>) =>
  ([1, 2, 3] as Step[]).reduce((a, b) => (Math.abs(w[b] - px) < Math.abs(w[a] - px) ? b : a))
const narrowMq = matchMedia('(max-width: 760px)')
const subscribeNarrow = (cb: () => void) => {
  narrowMq.addEventListener('change', cb)
  return () => narrowMq.removeEventListener('change', cb)
}

export interface NodeRowProps {
  node: TreeNode
  depth: number
  /** 그래프 캔버스 안 위치(px) */
  x: number
  y: number
  hasChildren: boolean
  /** 형제 중 위치(1부터)·형제 수 — aria-posinset/setsize (U50) */
  pos: number
  setSize: number
  /** 접혀서 숨은 하위 노드 수 (펼쳐져 있으면 0) */
  hiddenCount: number
  selected: boolean
  cut: boolean
  /** 오답 농도 0..1 (core/srs missHeat) — data-miss(E2E 계약) */
  heat: number
  /** 오답 점수(정수). 1 이상이면 우하단 ✕n 배지 (01 §3.1.3) */
  miss: number
  /** 위치 트랜지션 끔 (측정 전·드래그로 따라오는 중) */
  still: boolean
  /** 끌고 있는 카드: 들어 올린 모양 */
  lifted: boolean
  /** 진입 뒤에 새로 생긴 카드: 스프링으로 등장 */
  spawn: boolean
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
function NodeRow(p: NodeRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const editing = p.draft !== null
  const step: Step = p.node.width ?? 1
  const widths = useSyncExternalStore(subscribeNarrow, () => narrowMq.matches) ? WIDTH_PX_NARROW : WIDTH_PX
  const [spawned] = useState(p.spawn) // 마운트 시점 값 고정: 정착 표시로 spawn 이 꺼져도 애니메이션이 끊기지 않게
  const [liveW, setLiveW] = useState<number | null>(null) // 너비 핸들 드래그 중 미리보기 폭
  const drag = useRef<{ x: number; side: 1 | -1; z: number } | null>(null) // z = 그래프 확대 배율
  // 편집 중 들여쓰기·내어쓰기로 카드가 DOM 에서 옮겨지면 포커스를 되찾는다
  useLayoutEffect(() => {
    if (editing && document.activeElement !== inputRef.current) {
      inputRef.current?.focus()
      if (inputRef.current) ensureVisible(inputRef.current)
    }
  }, [editing, p.depth, p.node.parentId, p.node.order])
  // 선택되거나 편집 중 카드가 늘어나면 보이도록 스크롤
  useEffect(() => {
    if (p.selected) ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [p.selected, p.draft, p.node.note])

  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const handle = (side: 1 | -1) => (
    <span
      className={`w-handle ${side > 0 ? 'r' : 'l'}`}
      aria-hidden // 포인터 전용: 키보드·SR 은 패널의 너비 1·2·3 (U50)
      data-tip="끌어서 너비 조절"
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return
        e.stopPropagation()
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        const card = e.currentTarget.parentElement!
        drag.current = { x: e.clientX, side, z: card.getBoundingClientRect().width / card.offsetWidth || 1 }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        // 카드는 가운데 정렬로 배치되므로 양쪽이 함께 늘어난다 → 포인터 이동의 2배
        if (d) setLiveW(Math.min(Math.max(widths[step] + d.side * ((e.clientX - d.x) / d.z) * 2, 120), 440))
      }}
      onPointerUp={() => {
        if (!drag.current) return
        drag.current = null
        const to = liveW === null ? step : nearestStep(liveW, widths)
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
      id={`node-${p.node.id}`} // aria-activedescendant 대상(EditorPage)
      role="treeitem"
      aria-label={p.node.title || '제목 없음'}
      aria-posinset={p.pos}
      aria-setsize={p.setSize}
      aria-level={p.depth + 1}
      aria-selected={p.selected}
      aria-expanded={p.hasChildren ? !p.hiddenCount : undefined}
      data-node-id={p.node.id}
      data-width={step}
      data-miss={p.heat}
      className={`node-row${p.selected ? ' selected' : ''}${p.cut ? ' cut' : ''}${p.depth === 0 ? ' root' : ''}${liveW !== null ? ' resizing' : ''}${p.still ? ' still' : ''}${p.lifted ? ' lifted' : ''}${spawned ? ' spawn' : ''}`}
      style={{ left: p.x, top: p.y, width: liveW ?? widths[step], '--heat': p.heat } as React.CSSProperties}
      onClick={p.onSelect}
      onDoubleClick={p.onStartEdit}
    >
      {editing ? (
        <input
          ref={inputRef}
          className="title-input"
          aria-label="노드 제목"
          maxLength={CAP.title}
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
        <div className="node-title" title={p.node.title}>{p.node.title || ' '}</div>
      )}
      {p.noteEditor ? (
        <div className="node-note" onDoubleClick={stop}>{p.noteEditor}</div>
      ) : p.node.note ? (
        <div
          className="node-note"
          data-tip="두 번 탭 = 내용 편집"
          onDoubleClick={(e) => (stop(e), p.onStartNoteEdit())}
          // 저장 형식 → HTML (텍스트는 이스케이프됨)
          dangerouslySetInnerHTML={{ __html: toHtml(parse(p.node.note)) }}
        />
      ) : p.selected && !editing ? (
        // 내용이 없는 카드: 선택 시 카드 아래에 겹쳐 뜨는 추가 버튼 (배치 높이에 영향 없음)
        <button type="button" className="add-note" aria-label="+ 내용" data-tip="내용 추가" onClick={(e) => (stop(e), p.onStartNoteEdit())} onDoubleClick={stop}>
          <Icon d={I.plus} />
        </button>
      ) : null}
      {handle(-1)}
      {handle(1)}
      {p.miss >= 1 && (
        <span className="miss" aria-label={`오답 ${p.miss}회`}><Icon d={x} />{p.miss}</span>
      )}
      {p.hasChildren && (
        <span
          className={`badge${p.hiddenCount ? ' folded' : ''}`}
          aria-hidden // 접기 상태는 treeitem aria-expanded, 키보드는 H (U50)
          data-tip={p.hiddenCount ? '펼치기 (H)' : '접기 (H)'}
          onClick={(e) => (stop(e), p.onToggle())}
          onDoubleClick={stop}
        >
          <Icon d={chevronDown} />{p.hiddenCount ? p.hiddenCount : null}
        </span>
      )}
    </div>
  )
}

/**
 * 데이터 prop 이 같으면 다시 그리지 않는다 (입력·핀치 때 카드 300장을 다시 그리지 않게). 콜백(on*)은 비교하지 않는다:
 * 모두 ref(nodesRef·editRef·draftRef) 또는 setState 만 쓰므로 이전 렌더의 것을 불러도 안전하다.
 */
export default memo(NodeRow, (a, b) =>
  (Object.keys(b) as (keyof NodeRowProps)[]).every((k) => k.startsWith('on') || a[k] === b[k]),
)
