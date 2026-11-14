// 관리자 API·감사 로그·설정·신고 (03 §3.4·§3.6). 비관리자 404(requireAdmin), 120/분.
import { randomUUID } from 'node:crypto'
import { readFileSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Hono } from 'hono'
import type { AdminStats, AdminUser, Appeal, AuditRow, Report, Settings } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { env } from '../env.ts'
import { errors } from '../metrics.ts'
import { registerLegal } from './legal.ts'
import { opsStats, registerOps } from './ops.ts'
import { productStats, registerProduct, requireFlag } from './product.ts'
import { body, clientIp, DAY, fail, hit, limit, requireAdmin, requireUser, type AppEnv } from '../http.ts'
import { listTreesForAdmin, purgeUser, restoreTree, setHidden, softDeleteTreesOfUser, treeCountOf, treeIdBySlug, treeStats, treesOfUser } from '../sync/owner.ts'

// ---- 공용: 감사 로그·설정·검증 ----
/** meta 에 개인정보·IP 금지(03 §3.7) */
export function audit(db: DB, actor: string | null, action: string, targetType: AuditRow['target_type'], targetId: string | null, meta?: Record<string, unknown>) {
  db.prepare('INSERT INTO audit_log(ts,actor_id,action,target_type,target_id,meta) VALUES(?,?,?,?,?,?)')
    .run(Date.now(), actor, action, targetType, targetId, meta ? JSON.stringify(meta) : null)
}

/** 저장 모양: notices = Notice[], maintenance = {manual, from?, until?}, auto_hide_reports = number. enabled·notice 는 지금 시각 기준 파생값(스케줄러 없음, T2 #29) */
export function getSettings(db: DB, now = Date.now()): Settings {
  const raw: Record<string, unknown> = {}
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) raw[r.key] = JSON.parse(r.value)
  const notices = Array.isArray(raw.notices) ? (raw.notices as Settings['notices']) : []
  const m = (raw.maintenance ?? {}) as { manual?: boolean; enabled?: boolean; from?: number | null; until?: number | null }
  const manual = !!(m.manual ?? m.enabled) // enabled = 005 이전 저장 모양
  const scheduled = m.from != null && m.from <= now && (m.until == null || now < m.until)
  const first = notices.find((n) => n.audience === 'all' && noticeActive(n, now))
  return {
    notice: { text: first?.text ?? '', enabled: !!first },
    notices,
    maintenance: { enabled: manual || scheduled, manual, from: m.from ?? null, until: m.until ?? null },
    auto_hide_reports: typeof raw.auto_hide_reports === 'number' ? raw.auto_hide_reports : 3,
  }
}
export const noticeActive = (n: Settings['notices'][number], now: number) => (n.from == null || n.from <= now) && (n.until == null || now < n.until)
/** 공지 1건 검증(≤160자, url 은 http(s) ≤200, 기간은 ms, audience 2종). 틀리면 400 */
function notice(v: unknown, i: number): Settings['notices'][number] {
  const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  const f = `notices[${i}]`
  const text = optText(o.text, 160, f) ?? fail(400, 'invalid', '공지 내용을 적어 주세요', f)
  const url = optText(o.url, 200, f)
  if (url && !/^https?:\/\//.test(url)) fail(400, 'invalid', '링크는 http(s) 주소여야 합니다', f)
  const ms = (x: unknown) => (x == null || x === '' ? null : Number.isFinite(x) && (x as number) > 0 ? (x as number) : fail(400, 'invalid', '기간이 올바르지 않습니다', f))
  const from = ms(o.from), until = ms(o.until)
  if (from != null && until != null && until <= from) fail(400, 'invalid', '종료가 시작보다 앞입니다', f)
  if (o.audience !== 'all' && o.audience !== 'users') fail(400, 'invalid', '대상을 고르세요', f)
  const id = typeof o.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(o.id) ? o.id : randomUUID().slice(0, 8)
  return { id, text, ...(url ? { url } : {}), from, until, audience: o.audience as 'all' | 'users' }
}

/** 제어문자 금지 검증 (03 §3.6 입력 검증) */
// oxlint-disable-next-line no-control-regex
export const CTRL = /[\u0000-\u001f\u007f-\u009f]/
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TREE_ID = /^[A-Za-z0-9_-]{1,64}$/
/** 선택 문자열: 길이·제어문자(allowNewline 이면 \n 허용). 없으면 undefined */
export function optText(v: unknown, max: number, field: string, allowNewline = false): string | undefined {
  if (v === undefined || v === null) return undefined
  const bad = typeof v !== 'string' || Array.from(v).length > max || CTRL.test(allowNewline ? v.replace(/\r?\n/g, '') : v)
  if (bad) fail(400, 'invalid', `${field} 값이 올바르지 않습니다`, field)
  return (v as string).trim() || undefined
}
const lim = (q: string | undefined) => Math.min(50, Math.max(1, Math.floor(Number(q)) || 50))
const readJson = <T>(file: string, dflt: T): T => { try { return JSON.parse(readFileSync(join(env.dataDir, file), 'utf8')) as T } catch { return dflt } }

const USER_COLS = 'id, provider, provider_sub, nickname, role, created_at, last_seen_at, suspended_at, deleted_at' // provider_sub 는 관리자 전용(admins.json 대조, T3 #33)
const adminUser = (db: DB, u: Omit<AdminUser, 'tree_count'>): AdminUser => ({ ...u, tree_count: treeCountOf(db, u.id) })
function userOr404(db: DB, id: string) {
  const u = UUID.test(id) ? (db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id) as Omit<AdminUser, 'tree_count'> | undefined) : undefined
  return u ?? fail(404, 'not_found', '사용자가 없습니다')
}
const treeIdOr404 = (id: string) => TREE_ID.test(id) ? id : fail(404, 'not_found', '트리가 없습니다')

/** 로컬 자정 기준 14일(오래된 날 → 오늘) */
function signups14d(db: DB, now: number): number[] {
  const mid: number[] = []
  const d = new Date(now); d.setHours(0, 0, 0, 0)
  for (let i = 0; i < 14; i++) { mid.unshift(d.getTime()); d.setDate(d.getDate() - 1) }
  const out = new Array<number>(14).fill(0)
  for (const { created_at } of db.prepare('SELECT created_at FROM users WHERE created_at >= ?').all(mid[0]) as { created_at: number }[]) {
    let i = 13
    while (i > 0 && created_at < mid[i]) i--
    out[i]++
  }
  return out
}

export function stats(db: DB, now = Date.now()): AdminStats {
  const n = (sql: string, ...p: number[]) => (db.prepare(sql).get(...p) as { n: number }).n
  const today = new Date(now); today.setHours(0, 0, 0, 0)
  let disk = { total: 0, free: 0 }
  try { const s = statfsSync(env.dataDir); disk = { total: s.blocks * s.bsize, free: s.bavail * s.bsize } } catch { /* 디렉터리 없음 */ }
  return {
    users: {
      total: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL'),
      today: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND created_at >= ?', today.getTime()),
      d7: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND created_at >= ?', now - 7 * DAY),
      active7: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?', now - 7 * DAY),
      active30: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND last_seen_at >= ?', now - 30 * DAY),
      suspended: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NULL AND suspended_at IS NOT NULL'),
      pending_delete: n('SELECT COUNT(*) n FROM users WHERE deleted_at IS NOT NULL'),
      signups_14d: signups14d(db, now),
    },
    trees: treeStats(db),
    // at=0 = 아직 한 번도 안 돌았다(실패와 구분). configured = 외부 업로드 설정 유무(backup.ts 와 같은 환경 변수)
    backup: { ...readJson('backup.json', { at: 0, bytes: 0, ok: false }), configured: !!(process.env.BACKUP_AGE_RECIPIENT && process.env.BACKUP_RCLONE_REMOTE) },
    daily: readJson('daily.json', { at: 0, ok: false, purged_users: 0, purged_sessions: 0, purged_tombstones: 0 }),
    disk,
    errors: errors(),
    flags: { auth_fake: env.authFake },
    ops: opsStats(db),
    product: productStats(db),
    uptime_s: Math.floor(process.uptime()),
    rss: process.memoryUsage().rss,
  }
}

const resolveAppeals = (db: DB, treeId: string, resolution: 'accepted' | 'rejected') =>
  db.prepare('UPDATE appeals SET resolved_at = ?, resolution = ? WHERE tree_id = ? AND resolved_at IS NULL').run(Date.now(), resolution, treeId)

/** 탈퇴(본인·관리자·카카오 웹훅 공통): 7일 유예 시작 */
export function softDeleteUser(db: DB, id: string, now: number) {
  db.prepare('UPDATE users SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL').run(now, id)
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
  softDeleteTreesOfUser(db, id, now)
}
/** 즉시 purge(관리자 purge_now·카카오 가입 미완료·일일 작업) */
export function purgeUserNow(db: DB, id: string) {
  purgeUser(db, id)
  db.prepare('DELETE FROM users WHERE id = ?').run(id)
}

// ---- 신고 (anon·user, owner 403, 존재 비노출) ----
function registerReport(app: Hono<AppEnv>) {
  app.post('/api/t/:slug/report', async (c) => {
    const u = c.get('user')
    hit(c, u ? `report:u:${u.id}` : `report:ip:${clientIp(c)}`, u ? 20 : 5, 3_600_000)
    requireFlag(c.get('db'), 'report') // #44 신고 스위치(워커 C) — 라우트가 여기 있어 1줄만
    const b = await body<{ reason?: unknown; note?: unknown }>(c)
    if (!['copyright', 'spam', 'abuse', 'other'].includes(b.reason as string)) fail(400, 'invalid', '신고 사유를 고르세요', 'reason')
    const note = optText(b.note, 300, 'note', true) ?? null
    const slug = c.req.param('slug')
    const treeId = /^[A-Za-z0-9_-]{1,64}$/.test(slug) ? treeIdBySlug(c.get('db'), slug) : null
    const id = randomUUID()
    if (treeId) {
      const db = c.get('db')
      const owner = (db.prepare('SELECT owner_id FROM trees WHERE id = ?').get(treeId) as { owner_id: string } | undefined)?.owner_id
      if (u && owner === u.id) fail(403, 'forbidden', '내 트리는 신고할 수 없습니다')
      const now = Date.now()
      tx(db, () => {
        db.prepare('INSERT INTO reports(id,tree_id,reporter_id,reason,note,created_at) VALUES(?,?,?,?,?,?)').run(id, treeId, u?.id ?? null, b.reason as string, note, now)
        // T2 #28: 열린 신고가 N건(settings.auto_hide_reports, 0 = 끔)에 닿으면 자동 임시 숨김 30일 — 운영자 부재 대비. 행위자 NULL = 시스템
        const n = getSettings(db, now).auto_hide_reports
        const open = n > 0 ? (db.prepare('SELECT COUNT(*) n FROM reports WHERE tree_id = ? AND resolved_at IS NULL').get(treeId) as { n: number }).n : 0
        if (n > 0 && open >= n && !(db.prepare('SELECT hidden_by_admin_at h FROM trees WHERE id = ?').get(treeId) as { h: number | null }).h) {
          setHidden(db, treeId, true, now, now + 30 * DAY)
          audit(db, null, 'tree.hide', 'tree', treeId, { reason: `신고 ${open}건 누적 자동 임시 숨김`, auto: true, reports: open, until: now + 30 * DAY })
        }
      })
    }
    return c.json({ id }, 201) // id = 접수번호 — #/report/<id> 로 상태 조회(T2 #26)
  })
}

// ---- 소명 (운영 숨김 당사자 = 소유자, 로그인 필요). 트리당 열린 소명 1건, 하루 5건 ----
function registerAppeal(app: Hono<AppEnv>) {
  app.post('/api/trees/:id/appeal', requireUser, async (c) => {
    const db = c.get('db'), u = c.get('user')!
    hit(c, `appeal:${u.id}`, 5, DAY)
    const id = treeIdOr404(c.req.param('id'))
    const text = optText((await body<{ text?: unknown }>(c)).text, 500, 'text', true) ?? fail(400, 'invalid', '소명 내용을 적어 주세요', 'text')
    const t = db.prepare('SELECT hidden_by_admin_at FROM trees WHERE id = ? AND owner_id = ? AND deleted_at IS NULL').get(id, u.id) as { hidden_by_admin_at: number | null } | undefined
    if (!t) fail(404, 'not_found', '트리가 없습니다')
    if (!t!.hidden_by_admin_at) fail(409, 'not_hidden', '숨김 상태가 아닙니다')
    if (db.prepare('SELECT 1 FROM appeals WHERE tree_id = ? AND resolved_at IS NULL').get(id)) fail(409, 'appeal_open', '이미 보낸 소명을 검토 중입니다')
    const now = Date.now(), aid = randomUUID()
    tx(db, () => {
      db.prepare('INSERT INTO appeals(id,tree_id,user_id,text,created_at) VALUES(?,?,?,?,?)').run(aid, id, u.id, text, now)
      audit(db, u.id, 'tree.appeal', 'tree', id, { appeal_id: aid }) // 본문은 appeals 에만(감사 로그엔 개인정보·자유 텍스트 금지)
    })
    return c.json({ id: aid, created_at: now }, 201)
  })
}

// ---- /api/admin/* ----
export function registerAdmin(app: Hono<AppEnv>) {
  registerReport(app)
  registerAppeal(app)
  app.use('/api/admin/*', requireAdmin, limit('admin', 120, 60_000))
  const me = (c: Context<AppEnv>) => c.get('user')!.id
  registerOps(app)
  registerLegal(app)
  registerProduct(app)

  app.get('/api/admin/stats', (c) => c.json(stats(c.get('db'))))

  app.get('/api/admin/users', (c) => {
    const db = c.get('db')
    const q = optText(c.req.query('q'), 40, 'q') ?? ''
    const n = lim(c.req.query('limit'))
    const where: string[] = []
    const p: (string | number)[] = []
    const ps = /^(google|kakao|fake):(.+)$/.exec(q)
    if (UUID.test(q)) { where.push('id = ?'); p.push(q.toLowerCase()) }
    else if (ps) { where.push('provider = ? AND provider_sub = ?'); p.push(ps[1], ps[2]) }
    else if (q) { where.push("nickname LIKE ? ESCAPE '\\'"); p.push(`%${q.replace(/[\\%_]/g, (m) => '\\' + m)}%`) }
    const cur = /^(\d+)_([0-9a-f-]{36})$/i.exec(c.req.query('cursor') ?? '')
    if (cur) { where.push('(created_at < ? OR (created_at = ? AND id < ?))'); p.push(Number(cur[1]), Number(cur[1]), cur[2]) }
    const rows = db.prepare(`SELECT ${USER_COLS} FROM users ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .all(...p, n + 1) as Omit<AdminUser, 'tree_count'>[]
    const more = rows.length > n
    const items = rows.slice(0, n).map((u) => adminUser(db, u))
    if (q) audit(db, me(c), 'user.search', 'user', null, { hits: items.length }) // 개인정보 접속기록(안전성 확보조치 기준 §8) — 검색어는 남기지 않는다
    return c.json({ items, next: more ? `${items[n - 1].created_at}_${items[n - 1].id}` : null })
  })

  app.get('/api/admin/users/:id', (c) => {
    const db = c.get('db')
    const u = userOr404(db, c.req.param('id'))
    const sessions = (db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(u.id) as { n: number }).n
    audit(db, me(c), 'user.view', 'user', u.id)
    return c.json({ ...adminUser(db, u), sessions, trees: treesOfUser(db, u.id) })
  })

  for (const act of ['suspend', 'unsuspend'] as const)
    app.post(`/api/admin/users/:id/${act}`, async (c) => {
      const db = c.get('db')
      const u = userOr404(db, c.req.param('id'))
      const reason = optText((await body<{ reason?: unknown }>(c)).reason, 200, 'reason')
      if (u.id === me(c)) fail(403, 'forbidden', '자기 자신은 정지할 수 없습니다')
      tx(db, () => {
        db.prepare('UPDATE users SET suspended_at = ? WHERE id = ?').run(act === 'suspend' ? Date.now() : null, u.id)
        if (act === 'suspend') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id)
        audit(db, me(c), `user.${act}`, 'user', u.id, reason ? { reason } : undefined)
      })
      return c.json({ user: adminUser(db, userOr404(db, u.id)) })
    })

  app.post('/api/admin/users/:id/delete', async (c) => {
    const db = c.get('db')
    const u = userOr404(db, c.req.param('id'))
    const purge = (await body<{ purge_now?: unknown }>(c)).purge_now === true
    if (u.id === me(c)) fail(403, 'forbidden', '자기 자신은 여기서 삭제할 수 없습니다')
    tx(db, () => {
      if (purge) purgeUserNow(db, u.id)
      else softDeleteUser(db, u.id, Date.now())
      audit(db, me(c), purge ? 'user.purge' : 'user.delete', 'user', u.id)
    })
    return c.body(null, 204)
  })

  app.get('/api/admin/trees', (c) => {
    const db = c.get('db')
    const cursor = c.req.query('cursor')
    const onlyDeleted = c.req.query('deleted') === '1'
    const r = listTreesForAdmin(db, { cursor: cursor && cursor.length <= 200 ? cursor : undefined, limit: lim(c.req.query('limit')), deleted: onlyDeleted })
    // 기본 목록 첫 페이지에 삭제 유예 트리(7일, deleted_at 포함)를 덧붙인다 — 클라이언트는 deleted_at 으로 "삭제 트리 복구" 목록을 가른다.
    // ponytail: 유예 트리는 최대 100개만(커서 없음). 많아지면 ?deleted=1 로 따로 페이지
    const items = !onlyDeleted && !cursor ? [...r.items, ...listTreesForAdmin(db, { limit: 100, deleted: true }).items] : r.items
    const open = db.prepare('SELECT COUNT(*) n FROM reports WHERE tree_id = ? AND resolved_at IS NULL')
    return c.json({ items: items.map((t) => ({ ...t, open_reports: (open.get(t.id) as { n: number }).n })), next: r.next })
  })

  for (const act of ['hide', 'unhide'] as const)
    app.post(`/api/admin/trees/:id/${act}`, async (c) => {
      const db = c.get('db')
      const id = treeIdOr404(c.req.param('id'))
      const reason = optText((await body<{ reason?: unknown }>(c)).reason, 200, 'reason')
      const tree = tx(db, () => {
        const t = setHidden(db, id, act === 'hide', Date.now())
        if (t) audit(db, me(c), `tree.${act}`, 'tree', id, reason ? { reason } : undefined)
        if (t && act === 'unhide') resolveAppeals(db, id, 'accepted')
        return t
      })
      return tree ? c.json({ tree }) : fail(404, 'not_found', '트리가 없습니다')
    })

  app.post('/api/admin/trees/:id/restore', async (c) => {
    const db = c.get('db')
    const id = treeIdOr404(c.req.param('id'))
    const reason = optText((await body<{ reason?: unknown }>(c)).reason, 200, 'reason')
    const tree = tx(db, () => {
      const t = restoreTree(db, id)
      if (t) audit(db, me(c), 'tree.restore', 'tree', id, reason ? { reason } : undefined)
      return t
    })
    return tree ? c.json({ tree }) : fail(410, 'purged', '7일이 지나 복구할 수 없습니다')
  })

  const REPORT_SQL = `SELECT r.id, r.tree_id, COALESCE(t.title, '') title, t.slug, t.hidden_by_admin_at, r.reason, r.note, r.created_at, r.resolved_at, r.resolution
    FROM reports r LEFT JOIN trees t ON t.id = r.tree_id`
  type RRow = Omit<Report, 'tree'> & { tree_id: string; title: string; slug: string | null; hidden_by_admin_at: number | null }
  const report = ({ tree_id, title, slug, hidden_by_admin_at, ...r }: RRow): Report => ({ ...r, tree: { id: tree_id, title, slug, hidden_by_admin_at } })

  app.get('/api/admin/reports', (c) => {
    const s = c.req.query('status') ?? 'open'
    const where = s === 'all' ? '' : s === 'resolved' ? 'WHERE r.resolved_at IS NOT NULL' : 'WHERE r.resolved_at IS NULL'
    const rows = c.get('db').prepare(`${REPORT_SQL} ${where} ORDER BY r.created_at DESC LIMIT 200`).all() as RRow[]
    return c.json({ items: rows.map(report) })
  })

  app.post('/api/admin/reports/:id/resolve', async (c) => {
    const db = c.get('db')
    const id = c.req.param('id')
    const res = (await body<{ resolution?: unknown }>(c)).resolution
    if (res !== 'hidden' && res !== 'dismissed') fail(400, 'invalid', '처리 방법을 고르세요', 'resolution')
    const r = UUID.test(id) ? (db.prepare(`${REPORT_SQL} WHERE r.id = ?`).get(id) as RRow | undefined) : undefined
    if (!r) fail(404, 'not_found', '신고가 없습니다')
    const now = Date.now()
    tx(db, () => {
      if (res === 'hidden') {
        setHidden(db, r!.tree_id, true, now)
        db.prepare("UPDATE reports SET resolved_at = ?, resolution = 'hidden' WHERE tree_id = ? AND resolved_at IS NULL").run(now, r!.tree_id)
        db.prepare("UPDATE reports SET resolved_at = ?, resolution = 'hidden' WHERE id = ?").run(now, id)
        audit(db, me(c), 'tree.hide', 'tree', r!.tree_id, { report_id: id })
      } else {
        db.prepare("UPDATE reports SET resolved_at = ?, resolution = 'dismissed' WHERE id = ?").run(now, id)
        audit(db, me(c), 'report.dismiss', 'report', id)
      }
    })
    return c.json({ report: report(db.prepare(`${REPORT_SQL} WHERE r.id = ?`).get(id) as RRow) })
  })

  // ---- 소명 큐 ----
  const APPEAL_SQL = `SELECT a.id, a.tree_id, COALESCE(t.title, '') title, t.slug, t.hidden_by_admin_at, COALESCE(u.nickname, '') owner, a.text, a.created_at, a.resolved_at, a.resolution
    FROM appeals a LEFT JOIN trees t ON t.id = a.tree_id LEFT JOIN users u ON u.id = a.user_id`
  type ARow = Omit<Appeal, 'tree'> & { tree_id: string; title: string; slug: string | null; hidden_by_admin_at: number | null }
  const appeal = ({ tree_id, title, slug, hidden_by_admin_at, ...a }: ARow): Appeal => ({ ...a, tree: { id: tree_id, title, slug, hidden_by_admin_at } })
  app.get('/api/admin/appeals', (c) => {
    const s = c.req.query('status') ?? 'open'
    const where = s === 'all' ? '' : s === 'resolved' ? 'WHERE a.resolved_at IS NOT NULL' : 'WHERE a.resolved_at IS NULL'
    return c.json({ items: (c.get('db').prepare(`${APPEAL_SQL} ${where} ORDER BY a.created_at DESC LIMIT 200`).all() as ARow[]).map(appeal) })
  })
  app.post('/api/admin/appeals/:id/resolve', async (c) => {
    const db = c.get('db')
    const id = c.req.param('id')
    const res = (await body<{ resolution?: unknown }>(c)).resolution
    if (res !== 'accepted' && res !== 'rejected') fail(400, 'invalid', '처리 방법을 고르세요', 'resolution')
    const a = UUID.test(id) ? (db.prepare(`${APPEAL_SQL} WHERE a.id = ?`).get(id) as ARow | undefined) : undefined
    if (!a) fail(404, 'not_found', '소명이 없습니다')
    tx(db, () => {
      if (res === 'accepted') { setHidden(db, a!.tree_id, false, Date.now()); audit(db, me(c), 'tree.unhide', 'tree', a!.tree_id, { appeal_id: id }) }
      else audit(db, me(c), 'appeal.reject', 'tree', a!.tree_id, { appeal_id: id })
      resolveAppeals(db, a!.tree_id, res as 'accepted' | 'rejected')
    })
    return c.json({ appeal: appeal(db.prepare(`${APPEAL_SQL} WHERE a.id = ?`).get(id) as ARow) })
  })

  app.get('/api/admin/settings', (c) => c.json({ settings: getSettings(c.get('db')) }))
  // 저장은 원본(notices 배열·maintenance {manual,from,until}·auto_hide_reports)만. 응답은 getSettings 파생값 포함 (T2 #29)
  app.put('/api/admin/settings', async (c) => {
    const db = c.get('db')
    const b = await body<{ notices?: unknown; maintenance?: { manual?: unknown; from?: unknown; until?: unknown }; auto_hide_reports?: unknown }>(c)
    const before = getSettings(db)
    const stored: Record<string, unknown> = { notices: before.notices, maintenance: { manual: before.maintenance.manual, from: before.maintenance.from ?? null, until: before.maintenance.until ?? null }, auto_hide_reports: before.auto_hide_reports }
    const next = { ...stored }
    if (b.notices !== undefined) {
      if (!Array.isArray(b.notices) || b.notices.length > 10) fail(400, 'invalid', '공지는 10개까지입니다', 'notices')
      next.notices = (b.notices as unknown[]).map(notice)
    }
    if (b.maintenance !== undefined) {
      const m = b.maintenance
      if (typeof m !== 'object' || m === null || typeof m.manual !== 'boolean') fail(400, 'invalid', '점검 모드 값이 올바르지 않습니다', 'maintenance')
      const ms = (x: unknown) => (x == null || x === '' ? null : Number.isFinite(x) && (x as number) > 0 ? (x as number) : fail(400, 'invalid', '점검 시각이 올바르지 않습니다', 'maintenance'))
      const from = ms(m!.from), until = ms(m!.until)
      if (from != null && until != null && until <= from) fail(400, 'invalid', '종료가 시작보다 앞입니다', 'maintenance')
      if (from == null && until != null) fail(400, 'invalid', '시작 시각이 필요합니다', 'maintenance')
      next.maintenance = { manual: m!.manual as boolean, from, until }
    }
    if (b.auto_hide_reports !== undefined) {
      const n = b.auto_hide_reports
      if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > 20) fail(400, 'invalid', '자동 숨김 기준은 0~20 입니다', 'auto_hide_reports')
      next.auto_hide_reports = n
    }
    const now = Date.now()
    const put = db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    tx(db, () => {
      for (const k of ['notices', 'maintenance', 'auto_hide_reports'] as const)
        if (JSON.stringify(stored[k]) !== JSON.stringify(next[k])) {
          put.run(k, JSON.stringify(next[k]), now)
          audit(db, me(c), `settings.${k === 'notices' ? 'notice' : k}`, 'settings', k, { before: stored[k], after: next[k] })
        }
    })
    return c.json({ settings: getSettings(db) })
  })

  // 감사 로그: 필터(action 접두·target_id·기간) + CSV(≤5,000행, T3 #35). audit_ts·audit_target 인덱스 사용
  app.get('/api/admin/audit', (c) => {
    const q = c.req.query()
    const csv = q.format === 'csv'
    const where: string[] = [], p: (string | number)[] = []
    const cur = Number(q.cursor); if (cur > 0) { where.push('a.id < ?'); p.push(cur) }
    const action = optText(q.action, 40, 'action'); if (action) { where.push("a.action LIKE ? ESCAPE '\\'"); p.push(action.replace(/[\\%_]/g, (m) => '\\' + m) + '%') }
    const target = optText(q.target_id, 64, 'target_id'); if (target) { where.push('a.target_id = ?'); p.push(target) }
    const from = Number(q.from), to = Number(q.to)
    if (from > 0) { where.push('a.ts >= ?'); p.push(from) }
    if (to > 0) { where.push('a.ts < ?'); p.push(to) }
    const n = csv ? 5000 : lim(q.limit)
    const rows = c.get('db').prepare(`SELECT a.*, u.nickname actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.id DESC LIMIT ?`)
      .all(...p, n + 1) as (Omit<AuditRow, 'meta'> & { meta: string | null })[]
    if (csv) {
      const cell = (v: unknown) => { const s = String(v ?? ''); return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` } // 수식 주입 방지
      const lines = rows.slice(0, n).map((r) => [new Date(r.ts).toISOString(), r.actor ?? r.actor_id ?? '', r.action, r.target_type ?? '', r.target_id ?? '', r.meta ?? ''].map(cell).join(','))
      return c.text(['ts,actor,action,target_type,target_id,meta', ...lines].join('\n'), 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="audit.csv"' })
    }
    const items = rows.slice(0, n).map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }))
    return c.json({ items, next: rows.length > n ? String(items[n - 1].id) : null })
  })
}
