// 플래시카드 한 장: 개념 하나 + 가려진 하위 개념. FlashPage·ReviewPage 공용
import { useEffect, useRef, useState } from 'react'
import { logEvent } from '../../core/events'
import { childrenOf } from '../../core/repo'
import { colorClass, recordResult, type ColorInfo } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { parse, toHtml } from '../editor/content/format'
import { plainNote } from './flash'

/** 내용 서식(불릿·형광펜) 표시 — 에디터 렌더러 재사용. toHtml 은 텍스트를 이스케이프한다 */
const Note = ({ note }: { note: string }) => <div className="flash-note" dangerouslySetInnerHTML={{ __html: toHtml(parse(note)) }} />

const NONE: ColorInfo = { color: 'none', misplaced: false }

interface Props {
  treeId: ID
  nodes: TreeNode[]
  conceptId: ID
  colors: Map<ID, ColorInfo>
  /** 평가 기록 후 호출 — 부모가 srs 맵·집계를 갱신 */
  onRated: (s: NodeSrs, known: boolean) => void
  /** 자식 있는 하위 노드로 더 들어가기. 없으면 버튼 숨김 */
  onDive?: (id: ID) => void
}

export default function FlashCard({ treeId, nodes, conceptId, colors, onRated, onDive }: Props) {
  const concept = nodes.find((n) => n.id === conceptId)
  const kids = childrenOf(nodes, conceptId)
  const [open, setOpen] = useState(false)
  const [rated, setRated] = useState(new Map<ID, boolean>())
  const cardRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cardRef.current?.focus({ preventScroll: true }), [])
  if (!concept) return <p className="muted">개념을 찾을 수 없습니다.</p>

  const color = (id: ID) => colors.get(id) ?? NONE
  const rate = async (n: TreeNode, known: boolean) => {
    setRated((m) => new Map(m).set(n.id, known))
    const s = await recordResult(n.id, treeId, known)
    await logEvent('flash_rated', { nodeId: n.id, known }, treeId)
    onRated(s, known)
  }
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
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flash-concept-title">{concept.title}</span>
        {note && <Note note={concept.note!} />}
        <span className="flash-count">
          {kids.length ? `하위 ${kids.length}개 · ${open ? '접기' : '눌러서 펼치기'}` : '하위 개념 없음'}
        </span>
      </button>

      {open && kids.length > 0 && (
        <ul className="flash-kids" aria-label="하위 개념">
          {kids.map((k, i) => {
            const grand = childrenOf(nodes, k.id).length
            const r = rated.get(k.id)
            const kn = plainNote(k.note)
            return (
              <li
                key={k.id}
                className={`flash-kid ${colorClass(color(k.id))}`}
                data-node-id={k.id}
                data-color={color(k.id).color}
                data-rated={r === undefined ? undefined : r ? 'known' : 'unknown'}
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="flash-kid-body">
                  <strong>{k.title}</strong>
                  {kn && <Note note={k.note!} />}
                  {grand > 0 && onDive && (
                    <button type="button" className="link flash-dive" onClick={() => onDive(k.id)}>
                      하위 {grand}개 · 더 들어가기 →
                    </button>
                  )}
                </div>
                <div className="flash-rate">
                  {r === undefined ? (
                    <>
                      <button type="button" className="known" onClick={() => rate(k, true)}>알음</button>
                      <button type="button" className="unknown" onClick={() => rate(k, false)}>모름</button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={`flash-result ${r ? 'known' : 'unknown'}`}
                      title="다시 평가"
                      aria-label={`${r ? '알음' : '모름'} — 다시 평가`}
                      onClick={() => setRated((m) => { const c = new Map(m); c.delete(k.id); return c })}
                    >
                      {r ? '✓ 알음' : '✕ 모름'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
