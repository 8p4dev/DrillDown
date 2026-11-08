// 공유 보기 /t/<slug>?m= — 04 §3.4·§3.10, 02 §3.1 공유 보기 와이어.
// 보기 탭 = 읽기 전용 목록 + 하단 복제 바. 플래시·빈칸·백지 = 기존 화면에 메모리 소스 주입(ephemeral). 신고·링크 복사는 헤더 ⋯ 메뉴.
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, type ReportReason, type SharedTree } from '../../core/api'
import { childrenOf, copyTree } from '../../core/repo'
import type { StudySource } from '../../core/source'
import { applyGrade } from '../../core/srs'
import type { ID, NodeSrs, TreeNode } from '../../core/types'
import { href, navigateShared, type Mode } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { copy as copyIcon, eye, x } from '../../ui/icons.all'
import { parse, toHtml } from '../editor/content/format'
import { toast } from '../Toast'
import { Avatar } from '../../ui/Avatar'
import { Sheet } from '../../ui/Sheet'
import './share-list.css'
import './share.css'

const FlashPage = lazy(() => import('../flash/FlashPage'))
const DndPage = lazy(() => import('../dnd/DndPage'))
const BlankDndPage = lazy(() => import('../dnd/BlankDndPage'))

type ViewMode = 'view' | Exclude<Mode, 'edit'>
const TABS: { mode: ViewMode; label: string; aria: string; icon: string }[] = [
  { mode: 'view', label: '보기', aria: '보기', icon: eye },
  { mode: 'flash', label: '플래시', aria: '플래시카드', icon: I.layers },
  { mode: 'dnd', label: '빈칸', aria: '빈칸 퀴즈', icon: I.squareDashed },
  { mode: 'blank', label: '백지', aria: '백지 퀴즈', icon: I.file },
]
const REASONS: { v: ReportReason; label: string }[] = [
  { v: 'copyright', label: '저작권' },
  { v: 'spam', label: '스팸' },
  { v: 'abuse', label: '욕설/유해' },
  { v: 'other', label: '기타' },
]

// 체험 학습 기록: 탭을 오가도 세션 동안 유지, 저장 안 함 (04 §3.4.2)
const sessions = new Map<string, Map<ID, NodeSrs>>()
function memorySource(t: SharedTree): StudySource {
  const srs = sessions.get(t.slug) ?? new Map<ID, NodeSrs>()
  sessions.set(t.slug, srs)
  return {
    ephemeral: true,
    nodes: async () => t.nodes,
    srs: async () => srs,
    record: async (nodeId, ok) => {
      const { next } = applyGrade(srs.get(nodeId), nodeId, t.slug, ok ? 'exact' : 'auto_reject', ok ? 'ok' : null, new Date())
      srs.set(nodeId, next)
      return next
    },
  }
}

function Branch({ nodes, items, level }: { nodes: TreeNode[]; items: TreeNode[]; level: number }) {
  return (
    <ul role={level === 1 ? 'tree' : 'group'} className="share-tree" aria-label={level === 1 ? '트리' : undefined}>
      {items.map((n) => {
        const kids = childrenOf(nodes, n.id)
        return (
          <li key={n.id} role="treeitem" aria-level={level} aria-expanded={kids.length ? true : undefined} data-node-id={n.id}>
            <div className="share-node">
              <strong>{n.title}</strong>
              {n.aliases.length > 0 && <span className="muted"> · {n.aliases.join(', ')}</span>}
              {n.note && <div className="share-note" dangerouslySetInnerHTML={{ __html: toHtml(parse(n.note)) }} />}
            </div>
            {kids.length > 0 && <Branch nodes={nodes} items={kids} level={level + 1} />}
          </li>
        )
      })}
    </ul>
  )
}

// 서버 오류 코드 → 한 줄 화면 (04 §3.3·§3.6: 404 / 410 deleted / 403 hidden)
const FAIL: Record<number, string> = { 404: '링크를 찾을 수 없습니다', 410: '삭제된 트리입니다', 403: '운영 정책으로 숨김', 0: '네트워크에 연결할 수 없습니다' }
type Load = ({ t: SharedTree } | { fail: string }) & { slug: string }

export default function SharedPage({ slug, mode, rootId }: { slug: string; mode: ViewMode; rootId?: string }) {
  const [loaded, setLoad] = useState<Load | null>(null)
  useEffect(() => {
    const ac = new AbortController()
    api<SharedTree>(`/api/t/${slug}`, { signal: ac.signal }).then(
      (t) => setLoad({ slug, t }),
      (e) => !ac.signal.aborted && setLoad({ slug, fail: FAIL[e instanceof ApiError ? e.status : -1] ?? FAIL[404] }),
    )
    return () => ac.abort()
  }, [slug])
  const load = loaded?.slug === slug ? loaded : null
  const t = load && 't' in load ? load.t : null
  const source = useMemo(() => (t ? memorySource(t) : null), [t])
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState(false)
  const [reason, setReason] = useState<ReportReason>('copyright')
  const [note, setNote] = useState('')
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !moreRef.current?.contains(e.target as Node) && setMenu(false)
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [menu])

  if (!load) return <div className="route-loading" aria-busy="true" />
  if (!t) {
    return (
      <section className="shared share-error">
        <h1>{'fail' in load ? load.fail : FAIL[404]}</h1>
        <p><a href="/#/">내 트리 ›</a></p>
      </section>
    )
  }
  const root = t.nodes.find((n) => n.parentId === null)
  const url = location.origin + href.shared(slug)

  const doCopy = async () => {
    const tree = await copyTree(t)
    void api(`/api/t/${slug}/copy`, { method: 'POST' }).catch(() => {}) // copy_count 용, 실패 무시
    toast('복제됨 · 원본이 바뀌어도 이 트리는 바뀌지 않습니다', { label: '열기', run: () => location.assign('/' + href.edit(tree.id)) }, 6000)
  }
  const copyLink = async () => {
    setMenu(false)
    await navigator.clipboard.writeText(url)
    toast('링크 복사됨')
  }
  const sendReport = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await api(`/api/t/${slug}/report`, { body: { reason, note: note.trim() || undefined } })
    } catch (err) {
      return toast(err instanceof ApiError ? err.message : '신고하지 못했습니다')
    }
    setReport(false)
    setNote('')
    toast('신고 접수됨')
  }

  return (
    <section className="shared" data-mode={mode}>
      <header className="share-head">
        <div className="share-title">
          <div className="share-title-row"><h1>{t.title}</h1><span className="badge">읽기 전용</span></div>
          <p className="muted share-owner"><Avatar name={t.owner.nickname} url={t.owner.avatar_url} size={32} className="share-avatar" />{t.owner.nickname} · 노드 {t.node_count}개</p>
        </div>
        <nav aria-label="학습 모드" className="share-tabs">
          {TABS.map((tab) => (
            <a
              key={tab.mode} href={href.shared(slug, tab.mode === 'view' ? undefined : tab.mode)} aria-label={tab.aria}
              aria-current={tab.mode === mode ? 'page' : undefined}
              onClick={(e) => (e.preventDefault(), navigateShared(slug, tab.mode === 'view' ? undefined : tab.mode))}
            >
              <Icon d={tab.icon} />{tab.label}
            </a>
          ))}
        </nav>
        <div className="share-tools">
          <button type="button" className="ghost share-copy" aria-label="내 트리로 복제" data-tip="내 트리로 복제" onClick={doCopy}>
            <Icon d={copyIcon} size={20} /><span className="share-copy-text">내 트리로 복제</span>
          </button>
          <div className="share-more" ref={moreRef}>
            <button type="button" className="ghost" aria-label="더 보기" data-tip="더 보기" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon d={I.ellipsis} size={20} />
            </button>
            {menu && (
              <ul role="menu" className="share-menu">
                <li><button type="button" role="menuitem" onClick={() => (setMenu(false), setReport(true))}>신고</button></li>
                <li><button type="button" role="menuitem" onClick={copyLink}>링크 복사</button></li>
              </ul>
            )}
          </div>
        </div>
      </header>

      {mode === 'view' && root && <Branch nodes={t.nodes} items={[root]} level={1} />}
      {mode !== 'view' && source && (
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          {mode === 'flash' && <FlashPage key={slug} treeId={slug} rootId={rootId} source={source} />}
          {mode === 'dnd' && <DndPage key={slug + rootId} treeId={slug} rootId={rootId} source={source} />}
          {mode === 'blank' && <BlankDndPage key={slug + rootId} treeId={slug} rootId={rootId} source={source} />}
        </Suspense>
      )}

      {mode === 'view' && (
        <div className="share-bar">
          <button type="button" className="primary" onClick={doCopy}><Icon d={copyIcon} />내 트리로 복제</button>
        </div>
      )}

      <Sheet open={report} onClose={() => setReport(false)} label="신고">
        <form className="share-sheet share-report" onSubmit={sendReport}>
          <header className="sheet-head">
            <h2>신고</h2>
            <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={() => setReport(false)}><Icon d={x} /></button>
          </header>
          <fieldset>
            <legend className="muted">사유</legend>
            {REASONS.map((r) => (
              <label key={r.v}><input type="radio" name="reason" value={r.v} checked={reason === r.v} onChange={() => setReason(r.v)} /> {r.label}</label>
            ))}
          </fieldset>
          <textarea aria-label="메모" rows={3} maxLength={300} placeholder="메모 (선택, 300자 이내)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="actions">
            <button type="submit" className="primary">신고</button>
          </div>
        </form>
      </Sheet>
    </section>
  )
}
