// 세션 쿠키·세션 테이블 (03 §3.2 "세션 쿠키", flows.md §2). DB 에는 sha256(sid) 만.
import { createHash, randomBytes } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { DB } from '../db.ts'
import { env } from '../env.ts'
import { DAY, type AppEnv } from '../http.ts'

const SLIDE = 30 * DAY
const RENEW_BELOW = 15 * DAY
export const ABS_USER = 180 * DAY
export const ABS_ADMIN = DAY

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const rand = (n = 32) => randomBytes(n).toString('base64url')

const sidCookie = (c: Context, sid: string, maxAgeMs: number) =>
  setCookie(c, 'sid', sid, { httpOnly: true, sameSite: 'Lax', path: '/', secure: env.secure, maxAge: Math.max(0, Math.floor(maxAgeMs / 1000)) })
export const clearSid = (c: Context) => deleteCookie(c, 'sid', { path: '/', secure: env.secure })

/** 'Chrome · Android' 수준 2단어 축약 — 원문 UA 는 저장하지 않는다(03 §3.7) */
export function shortUa(ua = ''): string {
  const b = /KAKAOTALK/i.test(ua) ? 'KakaoTalk' : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '브라우저'
  const o = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : '기타'
  return `${b} · ${o}`
}

/** 로그인 성공 시 항상 새 세션(고정 공격 방지). 쿠키까지 굽는다 */
export function createSession(c: Context, db: DB, userId: string, role: 'user' | 'admin', now: number) {
  const sid = rand()
  const exp = now + Math.min(SLIDE, role === 'admin' ? ABS_ADMIN : ABS_USER)
  db.prepare('INSERT INTO sessions(id,user_id,created_at,expires_at,last_seen_at,ua) VALUES(?,?,?,?,?,?)')
    .run(sha256(sid), userId, now, exp, now, shortUa(c.req.header('user-agent')))
  sidCookie(c, sid, exp - now)
}

type Row = { id: string; user_id: string; created_at: number; expires_at: number; last_seen_at: number; role: 'user' | 'admin'; nickname: string; suspended_at: number | null; deleted_at: number | null }

/** 쿠키 sid → sessions·users 조회 → c.set('user'). 만료·절대 상한·정지·탈퇴면 무효 + 쿠키 삭제 */
export const sessionMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const sid = getCookie(c, 'sid')
  if (sid) {
    const db = c.get('db')
    const now = Date.now()
    const r = db.prepare(`SELECT s.id, s.user_id, s.created_at, s.expires_at, s.last_seen_at, u.role, u.nickname, u.suspended_at, u.deleted_at
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`).get(sha256(sid)) as Row | undefined
    const abs = r ? r.created_at + (r.role === 'admin' ? ABS_ADMIN : ABS_USER) : 0
    if (!r || r.expires_at <= now || abs <= now || r.suspended_at || r.deleted_at) {
      if (r) db.prepare('DELETE FROM sessions WHERE id = ?').run(r.id)
      clearSid(c)
    } else {
      if (r.expires_at - now < RENEW_BELOW) {
        const exp = Math.min(now + SLIDE, abs)
        if (exp > r.expires_at) {
          db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(exp, r.id)
          sidCookie(c, sid, exp - now)
        }
      }
      if (now - r.last_seen_at >= 60_000) {
        db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now, r.id)
        db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(now, r.user_id)
      }
      c.set('user', { id: r.user_id, role: r.role, nickname: r.nickname, sessionId: r.id })
    }
  }
  await next()
}
