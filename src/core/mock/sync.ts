// [mock] 동기화 상태 스토어 — 공유 계약 orchestration_ui_first.md §3.4 (SH 소유). 상태 집합은 04 §3.10.
// 서버 구현 때 src/core/sync.ts 가 같은 useSyncState 를 내보낸다.
import { useSyncExternalStore } from 'react'

export type SyncState =
  | { kind: 'saved' }
  | { kind: 'syncing' }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; reason: string; pending: number }

const subs = new Set<() => void>()
let state: SyncState = { kind: 'saved' }

export function useSyncState(): SyncState {
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)
}
export function setSyncState(next: SyncState) {
  state = next
  subs.forEach((f) => f())
}
/** 오프라인 표시를 탭했을 때(재시도) — mock 은 동기화 중 1초 뒤 저장됨으로 */
export function retrySync() {
  setSyncState({ kind: 'syncing' })
  setTimeout(() => setSyncState({ kind: 'saved' }), 1000)
}
