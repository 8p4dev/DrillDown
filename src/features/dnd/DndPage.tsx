// D1 빈칸 퀴즈: 뼈대 트리(리프 = 빈칸) + 섞인 리프 카드 트레이
import { Fragment, useMemo, useState, type CSSProperties } from 'react'
import type { StudySource } from '../../core/source'
import { logEvent } from '../../core/events'
import type { ID, TreeNode } from '../../core/types'
import { Icon } from '../../ui/Icon'
import { checkCheck, eye, eyeOff, rotateCcw } from '../../ui/icons.all'
import { haptic } from '../feel'
import { toast } from '../Toast'
import { attemptOf, gradeDnd, leavesOf, moveCard, shuffle, type Place, type Score } from './dnd'
import { Ghost, Progress, QuizShell, ResultMark, ScoreLine, TreeCanvas } from './kit'
import { useDragDrop } from './useDragDrop'

const MAX_LEAVES = 30 // U30: 이보다 많고 ?root= 가 없으면 범위부터 고른다

export default function DndPage(p: { treeId: string; rootId?: string; source?: StudySource }) {
  return (
    <QuizShell {...p} mode="dnd" hint="카드 탭 → 빈칸 탭" big={(scope) => leavesOf(scope).length > MAX_LEAVES}>
      {(scope, src) => <Quiz treeId={p.treeId} scope={scope} source={src} />}
    </QuizShell>
  )
}

function Quiz({ treeId, scope, source }: { treeId: ID; scope: TreeNode[]; source: StudySource }) {
  const rootId = scope[0].id
  const leaves = useMemo(() => leavesOf(scope), [scope])
  const byId = new Map(scope.map((n) => [n.id, n]))
  const [order, setOrder] = useState(() => shuffle(leaves.map((l) => l.id)))
  const [place, setPlace] = useState<Place>({})
  const [score, setScore] = useState<Score | null>(null)
  const [answer, setAnswer] = useState(false)
  const [startedAt] = useState(() => Date.now()) // attempts.startedAt = 퀴즈 마운트 시각
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
    if (s.placed.length) { // 하나도 안 놓은 채점은 기록하지 않음(U35), 일부만 놓았으면 남은 카드 = 오답(설계 그대로)
      try {
        await source.recordResults(leaves.map((l) => l.id), leaves.map((l) => s.ok[l.id])) // S18: 한 트랜잭션
      } catch {
        toast('저장하지 못했어요') // S3: 채점 전으로 되돌려 다시 누를 수 있게
        return setScore(null)
      }
      await source.attempt?.(attemptOf(treeId, rootId, startedAt, s)) // 서버 지표(K2·회독·활성화율)의 원천
    }
    if (!source.ephemeral) await logEvent('dnd_attempt_completed', { mode: 'dnd', rootId, total: s.total, correct: s.correct }, treeId)
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
      aria-pressed={sel === id}
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
      <div role="group" className={`dnd-slot filled${over(n.id)}${target(c !== holding)}`} data-drop={n.id} data-slot={n.id} aria-label={label}>
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
          {score && !score.placed.length && <p className="muted">놓은 카드가 없어 학습 기록을 남기지 않았어요</p>}
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
