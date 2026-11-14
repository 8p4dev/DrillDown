// 법규·통지 — 저작권 게시중단(takedowns), 정보주체 요청 큐(requests), 접수 상태 조회, 임시조치 30일(hidden_until), 공지 복수·기간·점검 예약.
// docs/research/admin/00_synthesis.md T2 #23·#25~#29, w4_external.md §3. 공개 라우트(/api/takedown, /api/report/:id, /api/notices)와 관리자 라우트(/api/admin/*) 모두 여기.
// 원칙(03 §3.7): IP·이메일 저장 금지 — 예외는 게시중단 요구자 연락처(저작권법 §103 ② 통보용, 처리 후 90일 삭제). 감사 meta 에는 개인정보·자유 텍스트 없음.
import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { DsrKind, DsrRequest, LegalMe, ReportStatus, Takedown, TakedownState } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { body, clientIp, DAY, fail, hit, UUID, type AppEnv } from '../http.ts'
import { setHidden, treeIdBySlug } from '../sync/owner.ts'
import { audit, getSettings, noticeActive, optText, resolveAppeals } from './admin.ts'

const HOLD_MS = 30 * DAY   // 임시조치 상한(망법 §44조의2 ④). 재개 요구 기한(저작권법 영 §42, 통보일부터 30일)의 D-N 은 화면이 hidden_at 으로 계산
const RESUME_MS = 7 * DAY   // 재개 예정일 = 권리주장자 통보 후 7일(법정 기한 없음, 운영 규칙)
const DSR_MS = 10 * DAY     // 정보주체 요청 기한(영 §41·43·44)
const KEEP_MS = 90 * DAY    // 처리된 요청 보관
const SLUG_IN_URL = /(?:^|\/t\/)([1-9A-HJ-NP-Za-km-z]{11})\/?(?:[?#].*)?$/
const KINDS: DsrKind[] = ['access', 'correct', 'delete', 'suspend', 'minor', 'other']

/** 공지·점검 예고 — 로그인 사용자(users 포함) / 비로그인(all 만). 스케줄러 없이 요청 시각으로 판정 */
function legalFor(db: DB, loggedIn: boolean, now: number): LegalMe {
  const s = getSettings(db, now)
  const out: LegalMe = { notices: s.notices.filter((n) => noticeActive(n, now) && (loggedIn || n.audience === 'all')) }
  const m = s.maintenance
  if (!m.enabled && m.from != null && m.from > now) out.maintenance_scheduled = { from: m.from, until: m.until ?? null }
  return out
}
/** GET /api/me 에 합쳐지는 부분 */
export const legalMe = (db: DB): LegalMe => legalFor(db, true, Date.now())

/** 일일 작업: 임시조치 만료 → 숨김 해제(소명도 수용 처리), 처리된 게시중단·정보주체 요청 90일 삭제 */
export function legalDaily(db: DB, now: number): void {
  for (const { id } of db.prepare('SELECT id FROM trees WHERE hidden_by_admin_at IS NOT NULL AND hidden_until IS NOT NULL AND hidden_until <= ?').all(now) as { id: string }[]) {
    setHidden(db, id, false, now)
    db.prepare("UPDATE appeals SET resolved_at = ?, resolution = 'accepted' WHERE tree_id = ? AND resolved_at IS NULL").run(now, id)
    audit(db, null, 'tree.unhide', 'tree', id, { expired: true })
  }
  db.prepare('DELETE FROM takedowns WHERE resolved_at < ?').run(now - KEEP_MS)
  db.prepare('DELETE FROM requests WHERE resolved_at < ?').run(now - KEEP_MS)
}

const TD_SQL = `SELECT k.*, t.title, t.slug AS tree_slug, t.hidden_by_admin_at,
    (SELECT MIN(a.created_at) FROM appeals a WHERE a.tree_id = k.tree_id AND a.resolved_at IS NULL) AS appealed_at
  FROM takedowns k LEFT JOIN trees t ON t.id = k.tree_id`
type TdRow = Omit<Takedown, 'tree'> & { tree_id: string | null; title: string | null; tree_slug: string | null; hidden_by_admin_at: number | null }
const takedown = ({ tree_id, title, tree_slug, hidden_by_admin_at, ...k }: TdRow): Takedown =>
  ({ ...k, tree: tree_id ? { id: tree_id, title: title ?? '', slug: tree_slug, hidden_by_admin_at } : null })
/** 살아 있는 트리가 운영 숨김 상태인가(보류·확정 불문). admin.ts 자동 숨김도 같이 쓴다 */
export const isHidden = (db: DB, treeId: string) => !!(db.prepare('SELECT hidden_by_admin_at h FROM trees WHERE id = ? AND deleted_at IS NULL').get(treeId) as { h: number | null } | undefined)?.h

/** 관리자 동작 → (허용 이전 상태, 다음 상태). resume·reject 는 숨김 해제, confirm·litigation 은 숨김 유지 */
const TD_ACTIONS: Record<string, { from: TakedownState[]; to: TakedownState }> = {
  resume_notify: { from: ['hidden'], to: 'resume_notified' },
  resume: { from: ['hidden', 'resume_notified'], to: 'resumed' },
  litigation: { from: ['hidden', 'resume_notified'], to: 'litigation' },
  confirm: { from: ['hidden'], to: 'confirmed' },
  reject: { from: ['received', 'hidden'], to: 'rejected' },
}

export function registerLegal(app: Hono<AppEnv>) {
  const me = (c: Context<AppEnv>) => c.get('user')!.id

  // ---- 공개: 비로그인 공지(audience=all)·점검 예고 ----
  app.get('/api/notices', (c) => {
    hit(c, `notices:${clientIp(c)}`, 60, 60_000)
    c.header('Cache-Control', 'private, max-age=60')
    return c.json(legalFor(c.get('db'), !!c.get('user'), Date.now()))
  })

  // ---- 공개: 저작권 게시중단 요청(T2 #23). 비로그인 가능, IP 당 3/시(메모리 버킷, IP 저장 없음). 트리가 있으면 즉시 숨김(§103 ②) + 소유자 앱 내 통보(hidden_trees).
  // 숨김은 30일 임시조치(hidden_until) — 관리자가 confirm 하면 확정, 큐를 안 보면 legalDaily 가 자동 복원한다(익명 POST 1번으로 무기한 내리는 남용 방지, r1 M4) ----
  app.post('/api/takedown', async (c) => {
    hit(c, `takedown:ip:${clientIp(c)}`, 3, 3_600_000)
    const b = await body<{ url?: unknown; name?: unknown; contact?: unknown; claim?: unknown; attest?: unknown }>(c)
    const url = optText(b.url, 300, 'url') ?? fail(400, 'invalid', '트리 주소를 적어 주세요', 'url')
    const slug = SLUG_IN_URL.exec(url)?.[1] ?? fail(400, 'invalid', '공유 주소(/t/…) 또는 11자 코드가 아닙니다', 'url')
    const name = optText(b.name, 40, 'name') ?? fail(400, 'invalid', '성명을 적어 주세요', 'name')
    const contact = optText(b.contact, 120, 'contact') ?? fail(400, 'invalid', '연락처를 적어 주세요', 'contact')
    const claim = optText(b.claim, 1000, 'claim', true) ?? fail(400, 'invalid', '권리 소명을 적어 주세요', 'claim')
    if (b.attest !== true) fail(400, 'invalid', '사실 확인에 동의해 주세요', 'attest')
    const db = c.get('db'), now = Date.now(), id = randomUUID()
    const treeId = treeIdBySlug(db, slug)
    const live = treeId && !!db.prepare('SELECT 1 FROM trees WHERE id = ? AND deleted_at IS NULL').get(treeId)
    // hidden_at 은 "이 요청이 숨겼을 때만" — 이미 숨긴 트리(관리자·앞선 게시중단)에 찍으면 reject/resume 이 다른 사유의 숨김을 풀어 버린다(r1 H1)
    const hid = live && !isHidden(db, treeId)
    tx(db, () => {
      if (hid) {
        setHidden(db, treeId, true, now, now + HOLD_MS)
        audit(db, null, 'tree.hide', 'tree', treeId, { reason: '저작권 게시중단 요청 접수', takedown_id: id, until: now + HOLD_MS })
      }
      db.prepare('INSERT INTO takedowns(id,slug,tree_id,claimant_name,claimant_contact,claim,state,received_at,hidden_at) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id, slug, live ? treeId : null, name, contact, claim, live ? 'hidden' : 'received', now, hid ? now : null)
    })
    return c.json({ id }, 201)
  })

  // ---- 공개: 접수 상태(T2 #26). 신고·게시중단 접수번호 → 상태만(연락처·트리 없음). 없으면 404 ----
  app.get('/api/report/:id', (c) => {
    hit(c, `rstatus:${clientIp(c)}`, 30, 60_000)
    const id = c.req.param('id')
    if (!UUID.test(id)) fail(404, 'not_found', '접수번호를 찾을 수 없습니다')
    const db = c.get('db')
    const r = db.prepare('SELECT created_at, resolved_at, resolution FROM reports WHERE id = ?').get(id) as { created_at: number; resolved_at: number | null; resolution: 'hidden' | 'dismissed' | null } | undefined
    if (r) return c.json({ kind: 'report', state: r.resolution ?? 'open', received_at: r.created_at, updated_at: r.resolved_at } satisfies ReportStatus)
    const k = db.prepare('SELECT state, received_at, hidden_at, counter_at, resolved_at FROM takedowns WHERE id = ?').get(id) as { state: TakedownState; received_at: number; hidden_at: number | null; counter_at: number | null; resolved_at: number | null } | undefined
    if (!k) fail(404, 'not_found', '접수번호를 찾을 수 없습니다')
    return c.json({ kind: 'takedown', state: k!.state, received_at: k!.received_at, updated_at: k!.resolved_at ?? k!.counter_at ?? k!.hidden_at } satisfies ReportStatus)
  })

  // ---- 관리자: 게시중단 큐 ----
  app.get('/api/admin/takedowns', (c) => {
    const where = c.req.query('status') === 'all' ? '' : 'WHERE k.resolved_at IS NULL'
    return c.json({ items: (c.get('db').prepare(`${TD_SQL} ${where} ORDER BY k.received_at DESC LIMIT 200`).all() as TdRow[]).map(takedown) })
  })
  app.post('/api/admin/takedowns/:id', async (c) => {
    const db = c.get('db'), id = c.req.param('id')
    const action = (await body<{ action?: unknown }>(c)).action as string
    const a = TD_ACTIONS[action] ?? fail(400, 'invalid', '처리 방법을 고르세요', 'action')
    const k = UUID.test(id) ? (db.prepare(`${TD_SQL} WHERE k.id = ?`).get(id) as TdRow | undefined) : undefined
    if (!k) fail(404, 'not_found', '요청이 없습니다')
    if (!a.from.includes(k!.state)) fail(409, 'bad_state', '지금 상태에서는 할 수 없는 처리입니다')
    const now = Date.now(), tid = k!.tree_id
    tx(db, () => {
      if (action === 'resume_notify') {
        db.prepare('UPDATE takedowns SET state = ?, counter_at = ?, resume_due = ? WHERE id = ?').run(a.to, k!.appealed_at ?? now, now + RESUME_MS, id)
        audit(db, me(c), 'takedown.notify', 'tree', tid, { takedown_id: id, to: 'claimant', resume_due: now + RESUME_MS })
        return
      }
      db.prepare('UPDATE takedowns SET state = ?, resolved_at = ? WHERE id = ?').run(a.to, now, id)
      const unhide = (action === 'resume' || action === 'reject') && tid && k!.hidden_at && isHidden(db, tid)
      if (tid) resolveAppeals(db, tid, unhide ? 'accepted' : 'rejected', now)
      if (unhide) { setHidden(db, tid, false, now); audit(db, me(c), 'tree.unhide', 'tree', tid, { takedown_id: id }) }
      if (action === 'confirm' && tid) db.prepare('UPDATE trees SET hidden_until = NULL WHERE id = ?').run(tid) // 임시조치 → 확정(만료 없음)
      if (action !== 'resume') audit(db, me(c), `takedown.${action}`, 'tree', tid, { takedown_id: id })
    })
    return c.json({ takedown: takedown(db.prepare(`${TD_SQL} WHERE k.id = ?`).get(id) as TdRow) })
  })

  // ---- 관리자: 정보주체 요청 큐(T2 #25). 수동 입력, 기한 10일, 완료 시 audit dsr.<kind> ----
  const REQ = 'SELECT id, kind, channel, received_at, due_at, target_type, target_id, state, note, resolved_at FROM requests'
  app.get('/api/admin/requests', (c) => {
    const where = c.req.query('status') === 'all' ? '' : 'WHERE resolved_at IS NULL'
    return c.json({ items: c.get('db').prepare(`${REQ} ${where} ORDER BY due_at ASC LIMIT 200`).all() as unknown as DsrRequest[] })
  })
  app.post('/api/admin/requests', async (c) => {
    const db = c.get('db')
    const b = await body<{ kind?: unknown; channel?: unknown; received_at?: unknown; target_type?: unknown; target_id?: unknown; note?: unknown }>(c)
    if (!KINDS.includes(b.kind as DsrKind)) fail(400, 'invalid', '요청 종류를 고르세요', 'kind')
    const channel = optText(b.channel, 40, 'channel') ?? 'email'
    const now = Date.now()
    const received = b.received_at === undefined ? now : Number(b.received_at)
    if (!Number.isFinite(received) || received <= 0 || received > now + DAY) fail(400, 'invalid', '접수 시각이 올바르지 않습니다', 'received_at')
    if (b.target_type !== undefined && b.target_type !== 'user' && b.target_type !== 'tree') fail(400, 'invalid', '대상 종류가 올바르지 않습니다', 'target_type')
    const targetId = optText(b.target_id, 64, 'target_id') ?? null
    const note = optText(b.note, 300, 'note', true) ?? null
    const id = randomUUID()
    db.prepare('INSERT INTO requests(id,kind,channel,received_at,due_at,target_type,target_id,note) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, b.kind as string, channel, received, received + DSR_MS, (b.target_type as string | undefined) ?? null, targetId, note)
    return c.json({ request: db.prepare(`${REQ} WHERE id = ?`).get(id) as unknown as DsrRequest }, 201)
  })
  app.post('/api/admin/requests/:id', async (c) => {
    const db = c.get('db'), id = c.req.param('id')
    const b = await body<{ action?: unknown; note?: unknown }>(c)
    if (b.action !== 'done' && b.action !== 'rejected') fail(400, 'invalid', '처리 방법을 고르세요', 'action')
    const r = UUID.test(id) ? (db.prepare(`${REQ} WHERE id = ?`).get(id) as unknown as DsrRequest | undefined) : undefined
    if (!r) fail(404, 'not_found', '요청이 없습니다')
    if (r!.resolved_at) fail(409, 'bad_state', '이미 처리된 요청입니다')
    const note = optText(b.note, 300, 'note', true)
    const now = Date.now()
    tx(db, () => {
      db.prepare('UPDATE requests SET state = ?, resolved_at = ?, note = COALESCE(?, note) WHERE id = ?').run(b.action as string, now, note ?? null, id)
      audit(db, me(c), b.action === 'done' ? `dsr.${r!.kind}` : 'dsr.reject', r!.target_type, r!.target_id, { request_id: id, kind: r!.kind, channel: r!.channel, days: Math.ceil((now - r!.received_at) / DAY) })
    })
    return c.json({ request: db.prepare(`${REQ} WHERE id = ?`).get(id) as unknown as DsrRequest })
  })

  // ---- 관리자: 임시조치(보류 숨김 30일)·확정(T2 #27). 기존 /hide 는 확정 숨김 ----
  app.post('/api/admin/trees/:id/hold', async (c) => {
    const db = c.get('db'), id = c.req.param('id')
    const reason = optText((await body<{ reason?: unknown }>(c)).reason, 200, 'reason')
    if (isHidden(db, id)) fail(409, 'already_hidden', '이미 숨김 상태입니다')
    const now = Date.now()
    const tree = tx(db, () => {
      const t = setHidden(db, id, true, now, now + HOLD_MS)
      if (t) audit(db, me(c), 'tree.hide', 'tree', id, { ...(reason ? { reason } : {}), until: now + HOLD_MS })
      return t
    })
    return tree ? c.json({ tree }) : fail(404, 'not_found', '트리가 없습니다')
  })
  app.post('/api/admin/trees/:id/confirm', (c) => {
    const db = c.get('db'), id = c.req.param('id')
    const tree = tx(db, () => {
      const t = db.prepare('UPDATE trees SET hidden_until = NULL WHERE id = ? AND hidden_by_admin_at IS NOT NULL AND hidden_until IS NOT NULL RETURNING id, title, hidden_by_admin_at, hidden_until').get(id) as { id: string } | undefined
      if (t) audit(db, me(c), 'tree.hide_confirm', 'tree', id)
      return t
    })
    return tree ? c.json({ tree }) : fail(409, 'bad_state', '보류 숨김 상태가 아닙니다')
  })
}
