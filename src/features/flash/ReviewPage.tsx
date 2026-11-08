// 오늘의 복습 (plan §1 F2): 오늘 기한 노드의 부모 큐를 플래시카드로 차례 복습. Dexie 직접(계약 §3.5 — 공유 보기에 없음)
import { useEffect, useMemo, useState } from 'react'
import { ancestorsOf } from '../../core/path'
import { getTreeNodes, listTrees } from '../../core/repo'
import { dexieSource } from '../../core/source'
import { colorMap, dueByTree, getSrsMap } from '../../core/srs'
import type { ID, NodeSrs, Tree, TreeNode } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { NodePath } from '../../ui/NodePath'
import { arrowRight } from '../../ui/icons.all'
import FlashCard from './FlashCard'
import { byOverdue, parentQueue } from './flash'
import './flash.css'

interface Session { tree: Tree; nodes: TreeNode[]; queue: ID[]; i: number }

/** '오늘의' 복습 = 오늘 안에 기한이 오는 노드 (Again 은 수 분 뒤 기한이라 now 기준이면 방금 틀린 항목이 안 보임) */
const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

const loadSrs = async (treeId: ID) => ({ map: await getSrsMap(treeId), at: new Date() })

export default function ReviewPage() {
  const [rows, setRows] = useState<{ tree: Tree; due: NodeSrs[] }[] | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [srs, setSrs] = useState({ map: new Map<ID, NodeSrs>(), at: new Date(0) })
  useEffect(() => {
    if (session) return
    Promise.all([listTrees(), dueByTree(endOfToday())]).then(([trees, due]) =>
      setRows(byOverdue(trees.filter((t) => due.get(t.id)?.length).map((t) => ({ tree: t, due: due.get(t.id)! })))),
    )
  }, [session])
  const colors = useMemo(() => colorMap(session?.nodes ?? [], srs.map, srs.at), [session?.nodes, srs])

  const start = async (tree: Tree, due: NodeSrs[]) => {
    const [nodes, s] = await Promise.all([getTreeNodes(tree.id), loadSrs(tree.id)])
    setSrs(s)
    setSession({ tree, nodes, queue: parentQueue(nodes, due), i: 0 })
  }

  if (session) {
    const id = session.queue[session.i]
    const last = session.i >= session.queue.length - 1
    const step = () => setSession({ ...session, i: session.i + 1 })
    const treeId = session.tree.id
    return (
      <section className="review flash">
        <header className="review-head">
          <h1>{session.tree.title} 복습</h1>
          <span className="muted" aria-label="복습 진행">{session.i + 1} / {session.queue.length}</span>
          <div className="review-bar" role="progressbar" aria-valuemin={0} aria-valuemax={session.queue.length} aria-valuenow={session.i + 1}>
            <span style={{ width: `${((session.i + 1) / session.queue.length) * 100}%` }} />
          </div>
        </header>
        {id ? (<>
          <NodePath path={ancestorsOf(new Map(session.nodes.map((n) => [n.id, n])), id)} label="복습 위치" className="flash-path" />
          <FlashCard key={id} treeId={treeId} nodes={session.nodes} conceptId={id} colors={colors}
            source={dexieSource(treeId)}
            onRated={(s) => setSrs(({ map }) => ({ map: new Map(map).set(s.nodeId, s), at: new Date() }))} onNext={last ? undefined : step} />
        </>) : (
          <p className="muted">복습할 항목이 없습니다.</p>
        )}
        <div className="actions flash-nav">
          {!last && <button type="button" className="primary" aria-label="다음 복습 →" data-tip="다음 복습 (→ / Enter)" onClick={step}><Icon d={arrowRight} /> 다음</button>}
          <button type="button" onClick={() => setSession(null)}>{last ? '복습 마치기' : '그만하기'}</button>
        </div>
      </section>
    )
  }

  return (
    <section className="review">
      <h1>오늘의 복습</h1>
      {rows === null ? <p>불러오는 중…</p> : rows.length === 0 ? (
        <div className="empty review-empty">
          <Icon d={I.check} size={24} />
          <span>오늘 복습 없음</span>
          <a href="#/">내 트리 ›</a>
        </div>
      ) : (
        <ul aria-label="복습 대상 트리" className="review-list">
          {rows.map(({ tree, due }) => (
            <li key={tree.id} data-tree-id={tree.id} data-due-count={due.length} className="card">
              <strong>{tree.title}</strong>
              <span className="due-count muted">{due.length}항목</span>
              <a className="review-link" href={href.flash(tree.id)}><Icon d={I.layers} /> 플래시카드</a>
              <button type="button" className="primary" aria-label={`복습 시작: ${tree.title}`} onClick={() => start(tree, due)}>복습 시작</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
