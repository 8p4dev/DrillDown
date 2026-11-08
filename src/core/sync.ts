// 동기화 공개 API — 공유 계약 orchestration_server.md §3.5 (CS 소유). 첫 화면 청크에 들어가므로 작게 유지한다.
// push/pull 엔진(sync/engine.ts)은 onLogin 안에서만 동적 import — 비로그인은 엔진을 아예 받지 않는다 (01 §3.8).
import { useSyncExternalStore } from 'react'

export type SyncState =
  | { kind: 'saved' }
  | { kind: 'syncing' }
  | { kind: 'offline'; pending: number }
  | { kind: 'error'; reason: string; pending: number }

/** 첫 로그인 병합 계획 (03 §3.3·04 §3.8 M1~M3). local=0·server=0·otherAccount=null 이면 대화 없음 */
export interface MergePlan { local: number; server: number; otherAccount: string | null }
export type MergeChoice = 'upload' | 'wipe_other' | 'copy_other'

const subs = new Set<() => void>()
let state: SyncState = { kind: 'saved' }
export function useSyncState(): SyncState {
  return useSyncExternalStore((f) => (subs.add(f), () => void subs.delete(f)), () => state)
}
/** 엔진 전용 */
export function setSyncState(next: SyncState) {
  state = next
  subs.forEach((f) => f())
}

type Engine = typeof import('./sync/engine')
let engine: Engine | undefined

/** 로그인 확인(/api/me 200) 때 CA 가 1회 호출 */
export async function onLogin(userId: string): Promise<MergePlan> {
  engine ??= await import('./sync/engine')
  return engine.onLogin(userId)
}
/** 병합 대화 결과 */
export function applyMerge(choice: MergeChoice): Promise<void> {
  return engine ? engine.applyMerge(choice) : Promise.resolve()
}
/** 엔진 정지. 로컬 데이터·outbox·meta.userId 는 유지 (M6) */
export function onLogout(): void {
  engine?.stop()
  setSyncState({ kind: 'saved' })
}
/** 상태 표시 탭(오프라인·오류) → 즉시 재시도 */
export function retrySync(): void {
  void engine?.sync()
}
/** 쌓인 outbox 를 지금 보내고 끝날 때까지 기다린다(공개 범위 API 전). 비로그인은 즉시 끝 */
export function flush(): Promise<void> {
  return engine ? engine.flush() : Promise.resolve()
}
