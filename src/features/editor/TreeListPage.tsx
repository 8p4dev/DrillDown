import { useCallback, useEffect, useRef, useState } from 'react'
import { exportEvents, logEvent } from '../../core/events'
import { createTree, deleteTree, listTrees, renameTree } from '../../core/repo'
import type { Tree } from '../../core/types'
import { href } from '../../router'
import { haptic } from '../feel'
import './treelist.css'

// 선 굵기는 CSS(.tree-modes svg)에서 한 번에 준다
const MODES = [
  { icon: <><rect x="2" y="5" width="9.5" height="8.5" rx="1.5" /><path d="M5 2.5h7.5A1.5 1.5 0 0 1 14 4v7" /></>, label: '플래시카드', to: href.flash },
  { icon: <rect x="2" y="3.5" width="12" height="9" rx="1.5" strokeDasharray="2.4 2" />, label: '빈칸 퀴즈', to: href.dnd },
  { icon: <><path d="M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V5.5z" /><path d="M9.5 2v3.5H13" /></>, label: '백지 퀴즈', to: href.blank },
]

/** 제목 → 아바타 색조 0..5 (같은 제목은 언제나 같은 색) */
const toneOf = (title: string) => [...title].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 6

export default function TreeListPage() {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  const [title, setTitle] = useState('')
  const [newId, setNewId] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const reload = useCallback(() => listTrees().then(setTrees), [])
  useEffect(() => void reload(), [reload])
  useEffect(() => {
    if (trees?.length === 0) input.current?.focus()
  }, [trees])
  // 열린 ⋯ 메뉴는 바깥을 누르면 닫는다 (네이티브 <details> 는 스스로 닫히지 않음)
  useEffect(() => {
    const close = (e: PointerEvent) =>
      document.querySelectorAll<HTMLDetailsElement>('.tree-menu[open]').forEach((d) => d.contains(e.target as Node) || (d.open = false))
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    const tree = await createTree(t)
    await logEvent('tree_created', { title: t }, tree.id)
    haptic('success')
    setTitle('')
    setNewId(tree.id)
    await reload()
  }
  const rename = async (t: Tree, next: string) => {
    setEditing(undefined)
    next = next.trim()
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
        <button type="button" className="icon" aria-label="학습 기록 내보내기" title="학습 기록 내보내기" onClick={exportLog}>⤓</button>
      </header>
      <form onSubmit={create} className="trees-form card">
        <input ref={input} aria-label="새 트리 제목" placeholder="새 트리 제목 (예: 노동법)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="primary">만들기</button>
      </form>
      {trees === null ? (
        <p className="muted">불러오는 중…</p>
      ) : trees.length === 0 ? (
        <p className="trees-empty muted">
          <svg viewBox="0 0 64 48" aria-hidden>
            <path className="branch" d="M32 14v6M12 30v-6a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v6M32 20v10" />
            <circle className="root" cx="32" cy="8" r="6" />
            <circle cx="12" cy="38" r="6" /><circle cx="32" cy="38" r="6" /><circle cx="52" cy="38" r="6" />
          </svg>
          아직 트리가 없습니다.
        </p>
      ) : (
        <ul className="tree-cards">
          {trees.map((t) => (
            <TreeCard key={t.id} t={t} isNew={t.id === newId} editing={t.id === editing}
              onEdit={() => setEditing(t.id)} onRename={(v) => rename(t, v)} onCancel={() => setEditing(undefined)} onRemove={() => remove(t)} />
          ))}
        </ul>
      )}
    </section>
  )
}

type CardProps = {
  t: Tree; isNew: boolean; editing: boolean
  onEdit: () => void; onRename: (v: string) => void; onCancel: () => void; onRemove: () => void
}

function TreeCard({ t, isNew, editing, onEdit, onRename, onCancel, onRemove }: CardProps) {
  const timer = useRef(0)
  const menu = useRef<HTMLDetailsElement>(null)
  const done = useRef(false) // Esc/Enter 처리 뒤 blur 로 한 번 더 확정되지 않게
  useEffect(() => () => clearTimeout(timer.current), [])
  const pick = (f: () => void) => () => {
    if (menu.current) menu.current.open = false
    f()
  }
  return (
    <li data-tree-id={t.id} className={`card${isNew ? ' is-new' : ''}`}>
      <div className="tree-top">
        <span className="tree-avatar" data-tone={toneOf(t.title)} aria-hidden>{[...t.title][0]}</span>
        {editing ? (
          <input className="tree-rename" aria-label="트리 이름" defaultValue={t.title} autoFocus
            onFocus={(e) => { done.current = false; e.target.select() }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') { done.current = true; onRename(e.currentTarget.value) }
              if (e.key === 'Escape') { done.current = true; onCancel() }
            }}
            onBlur={(e) => done.current || onRename(e.target.value)} />
        ) : (
          // 한 번 = 편집으로 이동(더블클릭 판별 위해 잠깐 대기), 두 번 = 이름 변경
          <strong className="tree-title"
            onClick={(e) => { if (e.detail === 1) timer.current = window.setTimeout(() => { haptic('tap'); location.hash = href.edit(t.id) }, 250) }}
            onDoubleClick={() => { clearTimeout(timer.current); onEdit() }}>{t.title}</strong>
        )}
        <details className="tree-menu" ref={menu}>
          <summary aria-label="더 보기" title="더 보기">⋯</summary>
          <div className="tree-menu-list">
            <button type="button" onClick={pick(onEdit)}>이름 변경</button>
            <button type="button" className="danger" onClick={pick(onRemove)}>삭제</button>
          </div>
        </details>
      </div>
      {/* stretched link: 제목과 모드 사이 빈칸이 링크 본체, ::after 가 카드 전체를 덮는다. 제목·메뉴·모드 링크는 z-index 로 위에 */}
      <a className="tree-open" href={href.edit(t.id)} aria-label="편집" onClick={() => haptic('tap')} />
      <nav className="tree-modes" aria-label="학습 모드">
        {MODES.map((m) => (
          <a key={m.label} href={m.to(t.id)} onClick={() => haptic('tap')}><svg viewBox="0 0 16 16" aria-hidden>{m.icon}</svg>{m.label}</a>
        ))}
      </nav>
    </li>
  )
}
