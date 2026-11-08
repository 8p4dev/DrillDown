// 플래시카드 한 장: 개념 하나 + 가려진 하위 개념. FlashPage·ReviewPage 공용
import { useEffect, useMemo, useRef, useState } from 'react'
import { logEvent } from '../../core/events'
import { childrenOf } from '../../core/repo'
import { colorClass, type ColorInfo, type NodeColor } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { chevronDown, cornerDownRight, x } from '../../ui/icons.all'
import { parse, toHtml } from '../editor/content/format'
import { haptic } from '../feel'
import { plainNote } from './flash'

/** 내용 서식(불릿·형광펜) 표시 — 에디터 렌더러 재사용. toHtml 은 텍스트를 이스케이프한다 */
const Note = ({ note }: { note: string }) => <div className="flash-note" dangerouslySetInnerHTML={{ __html: toHtml(parse(note)) }} />

/** 숙련도 4단계의 색 아닌 단서(01 §3.1.2): ✓✓ / ✓ / 없음 / ✕ */
const Mark = ({ color }: { color: NodeColor }) => {
  if (color !== 'green' && color !== 'lightgreen' && color !== 'red') return null
  return (
    <span className={`flash-state${color === 'green' ? ' dbl' : ''}`} aria-hidden="true">
      {color === 'red' ? <Icon d={x} /> : <><Icon d={I.check} />{color === 'green' && <Icon d={I.check} />}</>}
    </span>
  )
}

const NONE: ColorInfo = { color: 'none', misplaced: false }

interface Props {
  treeId: ID
  nodes: TreeNode[]
  conceptId: ID
  colors: Map<ID, ColorInfo>
  /** 평가 기록 — 데이터 소스 경유(StudySource.record). 돌려준 NodeSrs 로 색을 갱신한다 */
  record: (nodeId: ID, ok: boolean) => Promise<NodeSrs>
  /** 평가 기록 후 호출 — 부모가 srs 맵·집계를 갱신 */
  onRated: (s: NodeSrs, known: boolean) => void
  /** 자식 있는 하위 노드로 더 들어가기. 없으면 버튼 숨김 */
  onDive?: (id: ID) => void
  /** 이미 평가한 하위(새로고침 후 복원용) */
  initialRated?: Map<ID, boolean>
  /** →/Enter 키: 다음 카드로 */
  onNext?: () => void
}

/** 입력 중이거나 수정키가 눌렸으면 단축키 무시 */
const typing = (e: KeyboardEvent) =>
  e.ctrlKey || e.metaKey || e.altKey || e.isComposing || (e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')

export default function FlashCard({ treeId, nodes, conceptId, colors, record, onRated, onDive, initialRated, onNext }: Props) {
  const concept = nodes.find((n) => n.id === conceptId)
  const kids = useMemo(() => childrenOf(nodes, conceptId), [nodes, conceptId])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false) // 처음 펼칠 때 마운트. 이후 닫힘은 CSS(.closed)가 맡는다
  const [rated, setRated] = useState(() => new Map<ID, boolean>(initialRated))
  const [shook, setShook] = useState<ID | null>(null) // 방금 모름 평가한 하위 — 한 번 흔든다
  const cardRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cardRef.current?.focus({ preventScroll: true }), [])
  const color = (id: ID) => colors.get(id) ?? NONE
  const rate = async (n: TreeNode, known: boolean) => {
    haptic(known ? 'success' : 'warn')
    setRated((m) => new Map(m).set(n.id, known))
    setShook(known ? null : n.id)
    const s = await record(n.id, known)
    await logEvent('flash_rated', { nodeId: n.id, known }, treeId)
    onRated(s, known)
  }

  // 키보드: 1=알음 2=모름(첫 미평가 하위), →/Enter=다음. Enter 는 다른 버튼에 포커스가 있으면 그 버튼 몫
  // 리스너는 한 번만 등록하고, 최신 상태를 보는 핸들러는 ref 로 읽는다
  const onKey = useRef<(e: KeyboardEvent) => void>(() => {})
  useEffect(() => {
    onKey.current = (e) => {
      if (!open || typing(e)) return
      const t = e.target as HTMLElement
      if (e.key === '1' || e.key === '2') {
        const k = kids.find((c) => !rated.has(c.id))
        if (k) { e.preventDefault(); rate(k, e.key === '1') }
      } else if (onNext && (e.key === 'ArrowRight' || (e.key === 'Enter' && (t === document.body || t === cardRef.current)))) {
        e.preventDefault()
        onNext()
      }
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey.current(e)
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])
  if (!concept) return <p className="muted">개념을 찾을 수 없습니다.</p>

  const note = plainNote(concept.note)

  return (
    <div className="flash-card-wrap">
      {/* 네이티브 button: 클릭·탭·Space·Enter 로 펼침 */}
      <button
        ref={cardRef}
        type="button"
        className={`flash-concept ${colorClass(color(concept.id))}`}
        data-concept-id={concept.id}
        data-color={color(concept.id).color}
        aria-expanded={open}
        onClick={() => { setMounted(true); setOpen((o) => !o); setShook(null) }}
      >
        <Mark color={color(concept.id).color} />
        <span className="flash-concept-title">{concept.title}</span>
        {note && <Note note={concept.note!} />}
        <span className="flash-count">
          {kids.length ? <><span className="sr">하위 </span>{kids.length}<span className="sr">개</span><Icon d={chevronDown} className="chev" /></> : '하위 개념 없음'}
        </span>
      </button>

      {mounted && kids.length > 0 && (
        <div className={`flash-kids-wrap${open ? '' : ' closed'}`} inert={!open}><div className="flash-kids-clip"><ul className="flash-kids" aria-label="하위 개념">
          {kids.map((k, i) => {
            const grand = childrenOf(nodes, k.id).length
            const r = rated.get(k.id)
            const kn = plainNote(k.note)
            return (
              <li
                key={k.id}
                className={`flash-kid ${colorClass(color(k.id))}${shook === k.id ? ' shake' : ''}`}
                data-node-id={k.id}
                data-color={color(k.id).color}
                data-rated={r === undefined ? undefined : r ? 'known' : 'unknown'}
                style={{ '--i': i } as React.CSSProperties}
              >
                <Mark color={color(k.id).color} />
                <div className="flash-kid-body">
                  <strong>{k.title}</strong>
                  {kn && <Note note={k.note!} />}
                  {grand > 0 && onDive && (
                    <button type="button" className="flash-dive" data-tip="더 들어가기" aria-label={`더 들어가기: 하위 ${grand}개`} onClick={() => onDive(k.id)}>
                      <Icon d={cornerDownRight} /> {grand}
                    </button>
                  )}
                </div>
                <div className="flash-rate">
                  {r === undefined ? (
                    <>
                      <button type="button" className="known" data-tip="알음 (1)" onClick={() => rate(k, true)}><Icon d={I.check} /> 알음</button>
                      <button type="button" className="unknown" data-tip="모름 (2)" onClick={() => rate(k, false)}><Icon d={x} /> 모름</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`flash-result ${r ? 'known' : 'unknown'}`}
                      data-tip="다시 평가"
                      aria-label={`${r ? '알음' : '모름'} — 다시 평가`}
                      onClick={() => { setShook(null); setRated((m) => { const c = new Map(m); c.delete(k.id); return c }) }}
                    >
                      <span className="flash-mark" aria-hidden="true"><Icon d={r ? I.check : x} /></span> {r ? '알음' : '모름'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul></div></div>
      )}
    </div>
  )
}
