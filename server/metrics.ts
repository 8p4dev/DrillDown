// 메모리 카운터 — 재시작 이후 5xx 요약(관리자 대시보드). SQLite 에 쓰지 않는다(요청당 fsync 금지, 03 §3.7 로그 규칙: 경로·메서드·오류 이름만, 메시지·IP 금지).
// ponytail: 링버퍼 20건·프로세스 메모리만. 시계열이 필요해지면 daily_stats 스냅샷으로
export interface ErrorRow { ts: number; method: string; path: string; name: string }
const recent: ErrorRow[] = []
let count = 0

export const maskPath = (p: string) => p.replace(/^(\/api)?\/t\/[^/]+/, '$1/t/:slug').replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')

export function recordError(e: unknown, method: string, path: string) {
  count++
  recent.unshift({ ts: Date.now(), method, path: maskPath(path), name: (e instanceof Error ? e.name : typeof e).slice(0, 40) })
  if (recent.length > 20) recent.pop()
}
export const errors = () => ({ count, recent: [...recent] })
