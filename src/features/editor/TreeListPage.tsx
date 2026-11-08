import { useCallback, useEffect, useRef, useState } from 'react'
import { initialOf, toneOf } from '../../core/avatar'
import { exportEvents, logEvent } from '../../core/events'
import { useMe } from '../../core/me'
import { createTree, listTrees, markTreeDeleted, purgeDeletedTrees, renameTree, restoreTree } from '../../core/repo'
import { CAP, type Tree } from '../../core/types'
import { href } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import ShareSheet from '../share/ShareSheet'
import SyncStatus from '../share/SyncStatus'
import VisibilityBadge from '../share/VisibilityBadge'
import { haptic } from '../feel'
import { toast } from '../Toast'
import { startViewport } from '../viewport'
import './treelist.css'

const UNDO_MS = 10_000
/** 모드 3칸: 아이콘 + 짧은 글자. aria-label 은 E2E 계약(plan §3.7) */
const MODES = [
  { icon: I.layers, short: '플래시', label: '플래시카드', to: href.flash },
  { icon: I.squareDashed, short: '빈칸', label: '빈칸 퀴즈', to: href.dnd },
  { icon: I.file, short: '백지', label: '백지 퀴즈', to: href.blank },
]
const coarse = () => matchMedia('(pointer: coarse)').matches

export default function TreeListPage() {
  const [trees, setTrees] = useState<Tree[] | null>(null)
  const [title, setTitle] = useState('')
  const [newId, setNewId] = useState<string>()
  const [editing, setEditing] = useState<string>()
  const [sharing, setSharing] = useState<Tree>()
  const [goneId, setGoneId] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const me = useMe()
  const reload = useCallback(() => listTrees().then(setTrees), [])
  useEffect(() => {
    startViewport()
    purgeDeletedTrees().then(reload) // 휴지통에서 7일 지난 트리만 하드 삭제
    addEventListener('dd:remote', reload) // 동기화 pull 뒤 목록 갱신
    return () => removeEventListener('dd:remote', reload)
  }, [reload])
  // D8: PC 는 빈 상태에서 자동 포커스, 터치 기기는 키보드가 화면을 가리므로 탭해야 포커스
  useEffect(() => {
    if (trees?.length === 0 && !coarse()) input.current?.focus()
  }, [trees])
  // 열린 ⋯ 메뉴는 바깥을 누르면 닫는다 (네이티브 <details> 는 스스로 닫히지 않음)
  useEffect(() => {
    const close = (e: PointerEvent) =>
      document.querySelectorAll<HTMLDetailsElement>('.tree-menu[open]').forEach((d) => d.contains(e.target as Node) || (d.open = false))
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  // C5: 로그인 사용자는 서버 한도(200)에 닿으면 만들기를 막는다. 비로그인은 막지 않음
  const full = !!me && (trees?.length ?? 0) >= CAP.treesPerUser
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const t = title.trim()
    if (!t || full) return
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
  /** 확인창 없음(02 D9): 소프트 삭제 → 되돌리기 토스트 10초. 놓치면 휴지통(계정 화면, 7일) */
  const remove = (t: Tree) => {
    setGoneId(t.id)
    haptic('warn')
    setTimeout(async () => {
      await markTreeDeleted(t.id)
      setGoneId(undefined)
      await reload()
      toast(`"${t.title}" 삭제 · 휴지통에 7일 보관`, {
        label: '되돌리기',
        run: () => {
          setNewId(t.id)
          restoreTree(t.id).then(reload)
        },
      }, UNDO_MS)
    }, 200) // 카드 사라짐(opacity·scale) 뒤에 목록에서 뺀다
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
        <SyncStatus />
        {!me && (
          <a className="ghost trees-trash" href={href.account()} aria-label="휴지통·내보내기" data-tip="휴지통·내보내기">
            <Icon d={I.trash2} size={20} />
          </a>
        )}
        <button type="button" className="ghost" aria-label="학습 기록 내보내기" data-tip="학습 기록 내보내기" onClick={exportLog}>
          <Icon d={I.download} size={20} />
        </button>
      </header>
      <form onSubmit={create} className="trees-form card">
        <input ref={input} aria-label="새 트리 제목" placeholder="새 트리 제목 (예: 노동법)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className="primary" disabled={full}><Icon d={I.plus} />만들기</button>
      </form>
      {full && <p className="trees-full" role="status">트리는 200개까지 저장할 수 있습니다</p>}
      {trees === null ? null : trees.length === 0 ? (
        <button type="button" className="empty trees-empty" onClick={() => input.current?.focus()}>
          <Icon d={I.plus} size={64} />
          <span>첫 트리 만들기</span>
        </button>
      ) : (
        <ul className="tree-cards">
          {trees.map((t) => (
            <TreeCard key={t.id} t={t} isNew={t.id === newId} gone={t.id === goneId} editing={t.id === editing}
              onEdit={() => setEditing(t.id)} onRename={(v) => rename(t, v)} onCancel={() => setEditing(undefined)}
              onShare={() => setSharing(t)} onRemove={() => remove(t)} />
          ))}
        </ul>
      )}
      {sharing && <ShareSheet tree={sharing} onClose={() => setSharing(undefined)} onChange={reload} />}
    </section>
  )
}

type CardProps = {
  t: Tree; isNew: boolean; gone: boolean; editing: boolean
  onEdit: () => void; onRename: (v: string) => void; onCancel: () => void; onShare: () => void; onRemove: () => void
}

function TreeCard({ t, isNew, gone, editing, onEdit, onRename, onCancel, onShare, onRemove }: CardProps) {
  const timer = useRef(0)
  const menu = useRef<HTMLDetailsElement>(null)
  const done = useRef(false) // Esc/Enter 처리 뒤 blur 로 한 번 더 확정되지 않게
  useEffect(() => () => clearTimeout(timer.current), [])
  const pick = (f: () => void) => () => {
    if (menu.current) menu.current.open = false
    f()
  }
  return (
    <li data-tree-id={t.id} className={`card${isNew ? ' is-new' : ''}${gone ? ' is-gone' : ''}`}>
      <div className="tree-top">
        <span className="avatar" data-tone={toneOf(t.title)} aria-hidden>{initialOf(t.title)}</span>
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
        <VisibilityBadge tree={t} />
        <details className="tree-menu" ref={menu}>
          <summary aria-label="더 보기" data-tip="더 보기"><Icon d={I.ellipsis} size={20} /></summary>
          <div className="tree-menu-list">
            <button type="button" onClick={pick(onEdit)}><Icon d={I.pencil} />이름 변경</button>
            <button type="button" onClick={pick(onShare)}><Icon d={I.link} />공유…</button>
            <button type="button" className="danger" onClick={pick(onRemove)}><Icon d={I.trash2} />삭제</button>
          </div>
        </details>
      </div>
      {/* stretched link: 제목과 모드 사이 빈칸이 링크 본체, ::after 가 카드 전체를 덮는다. 제목·메뉴·모드 링크는 z-index 로 위에 */}
      <a className="tree-open" href={href.edit(t.id)} aria-label="편집" onClick={() => haptic('tap')} />
      <nav className="tree-modes" aria-label="학습 모드">
        {MODES.map((m) => (
          <a key={m.label} href={m.to(t.id)} aria-label={m.label} onClick={() => haptic('tap')}><Icon d={m.icon} />{m.short}</a>
        ))}
      </nav>
    </li>
  )
}
