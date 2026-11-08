// D1 빈칸 퀴즈: 뼈대 트리(리프 = 빈칸) + 섞인 리프 카드 트레이
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { StudySource } from '../../core/source'
import { logEvent } from '../../core/events'
import { getRoot } from '../../core/repo'
import type { ID, TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { checkCheck, eye, eyeOff, rotateCcw } from '../../ui/icons.all'
import { haptic } from '../feel'
import { coarseHint, useStudySource } from '../flash/study'
import TreeHeader from '../TreeHeader'
import { gradeDnd, leavesOf, moveCard, scopeOf, shuffle, type Place, type Score } from './dnd'
import { Ghost, Progress, ResultMark, ScopeSelect, ScoreLine, TreeCanvas } from './kit'
import { useDragDrop } from './useDragDrop'

export default function DndPage({ treeId, rootId, source }: { treeId: string; rootId?: string; source?: StudySource }) {
  const src = useStudySource(source, treeId)
  const [all, setAll] = useState<TreeNode[] | null>(null)
  useEffect(() => void src.nodes().then((ns) => { setAll(ns); coarseHint('dnd', '카드 탭 → 빈칸 탭', I.squareDashed) }), [src])
  const rid = all && (all.some((n) => n.id === rootId) ? rootId! : getRoot(all).id)
  return (
    <section>
      <TreeHeader treeId={treeId} active="dnd">
        {all && rid && <ScopeSelect nodes={all} value={rid} to={(id) => href.dnd(treeId, id)} />}
      </TreeHeader>
      {all && rid && <Quiz treeId={treeId} scope={scopeOf(all, rid)} record={src.record} />}
    </section>
  )
}

function Quiz({ treeId, scope, record }: { treeId: ID; scope: TreeNode[]; record: StudySource['record'] }) {
  const rootId = scope[0].id
  const leaves = useMemo(() => leavesOf(scope), [scope])
  const byId = new Map(scope.map((n) => [n.id, n]))
  const [order, setOrder] = useState(() => shuffle(leaves.map((l) => l.id)))
  const [place, setPlace] = useState<Place>({})
  const [score, setScore] = useState<Score | null>(null)
  const [answer, setAnswer] = useState(false)
  const { drag, sel, handlers } = useDragDrop((card, to) => setPlace((p) => moveCard(p, card, to)), !score)

  if (!leaves.length) return <p className="dnd-empty muted">빈칸으로 낼 하위 개념이 없어요</p>

  const placed = new Set(Object.values(place))
  const tray = order.filter((id) => !placed.has(id))
  const title = (id: ID) => byId.get(id)?.title ?? ''
  const over = (id: ID) => (drag?.over === id ? ' over' : '')
  const holding = drag?.id ?? sel // 집은 카드 → 놓을 수 있는 곳만 .target
  const target = (ok: boolean) => (holding && ok ? ' target' : '')

  async function grade() {
    const s = gradeDnd(scope, place)
    setScore(s)
    haptic(s.correct === s.total ? 'success' : 'warn')
    await Promise.all(leaves.map((l) => record(l.id, s.ok[l.id])))
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
      <ResultMark ok={result} />
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
          data-result={score ? 'wrong' : undefined} disabled={!!score}>
          <ResultMark ok={score ? false : undefined} />
        </button>
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
      <div className="dnd-dock">
        <div className={`dnd-tray${over('tray')}${target(!!holding && placed.has(holding))}`} data-drop="tray" aria-label="카드 트레이">
          {tray.map((id, i) => <Fragment key={id}>{card(id, score ? false : undefined, scope.length + i)}</Fragment>)}
        </div>
        <div className="dnd-bar">
          {score && <ScoreLine {...score} />}
          {!score && <Progress n={placed.size} total={leaves.length} />}
          {!score && <button type="button" className={`primary${tray.length ? '' : ' ready'}`} onClick={grade}><Icon d={checkCheck} /> 채점</button>}
          {score && <button type="button" onClick={() => setAnswer((a) => !a)}><Icon d={answer ? eyeOff : eye} /> {answer ? '내 답 보기' : '정답 보기'}</button>}
          {score && <button type="button" className="primary" onClick={retry}><Icon d={rotateCcw} /> 다시 하기</button>}
        </div>
      </div>
      <Ghost drag={drag} title={title} />
    </div>
  )
}
