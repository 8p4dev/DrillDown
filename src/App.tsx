// 앱 셸 — 오케스트레이터 소유 (orchestration_ui_first.md §3.1). 상단 바 배치는 02 §3.1: [■(+이름 ≥421)] 내 트리  복습•n … [테마] [아바타/로그인]
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { href, useRoute, type Route } from './router'
import { Toaster } from './features/Toast'
import { TooltipLayer } from './ui/Tooltip'
import ThemeToggle from './ui/ThemeToggle'
import NavUser from './features/account/NavUser'
import Banners from './features/account/Banners'
import { useMe } from './core/me'
import { startViewport } from './features/viewport'

// 화면별 코드 분할: 첫 화면만 받고, 나머지는 유휴 시간에 미리 받는다. 관리자 청크는 admin 일 때만 (01 §3.8)
const load = {
  trees: () => import('./features/editor/TreeListPage'),
  edit: () => import('./features/editor/EditorPage'),
  flash: () => import('./features/flash/FlashPage'),
  review: () => import('./features/flash/ReviewPage'),
  dnd: () => import('./features/dnd/DndPage'),
  blank: () => import('./features/dnd/BlankDndPage'),
  login: () => import('./features/account/LoginPage'),
  account: () => import('./features/account/AccountPage'),
  shared: () => import('./features/share/SharedPage'),
  gallery: () => import('./features/share/GalleryPage'),
  privacy: () => import('./features/account/PrivacyPage'),
}
const loadAdmin = () => import('./features/admin/AdminPage')
const TreeListPage = lazy(load.trees)
const EditorPage = lazy(load.edit)
const FlashPage = lazy(load.flash)
const ReviewPage = lazy(load.review)
const DndPage = lazy(load.dnd)
const BlankDndPage = lazy(load.blank)
const LoginPage = lazy(load.login)
const AccountPage = lazy(load.account)
const AdminPage = lazy(loadAdmin)
const SharedPage = lazy(load.shared)
const GalleryPage = lazy(load.gallery)
const PrivacyPage = lazy(load.privacy)

/** 오늘 끝까지 due 인 노드 수(삭제 표시된 트리 제외) — 상단 바 복습 배지(02 §3.1). Dexie 는 동적 import 로(ts-fsrs 를 첫 청크에 넣지 않게) */
async function countDue(): Promise<number> {
  const [{ db }, { listTrees }] = await Promise.all([import('./core/db'), import('./core/repo')])
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const live = new Set((await listTrees()).map((t) => t.id))
  return (await db.srs.where('due').belowOrEqual(+end).toArray()).filter((s) => live.has(s.treeId)).length
}
const TITLES: Record<string, string> = { trees: '내 트리', review: '오늘의 복습', login: '로그인', account: '계정', admin: '관리', gallery: '갤러리', privacy: '개인정보 처리방침', edit: '편집', flash: '플래시카드', dnd: '빈칸', blank: '백지' }
/** 탭 제목(U52): '<트리 이름> · 편집 — Drill Down'. 공유 보기는 서버가 넣은 제목을 둔다 */
async function titleOf(r: Route): Promise<string | null> {
  if (r.name === 'shared') return null
  const page = TITLES[r.name]
  if (!('treeId' in r)) return `${page} — Drill Down`
  const { db } = await import('./core/db')
  const t = await db.trees.get(r.treeId)
  return `${t ? t.title + ' · ' : ''}${page} — Drill Down`
}
async function countTrees(): Promise<number> {
  const { listTrees } = await import('./core/repo')
  return (await listTrees()).length
}

/** 앱 전체 오류 경계 — 렌더 예외와 lazy 청크 실패(배포 직후 404)를 잡고 '새로 고침' 하나만 보여 준다 */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="route-error" role="alert">
        <p>화면을 불러오지 못했습니다</p>
        <button type="button" className="primary" onClick={() => location.reload()}>새로 고침</button>
      </div>
    )
  }
}

export default function App() {
  const r = useRoute()
  const me = useMe()
  const inShared = r.name === 'shared'
  const [due, setDue] = useState(0)
  const [localTrees, setLocalTrees] = useState<number | null>(null)
  // 화면을 옮길 때마다 다시 센다. 채점(dd:due, 계약 C3)·다른 기기 변경(dd:remote)이 오면 그 자리에서 다시 센다
  useEffect(() => {
    let on = true
    const recount = () => {
      void countDue().then((n) => on && setDue(n))
      void countTrees().then((n) => on && setLocalTrees(n))
    }
    recount()
    addEventListener('dd:due', recount)
    addEventListener('dd:remote', recount)
    return () => { on = false; removeEventListener('dd:due', recount); removeEventListener('dd:remote', recount) }
  }, [r])
  // 모바일 키보드 높이(--kb)는 모든 화면이 받는다(H1). 화면별 호출은 가드로 1회만 동작한다
  useEffect(() => { startViewport() }, [])
  useEffect(() => {
    let on = true
    void titleOf(r).then((t) => { if (on && t) document.title = t })
    return () => { on = false }
  }, [r])
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300))
    idle(() => Object.values(load).forEach((f) => void f()))
  }, [])
  useEffect(() => {
    if (me?.user.role === 'admin') void loadAdmin()
  }, [me])
  return (
    <>
      <nav className="topnav">
        <a className="brand" href={href.trees()} aria-label="Drill Down"><span className="brand-mark" aria-hidden />Drill Down</a>
        {/* 공유 보기에서 비로그인·로컬 트리 0개면 '내 트리'·복습 숨김 (02 §3.1) */}
        {!(inShared && !me && localTrees === 0) && (
          <>
            <a aria-current={r.name === 'trees' ? 'page' : undefined} href={href.trees()}>내 트리</a>
            <a aria-current={r.name === 'review' ? 'page' : undefined} href={href.review()} aria-label={due ? `오늘의 복습 ${due}개` : '오늘의 복습'}>
              <span className="nav-long">오늘의 복습</span><span className="nav-short">복습</span>
              {due > 0 && <span className="badge on nav-due" style={{ marginLeft: ".35rem" }} aria-hidden>{due}</span>}
            </a>
          </>
        )}
        <span className="topnav-spacer" />
        <ThemeToggle />
        {r.name !== 'login' && <NavUser />}
      </nav>
      <Banners />
      <main className={inShared ? 'main-shared' : undefined}>
        <ErrorBoundary>
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          {r.name === 'trees' && <TreeListPage />}
          {r.name === 'edit' && <EditorPage key={r.treeId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'flash' && <FlashPage key={r.treeId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'dnd' && <DndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'blank' && <BlankDndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'review' && <ReviewPage />}
          {r.name === 'login' && <LoginPage e={r.e} returnTo={r.returnTo} />}
          {r.name === 'account' && <AccountPage />}
          {r.name === 'admin' && <AdminPage tab={r.tab} />}
          {r.name === 'gallery' && <GalleryPage />}
          {r.name === 'privacy' && <PrivacyPage />}
          {r.name === 'shared' && <SharedPage key={r.slug} slug={r.slug} mode={r.mode} rootId={r.rootId} />}
        </Suspense>
        </ErrorBoundary>
      </main>
      <Toaster />
      <TooltipLayer />
    </>
  )
}
