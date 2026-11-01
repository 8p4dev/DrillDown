import { useEffect, useState } from 'react'
import { descendantsOf, getRoot, getTreeNodes, listTrees } from '../../core/repo'
import { dueByTree } from '../../core/srs'
import type { NodeSrs, Tree, TreeNode } from '../../core/types'
import { href } from '../../router'
import Drill from './Drill'
import './study.css'

interface Session { tree: Tree; nodes: TreeNode[]; queue: string[]; i: number }

/** '오늘의' 복습 = 오늘 안에 기한이 오는 노드 (Again 은 수 분 뒤 기한이라 now 기준이면 방금 틀린 항목이 안 보임) */
const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

/** 기한 노드의 부모(루트면 자신)를 트리 전위 순서로 중복 없이 */
function parentQueue(nodes: TreeNode[], due: NodeSrs[]): string[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const want = new Set(due.flatMap((s) => { const n = byId.get(s.nodeId); return n ? [n.parentId ?? n.id] : [] }))
  const root = getRoot(nodes)
  return [root, ...descendantsOf(nodes, root.id)].filter((n) => want.has(n.id)).map((n) => n.id)
}

export default function ReviewPage() {
  const [rows, setRows] = useState<{ tree: Tree; due: NodeSrs[] }[] | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    Promise.all([listTrees(), dueByTree(endOfToday())]).then(([trees, due]) =>
      setRows(trees.filter((t) => due.get(t.id)?.length).map((t) => ({ tree: t, due: due.get(t.id)! }))),
    )
  }, [session])

  const start = async (tree: Tree, due: NodeSrs[]) => {
    const nodes = await getTreeNodes(tree.id)
    setSession({ tree, nodes, queue: parentQueue(nodes, due), i: 0 })
  }

  if (session) {
    const node = session.nodes.find((n) => n.id === session.queue[session.i])
    const last = session.i >= session.queue.length - 1
    return (
      <section className="review study">
        <p className="breadcrumb">{session.tree.title} 복습 {session.i + 1} / {session.queue.length}</p>
        {node ? (
          <>
            <h1>{node.title}</h1>
            <Drill key={node.id} treeId={session.tree.id} nodes={session.nodes} node={node} />
          </>
        ) : (
          <p className="muted">복습할 항목이 없습니다.</p>
        )}
        <div className="actions review-nav">
          {!last && <button type="button" onClick={() => setSession({ ...session, i: session.i + 1 })}>다음 복습</button>}
          <button type="button" onClick={() => setSession(null)}>{last ? '복습 마치기' : '그만하기'}</button>
        </div>
      </section>
    )
  }

  return (
    <section className="review">
      <h1>오늘의 복습</h1>
      {rows === null ? (
        <p>불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="empty muted">오늘 복습할 항목이 없습니다.</p>
      ) : (
        <ul aria-label="복습 대상 트리">
          {rows.map(({ tree, due }) => (
            <li key={tree.id} data-tree-id={tree.id} data-due-count={due.length}>
              <strong>{tree.title}</strong>
              <span className="due-count">{due.length}개</span>
              <a href={href.study(tree.id)}>학습</a>
              <button type="button" className="primary" aria-label={`복습 시작: ${tree.title}`} onClick={() => start(tree, due)}>복습 시작</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
