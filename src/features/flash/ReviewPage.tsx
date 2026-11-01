// 오늘의 복습 (plan §1 F2): 오늘 기한 노드의 부모 큐를 플래시카드로 차례 복습
import { useEffect, useMemo, useState } from 'react'
import { getTreeNodes, listTrees } from '../../core/repo'
import { colorMap, dueByTree, getSrsMap } from '../../core/srs'
import type { ID, NodeSrs, Tree, TreeNode } from '../../core/types'
import { href } from '../../router'
import FlashCard from './FlashCard'
import { parentQueue } from './flash'
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
      setRows(trees.filter((t) => due.get(t.id)?.length).map((t) => ({ tree: t, due: due.get(t.id)! }))),
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
    return (
      <section className="review flash">
        <header className="review-head">
          <h1>{session.tree.title} 복습</h1>
          <span className="muted" aria-label="복습 진행">{session.i + 1} / {session.queue.length}</span>
          <progress max={session.queue.length} value={session.i + 1} />
        </header>
        {id ? (
          <FlashCard key={id} treeId={session.tree.id} nodes={session.nodes} conceptId={id} colors={colors}
            onRated={(s) => setSrs(({ map }) => ({ map: new Map(map).set(s.nodeId, s), at: new Date() }))} />
        ) : (
          <p className="muted">복습할 항목이 없습니다.</p>
        )}
        <div className="actions flash-nav">
          {!last && <button type="button" className="primary" onClick={() => setSession({ ...session, i: session.i + 1 })}>다음 복습 →</button>}
          <button type="button" onClick={() => setSession(null)}>{last ? '복습 마치기' : '그만하기'}</button>
        </div>
      </section>
    )
  }

  return (
    <section className="review">
      <h1>오늘의 복습</h1>
      {rows === null ? <p>불러오는 중…</p> : rows.length === 0 ? <p className="empty muted">오늘 복습할 항목이 없습니다.</p> : (
        <ul aria-label="복습 대상 트리" className="review-list">
          {rows.map(({ tree, due }) => (
            <li key={tree.id} data-tree-id={tree.id} data-due-count={due.length} className="card">
              <strong>{tree.title}</strong>
              <span className="due-count muted">{due.length}개</span>
              <a href={href.flash(tree.id)}>플래시카드</a>
              <button type="button" className="primary" aria-label={`복습 시작: ${tree.title}`} onClick={() => start(tree, due)}>복습 시작</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
