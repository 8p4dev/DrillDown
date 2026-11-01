// D2 백지 드래그 앤 드롭 퀴즈: 범위 루트만 놓인 캔버스에 트레이의 노드를 끌어 붙여 트리를 만든다
import { Fragment, useEffect, useState } from 'react'
import { logEvent } from '../../core/events'
import { getRoot, getTreeNodes } from '../../core/repo'
import { recordResult } from '../../core/srs'
import type { ID, TreeNode } from '../../core/types'
import { href } from '../../router'
import TreeHeader from '../TreeHeader'
import { attach, detach, gradeBlank, placedTree, scopeOf, shuffle, type Links, type Score } from './dnd'
import { Ghost, ScopeSelect, ScoreLine, TreeCanvas } from './kit'
import { useDragDrop } from './useDragDrop'

export default function BlankDndPage({ treeId, rootId }: { treeId: string; rootId?: string }) {
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

  if (!rest.length) return <p className="muted">이 범위에는 하위 개념이 없어요. 범위를 바꿔 보세요.</p>

  const tray = order.filter((id) => !links.has(id))
  const title = (id: ID) => byId.get(id)?.title ?? ''
  const over = (id: ID) => (drag?.over === id ? ' over' : '')
  const result = (id: ID) => (score ? (score.ok[id] ? 'ok' : 'wrong') : undefined)

  async function grade() {
    const s = gradeBlank(scope, links)
    setScore(s)
    await Promise.all(rest.map((n) => recordResult(n.id, treeId, s.ok[n.id])))
    await logEvent('dnd_attempt_completed', { mode: 'blank_dnd', rootId, total: s.total, correct: s.correct }, treeId)
  }
  function retry() {
    setOrder(shuffle(rest.map((n) => n.id)))
    setLinks(new Map())
    setScore(null)
  }

  const card = (id: ID, onCanvas: boolean) => (
    <button
      type="button"
      className={`dnd-card${sel === id ? ' sel' : ''}${drag?.id === id ? ' dragging' : ''}${onCanvas ? over(id) : ''}`}
      data-card={id}
      data-drop={onCanvas ? id : undefined}
      data-result={result(id)}
      disabled={!!score}
      title={title(id)}
    >
      <span>{title(id)}</span>
    </button>
  )

  const render = (n: TreeNode) =>
    n.parentId === null ? (
      <button type="button" className={`dnd-node root${over(n.id)}`} data-drop={n.id} disabled={!!score} title={n.title}>
        <span>{n.title}</span>
      </button>
    ) : (
      card(n.id, true)
    )

  return (
    <div className={`dnd${score ? ' locked' : ''}`} {...handlers}>
      <p className="dnd-hint muted">카드를 끌어 캔버스의 노드 위에 놓으면 그 아래 자식으로 붙어요. 붙인 노드는 하위와 함께 옮기거나 트레이로 되돌릴 수 있어요. (탭으로 고른 뒤 대상을 탭해도 돼요)</p>
      <div className={score ? 'dnd-compare' : undefined}>
        <div>
          {score && <h2>내 트리</h2>}
          <TreeCanvas nodes={placedTree(scope, links)} render={render} label="내 트리" minHeight={240} />
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
      <div className={`dnd-tray${over('tray')}`} data-drop="tray" aria-label="카드 트레이">
        {tray.map((id) => <Fragment key={id}>{card(id, false)}</Fragment>)}
        {!tray.length && <span className="dnd-tray-empty muted">{score ? '' : '모든 카드를 놓았어요. 채점해 보세요.'}</span>}
      </div>
      <div className="dnd-bar">
        {score && <ScoreLine {...score} />}
        {!score && <span className="muted" style={{ marginRight: 'auto' }}>{links.size} / {rest.length} 배치</span>}
        {!score && <button type="button" className="primary" onClick={grade}>채점</button>}
        {score && <button type="button" className="primary" onClick={retry}>다시 하기</button>}
      </div>
      <Ghost drag={drag} title={title} />
    </div>
  )
}
