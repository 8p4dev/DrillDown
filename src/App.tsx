// 앱 셸 — 오케스트레이터 소유 (orchestration_ui_first.md §3.1). 상단 바 배치는 02 §3.1: [■(+이름 ≥421)] 내 트리  복습•n … [테마] [아바타/로그인]
import { lazy, Suspense, useEffect } from 'react'
import { href, useRoute } from './router'
import { Toaster } from './features/Toast'
import { TooltipLayer } from './ui/Tooltip'
import ThemeToggle from './ui/ThemeToggle'
import NavUser from './features/account/NavUser'
import Banners from './features/account/Banners'
import { useMe } from './core/me'

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

export default function App() {
  const r = useRoute()
  const me = useMe()
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300))
    idle(() => Object.values(load).forEach((f) => void f()))
  }, [])
  useEffect(() => {
    if (me?.user.role === 'admin') void loadAdmin()
  }, [me])
  const inShared = r.name === 'shared'
  return (
    <>
      <nav className="topnav">
        <a className="brand" href={href.trees()} aria-label="Drill Down"><span className="brand-mark" aria-hidden />Drill Down</a>
        {/* 공유 보기(비로그인·로컬 트리 0개)에서 '내 트리' 숨김은 LM/SH 가 조건을 넣는다 */}
        <a className={r.name === 'trees' ? 'active' : undefined} href={href.trees()}>내 트리</a>
        <a className={r.name === 'review' ? 'active' : undefined} href={href.review()}>
          <span className="nav-long">오늘의 복습</span><span className="nav-short">복습</span>
        </a>
        <span className="topnav-spacer" />
        <ThemeToggle />
        {r.name !== 'login' && <NavUser />}
      </nav>
      <Banners />
      <main className={inShared ? 'main-shared' : undefined}>
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          {r.name === 'trees' && <TreeListPage />}
          {r.name === 'edit' && <EditorPage treeId={r.treeId} />}
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
      </main>
      <Toaster />
      <TooltipLayer />
    </>
  )
}
