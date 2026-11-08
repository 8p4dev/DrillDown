// [스텁 — SH 가 교체] 동기화 상태 표시(목록 헤더 h1 오른쪽, 02 §3.1 "동기화 상태 자리"). 상태 집합 04 §3.10, 모양 01 §3.6 #17.
// 비로그인이면 null 을 돌려준다. 호출: TreeListPage(LM) <SyncStatus />
import { useMe } from '../../core/mock/me'
import { useSyncState } from '../../core/mock/sync'

export default function SyncStatus() {
  const me = useMe()
  const s = useSyncState()
  if (!me) return null
  return <span className="sync-status" data-kind={s.kind} aria-label="동기화 상태">{s.kind}</span>
}
