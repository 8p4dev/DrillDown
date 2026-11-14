// 공유 보기 /t/<slug>?m= — 04 §3.4·§3.10, 02 §3.1 공유 보기 와이어.
// 보기 탭 = 편집기와 같은 카드 그래프(GraphView·useZoom·editor.css 재사용, 계약 C6) + 읽기 전용 카드(ShareCard) + 하단 복제 바.
// 플래시·빈칸·백지 = 기존 화면에 메모리 소스 주입(ephemeral). 신고·링크 복사는 헤더 ⋯ 메뉴. 별점은 헤더(계약 C3).
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ApiError, REASON, type Rating, type ReportReason, type SharedTree } from '../../core/api'
import { useMe } from '../../core/me'
import { copyTree, listTrees } from '../../core/repo'
import type { StudySource } from '../../core/source'
import { applyGrade } from '../../core/srs'
import { CAP, type ID, type NodeSrs, type Tree, type TreeNode } from '../../core/types'
import { href, navigateShared, type Mode } from '../../router'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { copy as copyIcon, eye, listTree, network, star, zoomIn, zoomOut } from '../../ui/icons.all'
import GraphView from '../editor/graph/GraphView'
import type { Dir } from '../editor/graph/layout'
import { useZoom } from '../editor/graph/useZoom'
import { toast } from '../Toast'
import { Avatar } from '../../ui/Avatar'
import { Sheet } from '../../ui/Sheet'
import ShareCard from './ShareCard'
import '../editor/editor.css'
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
const STARS = [1, 2, 3, 4, 5]
/** 편집기의 세로 보기 선호(dd:editor-dir)를 읽기만 한다(A8). 저장은 편집기만 */
const loadDir = (): Dir => { try { return localStorage.getItem('dd:editor-dir') === 'right' ? 'right' : 'down' } catch { return 'down' } }

// 체험 학습 기록: 탭을 오가도 세션 동안 유지, 저장 안 함 (04 §3.4.2)
const sessions = new Map<string, Map<ID, NodeSrs>>()
function memorySource(t: SharedTree, copy: () => void): StudySource {
  const srs = sessions.get(t.slug) ?? new Map<ID, NodeSrs>()
  sessions.set(t.slug, srs)
  return {
    ephemeral: true,
    copy,
    nodes: async () => t.nodes,
    srs: async () => srs,
    record: async (nodeId, ok, base) => {
      const next = applyGrade(base === undefined ? srs.get(nodeId) : (base ?? undefined), nodeId, t.slug, ok ? 'exact' : 'auto_reject', ok ? 'ok' : null, new Date())
      srs.set(nodeId, next)
      return next
    },
    recordResults: async (ids, oks) => {
      const now = new Date()
      ids.forEach((id, i) => srs.set(id, applyGrade(srs.get(id), id, t.slug, oks[i] ? 'exact' : 'auto_reject', oks[i] ? 'ok' : null, now)))
    },
  }
}

/** 노드별 자식 유무·하위 수 (EditorPage countTree 의 읽기 전용 축소판, O(n)) */
function countTree(ns: TreeNode[]) {
  const kids = new Map<ID, ID[]>()
  for (const n of ns) {
    if (n.parentId === null) continue
    const k = kids.get(n.parentId)
    if (k) k.push(n.id)
    else kids.set(n.parentId, [n.id])
  }
  const desc = new Map<ID, number>()
  const walk = (id: ID): number => {
    const total = (kids.get(id) ?? []).reduce((sum, k) => sum + 1 + walk(k), 0)
    desc.set(id, total)
    return total
  }
  for (const n of ns) if (n.parentId === null) walk(n.id)
  return { hasKids: (id: ID) => kids.has(id), desc: (id: ID) => desc.get(id) ?? 0 }
}

// 서버 오류 코드 → 한 줄 화면 (04 §3.3·§3.6: 404 / 410 deleted / 403 hidden)
const FAIL: Record<number, string> = { 404: '링크를 찾을 수 없습니다', 410: '삭제된 트리입니다', 403: '운영 정책으로 숨김', 503: '점검 중입니다 · 잠시 후 다시 열어 주세요', 0: '네트워크에 연결할 수 없습니다' }
type Load = ({ t: SharedTree } | { fail: string }) & { slug: string }

export default function SharedPage({ slug, mode, rootId }: { slug: string; mode: ViewMode; rootId?: string }) {
  const me = useMe()
  const [loaded, setLoad] = useState<Load | null>(null)
  const [rating, setRating] = useState<Rating | null>(null)
  // 보기 탭 그래프: 접기·선택은 이 화면의 로컬 상태(저장·동기화 없음). 접기 초기값은 소유자가 접어 둔 노드
  const [folded, setFolded] = useState<Set<ID>>(() => new Set())
  const [selId, setSelId] = useState<ID>('')
  const [dir, setDir] = useState<Dir>(loadDir)
  const outlineRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const ac = new AbortController()
    api<SharedTree>(`/api/t/${slug}`, { signal: ac.signal }).then(
      (t) => {
        setLoad({ slug, t })
        setRating(t.rating)
        setFolded(new Set(t.nodes.filter((n) => n.collapsed).map((n) => n.id)))
        setSelId('')
      },
      (e) => !ac.signal.aborted && setLoad({ slug, fail: FAIL[e instanceof ApiError ? e.status : -1] ?? FAIL[404] }),
    )
    return () => ac.abort()
  }, [slug])
  const load = loaded?.slug === slug ? loaded : null
  const t = load && 't' in load ? load.t : null
  const root = t?.nodes.find((n) => n.parentId === null)
  const counts = useMemo(() => countTree(t?.nodes ?? []), [t])
  const open = useMemo(() => (n: TreeNode) => !folded.has(n.id), [folded])
  // 확대·축소(계약 C2): 버튼·휠·핀치. 자동 맞춤은 카드 구성이 바뀔 때(onSettled)와 방향 전환 때
  const { zoom, zoomTo, zoomBy, fit } = useZoom(outlineRef, 1, mode === 'view' && !!root)
  // onSettled 는 GraphView 의 레이아웃 이펙트 안에서 불려 flushSync(zoomTo)를 바로 못 쓴다 → 커밋이 끝난 뒤(마이크로태스크, 페인트 전)
  const refit = (id: ID) => queueMicrotask(() => fit(id || root?.id))
  const flipDir = () => {
    setDir((d) => (d === 'right' ? 'down' : 'right'))
    refit(selId) // 방향이 바뀌어도 카드 집합은 같아 onSettled 가 오지 않는다
  }
  const toggleFold = (id: ID) => setFolded((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const [dup, setDup] = useState<Tree | null>(null) // U57: 이미 복제한 트리 → 시트
  const doCopy = useCallback(async (again = false) => {
    if (!t) return
    setDup(null)
    const mine = await listTrees()
    // U57: 이미 복제한 트리가 있으면 먼저 묻는다(삭제된 것은 listTrees 가 뺀다)
    const prev = !again && mine.find((x) => x.sourceTreeId === t.id)
    if (prev) { setDup(prev); return }
    // C5: 로그인 사용자는 서버 한도에 닿으면 복제를 막는다(비로그인은 막지 않음)
    if (me && mine.length >= CAP.treesPerUser) { toast('트리는 200개까지 저장할 수 있습니다'); return }
    let tree: Tree
    try {
      tree = await copyTree(t)
    } catch {
      return toast('복제하지 못했어요 · 저장 공간을 확인하세요') // IndexedDB 쿼터·트랜잭션 실패
    }
    void api(`/api/t/${slug}/copy`, { method: 'POST' }).catch(() => {}) // copy_count 용, 실패 무시
    toast('복제됨 · 원본이 바뀌어도 이 트리는 바뀌지 않습니다', { label: '열기', run: () => location.assign('/' + href.edit(tree.id)) }, 6000)
  }, [t, me, slug])
  // U38·Q3: 첫 채점 토스트 [복제] = 헤더 복제와 같은 흐름(U57 중복 확인 포함). 소스는 트리·로그인 상태가 바뀔 때만 새로(체험 토스트 1회 유지)
  const source = useMemo(() => (t ? memorySource(t, () => void doCopy()) : null), [t, doCopy])
  const [menu, setMenu] = useState(false)
  const [report, setReport] = useState(false)
  const [sending, setSending] = useState(false)
  const [reason, setReason] = useState<ReportReason>('copyright')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState<string | null>(null) // 신고 접수번호 → #/report/<id> (T2 #26)
  const moreRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => !moreRef.current?.contains(e.target as Node) && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    addEventListener('pointerdown', close)
    addEventListener('keydown', esc)
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', esc) }
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
  const url = location.origin + href.shared(slug)

  const copyLink = async () => {
    setMenu(false)
    try {
      await navigator.clipboard.writeText(url)
      toast('링크 복사됨')
    } catch {
      toast('복사하지 못했습니다') // 권한 거부·비보안 문맥 등
    }
  }
  const sendReport = async (e: React.FormEvent) => {
    e.preventDefault()
    if (sending) return // 응답 전 두 번 눌러 2건 접수되지 않게
    setSending(true)
    let id: string
    try {
      id = (await api<{ id: string }>(`/api/t/${slug}/report`, { body: { reason, note: note.trim() || undefined } })).id
    } catch (err) {
      return toast(err instanceof ApiError ? err.message : '신고하지 못했습니다')
    } finally {
      setSending(false)
    }
    setNote('')
    setReceipt(id) // 시트는 열어 두고 접수번호·상태 링크를 보여 준다
  }
  const closeReport = () => { setReport(false); setReceipt(null) }
  // 별점(계약 C3): 로그인 + 남의 트리면 PUT. 비로그인은 로그인 안내, 내 트리는 버튼 비활성
  const rate = async (stars: number) => {
    if (!me) return toast('로그인하면 별점을 남길 수 있습니다', { label: '로그인', run: () => location.assign('/' + href.login(location.pathname + location.search)) })
    try {
      setRating(await api<Rating>(`/api/t/${slug}/rating`, { method: 'PUT', body: { stars } }))
      toast(`별점 ${stars}점`)
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '별점을 남기지 못했습니다')
    }
  }
  const ownTree = !!me && !!rating && !rating.canRate
  // 운영 스위치(계약 B): 서버가 flags 를 주면 꺼진 기능은 화면에서도 숨긴다(비로그인 포함). 없으면 켜진 것으로
  const noRating = t.flags?.rating === false
  const starTip = noRating ? '별점이 꺼져 있습니다' : ownTree ? '내 트리는 평가할 수 없습니다' : undefined
  // 선택한 카드가 자식 있는 비루트 노드면 그 가지로 플래시 탭을 연다
  const learnFrom = mode === 'view' && selId && selId !== root?.id && counts.hasKids(selId) ? selId : ''

  return (
    <section className="shared" data-mode={mode}>
      <header className="share-head">
        <div className="share-title">
          <div className="share-title-row"><h1>{t.title}</h1><span className="badge">읽기 전용</span></div>
          <p className="muted share-owner"><Avatar name={t.owner.nickname} url={t.owner.avatar_url} size={32} className="share-avatar" />{t.owner.nickname} · 노드 {t.node_count}개</p>
          {rating && (
            <div className="share-rating">
              <span className="share-rating-avg"><Icon d={star} />{rating.avg === null ? <span className="muted">평가 없음</span> : <><span className="tnum">{rating.avg.toFixed(1)}</span><span className="muted tnum">({rating.count})</span></>}</span>
              <span className="share-stars" role="group" aria-label="내 별점" data-tip={starTip}>
                {STARS.map((n) => (
                  <button
                    key={n} type="button" aria-label={`별점 ${n}점`} aria-pressed={rating.mine === n} disabled={ownTree || noRating}
                    data-on={rating.mine !== null && n <= rating.mine} data-tip={starTip ?? `별점 ${n}점`}
                    onClick={() => void rate(n)}
                  >
                    <Icon d={star} />
                  </button>
                ))}
              </span>
            </div>
          )}
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
          {learnFrom && (
            <button type="button" className="share-learn" onClick={() => navigateShared(slug, 'flash', learnFrom)}>
              <Icon d={I.layers} size={20} />여기부터 학습
            </button>
          )}
          <button type="button" className="ghost share-copy" aria-label="내 트리로 복제" data-tip="내 트리로 복제" onClick={() => void doCopy()}>
            <Icon d={copyIcon} size={20} /><span className="share-copy-text">내 트리로 복제</span>
          </button>
          <div className="share-more" ref={moreRef}>
            {/* H8: 메뉴 키보드 규약(화살표 이동)을 구현하지 않으므로 menu/menuitem 역할은 쓰지 않는다. 버튼 목록 + aria-expanded 만 */}
            <button type="button" className="ghost" aria-label="더 보기" data-tip="더 보기" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              <Icon d={I.ellipsis} size={20} />
            </button>
            {menu && (
              <ul className="share-menu">
                {t.flags?.report !== false && <li><button type="button" onClick={() => (setMenu(false), setReport(true))}>신고</button></li>}
                <li><button type="button" onClick={copyLink}>링크 복사</button></li>
              </ul>
            )}
          </div>
        </div>
      </header>

      {mode === 'view' && root && (
        <div className="canvas">
          <div className="outline" role="tree" aria-label="트리" ref={outlineRef}>
            <GraphView
              key={slug}
              zoom={zoom}
              nodes={t.nodes}
              rootId={root.id}
              open={open}
              onZoomAt={zoomTo}
              onSettled={() => refit(selId)}
              dir={dir}
              onMove={() => {}} // 읽기 전용: 끌어도 위치가 바뀌지 않는다
              renderNode={(n, box, m) => (
                <ShareCard
                  key={n.id}
                  node={n}
                  depth={box.depth}
                  x={box.x}
                  y={box.y}
                  hasChildren={counts.hasKids(n.id)}
                  hiddenCount={open(n) ? 0 : counts.desc(n.id)}
                  selected={n.id === selId}
                  still={m.still}
                  onSelect={() => setSelId(n.id)}
                  onToggle={() => toggleFold(n.id)}
                />
              )}
            />
          </div>
          <div className="zoom-tools">
            <span className="zoom-group" role="group" aria-label="확대·축소">
              <button type="button" className="zoom-step" aria-label="축소" data-tip="축소" onClick={() => zoomBy(1 / 1.2)}><Icon d={zoomOut} size={20} /></button>
              <button type="button" className="zoom-reset" aria-label={`100%로 (현재 ${Math.round(zoom * 100)}%)`} data-tip="100%로" onClick={() => zoomTo(1)}>
                <output className="tnum" aria-label="배율">{Math.round(zoom * 100)}%</output>
              </button>
              <button type="button" className="zoom-step" aria-label="확대" data-tip="확대" onClick={() => zoomBy(1.2)}><Icon d={zoomIn} size={20} /></button>
            </span>
            <button type="button" aria-label="세로 보기" aria-pressed={dir === 'right'} data-tip={dir === 'right' ? '가로 보기로' : '세로 보기'} onClick={flipDir}><Icon d={dir === 'right' ? network : listTree} size={20} /></button>
          </div>
        </div>
      )}
      {mode !== 'view' && source && (
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          {mode === 'flash' && <FlashPage key={slug + rootId} treeId={slug} rootId={rootId} source={source} />}
          {mode === 'dnd' && <DndPage key={slug + rootId} treeId={slug} rootId={rootId} source={source} />}
          {mode === 'blank' && <BlankDndPage key={slug + rootId} treeId={slug} rootId={rootId} source={source} />}
        </Suspense>
      )}

      {mode === 'view' && (
        <div className="share-bar">
          <button type="button" className="primary" onClick={() => void doCopy()}><Icon d={copyIcon} />내 트리로 복제</button>
        </div>
      )}

      <Sheet open={!!dup} onClose={() => setDup(null)} label="이미 복제한 트리">
        <div className="share-sheet">
          <header className="sheet-head">
            <h2>이미 복제한 트리가 있습니다</h2>
            <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={() => setDup(null)}><Icon d={I.x} /></button>
          </header>
          <p className="muted">‘{dup?.title}’ · 학습 기록은 그 트리에 있습니다</p>
          <div className="actions">
            <button type="button" onClick={() => void doCopy(true)}>새로 복제</button>
            <button type="button" className="primary" onClick={() => dup && location.assign('/' + href.edit(dup.id))}>그 트리 열기</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={report} onClose={closeReport} label="신고">
        {receipt ? (
          <div className="share-sheet share-report">
            <header className="sheet-head">
              <h2>신고 접수됨</h2>
              <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={closeReport}><Icon d={I.x} /></button>
            </header>
            <p>접수번호 <strong className="tnum" style={{ userSelect: 'all', overflowWrap: 'anywhere' }}>{receipt}</strong></p>
            <p className="muted">이 번호로 처리 결과를 볼 수 있습니다. 연락처는 받지 않으니 적어 두세요.</p>
            <div className="actions">
              <a href={'/' + href.report(receipt)}>처리 상태 보기</a>
              <button type="button" className="primary" onClick={closeReport}>닫기</button>
            </div>
          </div>
        ) : (
        <form className="share-sheet share-report" onSubmit={sendReport}>
          <header className="sheet-head">
            <h2>신고</h2>
            <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={closeReport}><Icon d={I.x} /></button>
          </header>
          <fieldset>
            <legend className="muted">사유</legend>
            {(Object.keys(REASON) as ReportReason[]).map((v) => (
              <label key={v}><input type="radio" name="reason" value={v} checked={reason === v} onChange={() => setReason(v)} /> {REASON[v]}</label>
            ))}
          </fieldset>
          <textarea aria-label="메모" rows={3} maxLength={300} placeholder="메모 (선택, 300자 이내)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="actions">
            <button type="submit" className="primary" disabled={sending}>신고</button>
          </div>
        </form>
        )}
      </Sheet>
    </section>
  )
}
