// 공용 HTTP 헬퍼 — 오케스트레이터 소유 (orchestration_server.md §3.3). 모든 라우트 모듈이 import 한다.
// 에러 봉투 { error: { code, message, field? } } snake_case (00 §4), 메모리 토큰 버킷 레이트 리밋(03 §3.6), 인증 가드.
import type { Context, MiddlewareHandler } from 'hono'
import type { DB } from './db.ts'
import { count } from './metrics.ts'

/** 세션 미들웨어(SA)가 c.set('user') 로 넣는 값. 없으면 null(anon) */
export interface SessionUser {
  id: string
  role: 'user' | 'admin'
  nickname: string
  /** sessions.id (sha256 hex) — 로그아웃·기기 목록용 */
  sessionId: string
}

export type AppEnv = { Variables: { user: SessionUser | null; db: DB } }

export class HttpError extends Error {
  status: number
  code: string
  field?: string
  constructor(status: number, code: string, message: string, field?: string) {
    super(message)
    this.status = status
    this.code = code
    this.field = field
  }
}

/** 핸들러 안에서 throw 하면 index.ts 의 onError 가 봉투로 바꾼다 */
export const fail = (status: number, code: string, message: string, field?: string): never => {
  throw new HttpError(status, code, message, field)
}

export const errorBody = (code: string, message: string, field?: string) => ({ error: field ? { code, message, field } : { code, message } })

/** 로그인 필요. 관리자 경로는 존재를 숨기려 404 (03 §3.4) */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) fail(401, 'unauthorized', '로그인이 필요합니다')
  await next()
}
export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.get('user')?.role !== 'admin') fail(404, 'not_found', '없는 경로입니다')
  await next()
}

/** 클라이언트 IP — Tunnel 뒤라 CF-Connecting-IP 만 신뢰(XFF 는 직접 접속 경로에서 위조돼 레이트 리밋을 무력화한다, s1 M1). 저장·로그 금지(03 §3.7) */
// 터널 뒤에서만 신뢰할 수 있다(Cloudflare 가 덮어씀). 서버에 직접 닿는 경로(루프백 바인딩이면 없음)에서는 위조 가능 — 운영 전제(v1 #3, 수용)
export const clientIp = (c: Context) => c.req.header('cf-connecting-ip') ?? 'local'

// ---- 레이트 리밋: 메모리 고정 창. 재시작하면 초기화(허용, 03 §3.6) ----
// ponytail: 고정 창 카운터(토큰 버킷 대신). 창 경계에서 2배까지 허용 — 남용 억제 목적엔 충분
const buckets = new Map<string, { n: number; reset: number }>()
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k) }, 60_000).unref()

/** key 별 windowMs 동안 max 회. 초과면 429 rate_limited + Retry-After */
export function hit(c: Context, key: string, max: number, windowMs: number) {
  const now = Date.now()
  let b = buckets.get(key)
  if (!b || b.reset < now) buckets.set(key, (b = { n: 0, reset: now + windowMs }))
  if (++b.n > max) {
    count(`429:${key.split(':')[0]}`) // 키 이름별 429 (관리자 대시보드, 메모리만)
    c.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)))
    fail(429, 'rate_limited', '요청이 너무 많습니다. 잠시 뒤 다시 시도해 주세요')
  }
}
/** 미들웨어형: 사용자 id(로그인) 또는 IP 단위 */
export const limit = (name: string, max: number, windowMs: number): MiddlewareHandler<AppEnv> => async (c, next) => {
  hit(c, `${name}:${c.get('user')?.id ?? clientIp(c)}`, max, windowMs)
  await next()
}

/** JSON 본문 읽기(크기 상한). 잘못된 JSON 은 400 invalid */
export async function body<T>(c: Context, maxBytes = 16 * 1024): Promise<T> {
  const text = await c.req.text()
  if (text.length > maxBytes) fail(400, 'payload_too_large', '요청이 너무 큽니다')
  try {
    return (text ? JSON.parse(text) : {}) as T
  } catch {
    return fail(400, 'invalid', 'JSON 형식이 아닙니다')
  }
}

/** 제어문자 금지 검증 (03 §3.6 입력 검증). 제목·별칭·닉네임·사유 공통 */
// oxlint-disable-next-line no-control-regex
export const CTRL = /[\u0000-\u001f\u007f-\u009f]/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const DAY = 86_400_000
/** 유예·톰스톤·커서 만료 공통 7일 (00 §4, D16) */
export const GRACE_MS = 7 * DAY
