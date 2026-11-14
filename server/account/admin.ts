// 관리자 API·감사 로그·설정·신고 (03 §3.4·§3.6). 비관리자 404(requireAdmin), 120/분.
import { randomUUID } from 'node:crypto'
import { readFileSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import type { Context, Hono } from 'hono'
import type { AdminStats, AdminUser, AuditRow, Report, Settings } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { env } from '../env.ts'
import { errors } from '../metrics.ts'
import { body, clientIp, DAY, fail, hit, limit, requireAdmin, type AppEnv } from '../http.ts'
import { listTreesForAdmin, purgeUser, restoreTree, setHidden, softDeleteTreesOfUser, treeCountOf, treeIdBySlug, treeStats, treesOfUser } from '../sync/owner.ts'

// ---- 공용: 감사 로그·설정·검증 ----
/** meta 에 개인정보·IP 금지(03 §3.7) */
export function audit(db: DB, actor: string | null, action: string, targetType: AuditRow['target_type'], targetId: string | null, meta?: Record<string, unknown>) {
  db.prepare('INSERT INTO audit_log(ts,actor_id,action,target_type,target_id,meta) VALUES(?,?,?,?,?,?)')
    .run(Date.now(), actor, action, targetType, targetId, meta ? JSON.stringify(meta) : null)
}

export function getSettings(db: DB): Settings {
  const s: Settings = { notice: { text: '', enabled: false }, maintenance: { enabled: false } }
  for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) {
    if (r.key === 'notice') s.notice = JSON.parse(r.value)
    if (r.key === 'maintenance') s.maintenance = JSON.parse(r.value)
  }
  return s
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

const USER_COLS = 'id, provider, nickname, role, created_at, last_seen_at, suspended_at, deleted_at'
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
    uptime_s: Math.floor(process.uptime()),
    rss: process.memoryUsage().rss,
  }
}

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
      db.prepare('INSERT INTO reports(id,tree_id,reporter_id,reason,note,created_at) VALUES(?,?,?,?,?,?)').run(id, treeId, u?.id ?? null, b.reason as string, note, Date.now())
    }
    return c.json({ id }, 201)
  })
}

// ---- /api/admin/* ----
export function registerAdmin(app: Hono<AppEnv>) {
  registerReport(app)
  app.use('/api/admin/*', requireAdmin, limit('admin', 120, 60_000))
  const me = (c: Context<AppEnv>) => c.get('user')!.id

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
    return c.json({ items, next: more ? `${items[n - 1].created_at}_${items[n - 1].id}` : null })
  })

  app.get('/api/admin/users/:id', (c) => {
    const db = c.get('db')
    const u = userOr404(db, c.req.param('id'))
    const sessions = (db.prepare('SELECT COUNT(*) n FROM sessions WHERE user_id = ?').get(u.id) as { n: number }).n
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

  app.get('/api/admin/settings', (c) => c.json({ settings: getSettings(c.get('db')) }))
  app.put('/api/admin/settings', async (c) => {
    const db = c.get('db')
    const b = await body<{ notice?: { text?: unknown; enabled?: unknown }; maintenance?: { enabled?: unknown } }>(c)
    const before = getSettings(db)
    const next: Settings = structuredClone(before)
    if (b.notice !== undefined) {
      if (typeof b.notice !== 'object' || b.notice === null || typeof b.notice.enabled !== 'boolean') fail(400, 'invalid', '공지 값이 올바르지 않습니다', 'notice')
      next.notice = { text: optText(b.notice!.text ?? '', 80, 'notice') ?? '', enabled: b.notice!.enabled as boolean }
    }
    if (b.maintenance !== undefined) {
      if (typeof b.maintenance !== 'object' || b.maintenance === null || typeof b.maintenance.enabled !== 'boolean') fail(400, 'invalid', '점검 모드 값이 올바르지 않습니다', 'maintenance')
      next.maintenance = { enabled: b.maintenance!.enabled as boolean }
    }
    const now = Date.now()
    const put = db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
    tx(db, () => {
      for (const k of ['notice', 'maintenance'] as const)
        if (JSON.stringify(before[k]) !== JSON.stringify(next[k])) {
          put.run(k, JSON.stringify(next[k]), now)
          audit(db, me(c), `settings.${k}`, 'settings', k, { before: before[k], after: next[k] })
        }
    })
    return c.json({ settings: next })
  })

  app.get('/api/admin/audit', (c) => {
    const cur = Number(c.req.query('cursor'))
    const n = lim(c.req.query('limit'))
    const rows = c.get('db').prepare(`SELECT a.*, u.nickname actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ${cur > 0 ? 'WHERE a.id < ?' : ''} ORDER BY a.id DESC LIMIT ?`)
      .all(...(cur > 0 ? [cur, n + 1] : [n + 1])) as (Omit<AuditRow, 'meta'> & { meta: string | null })[]
    const items = rows.slice(0, n).map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null }))
    return c.json({ items, next: rows.length > n ? String(items[n - 1].id) : null })
  })
}
