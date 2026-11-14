// /api/me* · 로그아웃 · 카카오 연결 끊기 웹훅 (03 §3.3·§3.6, flows.md §3·§4)
import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { Me, Session, User } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { env } from '../env.ts'
import { body, clientIp, fail, hit, limit, requireUser, type AppEnv } from '../http.ts'
import { audit, CTRL, getSettings, purgeUserNow, softDeleteUser } from './admin.ts'
import { clearSid } from './session.ts'

const userOf = (db: DB, id: string): User => {
  const u = db.prepare('SELECT id, provider, nickname, avatar_url, use_provider_avatar, role, created_at FROM users WHERE id = ?').get(id) as unknown as Omit<User, 'use_provider_avatar'> & { use_provider_avatar: number }
  return { ...u, use_provider_avatar: !!u.use_provider_avatar }
}

/** 운영 숨김 당사자에게 사유·소명 상태를 전달(저작권법 §103 ②·망법 §44조의2 ② 통지). 사유는 가장 최근 tree.hide 감사 메모 */
function hiddenTreesOf(db: DB, ownerId: string): Me['hidden_trees'] {
  const rows = db.prepare('SELECT id, title, hidden_by_admin_at FROM trees WHERE owner_id = ? AND deleted_at IS NULL AND hidden_by_admin_at IS NOT NULL').all(ownerId) as { id: string; title: string; hidden_by_admin_at: number }[]
  const why = db.prepare("SELECT meta FROM audit_log WHERE action = 'tree.hide' AND target_id = ? ORDER BY id DESC LIMIT 1")
  const open = db.prepare('SELECT created_at FROM appeals WHERE tree_id = ? AND resolved_at IS NULL ORDER BY created_at DESC LIMIT 1')
  return rows.map((t) => {
    const m = (why.get(t.id) as { meta: string | null } | undefined)?.meta
    return { id: t.id, title: t.title, at: t.hidden_by_admin_at, reason: m ? ((JSON.parse(m) as { reason?: string }).reason ?? null) : null,
      appealed_at: (open.get(t.id) as { created_at: number } | undefined)?.created_at ?? null }
  })
}

export function registerMe(app: Hono<AppEnv>) {
  const uid = (c: Context<AppEnv>) => c.get('user')!.id

  app.post('/api/auth/logout', (c) => {
    hit(c, `auth:${clientIp(c)}`, 10, 60_000)
    const u = c.get('user')
    if (u) c.get('db').prepare('DELETE FROM sessions WHERE id = ?').run(u.sessionId)
    clearSid(c)
    return c.body(null, 204)
  })

  // 카카오 서버 → 우리 서버. CSRF 검사 제외(index.ts). 3초 내 200.
  // 리밋(F12): 인증 실패는 OAuth 와 같은 auth 버킷(10/분, 키 추측 억제), 인증된 웹훅은 별도 키·높은 한도 — 해지 폭주가 로그인을 막지 않게
  app.on(['GET', 'POST'], '/api/auth/kakao/unlink-webhook', async (c) => {
    const want = `KakaoAK ${env.kakao.adminKey}`
    const got = c.req.header('authorization') ?? ''
    if (!env.kakao.adminKey || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) {
      hit(c, `auth:${clientIp(c)}`, 10, 60_000)
      fail(401, 'unauthorized', '인증 실패')
    }
    hit(c, `kakao_unlink:${clientIp(c)}`, 600, 60_000)
    let f: Record<string, unknown> = c.req.query()
    if (c.req.method === 'POST') {
      const ct = c.req.header('content-type') ?? ''
      f = { ...f, ...(ct.startsWith('application/json') ? await body<Record<string, unknown>>(c) : await c.req.parseBody()) }
    }
    const sub = String(f.user_id ?? '')
    if (!/^\d{1,20}$/.test(sub)) fail(400, 'invalid', 'user_id', 'user_id')
    const db = c.get('db')
    const u = db.prepare("SELECT id FROM users WHERE provider = 'kakao' AND provider_sub = ?").get(sub) as { id: string } | undefined
    if (u)
      tx(db, () => {
        if (f.referrer_type === 'INCOMPLETE_SIGN_UP') { purgeUserNow(db, u.id); audit(db, null, 'user.purge', 'user', u.id, { via: 'kakao_unlink' }) }
        else { softDeleteUser(db, u.id, Date.now()); audit(db, null, 'user.delete_requested', 'user', u.id, { via: 'kakao_unlink' }) }
      })
    return c.json({})
  })

  app.post('/api/me/delete', requireUser, async (c, next) => { hit(c, `medel:${uid(c)}`, 3, 3_600_000); await next() })
  app.use('/api/me/*', requireUser, limit('me', 300, 60_000))
  app.use('/api/me', requireUser, limit('me', 300, 60_000))

  app.get('/api/me', (c) => {
    const db = c.get('db')
    const s = getSettings(db)
    const me: Me = { user: userOf(db, uid(c)), notice: s.notice.enabled && s.notice.text ? { text: s.notice.text } : null, maintenance: s.maintenance.enabled, hidden_trees: hiddenTreesOf(db, uid(c)) }
    return c.json(me)
  })

  app.patch('/api/me', async (c) => {
    const db = c.get('db')
    const b = await body<{ nickname?: unknown; use_provider_avatar?: unknown }>(c)
    let nick: string | undefined
    if (b.nickname !== undefined) {
      nick = typeof b.nickname === 'string' ? b.nickname.trim() : ''
      const n = Array.from(nick).length
      if (n < 1 || n > 20 || CTRL.test(nick)) fail(400, 'invalid', '닉네임은 1~20자입니다', 'nickname')
    }
    if (b.use_provider_avatar !== undefined && typeof b.use_provider_avatar !== 'boolean') fail(400, 'invalid', '값이 올바르지 않습니다', 'use_provider_avatar')
    tx(db, () => {
      if (nick !== undefined) db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(nick, uid(c))
      if (b.use_provider_avatar === true) db.prepare('UPDATE users SET use_provider_avatar = 1 WHERE id = ?').run(uid(c))
      if (b.use_provider_avatar === false) db.prepare('UPDATE users SET use_provider_avatar = 0, avatar_url = NULL WHERE id = ?').run(uid(c))
    })
    const user = userOf(db, uid(c))
    return c.json(b.use_provider_avatar === true ? { user, relogin_required: true } : { user })
  })

  const sessions = (c: Context<AppEnv>): Session[] =>
    (c.get('db').prepare('SELECT id, ua, created_at, last_seen_at FROM sessions WHERE user_id = ? ORDER BY last_seen_at DESC').all(uid(c)) as { id: string; ua: string; created_at: number; last_seen_at: number }[])
      .map(({ id, ...s }) => ({ id6: id.slice(0, 6), ...s, current: id === c.get('user')!.sessionId }))

  app.get('/api/me/sessions', (c) => c.json({ sessions: sessions(c) }))
  app.delete('/api/me/sessions/:id6', (c) => {
    const id6 = c.req.param('id6')
    if (!/^[0-9a-f]{6}$/.test(id6)) fail(400, 'invalid', '세션 id 가 올바르지 않습니다', 'id6')
    c.get('db').prepare("DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, 6) = ?").run(uid(c), id6)
    if (c.get('user')!.sessionId.startsWith(id6)) clearSid(c)
    return c.body(null, 204)
  })
  app.post('/api/me/sessions/revoke-others', (c) => {
    const r = c.get('db').prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(uid(c), c.get('user')!.sessionId)
    return c.json({ revoked: Number(r.changes) })
  })

  app.get('/api/me/export', (c) => {
    const db = c.get('db')
    const user = db.prepare('SELECT id, provider, provider_sub, nickname, avatar_url, use_provider_avatar, role, created_at, last_seen_at FROM users WHERE id = ?').get(uid(c))
    c.header('Content-Disposition', 'attachment; filename="drilldown-account.json"')
    return c.json({ exported_at: Date.now(), user, sessions: sessions(c) })
  })

  app.post('/api/me/delete', (c) => {
    const db = c.get('db')
    tx(db, () => {
      softDeleteUser(db, uid(c), Date.now())
      audit(db, uid(c), 'user.delete_requested', 'user', uid(c))
    })
    clearSid(c)
    return c.body(null, 204)
  })
}
