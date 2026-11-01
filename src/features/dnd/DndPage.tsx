// D1 빈칸 퀴즈: 뼈대 트리(리프 = 빈칸) + 섞인 리프 카드 트레이
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { logEvent } from '../../core/events'
import { getRoot, getTreeNodes } from '../../core/repo'
import { recordResult } from '../../core/srs'
import type { ID, TreeNode } from '../../core/types'
import { href } from '../../router'
import TreeHeader from '../TreeHeader'
import { gradeDnd, leavesOf, moveCard, scopeOf, shuffle, type Place, type Score } from './dnd'
import { Ghost, Progress, ScopeSelect, ScoreLine, TreeCanvas } from './kit'
import { useDragDrop } from './useDragDrop'

export default function DndPage({ treeId, rootId }: { treeId: string; rootId?: string }) {
  const [all, setAll] = useState<TreeNode[] | null>(null)
  useEffect(() => void getTreeNodes(treeId).then(setAll), [treeId])
  const rid = all && (all.some((n) => n.id === rootId) ? rootId! : getRoot(all).id)
  return (
    <section>
      <TreeHeader treeId={treeId} active="dnd">
        {all && rid && <ScopeSelect nodes={all} value={rid} to={(id) => href.dnd(treeId, id)} />}
      </TreeHeader>
      {all && rid && <Quiz treeId={treeId} scope={scopeOf(all, rid)} />}
    </section>
  )
}

function Quiz({ treeId, scope }: { treeId: ID; scope: TreeNode[] }) {
  const rootId = scope[0].id
  const leaves = useMemo(() => leavesOf(scope), [scope])
  const byId = new Map(scope.map((n) => [n.id, n]))
  const [order, setOrder] = useState(() => shuffle(leaves.map((l) => l.id)))
  const [place, setPlace] = useState<Place>({})
  const [score, setScore] = useState<Score | null>(null)
  const [answer, setAnswer] = useState(false)
  const { drag, sel, handlers } = useDragDrop((card, to) => setPlace((p) => moveCard(p, card, to)), !score)

  if (!leaves.length) return <p className="muted">이 범위에는 빈칸으로 낼 하위 개념이 없어요. 범위를 바꿔 보세요.</p>

  const placed = new Set(Object.values(place))
  const tray = order.filter((id) => !placed.has(id))
  const title = (id: ID) => byId.get(id)?.title ?? ''
  const over = (id: ID) => (drag?.over === id ? ' over' : '')
  const holding = drag?.id ?? sel // 집은 카드 → 놓을 수 있는 곳만 .target
  const target = (ok: boolean) => (holding && ok ? ' target' : '')

  async function grade() {
    const s = gradeDnd(scope, place)
    setScore(s)
    await Promise.all(leaves.map((l) => recordResult(l.id, treeId, s.ok[l.id])))
    await logEvent('dnd_attempt_completed', { mode: 'dnd', rootId, total: s.total, correct: s.correct }, treeId)
  }
  function retry() {
    setOrder(shuffle(leaves.map((l) => l.id)))
    setPlace({})
    setScore(null)
    setAnswer(false)
  }

  const card = (id: ID, result?: boolean, i?: number) => (
    <button
      type="button"
      className={`dnd-card${sel === id ? ' sel' : ''}${drag?.id === id ? ' dragging' : ''}`}
      data-card={id}
      data-result={result === undefined ? undefined : result ? 'ok' : 'wrong'}
      disabled={!!score}
      title={title(id)}
      style={i === undefined ? undefined : ({ '--i': i } as CSSProperties)}
    >
      <span>{title(id)}</span>
    </button>
  )

  const render = (n: TreeNode) => {
    if (n.parentId === null || !leaves.includes(n))
      return <div className={`dnd-node${n.parentId === null ? ' root' : ''}`} title={n.title}><span>{n.title}</span></div>
    if (answer) return <div className="dnd-node" data-slot={n.id}><span>{n.title}</span></div>
    const c = place[n.id]
    const label = `${title(n.parentId)} 아래 빈칸`
    if (!c)
      return (
        <button type="button" className={`dnd-slot${over(n.id)}${target(true)}`} data-drop={n.id} data-slot={n.id} aria-label={label}
          data-result={score ? 'wrong' : undefined} disabled={!!score} />
      )
    return (
      <div className={`dnd-slot filled${over(n.id)}${target(c !== holding)}`} data-drop={n.id} data-slot={n.id} aria-label={label}>
        {card(c, score ? score.ok[c] : undefined)}
      </div>
    )
  }

  return (
    <div className={`dnd${score ? ' locked' : ''}${drag ? ' grabbing' : ''}`} {...handlers}>
      <TreeCanvas nodes={scope} render={render} label={answer ? '정답 트리' : '뼈대 트리'} />
      <div className={`dnd-tray${over('tray')}${target(!!holding && placed.has(holding))}`} data-drop="tray" aria-label="카드 트레이">
        {tray.map((id, i) => <Fragment key={id}>{card(id, score ? false : undefined, scope.length + i)}</Fragment>)}
      </div>
      <div className="dnd-bar">
        {score && <ScoreLine {...score} />}
        {!score && <Progress n={placed.size} total={leaves.length} />}
        {!score && <button type="button" className={`primary${tray.length ? '' : ' ready'}`} onClick={grade}>채점</button>}
        {score && <button type="button" onClick={() => setAnswer((a) => !a)}>{answer ? '내 답 보기' : '정답 보기'}</button>}
        {score && <button type="button" className="primary" onClick={retry}>다시 하기</button>}
      </div>
      <Ghost drag={drag} title={title} />
    </div>
  )
}
