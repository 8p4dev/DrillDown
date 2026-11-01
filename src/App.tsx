import { href, useRoute } from './router'
import TreeListPage from './features/editor/TreeListPage'
import EditorPage from './features/editor/EditorPage'
import FlashPage from './features/flash/FlashPage'
import ReviewPage from './features/flash/ReviewPage'
import DndPage from './features/dnd/DndPage'
import BlankDndPage from './features/dnd/BlankDndPage'
import { Toaster } from './features/Toast'

export default function App() {
  const r = useRoute()
  return (
    <>
      <nav className="topnav">
        <a className="brand" href={href.trees()}>Drill Down</a>
        <a className={r.name === 'trees' ? 'active' : undefined} href={href.trees()}>내 트리</a>
        <a className={r.name === 'review' ? 'active' : undefined} href={href.review()}>오늘의 복습</a>
      </nav>
      <main>
        {r.name === 'trees' && <TreeListPage />}
        {r.name === 'edit' && <EditorPage treeId={r.treeId} />}
        {r.name === 'flash' && <FlashPage key={r.treeId} treeId={r.treeId} rootId={r.rootId} />}
        {r.name === 'dnd' && <DndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
        {r.name === 'blank' && <BlankDndPage key={r.treeId + r.rootId} treeId={r.treeId} rootId={r.rootId} />}
        {r.name === 'review' && <ReviewPage />}
      </main>
      <Toaster />
    </>
  )
}
