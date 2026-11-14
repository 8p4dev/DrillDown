// 제품 지표·피드백·운영 스위치 — 학습 지표(attempts·srs), daily_stats 스냅샷, 공유 조회 수, 피드백함, flags·featured, 시드 트리, 신고 집계, 사고 기록.
// docs/plans/orchestration_admin_stage3.md §3 (T4 #40~#45·#49), w3_product.md. 개인정보 원칙: 집계값만, IP·이메일·원문 UA 없음, 요청당 SQLite 쓰기는 view_count +1 만(#42 명시).
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Hono } from 'hono'
import { curve, migrateFSRS7Parameters } from 'ts-fsrs/models/fsrs-7'
import type { DailyStat, Feedback, MyFeedback, ProductFlags, ProductMe, ProductMetrics, ProductSettings, ProductStats, ProductTree, ReportAgg, ReportReason } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { env } from '../env.ts'
import { body, clientIp, DAY, fail, hit, UUID, type AppEnv } from '../http.ts'
import { clearGalleryCache, SLUG_RE } from '../sync/share.ts'
import { audit, optText } from './admin.ts'
import { shortUa } from './session.ts'

const H = 3_600_000
const H72 = 72 * H
/** 로컬 날짜 'YYYY-MM-DD' (daily_stats.day) */
export const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const num = (db: DB, sql: string, ...p: (number | string)[]) => (db.prepare(sql).get(...p) as { n: number }).n
const rate = (a: number, b: number) => (b > 0 ? a / b : null)

// ---- 운영 스위치·추천 (#44·#45) ----
const FLAGS: ProductFlags = { gallery: true, report: true, rating: true, publish: true }
const FLAG_KEYS = Object.keys(FLAGS) as (keyof ProductFlags)[]
export function productSettings(db: DB): ProductSettings {
  const get = (k: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(k) as { value: string } | undefined)?.value
  const f = get('flags'), s = get('featured_slugs')
  return { flags: { ...FLAGS, ...(f ? (JSON.parse(f) as Partial<ProductFlags>) : {}) }, featured_slugs: s ? (JSON.parse(s) as string[]) : [] }
}
/** 라우트 강제: 스위치가 꺼져 있으면 거절(갤러리는 404 — 존재를 숨긴다) */
export function requireFlag(db: DB, k: keyof ProductFlags, status: 403 | 404 = 403) {
  if (!productSettings(db).flags[k]) fail(status, status === 404 ? 'not_found' : 'disabled', status === 404 ? '없는 경로입니다' : '지금은 운영 정책으로 잠시 꺼져 있는 기능입니다')
}
/** GET /api/me 에 합쳐지는 부분 */
export const productMe = (db: DB): ProductMe => ({ flags: productSettings(db).flags })
/** GET /api/admin/stats 의 product 부분 — 가벼운 것만 */
export function productStats(db: DB): ProductStats {
  return { feedback_open: num(db, 'SELECT COUNT(*) n FROM feedback WHERE resolved_at IS NULL') }
}

// ---- 메모리 카운터(#41 gallery_hits): 서버 프로세스가 5분마다 파일에 누계를 적고, 별도 프로세스인 일일 작업이 읽는다. 요청당 SQLite 쓰기 없음 ----
const CFILE = 'product-counters.json'
const counters = { gallery_hits: 0 }
function loadCounters() { try { Object.assign(counters, JSON.parse(readFileSync(join(env.dataDir, CFILE), 'utf8'))) } catch { /* 아직 없음 */ } }
let savedHits = -1
function saveCounters() {
  if (counters.gallery_hits === savedHits) return
  try { mkdirSync(env.dataDir, { recursive: true }); writeFileSync(join(env.dataDir, CFILE), JSON.stringify(counters)); savedHits = counters.gallery_hits } catch (e) { console.error('product counters', (e as Error).message) }
}
export const countGalleryHit = () => { counters.gallery_hits++ }
// ---- #42 공유 조회 수(trees.view_count): 요청마다 UPDATE 하면 synchronous=FULL 이라 fsync 1회 → 메모리에 모아 5분(createApp 의 setInterval)·재시작 직전에 반영(r1 L5) ----
const views = new Map<string, number>()
export const countView = (treeId: string) => { views.set(treeId, (views.get(treeId) ?? 0) + 1) }
export function flushViews(db: DB) {
  if (!views.size) return
  const up = db.prepare('UPDATE trees SET view_count = view_count + ? WHERE id = ?')
  tx(db, () => { for (const [id, n] of views) up.run(n, id) })
  views.clear()
}

// ---- 일일 작업(04:00): 어제 행 upsert(restarts 는 기동 시 +1 한 값을 둔다) + 처리된 피드백 90일 삭제 ----
export function productDaily(db: DB, now: number): void {
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  const end = d.getTime(), start = end - DAY
  loadCounters()
  const row: Omit<DailyStat, 'restarts'> = {
    day: dayOf(start),
    dau: num(db, 'SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?', now - DAY),
    wau: num(db, 'SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?', now - 7 * DAY),
    mau: num(db, 'SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?', now - 30 * DAY),
    retrieval_active: num(db, 'SELECT COUNT(DISTINCT user_id) n FROM attempts WHERE completed_at >= ?', now - 7 * DAY),
    new_users: num(db, 'SELECT COUNT(*) n FROM users WHERE created_at >= ? AND created_at < ?', start, end),
    new_trees: num(db, 'SELECT COUNT(*) n FROM trees WHERE created_at >= ? AND created_at < ?', start, end),
    attempts: num(db, 'SELECT COUNT(*) n FROM attempts WHERE completed_at >= ? AND completed_at < ?', start, end),
    share_views: num(db, 'SELECT COALESCE(SUM(view_count), 0) n FROM trees'),
    copies: num(db, 'SELECT COALESCE(SUM(copy_count), 0) n FROM trees'),
    gallery_hits: counters.gallery_hits,
    client_errors: 0, // 워커 A 의 클라이언트 오류 카운터 합류 지점
    open_reports: num(db, 'SELECT COUNT(*) n FROM reports WHERE resolved_at IS NULL'),
    public_trees: num(db, "SELECT COUNT(*) n FROM trees WHERE visibility = 'public' AND deleted_at IS NULL AND hidden_by_admin_at IS NULL"),
  }
  const cols = Object.keys(row)
  db.prepare(`INSERT INTO daily_stats(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')}) ON CONFLICT(day) DO UPDATE SET ${cols.filter((c) => c !== 'day').map((c) => `${c} = excluded.${c}`).join(', ')}`)
    .run(...Object.values(row))
  db.prepare('DELETE FROM feedback WHERE resolved_at < ?').run(now - 90 * DAY)
}

// ---- 학습·성장 지표 (#40·#49) — 전부 현재 스키마 SQL. 기간 days=30|90|0(전체) ----
const W7 = migrateFSRS7Parameters()
type CardRow = { user_id: string; s: number | null; sf: number | null; d: number | null; lr: string | null }
/** FSRS-7 예측 기억률 — 클라이언트 retrievability 와 같은 곡선(ts-fsrs). 카드 JSON 은 stability·stabilityFast·difficulty·lastReviewAt */
function fsrsRetention(db: DB, since: number, now: number): ProductMetrics['fsrs'] {
  // ponytail: 최대 20,000장만 본다(Pi 1대, 1요청 100ms). 더 정확히 필요하면 일일 작업에서 미리 계산해 daily_stats 에
  const rows = db.prepare(`SELECT user_id, json_extract(card,'$.stability') s, json_extract(card,'$.stabilityFast') sf, json_extract(card,'$.difficulty') d,
      COALESCE(json_extract(card,'$.lastReviewAt'), json_extract(card,'$.last_review')) lr FROM srs WHERE deleted_at IS NULL AND updated_at >= ? LIMIT 20000`).all(since) as CardRow[]
  const per = new Map<string, { sum: number; n: number }>()
  let sum = 0, n = 0
  for (const r of rows) {
    const lr = r.lr ? Date.parse(r.lr) : NaN
    if (!r.s || !Number.isFinite(lr)) continue
    const t = Math.max(0, (now - lr) / DAY)
    const rr = curve(W7, t, { stability: r.s, stabilityFast: r.sf ?? r.s, difficulty: r.d ?? 5 }).retrievability
    sum += rr; n++
    const u = per.get(r.user_id) ?? { sum: 0, n: 0 }
    u.sum += rr; u.n++; per.set(r.user_id, u)
  }
  let below = 0
  for (const u of per.values()) if (u.sum / u.n < 0.9) below++
  return { cards: n, avg_r: n ? sum / n : null, users_below_90: below }
}
const median = (xs: number[]) => (xs.length ? (xs.length % 2 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2) : null)
function dbBytes(): number {
  let b = 0
  for (const f of ['app.db', 'app.db-wal']) try { b += statSync(join(env.dataDir, f)).size } catch { /* 없음(메모리 DB·WAL 미생성) */ }
  return b
}

export function productMetrics(db: DB, days: number, now = Date.now()): ProductMetrics {
  const since = days ? now - days * DAY : 0
  const n = (sql: string, ...p: (number | string)[]) => num(db, sql, ...p)
  const recallAt = (k: number) => (db.prepare(`SELECT node_recall v FROM (SELECT node_recall, completed_at, ROW_NUMBER() OVER (PARTITION BY user_id, tree_id ORDER BY completed_at) k FROM attempts)
    WHERE k = ? AND completed_at >= ? ORDER BY v`).all(k, since) as { v: number }[]).map((r) => r.v)
  const r1 = recallAt(1), r3 = recallAt(3)
  const g = db.prepare('SELECT COALESCE(SUM(auto_graded_count),0) a, COALESCE(SUM(self_graded_count),0) s, COALESCE(SUM(overridden_count),0) o, AVG(edge_accuracy) e, COUNT(*) c FROM attempts WHERE completed_at >= ?').get(since) as { a: number; s: number; o: number; e: number | null; c: number }
  const active = n('SELECT COUNT(DISTINCT user_id) n FROM attempts WHERE completed_at >= ?', since)
  const k2 = n(`SELECT COUNT(DISTINCT user_id) n FROM (SELECT user_id, completed_at, LAG(completed_at) OVER (PARTITION BY user_id, tree_id ORDER BY completed_at) prev FROM attempts WHERE completed_at >= ?)
    WHERE prev IS NOT NULL AND completed_at - prev <= ?`, since, 14 * DAY)
  const act = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(EXISTS(SELECT 1 FROM attempts a WHERE a.user_id = u.id AND a.completed_at <= u.created_at + ?)), 0) ok
    FROM users u WHERE u.deleted_at IS NULL AND u.created_at >= ? AND u.created_at <= ?`).get(H72, since, now - H72) as { c: number; ok: number }
  const providers: Record<string, number> = {}
  for (const r of db.prepare('SELECT provider p, COUNT(*) n FROM users WHERE deleted_at IS NULL AND created_at >= ? GROUP BY provider').all(since) as { p: string; n: number }[]) providers[r.p] = r.n
  const rep = db.prepare(`SELECT SUM(resolved_at IS NULL) open, MIN(CASE WHEN resolved_at IS NULL THEN created_at END) oldest,
    SUM(resolved_at >= ?) resolved, SUM(resolved_at >= ? AND resolved_at - created_at <= ?) within FROM reports`).get(since, since, 7 * DAY) as { open: number | null; oldest: number | null; resolved: number | null; within: number | null }
  const by_reason: Record<ReportReason, number> = { copyright: 0, spam: 0, abuse: 0, other: 0 }
  for (const r of db.prepare('SELECT reason, COUNT(*) n FROM reports WHERE created_at >= ? GROUP BY reason').all(since) as { reason: ReportReason; n: number }[]) by_reason[r.reason] = r.n
  const users = n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL')
  const bytes = dbBytes()
  return {
    days, since,
    active_users: active, attempts: g.c,
    k2: { users: k2, rate: rate(k2, active) },
    recall: { r1: median(r1), r3: median(r3), n1: r1.length, n3: r3.length },
    grading: { auto: g.a, self: g.s, overridden: g.o, self_rate: rate(g.s, g.a + g.s), override_rate: rate(g.o, g.a + g.s) },
    structure_error: g.e == null ? null : 1 - g.e,
    fsrs: fsrsRetention(db, since, now),
    activation: { signups: act.c, activated: act.ok, rate: rate(act.ok, act.c) },
    providers,
    reports: { open: rep.open ?? 0, oldest_open_h: rep.oldest ? (now - rep.oldest) / H : null, resolved: rep.resolved ?? 0, within_7d_rate: rate(rep.within ?? 0, rep.resolved ?? 0), by_reason },
    inactive_1y: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at < ?', now - 365 * DAY),
    db: { bytes, per_user: Math.round(bytes / Math.max(1, users)) },
    daily: db.prepare('SELECT * FROM daily_stats WHERE day >= ? AND day < ? ORDER BY day').all(dayOf(now - (days || 90) * DAY), dayOf(now)) as unknown as DailyStat[],
    restarts_today: n('SELECT COALESCE(SUM(restarts), 0) n FROM daily_stats WHERE day = ?', dayOf(now)),
    incidents: (db.prepare("SELECT ts, meta FROM audit_log WHERE action = 'system.incident' ORDER BY id DESC LIMIT 20").all() as { ts: number; meta: string | null }[])
      .map((r) => ({ ts: r.ts, text: r.meta ? String((JSON.parse(r.meta) as { text?: unknown }).text ?? '') : '' })),
  }
}

// ---- 큐레이션(#45): 시드(소유자 admin)·추천·조회·복제·별점·신고·복제 계보 ----
export function productTrees(db: DB, seedOnly: boolean): ProductTree[] {
  const featured = new Set(productSettings(db).featured_slugs)
  const rows = db.prepare(`SELECT t.id, t.title, t.slug, u.nickname owner, (u.role = 'admin') seed, t.view_count, t.copy_count, t.updated_at, s.title source_title,
      (SELECT AVG(stars) FROM ratings WHERE tree_id = t.id) rating_avg, (SELECT COUNT(*) FROM ratings WHERE tree_id = t.id) rating_count,
      (SELECT COUNT(*) FROM reports WHERE tree_id = t.id AND resolved_at IS NULL) open_reports
    FROM trees t JOIN users u ON u.id = t.owner_id LEFT JOIN trees s ON s.id = t.source_tree_id
    WHERE t.visibility = 'public' AND t.deleted_at IS NULL AND t.slug IS NOT NULL${seedOnly ? " AND u.role = 'admin'" : ''} ORDER BY t.view_count DESC, t.updated_at DESC LIMIT 200`).all() as (Omit<ProductTree, 'seed' | 'featured'> & { seed: number })[]
  return rows.map((r) => ({ ...r, seed: !!r.seed, featured: featured.has(r.slug), rating_avg: r.rating_avg == null ? null : Math.round(r.rating_avg * 10) / 10 }))
}
export function reportAgg(db: DB): ReportAgg {
  return {
    owners: db.prepare(`SELECT u.id, u.nickname, COUNT(DISTINCT r.tree_id) trees, COUNT(*) reports, SUM(r.resolved_at IS NULL) open
      FROM reports r JOIN trees t ON t.id = r.tree_id JOIN users u ON u.id = t.owner_id GROUP BY u.id ORDER BY reports DESC, open DESC LIMIT 50`).all() as ReportAgg['owners'],
    reporters: db.prepare('SELECT r.reporter_id id, u.nickname, COUNT(*) reports FROM reports r LEFT JOIN users u ON u.id = r.reporter_id GROUP BY r.reporter_id ORDER BY reports DESC LIMIT 50').all() as ReportAgg['reporters'],
  }
}

// ---- 라우트 ----
const CATS = ['bug', 'idea', 'content', 'other']
const FB_SQL = 'SELECT f.id, u.nickname user, f.category, f.text, f.tree_id, f.client, f.created_at, f.resolved_at, f.note FROM feedback f LEFT JOIN users u ON u.id = f.user_id'
const fbOr404 = (db: DB, id: string) => (UUID.test(id) ? (db.prepare(`${FB_SQL} WHERE f.id = ?`).get(id) as Feedback | undefined) : undefined) ?? fail(404, 'not_found', '피드백이 없습니다')

export function registerProduct(app: Hono<AppEnv>) {
  const me = (c: Context<AppEnv>) => c.get('user')!.id
  loadCounters()
  setInterval(saveCounters, 5 * 60_000).unref()

  // #43 피드백 — 비로그인 IP 5/시, 로그인 20/시(메모리 버킷, IP 비저장)
  app.post('/api/feedback', async (c) => {
    const u = c.get('user'), db = c.get('db')
    hit(c, u ? `feedback:u:${u.id}` : `feedback:ip:${clientIp(c)}`, u ? 20 : 5, H)
    const b = await body<{ category?: unknown; text?: unknown; tree_id?: unknown }>(c)
    if (!CATS.includes(b.category as string)) fail(400, 'invalid', '종류를 고르세요', 'category')
    const text = optText(b.text, 500, 'text', true) ?? fail(400, 'invalid', '내용을 적어 주세요', 'text')
    const treeId = b.tree_id == null ? null : (typeof b.tree_id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(b.tree_id) ? b.tree_id : fail(400, 'invalid', '트리 id 가 올바르지 않습니다', 'tree_id'))
    const id = randomUUID(), now = Date.now()
    db.prepare('INSERT INTO feedback(id,user_id,category,text,tree_id,client,created_at) VALUES(?,?,?,?,?,?,?)').run(id, u?.id ?? null, b.category as string, text, treeId, shortUa(c.req.header('user-agent')), now)
    return c.json({ id, created_at: now }, 201)
  })
  // 내 피드백·상태·운영자 메모 (/api/me/* 는 me.ts 의 requireUser·리밋 미들웨어 뒤)
  app.get('/api/me/feedback', (c) => c.json({
    items: c.get('db').prepare('SELECT id, category, text, tree_id, created_at, resolved_at, note FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(me(c)) as unknown as MyFeedback[],
  }))
  app.get('/api/admin/feedback', (c) => {
    const s = c.req.query('status') ?? 'open'
    const where = s === 'all' ? '' : s === 'resolved' ? 'WHERE f.resolved_at IS NOT NULL' : 'WHERE f.resolved_at IS NULL'
    return c.json({ items: c.get('db').prepare(`${FB_SQL} ${where} ORDER BY f.created_at DESC LIMIT 200`).all() as unknown as Feedback[] })
  })
  app.patch('/api/admin/feedback/:id', async (c) => {
    const db = c.get('db'), id = c.req.param('id')
    fbOr404(db, id)
    const b = await body<{ resolved?: unknown; note?: unknown }>(c)
    if (b.resolved !== undefined && typeof b.resolved !== 'boolean') fail(400, 'invalid', '값이 올바르지 않습니다', 'resolved')
    const note = b.note === undefined ? undefined : optText(b.note, 300, 'note', true) ?? null
    tx(db, () => {
      if (b.resolved !== undefined) { db.prepare('UPDATE feedback SET resolved_at = ? WHERE id = ?').run(b.resolved ? Date.now() : null, id); audit(db, me(c), b.resolved ? 'feedback.resolve' : 'feedback.reopen', null, id) }
      if (note !== undefined) { db.prepare('UPDATE feedback SET note = ? WHERE id = ?').run(note, id); audit(db, me(c), 'feedback.note', null, id) } // 메모 본문은 feedback 에만(감사 로그엔 자유 텍스트 금지)
    })
    return c.json({ item: fbOr404(db, id) })
  })

  // #40·#41·#49 지표
  app.get('/api/admin/product/metrics', (c) => {
    const d = Number(c.req.query('days') ?? 30)
    if (![0, 30, 90].includes(d)) fail(400, 'invalid', '기간은 30·90·0(전체) 중 하나입니다', 'days')
    return c.json(productMetrics(c.get('db'), d))
  })
  // #45 큐레이션·신고 집계
  app.get('/api/admin/product/trees', (c) => c.json({ items: productTrees(c.get('db'), c.req.query('seed') === '1') }))
  app.get('/api/admin/product/reports', (c) => c.json(reportAgg(c.get('db'))))

  // #44 운영 스위치·추천 — 자기 키(flags·featured_slugs)만. notice·maintenance 는 admin.ts
  app.get('/api/admin/product/settings', (c) => c.json({ settings: productSettings(c.get('db')) }))
  app.put('/api/admin/product/settings', async (c) => {
    const db = c.get('db')
    const b = await body<{ flags?: unknown; featured_slugs?: unknown }>(c)
    const before = productSettings(db), next = structuredClone(before)
    if (b.flags !== undefined) {
      if (typeof b.flags !== 'object' || b.flags === null) fail(400, 'invalid', '스위치 값이 올바르지 않습니다', 'flags')
      for (const k of FLAG_KEYS) {
        const v = (b.flags as Record<string, unknown>)[k]
        if (v === undefined) continue
        if (typeof v !== 'boolean') fail(400, 'invalid', `${k} 는 true/false 입니다`, 'flags')
        next.flags[k] = v as boolean
      }
    }
    if (b.featured_slugs !== undefined) {
      if (!Array.isArray(b.featured_slugs) || b.featured_slugs.length > 20 || !b.featured_slugs.every((s) => typeof s === 'string' && SLUG_RE.test(s))) fail(400, 'invalid', '추천 slug 는 11자 slug 20개까지입니다', 'featured_slugs')
      next.featured_slugs = [...new Set(b.featured_slugs as string[])]
    }
    const now = Date.now()
    const put = db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    tx(db, () => {
      if (JSON.stringify(before.flags) !== JSON.stringify(next.flags)) { put.run('flags', JSON.stringify(next.flags), now); audit(db, me(c), 'settings.flags', 'settings', 'flags', { before: before.flags, after: next.flags }) }
      if (JSON.stringify(before.featured_slugs) !== JSON.stringify(next.featured_slugs)) { put.run('featured_slugs', JSON.stringify(next.featured_slugs), now); audit(db, me(c), 'settings.featured', 'settings', 'featured_slugs', { before: before.featured_slugs, after: next.featured_slugs }) }
    })
    clearGalleryCache()
    return c.json({ settings: next })
  })
}
