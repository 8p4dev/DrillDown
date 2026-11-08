// 동기화 상태 표시(목록 헤더 h1 오른쪽, 02 §3.1 "동기화 상태 자리"). 상태 집합 04 §3.10, 모양 01 §3.6 #17.
// 비로그인이면 null. 호출: TreeListPage(LM) <SyncStatus />. 상태는 core/sync.ts(엔진이 갱신).
import { useMe } from '../../core/me'
import { retrySync, useSyncState } from '../../core/sync'
import { Icon } from '../../ui/Icon'
import { I } from '../../ui/icons'
import { toast } from '../Toast'
import './share-list.css'

export default function SyncStatus() {
  const me = useMe()
  const s = useSyncState()
  if (!me) return null
  if (s.kind === 'saved')
    return <span key="saved" className="sync-status" data-kind="saved" role="img" aria-label="저장됨" data-tip="저장됨"><Icon d={I.check} /></span>
  if (s.kind === 'syncing')
    return <span key="syncing" className="sync-status" data-kind="syncing" role="img" aria-label="동기화 중" data-tip="동기화 중"><Icon d={I.refreshCw} className="spin" /></span>
  if (s.kind === 'offline')
    return (
      <button key="offline" type="button" className="sync-status ghost" data-kind="offline" aria-label={`오프라인 · ${s.pending}건 대기 · 재시도`} data-tip="재시도" onClick={retrySync}>
        <Icon d={I.cloudOff} /><span>{s.pending}건 대기</span>
      </button>
    )
  return (
    <button key="error" type="button" className="sync-status ghost" data-kind="error" aria-label="동기화 오류" data-tip="오류 사유" onClick={() => toast(s.reason)}>
      <Icon d={I.circleAlert} />
    </button>
  )
}
