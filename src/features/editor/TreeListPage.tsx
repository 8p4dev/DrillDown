import { useCallback, useEffect, useState } from 'react'
import { exportEvents, logEvent } from '../../core/events'
import { createTree, deleteTree, listTrees, renameTree } from '../../core/repo'
import type { Tree } from '../../core/types'
import { href } from '../../router'
import './treelist.css'

export default function TreeListPage() {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  const [title, setTitle] = useState('')
  const reload = useCallback(() => listTrees().then(setTrees), [])
  useEffect(() => void reload(), [reload])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    const tree = await createTree(t)
    await logEvent('tree_created', { title: t }, tree.id)
    setTitle('')
    await reload()
  }
  const rename = async (t: Tree) => {
    const next = prompt('새 이름', t.title)?.trim()
    if (next && next !== t.title) await renameTree(t.id, next).then(reload)
  }
  const remove = async (t: Tree) => {
    if (confirm(`"${t.title}" 트리를 삭제할까요? 학습 기록도 함께 지워집니다.`)) await deleteTree(t.id).then(reload)
  }

  const exportLog = async () => {
    const url = URL.createObjectURL(new Blob([await exportEvents()], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `drilldown-events-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="trees">
      <header className="trees-head">
        <h1>내 트리</h1>
        <button type="button" aria-label="학습 기록 내보내기(JSON)" onClick={exportLog}>학습 기록 내보내기(JSON)</button>
      </header>
      <form onSubmit={create} className="trees-form card">
        <input aria-label="새 트리 제목" placeholder="새 트리 제목 (예: 노동법)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="primary">트리 만들기</button>
      </form>
      {trees === null ? (
        <p className="muted">불러오는 중…</p>
      ) : trees.length === 0 ? (
        <p className="trees-empty muted">아직 트리가 없습니다.</p>
      ) : (
        <ul className="tree-cards">
          {trees.map((t) => (
            <li key={t.id} data-tree-id={t.id} className="card">
              <strong>{t.title}</strong>
              <div className="tree-links">
                <a href={href.edit(t.id)}>편집</a>
                <a href={href.flash(t.id)}>플래시카드</a>
                <a href={href.dnd(t.id)}>D&D 퀴즈</a>
                <a href={href.blank(t.id)}>백지 D&D</a>
              </div>
              <div className="tree-tools">
                <button type="button" onClick={() => rename(t)}>이름 변경</button>
                <button type="button" className="danger" onClick={() => remove(t)}>삭제</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
