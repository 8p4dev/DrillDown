// [mock] 동기화 상태 스토어 — 공유 계약 orchestration_ui_first.md §3.4 (SH 소유). 상태 집합은 04 §3.10.
// 서버 구현 때 src/core/sync.ts 가 같은 useSyncState 를 내보낸다.
import { useSyncExternalStore } from 'react'
import { getMe } from '../me'

export type SyncState =
  | { kind: 'saved' }
  | { kind: 'syncing' }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; reason: string; pending: number }

const subs = new Set<() => void>()
let state: SyncState = { kind: 'saved' }
let pending = 0
let timer: ReturnType<typeof setTimeout> | undefined

export function useSyncState(): SyncState {
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)
}
export function setSyncState(next: SyncState) {
  state = next
  subs.forEach((f) => f())
}
/** 동기화 중 → ms 뒤 저장됨 (mock: 실제 push 없음) */
function settle(ms: number) {
  clearTimeout(timer)
  setSyncState({ kind: 'syncing' })
  timer = setTimeout(() => {
    pending = 0
    setSyncState({ kind: 'saved' })
  }, ms)
}
/** 오프라인 표시를 탭했을 때(재시도) — mock 은 동기화 중 1초 뒤 저장됨으로 */
export function retrySync() {
  settle(1000)
}
/** repo 의 쓰기 함수가 끝에 호출. 비로그인은 무시, 오프라인이면 대기 건수만 올린다 */
export function bump() {
  if (!getMe()) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    pending += 1
    setSyncState({ kind: 'offline', pending })
    return
  }
  settle(800)
}
if (typeof addEventListener === 'function') {
  addEventListener('offline', () => getMe() && setSyncState({ kind: 'offline', pending }))
  addEventListener('online', () => getMe() && settle(1000))
}
