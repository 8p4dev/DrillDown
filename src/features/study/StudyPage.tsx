import { useEffect, useState } from 'react'
import { getTreeNodes } from '../../core/repo'
import type { TreeNode } from '../../core/types'
import { href } from '../../router'
import Drill from './Drill'

export default function StudyPage({ treeId }: { treeId: string }) {
  const [nodes, setNodes] = useState<TreeNode[] | null>(null)
  const [curId, setCurId] = useState('')
  useEffect(() => {
    getTreeNodes(treeId).then((ns) => {
      setNodes(ns)
      setCurId(ns.find((n) => n.parentId === null)?.id ?? '')
    })
  }, [treeId])

  if (!nodes) return <p>불러오는 중…</p>
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const cur = byId.get(curId)
  if (!cur) return <p>트리를 찾을 수 없습니다. <a href={href.trees()}>목록으로</a></p>
  const path: TreeNode[] = []
  for (let n: TreeNode | undefined = cur; n; n = n.parentId ? byId.get(n.parentId) : undefined) path.unshift(n)

  return (
    <section className="study">
      <nav className="breadcrumb" aria-label="브레드크럼">
        {path.map((n, i) => (
          <span key={n.id}>
            {i > 0 && ' › '}
            {n.id === cur.id ? (
              <strong aria-current="page">{n.title}</strong>
            ) : (
              <button type="button" className="link" onClick={() => setCurId(n.id)}>{n.title}</button>
            )}
          </span>
        ))}
      </nav>
      <h1>{cur.title}</h1>
      <Drill key={cur.id} treeId={treeId} nodes={nodes} node={cur} onOpen={setCurId} />
      <p className="links">
        <a href={href.edit(treeId)}>편집</a> · <a href={href.quiz(treeId, cur.parentId ? cur.id : undefined)}>이 범위 백지 퀴즈</a>
      </p>
    </section>
  )
}
