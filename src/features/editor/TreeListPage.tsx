import { useCallback, useEffect, useState } from 'react'
import { createTree, deleteTree, listTrees, renameTree } from '../../core/repo'
import type { Tree } from '../../core/types'
import { href } from '../../router'
import './editor.css'

export default function TreeListPage() {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  const [title, setTitle] = useState('')
  const reload = useCallback(() => listTrees().then(setTrees), [])
  useEffect(() => void reload(), [reload])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    await createTree(t)
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

  return (
    <section className="tree-list">
      <h1>내 트리</h1>
      <form onSubmit={create} className="row-form">
        <input aria-label="새 트리 제목" placeholder="새 트리 제목 (예: 노동법)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit">트리 만들기</button>
      </form>
      {trees === null ? (
        <p>불러오는 중…</p>
      ) : trees.length === 0 ? (
        <p>아직 트리가 없습니다.</p>
      ) : (
        <ul>
          {trees.map((t) => (
            <li key={t.id} data-tree-id={t.id}>
              <strong>{t.title}</strong>
              <a href={href.edit(t.id)}>편집</a>
              <a href={href.study(t.id)}>학습</a>
              <a href={href.quiz(t.id)}>백지 퀴즈</a>
              <button type="button" onClick={() => rename(t)}>이름 변경</button>
              <button type="button" onClick={() => remove(t)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
