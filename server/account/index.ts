// [스텁 — SA 가 교체] 계정·인증·관리자 서버 모듈. 계약: orchestration_server.md §3.6 · 03 §3.2~§3.8
import type { Hono, MiddlewareHandler } from 'hono'
import type { AppEnv } from '../http.ts'

/** 쿠키 sid → sessions 조회 → c.set('user'). 슬라이딩 연장 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (_c, next) => { await next() }
/** settings.maintenance 가 켜져 있으면 /api/* 503 maintenance + Retry-After (관리자·/api/me·/api/auth/* 제외) */
export const maintenanceMiddleware: MiddlewareHandler<AppEnv> = async (_c, next) => { await next() }

/** /api/auth/* /api/me* /api/admin/* /api/t/:slug/report */
export function registerAccount(_app: Hono<AppEnv>) {}
