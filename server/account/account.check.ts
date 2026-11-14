// 계정 서버 자가 검사 (plan S1·S2). server/check.ts 가 import. 메모리 DB + app.request(), node:assert.
// env 는 check.ts 가 이미 읽었으므로 필드를 직접 덮어쓴다(라우트는 요청 시점에 env 를 읽는다).
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../db.ts'
import { env } from '../env.ts'
import { DAY } from '../http.ts'
import { createApp } from '../index.ts'
import { runDaily } from './daily.ts'
import { exchangeCode, setOAuthFetch } from './oauth.ts'
import { hooks } from './ops.ts'
import { shortUa } from './session.ts'

const saved = { authFake: env.authFake, dataDir: env.dataDir, adminsFile: env.adminsFile, google: env.google, kakao: env.kakao }
const tmp = mkdtempSync(join(tmpdir(), 'sa-check-'))
writeFileSync(join(tmp, 'admins.json'), JSON.stringify(['google:g-admin']))
Object.assign(env as unknown as Record<string, unknown>, {
  authFake: true, dataDir: tmp, adminsFile: join(tmp, 'admins.json'),
  google: { id: 'gid', secret: 'gsecret' }, kakao: { id: '', secret: '', adminKey: 'kadmin' },
})

const db = await openDb(':memory:')
const app = await createApp(db)
type Opt = { method?: string; body?: unknown; cookie?: string; ip?: string; headers?: Record<string, string> }
const req = (path: string, o: Opt = {}) => app.request(path, {
  method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
  headers: { 'cf-connecting-ip': o.ip ?? 'sa-check', 'user-agent': 'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36', ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers },
  body: o.body === undefined ? undefined : JSON.stringify(o.body),
})
const cookieOf = (r: Response, name: string) => r.headers.getSetCookie().find((s) => s.startsWith(name + '='))?.split(';')[0] ?? ''
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T
const err = async (r: Response) => (await json<{ error: { code: string; field?: string } }>(r)).error
async function login(as: 'user' | 'admin', name: string) {
  const r = await req(`/api/auth/fake/start?as=${as}&name=${encodeURIComponent(name)}&return_to=${encodeURIComponent('#/account')}`)
  assert.equal(r.status, 302)
  assert.equal(r.headers.get('location'), '/#/account')
  const sid = cookieOf(r, 'sid')
  assert.match(r.headers.getSetCookie().join('\n'), /sid=[A-Za-z0-9_-]{43}; Max-Age=2592000|sid=[A-Za-z0-9_-]{43}; Max-Age=86400/)
  assert.match(r.headers.getSetCookie().join('\n'), /HttpOnly/)
  return sid
}
const me = (cookie: string) => req('/api/me', { cookie })

assert.equal(shortUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17.0 Mobile Safari/604.1'), 'Safari · iOS')

// ---- providers ----
assert.deepEqual(await json(await req('/api/auth/providers')), { google: true, kakao: false, fake: true, privacy_contact: env.privacyContact })

// ---- fake 로그인 → /api/me → PATCH → 세션 → 로그아웃 ----
const a1 = await login('user', 'alice')
let r = await me(a1)
assert.equal(r.status, 200)
const m = await json<{ user: { id: string; nickname: string; role: string; provider: string }; notice: unknown; maintenance: boolean }>(r)
assert.equal(m.user.nickname, 'alice'); assert.equal(m.user.role, 'user'); assert.equal(m.notice, null); assert.equal(m.maintenance, false)
const aliceId = m.user.id
// 세션 해시 저장 확인
assert.ok(db.prepare('SELECT 1 FROM sessions WHERE id = ?').get(createHash('sha256').update(a1.slice(4)).digest('hex')))
r = await req('/api/me', { method: 'PATCH', body: { nickname: 'x'.repeat(21) }, cookie: a1 })
assert.equal(r.status, 400)
assert.deepEqual(await err(r), { code: 'invalid', message: '닉네임은 1~20자입니다', field: 'nickname' })
r = await req('/api/me', { method: 'PATCH', body: { nickname: ' 앨리스 ' }, cookie: a1 })
assert.equal((await json<{ user: { nickname: string } }>(r)).user.nickname, '앨리스')
r = await req('/api/me', { method: 'PATCH', body: { use_provider_avatar: true }, cookie: a1 })
assert.equal((await json(r)).relogin_required, true)
assert.equal((await json<{ user: { use_provider_avatar: boolean } }>(await me(a1))).user.use_provider_avatar, true)
const a2 = await login('user', 'alice')
r = await req('/api/me/sessions', { cookie: a1 })
const ss = (await json<{ sessions: { id6: string; ua: string; current: boolean }[] }>(r)).sessions
assert.equal(ss.length, 2); assert.equal(ss.filter((s) => s.current).length, 1); assert.equal(ss[0].ua, 'Chrome · Android')
r = await req('/api/me/sessions/revoke-others', { body: {}, cookie: a1 })
assert.deepEqual(await json(r), { revoked: 1 })
assert.equal((await me(a2)).status, 401)
r = await req('/api/me/export', { cookie: a1 })
assert.equal(r.status, 200); assert.equal((await json<{ user: { id: string } }>(r)).user.id, aliceId)
r = await req('/api/auth/logout', { body: {}, cookie: a1 })
assert.equal(r.status, 204); assert.match(cookieOf(r, 'sid'), /^sid=$/)
assert.equal((await me(a1)).status, 401)

// ---- 탈퇴 → 401 → 재로그인 복구 ----
const b1 = await login('user', 'bob')
const bobId = (await json<{ user: { id: string } }>(await me(b1))).user.id
// CSRF: 교차 출처 POST 403, 다른 Origin 403
assert.equal((await req('/api/me/delete', { body: {}, cookie: b1, headers: { 'sec-fetch-site': 'cross-site' } })).status, 403)
assert.equal((await req('/api/me/delete', { body: {}, cookie: b1, headers: { origin: 'https://evil.example' } })).status, 403)
r = await req('/api/me/delete', { body: {}, cookie: b1 })
assert.equal(r.status, 204)
assert.equal((await me(b1)).status, 401)
assert.ok((db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(bobId) as { deleted_at: number }).deleted_at > 0)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'user.delete_requested' AND target_id = ?").get(bobId))
const b2 = await login('user', 'bob')
r = await me(b2)
assert.equal(r.status, 200); assert.equal((await json<{ user: { id: string } }>(r)).user.id, bobId)
assert.equal((db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(bobId) as { deleted_at: null }).deleted_at, null)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'user.restore' AND target_id = ?").get(bobId))

// ---- OAuth: return_to 검증·state 불일치·거부 ----
r = await req('/api/auth/google/start?return_to=https://evil.example')
assert.equal(r.status, 302)
let loc = new URL(r.headers.get('location')!)
assert.equal(loc.origin + loc.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
assert.equal(loc.searchParams.get('scope'), 'openid profile'); assert.equal(loc.searchParams.get('code_challenge_method'), 'S256')
const oauthCk = cookieOf(r, 'oauth')
assert.match(r.headers.getSetCookie().join('\n'), /oauth=.*Max-Age=600; Path=\/api\/auth; HttpOnly; SameSite=Lax/)
assert.equal(JSON.parse(Buffer.from(oauthCk.slice(6), 'base64url').toString()).r, '#/')
r = await req(`/api/auth/google/callback?code=c&state=wrong`, { cookie: oauthCk })
assert.equal(r.headers.get('location'), '/#/login?e=state')
r = await req(`/api/auth/google/callback?code=c&state=${loc.searchParams.get('state')}`)
assert.equal(r.headers.get('location'), '/#/login?e=state') // 쿠키 없음
r = await req('/api/auth/google/callback?error=access_denied', { cookie: oauthCk })
assert.equal(r.headers.get('location'), '/#/login?e=denied')
assert.equal((await req('/api/auth/kakao/start')).status, 404) // 설정 없는 제공자

// ---- 가짜 fetch 로 Google 토큰·userinfo → 사용자 생성(허용목록 → admin) ----
await assert.rejects(exchangeCode('google', 'c', 'v', async () => Response.json({ error: 'invalid_grant' }, { status: 400 })))
let tokenForm: URLSearchParams | null = null
setOAuthFetch(async (url, init) => {
  if (String(url) === 'https://oauth2.googleapis.com/token') { tokenForm = new URLSearchParams(String(init?.body)); return Response.json({ access_token: 'AT' }) }
  assert.equal(String(url), 'https://openidconnect.googleapis.com/v1/userinfo')
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer AT')
  return Response.json({ sub: 'g-admin', name: 'Grace Hopper', picture: 'https://lh3.example/p.png' })
})
r = await req(`/api/auth/google/start?return_to=${encodeURIComponent('#/admin')}`)
loc = new URL(r.headers.get('location')!)
r = await req(`/api/auth/google/callback?code=CODE&state=${loc.searchParams.get('state')}`, { cookie: cookieOf(r, 'oauth') })
assert.equal(r.headers.get('location'), '/#/admin')
const tf = tokenForm as URLSearchParams | null
assert.equal(tf?.get('code'), 'CODE'); assert.equal(tf?.get('client_secret'), 'gsecret'); assert.equal(tf?.get('redirect_uri'), `${env.origin}/api/auth/google/callback`)
assert.equal(createHash('sha256').update(tf!.get('code_verifier')!).digest('base64url'), loc.searchParams.get('code_challenge'))
const g = await json<{ user: { provider: string; nickname: string; role: string; avatar_url: null } }>(await me(cookieOf(r, 'sid')))
assert.deepEqual([g.user.provider, g.user.nickname, g.user.role, g.user.avatar_url], ['google', 'Grace Hopper', 'admin', null])

// ---- 관리자: 비관리자 404, 관리자 200 + 모양 ----
const u = await login('user', 'carol')
const adm = await login('admin', 'root')
const adminId = (await json<{ user: { id: string } }>(await me(adm))).user.id
assert.equal((await req('/api/admin/stats', { cookie: u })).status, 404)
assert.equal((await req('/api/admin/stats')).status, 404)
r = await req('/api/admin/stats', { cookie: adm })
assert.equal(r.status, 200)
const st = await json<{ users: { total: number; today: number; signups_14d: number[] }; trees: object; backup: object; daily: object; disk: { total: number }; uptime_s: number; rss: number }>(r)
assert.equal(st.users.signups_14d.length, 14)
assert.equal(st.users.signups_14d[13], st.users.today)
assert.ok(st.users.total >= 5 && st.rss > 0 && typeof st.uptime_s === 'number')
// 대시보드 확장: 5xx 카운터(메모리)·AUTH_FAKE 플래그·백업 "아직 없음"(at=0)·외부 업로드 설정 여부
const st2 = st as unknown as { errors: { count: number; recent: unknown[] }; flags: { auth_fake: boolean }; backup: { at: number; configured: boolean } }
assert.equal(typeof st2.errors.count, 'number'); assert.ok(Array.isArray(st2.errors.recent))
assert.equal(st2.flags.auth_fake, true); assert.equal(st2.backup.at, 0); assert.equal(typeof st2.backup.configured, 'boolean')
assert.deepEqual(Object.keys(st.trees).sort(), ['hidden', 'pending_delete', 'public', 'total'])
r = await req('/api/admin/users?q=car', { cookie: adm })
const carol = (await json<{ items: { id: string; nickname: string; tree_count: number }[] }>(r)).items
assert.equal(carol.length, 1); assert.equal(carol[0].nickname, 'carol'); assert.equal(carol[0].tree_count, 0)
r = await req('/api/admin/users?limit=2', { cookie: adm })
const pg = await json<{ items: unknown[]; next: string }>(r)
assert.equal(pg.items.length, 2); assert.ok(pg.next)
r = await req(`/api/admin/users?limit=2&cursor=${pg.next}`, { cookie: adm })
assert.equal((await json<{ items: unknown[] }>(r)).items.length, 2)
// 공개 트리 목록 첫 페이지 = 공개 + 삭제 유예(deleted_at), ?deleted=1 = 유예만
const ins = db.prepare("INSERT INTO trees(id,owner_id,title,visibility,created_at,updated_at,deleted_at,seq) VALUES(?,?,?,'public',?,?,?,1)")
ins.run('t-live', carol[0].id, '공개', Date.now(), Date.now(), null)
ins.run('t-del', carol[0].id, '지움', Date.now(), Date.now(), Date.now() - DAY)
r = await req('/api/admin/trees?visibility=public', { cookie: adm })
const at = (await json<{ items: { id: string; deleted_at: number | null; open_reports: number }[] }>(r)).items
assert.deepEqual(at.map((t) => [t.id, !!t.deleted_at, t.open_reports]), [['t-live', false, 0], ['t-del', true, 0]])
r = await req('/api/admin/trees?deleted=1', { cookie: adm })
assert.deepEqual((await json<{ items: { id: string }[] }>(r)).items.map((t) => t.id), ['t-del'])
db.prepare("DELETE FROM trees WHERE id IN ('t-live','t-del')").run()
r = await req(`/api/admin/users/${carol[0].id}`, { cookie: adm })
assert.equal((await json<{ sessions: number }>(r)).sessions, 1)

// ---- 정지 → 세션 401·재로그인 거부, 자기 자신 금지 ----
assert.equal((await req(`/api/admin/users/${adminId}/suspend`, { body: {}, cookie: adm })).status, 403)
assert.equal((await req(`/api/admin/users/${carol[0].id}/suspend`, { body: { reason: 'x'.repeat(201) }, cookie: adm })).status, 400)
r = await req(`/api/admin/users/${carol[0].id}/suspend`, { body: { reason: '스팸' }, cookie: adm })
assert.ok((await json<{ user: { suspended_at: number } }>(r)).user.suspended_at > 0)
assert.equal((await me(u)).status, 401)
r = await req('/api/auth/fake/start?as=user&name=carol')
assert.equal(r.headers.get('location'), `/#/login?e=suspended&r=${encodeURIComponent('스팸')}`) // 정지 사유를 로그인 화면으로
await req(`/api/admin/users/${carol[0].id}/unsuspend`, { body: {}, cookie: adm })
assert.equal((await me(await login('user', 'carol'))).status, 200)

// ---- 공지·점검 모드 ----
assert.equal((await req('/api/admin/settings', { method: 'PUT', body: { notice: { text: 'x'.repeat(81), enabled: true } }, cookie: adm })).status, 400)
r = await req('/api/admin/settings', { method: 'PUT', body: { notice: { text: '오늘 밤 점검', enabled: true }, maintenance: { enabled: true } }, cookie: adm })
assert.deepEqual((await json<{ settings: unknown }>(r)).settings, { notice: { text: '오늘 밤 점검', enabled: true }, maintenance: { enabled: true } })
const d1 = await login('user', 'dave')
r = await req('/api/sync', { cookie: d1 })
assert.equal(r.status, 503); assert.equal(r.headers.get('retry-after'), '300'); assert.equal((await err(r)).code, 'maintenance')
r = await me(d1)
assert.equal(r.status, 200)
assert.deepEqual(await json(r).then((x) => [x.notice, x.maintenance]), [{ text: '오늘 밤 점검' }, true])
assert.notEqual((await req('/api/sync', { cookie: adm })).status, 503)
assert.equal((await req('/api/health')).status, 200)
await req('/api/admin/settings', { method: 'PUT', body: { maintenance: { enabled: false } }, cookie: adm })
assert.notEqual((await req('/api/sync', { cookie: d1 })).status, 503)
r = await req('/api/admin/audit?limit=50', { cookie: adm })
const acts = (await json<{ items: { action: string; meta: unknown }[] }>(r)).items.map((x) => x.action)
for (const a of ['user.suspend', 'user.unsuspend', 'settings.notice', 'settings.maintenance', 'admin.login']) assert.ok(acts.includes(a), a)

// ---- 신고: 잘못된 사유 400, 없는 slug 도 201(미저장), anon 6번째 429 ----
assert.equal((await req('/api/t/nope/report', { body: { reason: 'bad' }, ip: 'rep-v' })).status, 400)
for (let i = 0; i < 5; i++) {
  r = await req('/api/t/nope/report', { body: { reason: 'spam', note: '줄\n바꿈' }, ip: 'rep-1' })
  assert.equal(r.status, 201); assert.ok((await json<{ id: string }>(r)).id)
}
r = await req('/api/t/nope/report', { body: { reason: 'spam' }, ip: 'rep-1' })
assert.equal(r.status, 429); assert.ok(Number(r.headers.get('retry-after')) > 0)
assert.equal((db.prepare('SELECT COUNT(*) n FROM reports').get() as { n: number }).n, 0)
r = await req('/api/admin/reports', { cookie: adm })
assert.deepEqual(await json(r), { items: [] })
// 신고 응답에 트리 slug·숨김 상태 — 관리자 신고 큐의 "보기" 링크·"숨김 중" 표시
ins.run('t-rep', carol[0].id, '신고됨', Date.now(), Date.now(), null)
db.prepare("UPDATE trees SET slug = 'rep-slug' WHERE id = 't-rep'").run()
db.prepare("INSERT INTO reports(id,tree_id,reason,created_at) VALUES(?,'t-rep','spam',?)").run(crypto.randomUUID(), Date.now())
r = await req('/api/admin/reports', { cookie: adm })
const rep = (await json<{ items: { tree: { slug: string | null; hidden_by_admin_at: number | null } }[] }>(r)).items
assert.equal(rep.length, 1); assert.equal(rep[0].tree.slug, 'rep-slug'); assert.equal(rep[0].tree.hidden_by_admin_at, null)
db.prepare('DELETE FROM reports').run(); db.prepare("DELETE FROM trees WHERE id = 't-rep'").run()
assert.equal((await req('/api/admin/trees/abc/restore', { body: {}, cookie: adm })).status, 410) // SH 스텁: purge 됨

// ---- 카카오 연결 끊기 웹훅 ----
const kid = crypto.randomUUID()
db.prepare("INSERT INTO users(id,provider,provider_sub,nickname,created_at,last_seen_at) VALUES(?, 'kakao', '12345', 'k', 0, 0)").run(kid)
assert.equal((await req('/api/auth/kakao/unlink-webhook', { body: { user_id: '12345' }, headers: { authorization: 'KakaoAK nope!!' } })).status, 401)
r = await app.request('/api/auth/kakao/unlink-webhook', { method: 'POST', headers: { authorization: 'KakaoAK kadmin', 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': 'kakao' }, body: 'app_id=1&user_id=12345&referrer_type=UNLINK_FROM_APPS' })
assert.equal(r.status, 200)
assert.ok((db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(kid) as { deleted_at: number }).deleted_at > 0)
r = await req('/api/auth/kakao/unlink-webhook?user_id=12345&referrer_type=INCOMPLETE_SIGN_UP', { headers: { authorization: 'KakaoAK kadmin' }, ip: 'kakao' })
assert.equal(r.status, 200)
assert.equal(db.prepare('SELECT 1 FROM users WHERE id = ?').get(kid), undefined)
// F12 인증된 웹훅은 OAuth 의 10/분 IP 리밋과 별도 — 같은 IP 에서 연속 15회도 429 없음. 인증 실패 11회째는 auth 버킷으로 429
for (let i = 0; i < 15; i++) assert.equal((await req('/api/auth/kakao/unlink-webhook?user_id=99999', { headers: { authorization: 'KakaoAK kadmin' }, ip: 'kakao' })).status, 200)
for (let i = 0; i < 10; i++) await req('/api/auth/kakao/unlink-webhook?user_id=99999', { headers: { authorization: 'KakaoAK wrong!' }, ip: 'kakao-bad' })
assert.equal((await req('/api/auth/kakao/unlink-webhook?user_id=99999', { headers: { authorization: 'KakaoAK wrong!' }, ip: 'kakao-bad' })).status, 429)

// ---- 숨김 사유 통지 → 소명 → 수용 (약관 4·6, 저작권법 §103 ②③) ----
const c2 = await login('user', 'carol')
ins.run('t-app', carol[0].id, '소명 대상', Date.now(), Date.now(), null)
db.prepare("UPDATE trees SET slug = 'app-slug' WHERE id = 't-app'").run()
assert.equal((await req('/api/trees/t-app/appeal', { body: { text: '아직 숨김 아님' }, cookie: c2 })).status, 409)
await req('/api/admin/trees/t-app/hide', { body: { reason: '교재 전사' }, cookie: adm })
let m2 = await json<{ hidden_trees: { id: string; reason: string | null; appealed_at: number | null }[] }>(await me(c2))
assert.deepEqual(m2.hidden_trees.map((t) => [t.id, t.reason, t.appealed_at]), [['t-app', '교재 전사', null]])
assert.equal((await req('/api/trees/t-app/appeal', { body: { text: '' }, cookie: c2 })).status, 400)
assert.equal((await req('/api/trees/t-app/appeal', { body: { text: '제 강의 노트입니다' }, cookie: c2 })).status, 201)
assert.equal((await req('/api/trees/t-app/appeal', { body: { text: '또' }, cookie: c2 })).status, 409) // 열린 소명 1건
assert.equal((await req('/api/trees/t-app/appeal', { body: { text: '남의 트리' }, cookie: d1 })).status, 404) // 소유자만
m2 = await json(await me(c2))
assert.ok(m2.hidden_trees[0].appealed_at! > 0)
r = await req('/api/admin/appeals', { cookie: adm })
const aps = (await json<{ items: { id: string; text: string; owner: string; tree: { slug: string } }[] }>(r)).items
assert.equal(aps.length, 1); assert.equal(aps[0].text, '제 강의 노트입니다'); assert.equal(aps[0].owner, 'carol'); assert.equal(aps[0].tree.slug, 'app-slug')
r = await req(`/api/admin/appeals/${aps[0].id}/resolve`, { body: { resolution: 'accepted' }, cookie: adm })
assert.equal(r.status, 200)
assert.equal((db.prepare("SELECT hidden_by_admin_at h FROM trees WHERE id = 't-app'").get() as { h: number | null }).h, null)
assert.deepEqual((await json<{ items: unknown[] }>(await req('/api/admin/appeals', { cookie: adm }))).items, [])
assert.deepEqual((await json<{ hidden_trees: unknown[] }>(await me(c2))).hidden_trees, [])
for (const a of ['tree.appeal', 'tree.unhide', 'user.search', 'user.view']) assert.ok(db.prepare('SELECT 1 FROM audit_log WHERE action = ?').get(a), a) // 조회 감사 포함

// ---- 운영 기록·감사 로그 불변(트리거) ----
assert.equal((await req('/api/admin/ops/note', { body: { kind: 'bad', text: 'x' }, cookie: adm })).status, 400)
assert.equal((await req('/api/admin/ops/note', { body: { kind: 'incident', text: '훈련' }, cookie: adm })).status, 204)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'system.incident' AND meta LIKE '%훈련%'").get())
assert.throws(() => db.prepare("UPDATE audit_log SET action = 'x' WHERE id = (SELECT MAX(id) FROM audit_log)").run(), /append-only/)
assert.throws(() => db.prepare('DELETE FROM audit_log WHERE id = (SELECT MAX(id) FROM audit_log)').run(), /append-only/)
db.prepare("INSERT INTO audit_log(ts,action) VALUES(?, 'old')").run(Date.now() - 400 * DAY)
assert.equal(Number(db.prepare("DELETE FROM audit_log WHERE action = 'old'").run().changes), 1) // 1년 지난 행은 지워진다(일일 작업)

// ---- 운영(3단계, ops.ts): stats.ops 모양 · 클라이언트 오류 · 감사 필터/CSV · 사용자 세션 폐기/탈퇴 취소 · 다른 관리자 차단 · 수동 실행(가짜 spawn) · checkpoint · 재시작(가짜 exit) · 관리자 목록 ----
const ops = (await json<{ ops: { db: { file: number; wal: number; page_count: number; backups: unknown[] }; rss_max: number; sessions: { total: number; expired: number; admin: number }; counters: Record<string, number>; client_errors: { count: number; recent: unknown[] }; build: { started_at: number; restart_needed: boolean }; jobs: { backup: boolean; daily: boolean }; oauth: { google: { id: boolean; secret: boolean }; kakao: { id: boolean } }; restore_at: number | null } }>(await req('/api/admin/stats', { cookie: adm }))).ops
assert.equal(ops.db.file, 0); assert.ok(ops.db.page_count > 0); assert.deepEqual(ops.db.backups, []); assert.equal(ops.rss_max, 512 * 1024 * 1024)
assert.ok(ops.sessions.total >= 2 && ops.sessions.admin >= 1 && ops.sessions.expired === 0)
assert.ok(ops.build.started_at > 0 && typeof ops.build.restart_needed === 'boolean'); assert.deepEqual(ops.jobs, { backup: false, daily: false })
assert.deepEqual([ops.oauth.google.id, ops.oauth.google.secret, ops.oauth.kakao.id], [true, true, false])
assert.equal(ops.restore_at, null)
await req('/api/admin/ops/note', { body: { kind: 'restore', text: '리허설' }, cookie: adm })
assert.ok((await json<{ ops: { restore_at: number } }>(await req('/api/admin/stats', { cookie: adm }))).ops.restore_at > 0) // 대시보드 "복원 리허설 N일 전"
// 클라이언트 오류: 비로그인도 204, 빈 메시지 400, 제어문자 제거·200자, 분당 10건 → 429 가 '429:cerr' 카운터로
assert.equal((await req('/api/client-error', { body: { message: '' }, ip: 'cerr-1' })).status, 400)
for (let i = 0; i < 9; i++) assert.equal((await req('/api/client-error', { body: { message: `TypeError: x\u0007is not a function ${'y'.repeat(300)}`, version: 'index-abc.js' }, ip: 'cerr-1' })).status, 204)
assert.equal((await req('/api/client-error', { body: { message: 'again' }, ip: 'cerr-1' })).status, 429)
await req('/api/sync?since=0', { cookie: d1 }) // sync.pull 카운터
const ops2 = (await json<{ ops: { counters: Record<string, number>; client_errors: { count: number; recent: { message: string; version: string }[] } } }>(await req('/api/admin/stats', { cookie: adm }))).ops
assert.equal(ops2.client_errors.count, 9); assert.equal(ops2.client_errors.recent.length, 9)
assert.equal(Array.from(ops2.client_errors.recent[0].message).length, 200); assert.ok(!ops2.client_errors.recent[0].message.includes('\u0007')); assert.equal(ops2.client_errors.recent[0].version, 'index-abc.js')
assert.equal(ops2.counters['429:cerr'], 1); assert.ok(ops2.counters['sync.pull'] >= 1)
// 감사 필터: action 접두 · target_id · 기간 · CSV
let au = (await json<{ items: { action: string; target_id: string }[] }>(await req('/api/admin/audit?action=user.', { cookie: adm }))).items
assert.ok(au.length > 0 && au.every((x) => x.action.startsWith('user.')))
au = (await json<{ items: { action: string; target_id: string }[] }>(await req(`/api/admin/audit?target_id=${carol[0].id}`, { cookie: adm }))).items
assert.ok(au.length > 0 && au.every((x) => x.target_id === carol[0].id))
assert.deepEqual((await json<{ items: unknown[] }>(await req(`/api/admin/audit?to=${Date.now() - DAY}`, { cookie: adm }))).items, []) // 어제까지 = 없음
assert.ok((await json<{ items: unknown[] }>(await req(`/api/admin/audit?from=${Date.now() - DAY}`, { cookie: adm }))).items.length > 0)
assert.equal((await req('/api/admin/audit?action=%01', { cookie: adm })).status, 400)
r = await req('/api/admin/audit?format=csv&action=system.', { cookie: adm })
assert.equal(r.status, 200); assert.match(r.headers.get('content-type') ?? '', /^text\/csv/); assert.match(r.headers.get('content-disposition') ?? '', /audit\.csv/)
const csvLines = (await r.text()).split('\n')
assert.equal(csvLines[0], 'ts,actor,action,target_type,target_id,meta'); assert.ok(csvLines.length >= 3 && csvLines.slice(1).every((l) => l.includes('"system.')))
// 사용자 상세 동작: 세션 전부 폐기(정지 없이) · 탈퇴 취소(트리 복원) · provider_sub 노출
const f1 = await login('user', 'frank')
const frankId = (await json<{ user: { id: string } }>(await me(f1))).user.id
assert.equal((await req(`/api/admin/users/${frankId}/revoke-sessions`, { body: {}, cookie: adm })).status, 200)
assert.equal((await me(f1)).status, 401)
assert.equal((await json<{ items: { provider_sub: string; suspended_at: null }[] }>(await req(`/api/admin/users?q=${frankId}`, { cookie: adm }))).items[0].provider_sub, 'fake-frank')
assert.equal((await req(`/api/admin/users/${frankId}/undelete`, { body: {}, cookie: adm })).status, 409) // 탈퇴 대기 아님
ins.run('t-frank', frankId, '프랭크', Date.now(), Date.now(), null)
await req(`/api/admin/users/${frankId}/delete`, { body: {}, cookie: adm })
assert.ok((db.prepare("SELECT deleted_at FROM trees WHERE id = 't-frank'").get() as { deleted_at: number | null }).deleted_at! > 0)
assert.equal((await req(`/api/admin/users/${frankId}/undelete`, { body: {}, cookie: adm })).status, 204)
assert.equal((db.prepare('SELECT deleted_at FROM users WHERE id = ?').get(frankId) as { deleted_at: null }).deleted_at, null)
assert.equal((db.prepare("SELECT deleted_at FROM trees WHERE id = 't-frank'").get() as { deleted_at: null }).deleted_at, null)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'user.restore' AND target_id = ? AND actor_id = ?").get(frankId, adminId))
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'user.sessions_revoke' AND target_id = ?").get(frankId))
db.prepare("DELETE FROM trees WHERE id = 't-frank'").run()
assert.equal((await req('/api/admin/users/not-a-uuid/revoke-sessions', { body: {}, cookie: adm })).status, 404)
// 다른 관리자 정지·삭제 403(상호 잠금), 자기 자신도 여전히 403
const adm2 = await login('admin', 'second')
const admin2Id = (await json<{ user: { id: string } }>(await me(adm2))).user.id
assert.equal((await req(`/api/admin/users/${admin2Id}/suspend`, { body: {}, cookie: adm })).status, 403)
assert.equal((await req(`/api/admin/users/${admin2Id}/delete`, { body: {}, cookie: adm })).status, 403)
assert.equal((await req(`/api/admin/users/${adminId}/suspend`, { body: {}, cookie: adm })).status, 403)
assert.equal((await me(adm2)).status, 200)
// 수동 실행: 자식 프로세스는 가짜 — 202 → 실행 중 409 → 끝나면 다시 202. 없는 작업 404
const spawned: string[] = []
let finish = () => {}
hooks.spawn = (script, onExit) => { spawned.push(script); finish = onExit }
assert.equal((await req('/api/admin/ops/run/backup', { body: {}, cookie: adm })).status, 202)
assert.deepEqual(spawned, ['server/account/backup.ts'])
assert.equal((await req('/api/admin/ops/run/backup', { body: {}, cookie: adm })).status, 409)
assert.equal((await json<{ ops: { jobs: { backup: boolean } } }>(await req('/api/admin/stats', { cookie: adm }))).ops.jobs.backup, true)
finish()
assert.equal((await req('/api/admin/ops/run/backup', { body: {}, cookie: adm })).status, 202); finish()
assert.equal((await req('/api/admin/ops/run/daily', { body: {}, cookie: adm })).status, 202); finish()
assert.equal((await req('/api/admin/ops/run/vacuum', { body: {}, cookie: adm })).status, 404)
assert.equal(spawned.length, 3)
// checkpoint · 재시작(exit 는 가짜, 응답 뒤 300ms) · 관리자 목록
r = await req('/api/admin/ops/checkpoint', { body: {}, cookie: adm })
assert.equal(r.status, 200); assert.ok('busy' in (await json(r)))
let exited = 0
hooks.exit = (code) => { exited = code }
assert.equal((await req('/api/admin/ops/restart', { body: {}, cookie: adm })).status, 204)
assert.equal(exited, 0); await new Promise((res) => setTimeout(res, 400)); assert.equal(exited, 1) // 비정상 코드여야 Restart=on-failure
for (const a of ['system.backup_run', 'system.daily_run', 'system.checkpoint', 'system.restart']) assert.ok(db.prepare('SELECT 1 FROM audit_log WHERE action = ?').get(a), a)
r = await req('/api/admin/ops/admins', { cookie: adm })
assert.deepEqual(await json(r), { file: join(tmp, 'admins.json'), list: ['google:g-admin'], me: 'fake:fake-root' })
assert.equal((await req('/api/admin/ops/admins', { cookie: f1 })).status, 404)

// ---- 세션 슬라이딩·관리자 24h 절대 상한·비활동 60분 ----
const adm3 = await login('admin', 'root')
db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(Date.now() - 61 * 60_000, createHash('sha256').update(adm3.slice(4)).digest('hex'))
assert.equal((await req('/api/admin/stats', { cookie: adm3 })).status, 404)
const dsid = createHash('sha256').update(d1.slice(4)).digest('hex')
db.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = 0 WHERE id = ?').run(Date.now() + 10 * DAY, dsid)
r = await me(d1)
assert.match(cookieOf(r, 'sid'), /^sid=./)
assert.ok((db.prepare('SELECT expires_at FROM sessions WHERE id = ?').get(dsid) as { expires_at: number }).expires_at > Date.now() + 29 * DAY)
db.prepare('UPDATE sessions SET created_at = ? WHERE id = ?').run(Date.now() - 25 * 3_600_000, createHash('sha256').update(adm.slice(4)).digest('hex'))
assert.equal((await req('/api/admin/stats', { cookie: adm })).status, 404)

// ---- 일일 작업: 8일 전 탈퇴 사용자 purge ----
const e1 = await login('user', 'erin')
const erinId = (await json<{ user: { id: string } }>(await me(e1))).user.id
await req('/api/me/delete', { body: {}, cookie: e1 })
db.prepare('UPDATE users SET deleted_at = ? WHERE id = ?').run(Date.now() - 8 * DAY, erinId)
const dr = runDaily(db)
assert.equal(dr.ok, true); assert.ok(dr.purged_users >= 1)
assert.equal(db.prepare('SELECT 1 FROM users WHERE id = ?').get(erinId), undefined)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'user.purge' AND target_id = ? AND actor_id IS NULL").get(erinId))
assert.ok(db.prepare('SELECT 1 FROM users WHERE id = ?').get(bobId)) // 복구된 사용자는 남는다
assert.equal(JSON.parse(readFileSync(join(tmp, 'daily.json'), 'utf8')).at, dr.at)
assert.ok(existsSync(join(tmp, 'daily.json')))

// ---- 사건 대응: 전 세션 폐기(관리자 본인 포함) ----
const adm4 = await login('admin', 'root')
r = await req('/api/admin/ops/revoke-sessions', { body: {}, cookie: adm4 })
assert.ok((await json<{ count: number }>(r)).count >= 1)
assert.equal((await me(adm4)).status, 401)
assert.equal((db.prepare('SELECT COUNT(*) n FROM sessions').get() as { n: number }).n, 0)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'system.sessions_revoke_all'").get())

setOAuthFetch(fetch)
Object.assign(env as unknown as Record<string, unknown>, saved)
rmSync(tmp, { recursive: true, force: true })
console.log('account.check ok')
