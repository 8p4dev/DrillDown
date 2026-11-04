import { lazy, Suspense, useEffect } from 'react'
import { href, useRoute } from './router'
import { Toaster } from './features/Toast'
import { currentLook, LOOKS, setLook } from './looks/look'

// 화면별 코드 분할: 첫 화면만 받고, 나머지는 유휴 시간에 미리 받는다 (docs/plans/orchestration_visual_polish.md V0-9)
const load = {
  trees: () => import('./features/editor/TreeListPage'),
  edit: () => import('./features/editor/EditorPage'),
  flash: () => import('./features/flash/FlashPage'),
  review: () => import('./features/flash/ReviewPage'),
  dnd: () => import('./features/dnd/DndPage'),
  blank: () => import('./features/dnd/BlankDndPage'),
}
const TreeListPage = lazy(load.trees)
const EditorPage = lazy(load.edit)
const FlashPage = lazy(load.flash)
const ReviewPage = lazy(load.review)
const DndPage = lazy(load.dnd)
const BlankDndPage = lazy(load.blank)

export default function App() {
  const r = useRoute()
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 300))
    idle(() => Object.values(load).forEach((f) => void f()))
  }, [])
  return (
    <>
      <nav className="topnav">
        <a className="brand" href={href.trees()} aria-label="Drill Down">Drill Down</a>
        <a className={r.name === 'trees' ? 'active' : undefined} href={href.trees()}>내 트리</a>
        <a className={r.name === 'review' ? 'active' : undefined} href={href.review()}>오늘의 복습</a>
        <select className="look-picker" aria-label="디자인 시안" defaultValue={currentLook()} onChange={(e) => setLook(e.target.value)}>
          {Object.entries(LOOKS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </nav>
      <main>
        <Suspense fallback={<div className="route-loading" aria-busy="true" />}>
          {r.name === 'trees' && <TreeListPage />}
          {r.name === 'edit' && <EditorPage treeId={r.treeId} />}
          {r.name === 'flash' && <FlashPage key={r.treeId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'dnd' && <DndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'blank' && <BlankDndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
          {r.name === 'review' && <ReviewPage />}
        </Suspense>
      </main>
      <Toaster />
    </>
  )
}
