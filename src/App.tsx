import { href, useRoute } from './router'
import TreeListPage from './features/editor/TreeListPage'
import EditorPage from './features/editor/EditorPage'
import StudyPage from './features/study/StudyPage'
import QuizPage from './features/study/QuizPage'
import ReviewPage from './features/study/ReviewPage'

export default function App() {
  const r = useRoute()
  return (
    <>
      <nav className="topnav">
        <a href={href.trees()}>Drill Down</a>
        <a href={href.review()}>오늘의 복습</a>
      </nav>
      <main>
        {r.name === 'trees' && <TreeListPage />}
        {r.name === 'edit' && <EditorPage treeId={r.treeId} />}
        {r.name === 'study' && <StudyPage treeId={r.treeId} />}
        {r.name === 'quiz' && <QuizPage treeId={r.treeId} rootId={r.rootId} />}
        {r.name === 'review' && <ReviewPage />}
      </main>
    </>
  )
}
