// 메모리 카운터 — 재시작 이후 5xx 요약(관리자 대시보드). SQLite 에 쓰지 않는다(요청당 fsync 금지, 03 §3.7 로그 규칙: 경로·메서드·오류 이름만, 메시지·IP 금지).
// ponytail: 링버퍼 20건·프로세스 메모리만. 시계열이 필요해지면 daily_stats 스냅샷으로
export interface ErrorRow { ts: number; method: string; path: string; name: string }
const recent: ErrorRow[] = []
let errorCount = 0

export const maskPath = (p: string) => p.replace(/^(\/api)?\/t\/[^/]+/, '$1/t/:slug').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')

export function recordError(e: unknown, method: string, path: string) {
  errorCount++
  recent.unshift({ ts: Date.now(), method, path: maskPath(path), name: (e instanceof Error ? e.name : typeof e).slice(0, 40) })
  if (recent.length > 20) recent.pop()
}
export const errors = () => ({ count: errorCount, recent: [...recent] })

// ---- 이름별 카운터(429 키별·동기화·OAuth 콜백 실패) — 대시보드 "재시작 이후". 사용자별·시계열 집계는 넣지 않는다(w2 §4) ----
const counters = new Map<string, number>()
export const count = (name: string, by = 1) => { if (by) counters.set(name, (counters.get(name) ?? 0) + by) }
export const counts = (): Record<string, number> => Object.fromEntries([...counters].sort(([a], [b]) => a.localeCompare(b)))
export const STARTED_AT = Date.now()

// ---- 클라이언트 오류(POST /api/client-error): 메시지 200자·번들 파일명만, 최근 10건 ----
export interface ClientErrorRow { ts: number; message: string; version: string }
const clientRecent: ClientErrorRow[] = []
let clientCount = 0
export function recordClientError(message: string, version: string) {
  clientCount++
  clientRecent.unshift({ ts: Date.now(), message, version })
  if (clientRecent.length > 10) clientRecent.pop()
}
export const clientErrors = () => ({ count: clientCount, recent: [...clientRecent] })
