// 스텁 — 에이전트 F 가 플래시카드 기반 복습으로 교체 (docs/plans/orchestration_modes.md §2 F)
import { useEffect, useState } from 'react'
import { listTrees } from '../../core/repo'
import { dueByTree } from '../../core/srs'
import type { NodeSrs, Tree } from '../../core/types'
import { href } from '../../router'

const endOfToday = () => {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

export default function ReviewPage() {
  const [rows, setRows] = useState<{ tree: Tree; due: NodeSrs[] }[] | null>(null)
  useEffect(() => {
    Promise.all([listTrees(), dueByTree(endOfToday())]).then(([trees, due]) =>
      setRows(trees.filter((t) => due.get(t.id)?.length).map((t) => ({ tree: t, due: due.get(t.id)! }))),
    )
  }, [])
  return (
    <section className="review">
      <h1>오늘의 복습</h1>
      {rows === null ? <p>불러오는 중…</p> : rows.length === 0 ? <p className="muted">오늘 복습할 항목이 없습니다.</p> : (
        <ul aria-label="복습 대상 트리">
          {rows.map(({ tree, due }) => (
            <li key={tree.id} data-tree-id={tree.id}>
              <strong>{tree.title}</strong> {due.length}개 <a href={href.flash(tree.id)}>플래시카드</a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
