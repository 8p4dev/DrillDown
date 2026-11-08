// 앱 셸 — 오케스트레이터 소유 (orchestration_ui_first.md §3.1). 상단 바 배치는 02 §3.1: [■(+이름 ≥421)] 내 트리  복습•n … [테마] [아바타/로그인]
import { lazy, Suspense, useEffect, useState } from 'react'
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

/** 오늘 끝까지 due 인 노드 수(삭제 표시된 트리 제외) — 상단 바 복습 배지(02 §3.1). Dexie 는 동적 import 로(ts-fsrs 를 첫 청크에 넣지 않게) */
async function countDue(): Promise<number> {
  const [{ db }, { listTrees }] = await Promise.all([import('./core/db'), import('./core/repo')])
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  const live = new Set((await listTrees()).map((t) => t.id))
  return (await db.srs.where('due').belowOrEqual(+end).toArray()).filter((s) => live.has(s.treeId)).length
}
async function countTrees(): Promise<number> {
  const { listTrees } = await import('./core/repo')
  return (await listTrees()).length
}

export default function App() {
  const r = useRoute()
  const me = useMe()
  const inShared = r.name === 'shared'
  const [due, setDue] = useState(0)
  const [localTrees, setLocalTrees] = useState<number | null>(null)
  // 화면을 옮길 때마다 다시 센다(평가·채점 뒤 복습 화면으로 오면 바로 맞는다)
  useEffect(() => {
    let on = true
    void countDue().then((n) => on && setDue(n))
    void countTrees().then((n) => on && setLocalTrees(n))
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
            <a className={r.name === 'trees' ? 'active' : undefined} href={href.trees()}>내 트리</a>
            <a className={r.name === 'review' ? 'active' : undefined} href={href.review()} aria-label={due ? `오늘의 복습 ${due}개` : '오늘의 복습'}>
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
