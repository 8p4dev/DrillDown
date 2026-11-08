// 계정·인증·관리자 서버 모듈. 계약: orchestration_server.md §3.6 · 03 §3.2~§3.8
import type { Hono, MiddlewareHandler } from 'hono'
import { fail, type AppEnv } from '../http.ts'
import { getSettings, registerAdmin } from './admin.ts'
import { registerMe } from './me.ts'
import { registerOAuth } from './oauth.ts'

export { sessionMiddleware } from './session.ts'

/** settings.maintenance 가 켜져 있으면 /api/* 503 maintenance + Retry-After (관리자·GET /api/me·/api/auth/*·/api/health 제외) */
export const maintenanceMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const p = c.req.path
  const exempt = c.get('user')?.role === 'admin' || p === '/api/me' || p === '/api/health' || p.startsWith('/api/auth/')
  if (!exempt && getSettings(c.get('db')).maintenance.enabled) {
    c.header('Retry-After', '300')
    fail(503, 'maintenance', '점검 중입니다. 잠시 뒤 다시 시도해 주세요')
  }
  await next()
}

/** /api/auth/* /api/me* /api/admin/* /api/t/:slug/report */
export function registerAccount(app: Hono<AppEnv>) {
  registerOAuth(app)
  registerMe(app)
  registerAdmin(app)
}
