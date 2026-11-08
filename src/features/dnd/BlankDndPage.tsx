// D2 백지 퀴즈: 범위 루트만 놓인 캔버스에 트레이의 노드를 끌어 붙여 트리를 만든다
import { Fragment, useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { StudySource } from '../../core/source'
import { logEvent } from '../../core/events'
import { getRoot, getTreeNodes } from '../../core/repo'
import { recordResult } from '../../core/srs'
import type { ID, TreeNode } from '../../core/types'
import { href } from '../../router'
import { haptic } from '../feel'
import TreeHeader from '../TreeHeader'
import { attach, detach, gradeBlank, isUnder, placedTree, scopeOf, shuffle, type Links, type Score } from './dnd'
import { Ghost, Progress, ScopeSelect, ScoreLine, TreeCanvas } from './kit'
import { useDragDrop } from './useDragDrop'

export default function BlankDndPage({ treeId, rootId }: { treeId: string; rootId?: string; source?: StudySource }) {
  const [all, setAll] = useState<TreeNode[] | null>(null)
  useEffect(() => void getTreeNodes(treeId).then(setAll), [treeId])
  const rid = all && (all.some((n) => n.id === rootId) ? rootId! : getRoot(all).id)
  return (
    <section>
      <TreeHeader treeId={treeId} active="blank">
        {all && rid && <ScopeSelect nodes={all} value={rid} to={(id) => href.blank(treeId, id)} />}
      </TreeHeader>
      {all && rid && <Quiz treeId={treeId} scope={scopeOf(all, rid)} />}
    </section>
  )
}

function Quiz({ treeId, scope }: { treeId: ID; scope: TreeNode[] }) {
  const rootId = scope[0].id
  const rest = scope.slice(1)
  const byId = new Map(scope.map((n) => [n.id, n]))
  const [order, setOrder] = useState(() => shuffle(rest.map((n) => n.id)))
  const [links, setLinks] = useState<Links>(new Map())
  const [score, setScore] = useState<Score | null>(null)
  const { drag, sel, handlers } = useDragDrop(
    (card, to) => setLinks((l) => (to === 'tray' ? detach(l, card) : attach(l, card, to, rootId))),
    !score,
  )
  const placed = useMemo(() => placedTree(scope, links), [scope, links]) // 드래그 프레임마다 다시 배치하지 않게

  if (!rest.length) return <p className="muted">이 범위에는 하위 개념이 없어요. 범위를 바꿔 보세요.</p>

  const tray = order.filter((id) => !links.has(id))
  const title = (id: ID) => byId.get(id)?.title ?? ''
  const over = (id: ID) => (drag?.over === id ? ' over' : '')
  const result = (id: ID) => (score ? (score.ok[id] ? 'ok' : 'wrong') : undefined)
  const holding = drag?.id ?? sel // 집은 카드 → 놓을 수 있는 곳(attach 가 받아 주는 곳)만 .target
  const target = (ok: boolean) => (holding && ok ? ' target' : '')

  async function grade() {
    const s = gradeBlank(scope, links)
    setScore(s)
    haptic(s.correct === s.total ? 'success' : 'warn')
    await Promise.all(rest.map((n) => recordResult(n.id, treeId, s.ok[n.id])))
    await logEvent('dnd_attempt_completed', { mode: 'blank_dnd', rootId, total: s.total, correct: s.correct }, treeId)
  }
  function retry() {
    setOrder(shuffle(rest.map((n) => n.id)))
    setLinks(new Map())
    setScore(null)
  }

  const card = (id: ID, onCanvas: boolean, i?: number) => (
    <button
      type="button"
      className={`dnd-card${sel === id ? ' sel' : ''}${drag?.id === id ? ' dragging' : ''}${
        onCanvas ? over(id) + target(id !== holding && !isUnder(links, id, holding!)) : ''}`}
      data-card={id}
      data-drop={onCanvas ? id : undefined}
      data-result={result(id)}
      disabled={!!score}
      title={title(id)}
      style={i === undefined ? undefined : ({ '--i': i } as CSSProperties)}
    >
      <span>{title(id)}</span>
    </button>
  )

  const render = (n: TreeNode) =>
    n.parentId === null ? (
      <button type="button" className={`dnd-node root${over(n.id)}${target(true)}`} data-drop={n.id} disabled={!!score} title={n.title}>
        <span>{n.title}</span>
      </button>
    ) : (
      card(n.id, true)
    )

  return (
    <div className={`dnd${score ? ' locked' : ''}${drag ? ' grabbing' : ''}`} {...handlers}>
      <div className={score ? 'dnd-compare' : undefined}>
        <div>
          {score && <h2>내 트리</h2>}
          <TreeCanvas nodes={placed} orient={scope} render={render} label="내 트리" minHeight={240} />
        </div>
        {score && (
          <div>
            <h2>원본 트리</h2>
            <TreeCanvas
              nodes={scope}
              label="원본 트리"
              render={(n) => <div className={`dnd-node${n.parentId === null ? ' root' : ''}`} title={n.title}><span>{n.title}</span></div>}
            />
          </div>
        )}
      </div>
      <div className="dnd-dock">
        <div className={`dnd-tray${over('tray')}${target(!!holding && links.has(holding))}`} data-drop="tray" aria-label="카드 트레이">
          {tray.map((id, i) => <Fragment key={id}>{card(id, false, scope.length + i)}</Fragment>)}
        </div>
        <div className="dnd-bar">
          {score && <ScoreLine {...score} />}
          {!score && <Progress n={links.size} total={rest.length} />}
          {!score && <button type="button" className={`primary${tray.length ? '' : ' ready'}`} onClick={grade}>채점</button>}
          {score && <button type="button" className="primary" onClick={retry}>다시 하기</button>}
        </div>
      </div>
      <Ghost drag={drag} title={title} />
    </div>
  )
}
