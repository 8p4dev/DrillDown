// OAuth 로그인 (03 §3.2, flows.md §1): Authorization Code + PKCE S256 + state(oauth 쿠키) + userinfo. 리프레시 토큰 저장 안 함.
// 가짜 로그인(plan A1)도 같은 signIn 으로 끝난다.
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Context, Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { tx } from '../db.ts'
import { env } from '../env.ts'
import { fail, GRACE_MS, hit, clientIp, type AppEnv } from '../http.ts'
import { purgeUser, restoreTreesOfUser } from '../sync/owner.ts'
import { audit, CTRL } from './admin.ts'
import { createSession, rand } from './session.ts'

export type OAuthProvider = 'google' | 'kakao'
const P = {
  google: { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', userinfo: 'https://openidconnect.googleapis.com/v1/userinfo', scope: 'openid profile', cred: () => env.google },
  kakao: { auth: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token', userinfo: 'https://kapi.kakao.com/v1/oidc/userinfo', scope: 'openid profile_nickname profile_image', cred: () => env.kakao },
}
const redirectUri = (p: OAuthProvider) => `${env.origin}/api/auth/${p}/callback`
const enabled = (p: string): p is OAuthProvider => (p === 'google' || p === 'kakao') && !!P[p].cred().id

/** return_to 는 '#/' 접두 해시만(오픈 리디렉트 차단) */
export const safeReturn = (r: unknown) => typeof r === 'string' && r.startsWith('#/') && r.length <= 200 && !/[\s\\]/.test(r) && !CTRL.test(r) ? r : '#/'
/** 제공자 이름 → 닉네임 초기값: 제어문자 제거·앞뒤 공백·20자 */
const cleanName = (s: unknown) => typeof s === 'string' ? Array.from(s.replace(new RegExp(CTRL.source, 'g'), '').trim()).slice(0, 20).join('').trim() : ''
const safeUrl = (s: unknown) => typeof s === 'string' && s.startsWith('https://') && s.length <= 500 ? s : null

// ---- 토큰 교환·userinfo: fetch 주입형 순수 함수(A2, check 가 가짜 응답으로 검증) ----
export async function exchangeCode(p: OAuthProvider, code: string, verifier: string, f: typeof fetch = fetch): Promise<string> {
  const { id, secret } = P[p].cred()
  const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(p), client_id: id, code_verifier: verifier })
  if (secret) form.set('client_secret', secret)
  const r = await f(P[p].token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form, signal: AbortSignal.timeout(10_000) })
  const j = (await r.json().catch(() => null)) as { access_token?: unknown } | null
  if (!r.ok || typeof j?.access_token !== 'string') throw new Error('token_exchange')
  return j.access_token
}
export async function fetchProfile(p: OAuthProvider, token: string, f: typeof fetch = fetch): Promise<{ sub: string; name: string; picture: string | null }> {
  const r = await f(P[p].userinfo, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) })
  const j = (await r.json().catch(() => null)) as { sub?: unknown; name?: unknown; nickname?: unknown; picture?: unknown } | null
  if (!r.ok || (typeof j?.sub !== 'string' && typeof j?.sub !== 'number')) throw new Error('userinfo')
  return { sub: String(j.sub), name: cleanName(j.name ?? j.nickname), picture: safeUrl(j.picture) }
}
let oauthFetch: typeof fetch = fetch
/** check 전용: 콜백 전체 흐름에 가짜 fetch 주입 */
export const setOAuthFetch = (f: typeof fetch) => { oauthFetch = f }

function isListedAdmin(p: string, sub: string) {
  try {
    const list = JSON.parse(readFileSync(env.adminsFile, 'utf8')) as unknown
    return Array.isArray(list) && list.includes(`${p}:${sub}`)
  } catch {
    return false
  }
}

type UserRow = { id: string; use_provider_avatar: number; avatar_url: string | null; suspended_at: number | null; deleted_at: number | null }

/** 로그인 완료 공통: UPSERT·역할 동기화·탈퇴 취소·새 세션 → return_to 로 302 */
export function signIn(c: Context<AppEnv>, a: { provider: OAuthProvider | 'fake'; sub: string; name: string; picture: string | null; role?: 'user' | 'admin'; returnTo: string }) {
  const db = c.get('db')
  const now = Date.now()
  const find = () => db.prepare('SELECT id, use_provider_avatar, avatar_url, suspended_at, deleted_at FROM users WHERE provider = ? AND provider_sub = ?').get(a.provider, a.sub) as UserRow | undefined
  let u = find()
  if (u?.suspended_at) {
    // 정지 사유를 당사자에게(03 §3.6 e=suspended + r). 세션이 없으니 리디렉션 쿼리로만 전달할 수 있다
    const m = db.prepare("SELECT meta FROM audit_log WHERE action = 'user.suspend' AND target_id = ? ORDER BY id DESC LIMIT 1").get(u.id) as { meta: string | null } | undefined
    const reason = m?.meta ? (JSON.parse(m.meta) as { reason?: string }).reason : undefined
    return c.redirect(`/#/login?e=suspended${reason ? `&r=${encodeURIComponent(reason)}` : ''}`)
  }
  // 유예 7일이 지났는데 일일 작업이 아직이면 지금 purge 하고 새 사용자로
  if (u?.deleted_at && now - u.deleted_at >= GRACE_MS) {
    const id = u.id
    tx(db, () => { purgeUser(db, id); db.prepare('DELETE FROM users WHERE id = ?').run(id); audit(db, null, 'user.purge', 'user', id) })
    u = undefined
  }
  const role = a.role ?? (isListedAdmin(a.provider, a.sub) ? 'admin' : 'user')
  const id = tx(db, () => {
    if (!u) {
      const id = randomUUID()
      db.prepare('INSERT INTO users(id,provider,provider_sub,nickname,avatar_url,use_provider_avatar,role,created_at,last_seen_at) VALUES(?,?,?,?,NULL,0,?,?,?)')
        .run(id, a.provider, a.sub, a.name || `사용자-${id.slice(0, 4)}`, role, now, now)
      return id
    }
    db.prepare('UPDATE users SET last_seen_at = ?, role = ?, avatar_url = ?, deleted_at = NULL WHERE id = ?')
      .run(now, role, u.use_provider_avatar ? a.picture : u.avatar_url, u.id)
    if (u.deleted_at) audit(db, u.id, 'user.restore', 'user', u.id, { trees: restoreTreesOfUser(db, u.id, u.deleted_at) })
    return u.id
  })
  if (role === 'admin') audit(db, id, 'admin.login', 'user', id)
  const old = c.get('user')
  if (old) db.prepare('DELETE FROM sessions WHERE id = ?').run(old.sessionId)
  createSession(c, db, id, role, now)
  return c.redirect('/' + a.returnTo)
}

type OAuthCookie = { s: string; v: string; r: string; p: string; t: number }
const OAUTH_COOKIE = { path: '/api/auth', httpOnly: true, sameSite: 'Lax' as const }
const eq = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function registerOAuth(app: Hono<AppEnv>) {
  // 10/분/IP: 실제 OAuth 왕복만(providers·fake 는 일반 리밋, plan "변경 사항")
  const authLimit = (c: Context) => hit(c, `auth:${clientIp(c)}`, 10, 60_000)

  app.get('/api/auth/providers', (c) => c.json({ google: !!env.google.id, kakao: !!env.kakao.id, fake: env.authFake, privacy_contact: env.privacyContact }))

  app.get('/api/auth/fake/start', (c) => {
    if (!env.authFake) fail(404, 'not_found', '없는 경로입니다')
    const as = c.req.query('as') === 'admin' ? 'admin' : 'user'
    const name = cleanName(c.req.query('name'))
    return signIn(c, { provider: 'fake', sub: `fake-${name || as}`, name, picture: null, role: as, returnTo: safeReturn(c.req.query('return_to')) })
  })

  app.get('/api/auth/:provider/start', (c) => {
    const p = c.req.param('provider')
    if (!enabled(p)) return fail(404, 'not_found', '없는 경로입니다')
    authLimit(c)
    const s = rand(), v = rand()
    const val: OAuthCookie = { s, v, r: safeReturn(c.req.query('return_to')), p, t: Date.now() }
    setCookie(c, 'oauth', Buffer.from(JSON.stringify(val)).toString('base64url'), { ...OAUTH_COOKIE, secure: env.secure, maxAge: 600 })
    const q = new URLSearchParams({
      client_id: P[p].cred().id, redirect_uri: redirectUri(p), response_type: 'code', scope: P[p].scope, state: s,
      code_challenge: createHash('sha256').update(v).digest('base64url'), code_challenge_method: 'S256',
    })
    return c.redirect(`${P[p].auth}?${q}`)
  })

  app.get('/api/auth/:provider/callback', async (c) => {
    const p = c.req.param('provider')
    if (!enabled(p)) return fail(404, 'not_found', '없는 경로입니다')
    authLimit(c)
    const raw = getCookie(c, 'oauth')
    deleteCookie(c, 'oauth', { path: '/api/auth', secure: env.secure })
    if (c.req.query('error')) return c.redirect('/#/login?e=denied')
    let ck: OAuthCookie | null = null
    try { ck = raw ? (JSON.parse(Buffer.from(raw, 'base64url').toString()) as OAuthCookie) : null } catch { /* 깨진 쿠키 = 불일치 */ }
    const state = c.req.query('state') ?? '', code = c.req.query('code') ?? ''
    if (!ck || ck.p !== p || typeof ck.s !== 'string' || !eq(ck.s, state) || !code || !(Date.now() - ck.t < 600_000)) {
      console.warn('oauth_state_mismatch')
      return c.redirect('/#/login?e=state')
    }
    let prof
    try {
      prof = await fetchProfile(p, await exchangeCode(p, code, ck.v, oauthFetch), oauthFetch)
    } catch (e) {
      console.warn(`oauth_${(e as Error).message === 'userinfo' ? 'userinfo' : 'token'}_failed`)
      return c.redirect('/#/login?e=state')
    }
    return signIn(c, { provider: p, ...prof, returnTo: safeReturn(ck.r) })
  })
}
