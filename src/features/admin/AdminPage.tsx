// 관리자 #/admin — 03 §3.4 화면 표·권한, 02 §3.1 관리자 와이어(PC 표 + sticky 헤더, ≤760 카드), 01 §3.5 관리자 행·§3.6 #22.
// 탭마다 파일 하나(Dashboard·UsersTab·TreesTab·RequestsTab·MetricsTab·FeedbackTab·SystemTab), 공용은 shared.tsx. 데이터는 전부 /api/admin/*(03 §3.6).
// 비관리자·API 404 는 #/ 로. 입력칸 클래스는 .admin-search — 에디터의 전역 .search{position:absolute} 와 겹치면 안 된다(w1_gap.md B1).
import { useEffect } from 'react'
import { useMe, useMeReady } from '../../core/me'
import { href, type AdminTab } from '../../router'
import Dashboard from './Dashboard'
import FeedbackTab from './FeedbackTab'
import MetricsTab from './MetricsTab'
import RequestsTab from './RequestsTab'
import SystemTab from './SystemTab'
import TreesTab from './TreesTab'
import UsersTab from './UsersTab'
import './admin.css'

const TABS: [AdminTab, string][] = [['dashboard', '대시보드'], ['users', '사용자'], ['trees', '공개 트리'], ['requests', '요청'], ['metrics', '지표'], ['feedback', '피드백'], ['system', '시스템']]

export default function AdminPage({ tab }: { tab: AdminTab }) {
  const me = useMe()
  const ready = useMeReady()
  const ok = me?.user.role === 'admin'
  useEffect(() => { if (ready && !ok) location.hash = href.trees() }, [ready, ok])
  if (!ok) return null
  return (
    <section className="admin" data-tab={tab}>
      <header className="admin-head">
        <h1>관리자</h1>
        <nav className="seg admin-tabs" aria-label="관리자 탭">
          {TABS.map(([t, label]) => <a key={t} href={href.admin(t)} aria-current={t === tab ? 'page' : undefined}>{label}</a>)}
        </nav>
      </header>
      {tab === 'dashboard' && <Dashboard />}
      {tab === 'users' && <UsersTab meId={me.user.id} />}
      {tab === 'trees' && <TreesTab />}
      {tab === 'requests' && <RequestsTab />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'feedback' && <FeedbackTab />}
      {tab === 'system' && <SystemTab />}
    </section>
  )
}
