// 제품 지표·피드백·스위치 자가 검사 (3단계 워커 C). account.check.ts 끝에서 import. 메모리 DB + app.request(), node:assert.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '../db.ts'
import { env } from '../env.ts'
import { DAY } from '../http.ts'
import { createApp } from '../index.ts'
import { gallery } from '../sync/share.ts'
import { runDaily } from './daily.ts'
import { dayOf, flushViews, productMetrics } from './product.ts'

const saved = { authFake: env.authFake, dataDir: env.dataDir }
const tmp = mkdtempSync(join(tmpdir(), 'pc-check-'))
Object.assign(env as unknown as Record<string, unknown>, { authFake: true, dataDir: tmp })

const db = await openDb(':memory:')
const app = await createApp(db)
type Opt = { method?: string; body?: unknown; cookie?: string; ip?: string; ua?: string }
const req = (path: string, o: Opt = {}) => app.request(path, {
  method: o.method ?? (o.body === undefined ? 'GET' : 'POST'),
  headers: { 'cf-connecting-ip': o.ip ?? 'pc-check', 'user-agent': o.ua ?? 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(o.cookie ? { cookie: o.cookie } : {}) },
  body: o.body === undefined ? undefined : JSON.stringify(o.body),
})
const json = async <T = Record<string, unknown>>(r: Response) => (await r.json()) as T
const login = async (as: 'user' | 'admin', name: string) => (await req(`/api/auth/fake/start?as=${as}&name=${name}`)).headers.getSetCookie().find((s) => s.startsWith('sid='))!.split(';')[0]
const n = (sql: string, ...p: (string | number)[]) => (db.prepare(sql).get(...p) as { n: number }).n
const now = Date.now()

const adm = await login('admin', 'root')
const u1 = await login('user', 'una')
const u2 = await login('user', 'ubo')
const id = async (c: string) => (await json<{ user: { id: string } }>(await req('/api/me', { cookie: c }))).user.id
const [admId, una, ubo] = [await id(adm), await id(u1), await id(u2)]

// ---- #44 flags 기본 전부 true → /api/me 로 전달 ----
const me1 = await json<{ product: { flags: Record<string, boolean> } }>(await req('/api/me', { cookie: u1 }))
assert.deepEqual(me1.product.flags, { gallery: true, report: true, rating: true, publish: true })

// ---- 공개 트리 2개(관리자 시드 1 + 사용자 1), 복제 계보 ----
const ins = db.prepare("INSERT INTO trees(id,owner_id,title,visibility,slug,source_tree_id,node_count,created_at,updated_at,seq) VALUES(?,?,?,'public',?,?,5,?,?,1)")
ins.run('t-seed', admId, '시드 트리', 'Seed1Tree111', null, now - 2 * DAY, now - 2 * DAY)
ins.run('t-user', una, '사용자 트리', 'User1Tree111', 't-seed', now - DAY, now - DAY)
assert.ok(/^[1-9A-HJ-NP-Za-km-z]{11}$/.test('Seed1Tree11'))
db.prepare("UPDATE trees SET slug = 'Seed1Tree11' WHERE id = 't-seed'").run()
db.prepare("UPDATE trees SET slug = 'User1Tree11' WHERE id = 't-user'").run()

// ---- #42 조회 수: /api/t/:slug +1, /t/:slug +1, 크롤러 UA 제외. 메모리에 모았다가 flushViews(5분 주기·재시작 직전)가 반영한다(r1 L5) ----
assert.equal((await req('/api/t/User1Tree11')).status, 200)
assert.equal((await req('/api/t/User1Tree11', { ua: 'facebookexternalhit/1.1' })).status, 200) // 크롤러는 세지 않는다
const hasDist = existsSync(join(env.distDir, 'index.html')) // /t/:slug 는 dist 셸이 필요 — 빌드 전이면 건너뜀
if (hasDist) { assert.equal((await req('/t/User1Tree11')).status, 200); assert.equal((await req('/t/User1Tree11', { ua: 'kakaotalk-scrap/1.0' })).status, 200) }
assert.equal(n("SELECT view_count n FROM trees WHERE id = 't-user'"), 0) // 요청당 SQLite 쓰기 없음
flushViews(db)
assert.equal(n("SELECT view_count n FROM trees WHERE id = 't-user'"), hasDist ? 2 : 1)

// ---- #45 featured: 설정 전 갤러리 순서(최신) → 추천 고정 후 시드가 1쪽 상단 + featured 표식 ----
let g = gallery(db, 'recent', 1, now)
assert.deepEqual(g.items.map((i) => i.slug), ['User1Tree11', 'Seed1Tree11'])
assert.equal((await req('/api/admin/product/settings', { method: 'PUT', body: { featured_slugs: ['bad slug'] }, cookie: adm })).status, 400)
let r = await req('/api/admin/product/settings', { method: 'PUT', body: { featured_slugs: ['Seed1Tree11'] }, cookie: adm })
assert.deepEqual((await json<{ settings: { featured_slugs: string[] } }>(r)).settings.featured_slugs, ['Seed1Tree11'])
const gr = await json<{ items: { slug: string }[]; featured: string[] }>(await req('/api/gallery'))
assert.deepEqual(gr.items.map((i) => i.slug), ['Seed1Tree11', 'User1Tree11']); assert.deepEqual(gr.featured, ['Seed1Tree11'])
assert.deepEqual((await json<{ featured: string[] }>(await req('/api/gallery?q=사용자'))).featured, []) // 검색 중엔 고정 없음
// 큐레이션 목록: 시드 표식·추천·원본 제목·조회 수. seed=1 필터
const ct = (await json<{ items: { id: string; seed: boolean; featured: boolean; source_title: string | null; view_count: number }[] }>(await req('/api/admin/product/trees', { cookie: adm }))).items
assert.deepEqual(ct.map((t) => [t.id, t.seed, t.featured, t.source_title, t.view_count]), [['t-user', false, false, '시드 트리', hasDist ? 2 : 1], ['t-seed', true, true, null, 0]])
assert.deepEqual((await json<{ items: { id: string }[] }>(await req('/api/admin/product/trees?seed=1', { cookie: adm }))).items.map((t) => t.id), ['t-seed'])

// ---- #44 스위치 끄기 → 서버 거절(갤러리 404·신고 403·별점 403·공개 전환 403), /api/me 반영, 감사 ----
assert.equal((await req('/api/admin/product/settings', { method: 'PUT', body: { flags: { gallery: 'no' } }, cookie: adm })).status, 400)
r = await req('/api/admin/product/settings', { method: 'PUT', body: { flags: { gallery: false, report: false, rating: false, publish: false } }, cookie: adm })
assert.equal(r.status, 200)
assert.equal((await req('/api/gallery')).status, 404)
assert.equal((await req('/api/t/User1Tree11/report', { body: { reason: 'spam' }, cookie: u2 })).status, 403)
assert.equal((await req('/api/t/User1Tree11/rating', { method: 'PUT', body: { stars: 5 }, cookie: u2 })).status, 403)
assert.equal((await req('/api/trees/t-user/visibility', { method: 'PUT', body: { visibility: 'private' }, cookie: u1 })).status, 404) // 꺼져도 비공개 전환은 통과(트리 id 형식 404 는 기존 규칙)
r = await req('/api/trees/00000000-0000-4000-8000-000000000001/visibility', { method: 'PUT', body: { visibility: 'public' }, cookie: u1 })
assert.equal(r.status, 403); assert.equal((await json<{ error: { code: string } }>(r)).error.code, 'disabled')
assert.equal((await json<{ product: { flags: { gallery: boolean } } }>(await req('/api/me', { cookie: u1 }))).product.flags.gallery, false)
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'settings.flags'").get()); assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'settings.featured'").get())
await req('/api/admin/product/settings', { method: 'PUT', body: { flags: { gallery: true, report: true, rating: true, publish: true } }, cookie: adm })
assert.equal((await req('/api/gallery')).status, 200)
assert.equal((await req('/api/t/User1Tree11/report', { body: { reason: 'spam' }, cookie: u2 })).status, 201)

// ---- #43 피드백: 검증, anon 6번째 429, 내 목록, 관리자 처리·메모, 비관리자 404 ----
assert.equal((await req('/api/feedback', { body: { category: 'x', text: 'hi' } })).status, 400)
assert.equal((await req('/api/feedback', { body: { category: 'bug', text: '' } })).status, 400)
assert.equal((await req('/api/feedback', { body: { category: 'bug', text: 'x'.repeat(501) } })).status, 400)
for (let i = 0; i < 5; i++) assert.equal((await req('/api/feedback', { body: { category: 'idea', text: `익명 ${i}` }, ip: 'fb-anon' })).status, 201)
assert.equal((await req('/api/feedback', { body: { category: 'idea', text: '6' }, ip: 'fb-anon' })).status, 429)
r = await req('/api/feedback', { body: { category: 'bug', text: '버튼이\n안 눌려요', tree_id: 't-user' }, cookie: u1 })
assert.equal(r.status, 201)
const fid = (await json<{ id: string }>(r)).id
assert.equal((db.prepare('SELECT client FROM feedback WHERE id = ?').get(fid) as { client: string }).client, 'Chrome · Windows')
const mine = (await json<{ items: { id: string; resolved_at: number | null; note: string | null }[] }>(await req('/api/me/feedback', { cookie: u1 }))).items
assert.deepEqual(mine.map((f) => [f.id, f.resolved_at, f.note]), [[fid, null, null]])
assert.equal((await req('/api/me/feedback')).status, 401)
assert.equal((await req('/api/admin/feedback', { cookie: u1 })).status, 404)
const fl = (await json<{ items: { id: string; user: string | null }[] }>(await req('/api/admin/feedback', { cookie: adm }))).items
assert.equal(fl.length, 6); assert.equal(fl[0].user, 'una'); assert.equal(fl[1].user, null)
assert.equal((await json<{ feedback_open: number }>(await req('/api/admin/stats', { cookie: adm })).then((s) => (s as unknown as { product: { feedback_open: number } }).product.feedback_open)), 6)
assert.equal((await req(`/api/admin/feedback/${fid}`, { method: 'PATCH', body: { resolved: 'yes' }, cookie: adm })).status, 400)
assert.equal((await req('/api/admin/feedback/nope', { method: 'PATCH', body: { resolved: true }, cookie: adm })).status, 404)
r = await req(`/api/admin/feedback/${fid}`, { method: 'PATCH', body: { resolved: true, note: '다음 배포에 고칩니다' }, cookie: adm })
const it = (await json<{ item: { resolved_at: number | null; note: string | null } }>(r)).item
assert.ok(it.resolved_at! > 0); assert.equal(it.note, '다음 배포에 고칩니다')
const mine2 = (await json<{ items: { resolved_at: number | null; note: string | null }[] }>(await req('/api/me/feedback', { cookie: u1 }))).items
assert.equal(mine2[0].note, '다음 배포에 고칩니다'); assert.ok(mine2[0].resolved_at)
assert.equal((await json<{ items: { id: string }[] }>(await req('/api/admin/feedback?status=open', { cookie: adm }))).items.length, 5)
for (const a of ['feedback.resolve', 'feedback.note']) assert.ok(db.prepare('SELECT 1 FROM audit_log WHERE action = ? AND target_id = ?').get(a, fid), a)
assert.equal(db.prepare("SELECT 1 FROM audit_log WHERE meta LIKE '%다음 배포%'").get(), undefined) // 메모 본문은 감사 로그에 없다

// ---- #40 지표: attempts·srs·users·reports 로 계산 ----
const att = db.prepare('INSERT INTO attempts(id,user_id,tree_id,root_id,started_at,completed_at,node_recall,edge_accuracy,auto_graded_count,self_graded_count,overridden_count) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
// una: 같은 트리 3회(1회차 0.4, 2회차 10일 뒤 0.6, 3회차 0.8) → K2 해당, r1 0.4 · r3 0.8. ubo: 1회만 → K2 아님
att.run('a1', una, 't-user', 'r', now - 20 * DAY, now - 20 * DAY, 0.4, 0.9, 8, 2, 1)
att.run('a2', una, 't-user', 'r', now - 10 * DAY, now - 10 * DAY, 0.6, 0.8, 9, 1, 0)
att.run('a3', una, 't-user', 'r', now - DAY, now - DAY, 0.8, 1.0, 10, 0, 0)
att.run('a4', ubo, 't-seed', 'r', now - 50 * DAY, now - 50 * DAY, 0.5, 0.5, 5, 5, 0)
// srs: una 카드 2장(최근 복습 → R 높음), ubo 카드 1장(200일 전 복습, 안정성 1 → R 낮음)
const card = (s: number, daysAgo: number) => JSON.stringify({ stability: s, stabilityFast: s, difficulty: 5, lastReviewAt: new Date(now - daysAgo * DAY).toISOString() })
const srs = db.prepare("INSERT INTO srs(user_id,node_id,tree_id,card,due,updated_at,seq) VALUES(?,?,?,?,?,?,1)")
srs.run(una, 'n1', 't-user', card(30, 1), now, now - DAY); srs.run(una, 'n2', 't-user', card(30, 2), now, now - DAY); srs.run(ubo, 'n3', 't-seed', card(1, 200), now, now - 50 * DAY)
// 가입 72h: una·ubo 는 방금 가입(분모 밖). 4일 전 가입 + 가입 1일 뒤 백지 = 활성화 1/2
db.prepare("INSERT INTO users(id,provider,provider_sub,nickname,created_at,last_seen_at) VALUES('old-a','google','oa','old-a',?,?)").run(now - 4 * DAY, now - 400 * DAY)
db.prepare("INSERT INTO users(id,provider,provider_sub,nickname,created_at,last_seen_at) VALUES('old-b','kakao','ob','old-b',?,?)").run(now - 4 * DAY, now - DAY)
att.run('a5', 'old-a', 't-seed', 'r', now - 3 * DAY, now - 3 * DAY, 0.3, 0.3, 3, 7, 2)
// 신고: 열린 1건(2일 전) + 처리 1건(3일 → 1일 뒤 처리)
db.prepare("INSERT INTO reports(id,tree_id,reason,created_at) VALUES('rp1','t-user','copyright',?)").run(now - 2 * DAY)
db.prepare("INSERT INTO reports(id,tree_id,reason,created_at,resolved_at,resolution) VALUES('rp2','t-user','spam',?,?,'dismissed')").run(now - 3 * DAY, now - 2 * DAY)

const t0 = performance.now()
const m30 = productMetrics(db, 30, now)
assert.ok(performance.now() - t0 < 100, 'metrics < 100ms')
assert.equal(m30.active_users, 2) // una + old-a (ubo 는 50일 전)
assert.deepEqual(m30.k2, { users: 1, rate: 0.5 })
assert.deepEqual(m30.recall, { r1: 0.35, r3: 0.8, n1: 2, n3: 1 }) // 1회차 = a1(0.4, 20일 전)·a5(0.3) 중앙값, 3회차 = a3
assert.equal(m30.grading.auto, 8 + 9 + 10 + 3); assert.equal(m30.grading.self, 2 + 1 + 7); assert.equal(m30.grading.overridden, 3)
assert.ok(Math.abs(m30.structure_error! - (1 - (0.9 + 0.8 + 1.0 + 0.3) / 4)) < 1e-9)
assert.equal(m30.fsrs.cards, 2); assert.ok(m30.fsrs.avg_r! > 0.9); assert.equal(m30.fsrs.users_below_90, 0)
assert.deepEqual(m30.activation, { signups: 2, activated: 1, rate: 0.5 })
assert.deepEqual(m30.providers, { fake: 3, google: 1, kakao: 1 })
assert.equal(m30.reports.open, 2); assert.ok(Math.abs(m30.reports.oldest_open_h! - 48) < 1); // 열림 = rp1 + 위 스위치 검사에서 ubo 가 넣은 spam 1건 assert.equal(m30.reports.resolved, 1); assert.equal(m30.reports.within_7d_rate, 1)
assert.deepEqual(m30.reports.by_reason, { copyright: 1, spam: 2, abuse: 0, other: 0 })
assert.equal(m30.inactive_1y, 1)
assert.equal(m30.db.bytes, 0) // 메모리 DB
assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'system.incident'").get() === undefined)
await req('/api/admin/ops/note', { body: { kind: 'incident', text: '훈련' }, cookie: adm })
const mAll = await json<{ days: number; fsrs: { cards: number; users_below_90: number }; incidents: { text: string }[]; active_users: number }>(await req('/api/admin/product/metrics?days=0', { cookie: adm }))
assert.equal(mAll.days, 0); assert.equal(mAll.active_users, 3); assert.equal(mAll.fsrs.cards, 3); assert.equal(mAll.fsrs.users_below_90, 1); assert.deepEqual(mAll.incidents.map((i) => i.text), ['훈련'])
assert.equal((await req('/api/admin/product/metrics?days=7', { cookie: adm })).status, 400)
assert.equal((await req('/api/admin/product/metrics', { cookie: u1 })).status, 404)
// 신고 집계: 소유자 una(트리 1·신고 2·열림 1), 신고자 비로그인 2건
const agg = await json<{ owners: { nickname: string; trees: number; reports: number; open: number }[]; reporters: { id: string | null; reports: number }[] }>(await req('/api/admin/product/reports', { cookie: adm }))
assert.deepEqual(agg.owners.map((o) => [o.nickname, o.trees, o.reports, o.open]), [['una', 1, 3, 2]]) // 위 스위치 검사에서 ubo 가 1건 더 넣었다
assert.equal(agg.reporters.reduce((a, r) => a + r.reports, 0), 3)

// ---- #41·#49 daily_stats: 기동 시 오늘 restarts +1(첫 /api 요청), 일일 작업이 어제 행 upsert, 처리 피드백 90일 삭제 ----
const today = dayOf(now)
assert.equal(n('SELECT restarts n FROM daily_stats WHERE day = ?', today), 1)
db.prepare('UPDATE feedback SET resolved_at = ? WHERE id = ?').run(now - 91 * DAY, fid)
const dr = runDaily(db, now)
assert.equal(dr.ok, true, dr.error)
const y = db.prepare('SELECT * FROM daily_stats WHERE day = ?').get(dayOf(now - DAY)) as Record<string, number>
assert.ok(y); assert.equal(y.attempts, 1); assert.equal(y.share_views, hasDist ? 2 : 1); assert.equal(y.retrieval_active, 2); assert.equal(y.open_reports, 2); assert.equal(y.public_trees, 2); assert.equal(y.restarts, 0)
assert.ok(y.dau >= 3 && y.wau >= y.dau && y.mau >= y.wau)
assert.equal(db.prepare('SELECT 1 FROM feedback WHERE id = ?').get(fid), undefined)
assert.equal(n('SELECT COUNT(*) n FROM feedback'), 5)
// 같은 날 다시 돌려도 행 1개(upsert), restarts 보존
db.prepare('UPDATE daily_stats SET restarts = 3 WHERE day = ?').run(dayOf(now - DAY))
runDaily(db, now)
assert.equal(n('SELECT COUNT(*) n FROM daily_stats WHERE day = ?', dayOf(now - DAY)), 1); assert.equal(n('SELECT restarts n FROM daily_stats WHERE day = ?', dayOf(now - DAY)), 3)
const md = await json<{ daily: { day: string }[]; restarts_today: number }>(await req('/api/admin/product/metrics?days=30', { cookie: adm }))
assert.deepEqual(md.daily.map((d) => d.day), [dayOf(now - DAY)]); assert.equal(md.restarts_today, 1) // 오늘 행(기동 stub)은 추이에서 뺀다

Object.assign(env as unknown as Record<string, unknown>, saved)
rmSync(tmp, { recursive: true, force: true })
console.log('product.check ok')
