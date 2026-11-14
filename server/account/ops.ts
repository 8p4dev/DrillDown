// 운영 동작·운영 지표 — 사건 대응(전 세션 폐기·운영 기록), 수동 백업/일일(자식 프로세스), checkpoint, 버전·재시작, 관리자 목록, OAuth 상태, 백업 파일 목록, 클라이언트 오류 수집, 사용자 세션 폐기·탈퇴 취소.
// docs/research/admin/00_synthesis.md T1 #13·#15·#16, T3 #31~#38, T4 #48·#49, w2_ops.md. /api/admin/* 는 requireAdmin 뒤(admin.ts). SQLite 쓰기는 audit 만 — 카운터는 metrics.ts(메모리).
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Context, Hono } from 'hono'
import type { AdminStats, OpsStats } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { env } from '../env.ts'
import { body, clientIp, CTRL, fail, hit, UUID, type AppEnv } from '../http.ts'
import { clientErrors, counts, recordClientError, STARTED_AT } from '../metrics.ts'
import { restoreTreesOfUser } from '../sync/owner.ts'
import { audit, optText } from './admin.ts'
import { flushViews } from './product.ts'

const ROOT = resolve(import.meta.dirname, '../..')
/** deploy/drilldown-server.service 의 MemoryMax=512M — 서버는 유닛 값을 모르니 상수(수동 동기) */
const RSS_MAX = 512 * 1024 * 1024
const JOBS = { backup: 'server/account/backup.ts', daily: 'server/account/daily.ts' } as const
type Job = keyof typeof JOBS
const running: Record<Job, boolean> = { backup: false, daily: false }
/** 실제 종료·자식 프로세스. check 가 가짜로 바꿔 흐름만 검증한다 */
export const hooks = {
  exit: (code: number): void => process.exit(code),
  /** systemd 타이머와 같은 방식(별도 node 프로세스) — 서버 안에서 runBackup 을 부르면 rclone 이 이벤트 루프를 30분 막는다. --watch 는 빼야 자식이 끝난다 */
  spawn: (script: string, onExit: () => void) => {
    const ch = spawn(process.execPath, [...process.execArgv.filter((a) => !a.startsWith('--watch')), join(ROOT, script)], { cwd: ROOT, stdio: 'ignore' })
    ch.on('exit', onExit); ch.on('error', onExit)
  },
}

const size = (f: string) => { try { return statSync(f).size } catch { return 0 } }
const mtime = (f: string) => { try { return statSync(f).mtimeMs } catch { return 0 } }
const readJson = <T>(file: string, dflt: T): T => { try { return JSON.parse(readFileSync(join(env.dataDir, file), 'utf8')) as T } catch { return dflt } }
/** 계약 C — GET /api/admin/ops/jobs: 실행 중 플래그 + backup.json·daily.json (stats 보다 가벼운 폴링용). stats 의 backup·daily 도 이것.
 *  at=0 = 아직 한 번도 안 돌았다(실패와 구분). configured = 외부 업로드 설정 유무(backup.ts 와 같은 환경 변수) */
export const jobs = () => ({
  running: { ...running },
  backup: { ...readJson<Omit<AdminStats['backup'], 'configured'>>('backup.json', { at: 0, bytes: 0, ok: false }), configured: !!(process.env.BACKUP_AGE_RECIPIENT && process.env.BACKUP_RCLONE_REMOTE) },
  daily: readJson<AdminStats['daily']>('daily.json', { at: 0, ok: false, purged_users: 0, purged_sessions: 0, purged_tombstones: 0 }),
})
/** .git/HEAD → 커밋 12자(exec 없이 파일만). worktree(.git 파일)·packed-refs 도 처리. 없으면 null */
function gitHead(): string | null {
  try {
    let dir = join(ROOT, '.git')
    if (statSync(dir).isFile()) dir = resolve(ROOT, readFileSync(dir, 'utf8').replace(/^gitdir:\s*/, '').trim())
    const head = readFileSync(join(dir, 'HEAD'), 'utf8').trim()
    const ref = /^ref: (.+)$/.exec(head)?.[1]
    if (!ref) return head.slice(0, 12)
    let common = dir
    try { common = resolve(dir, readFileSync(join(dir, 'commondir'), 'utf8').trim()) } catch { /* 일반 clone */ }
    try { return readFileSync(join(common, ref), 'utf8').trim().slice(0, 12) } catch { /* packed-refs 로 */ }
    return new RegExp(`^([0-9a-f]{40}) ${ref}$`, 'm').exec(readFileSync(join(common, 'packed-refs'), 'utf8'))?.[1].slice(0, 12) ?? null
  } catch { return null }
}
/** 재시작 필요 = dist/index.html 또는 server/**.ts 가 서버 시작 뒤에 바뀜(git pull && build 후 재시작을 잊은 경우) */
function newestSource(): number {
  let t = mtime(join(env.distDir, 'index.html'))
  try { for (const f of readdirSync(join(ROOT, 'server'), { recursive: true }) as string[]) if (f.endsWith('.ts')) t = Math.max(t, mtime(join(ROOT, 'server', f))) } catch { /* 없음 */ }
  return t
}

/** GET /api/admin/stats 의 ops 부분 — 전부 stat·PRAGMA·COUNT(상수 시간) */
export function opsStats(db: DB, now = Date.now()): OpsStats {
  const n = (sql: string, ...p: number[]) => (db.prepare(sql).get(...p) as { n: number }).n
  const pragma = (name: string) => Number(Object.values(db.prepare(`PRAGMA ${name}`).get() as Record<string, number>)[0])
  const bdir = join(env.dataDir, 'backups')
  let backups: OpsStats['db']['backups'] = []
  try { backups = readdirSync(bdir).filter((f) => /^app-\d{8}\.db$/.test(f)).sort().reverse().map((f) => { const s = statSync(join(bdir, f)); return { name: f, bytes: s.size, at: s.mtimeMs } }) } catch { /* 폴더 없음 */ }
  let asset: string | null = null
  try { asset = /index-([\w-]+)\.js/.exec(readFileSync(join(env.distDir, 'index.html'), 'utf8'))?.[1] ?? null } catch { /* 빌드 없음 */ }
  const last = Object.fromEntries((db.prepare('SELECT provider p, MAX(last_seen_at) t FROM users GROUP BY provider').all() as { p: string; t: number }[]).map((r) => [r.p, r.t]))
  const oauth = (p: 'google' | 'kakao') => ({ id: !!env[p].id, secret: !!env[p].secret, last_seen_at: last[p] ?? null })
  return {
    db: { file: size(join(env.dataDir, 'app.db')), wal: size(join(env.dataDir, 'app.db-wal')), page_size: pragma('page_size'), page_count: pragma('page_count'), freelist: pragma('freelist_count'), backups_bytes: backups.reduce((a, b) => a + b.bytes, 0), backups },
    rss_max: RSS_MAX,
    sessions: { total: n('SELECT COUNT(*) n FROM sessions'), expired: n('SELECT COUNT(*) n FROM sessions WHERE expires_at < ?', now), admin: n("SELECT COUNT(*) n FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin'") },
    counters: counts(),
    client_errors: clientErrors(),
    build: { git: gitHead(), asset, started_at: STARTED_AT, restart_needed: newestSource() > STARTED_AT },
    jobs: { ...running },
    oauth: { google: oauth('google'), kakao: oauth('kakao') },
    restore_at: (db.prepare("SELECT MAX(ts) t FROM audit_log WHERE action = 'system.restore'").get() as { t: number | null }).t,
  }
}

export function registerOps(app: Hono<AppEnv>) {
  const me = (c: Context<AppEnv>) => c.get('user')!.id

  // ---- 클라이언트 오류 수집(비로그인 포함, T4 #48): 메시지 200자·번들 파일명만, 분당 10건. 저장은 메모리 ----
  app.post('/api/client-error', async (c) => {
    hit(c, `cerr:${c.get('user')?.id ?? clientIp(c)}`, 10, 60_000)
    const b = await body<{ message?: unknown; version?: unknown }>(c)
    const msg = typeof b.message === 'string' ? Array.from(b.message.replace(new RegExp(CTRL.source, 'g'), ' ')).slice(0, 200).join('').trim() : ''
    if (!msg) fail(400, 'invalid', 'message 가 필요합니다', 'message')
    recordClientError(msg, typeof b.version === 'string' ? b.version.slice(0, 40) : '')
    return c.body(null, 204)
  })

  // ---- 다른 관리자 정지·삭제 차단(상호 잠금, w1 §8). admin.ts 핸들러보다 먼저 등록되므로 여기서 403. 자기 자신은 admin.ts 가 따로 403 ----
  for (const act of ['suspend', 'delete'])
    app.use(`/api/admin/users/:id/${act}`, async (c, next) => {
      const id = c.req.param('id')
      const u = UUID.test(id) ? (c.get('db').prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined) : undefined
      if (u?.role === 'admin' && id !== me(c)) fail(403, 'forbidden', '다른 관리자는 정지·삭제할 수 없습니다 — admins.json 에서 빼고 SSH 로')
      await next()
    })

  // ---- 사용자 상세 동작(T3 #34): 세션 전부 폐기(정지 없이) · 탈퇴 취소 ----
  const userRow = (db: DB, id: string) => (UUID.test(id) ? (db.prepare('SELECT id, deleted_at FROM users WHERE id = ?').get(id) as { id: string; deleted_at: number | null } | undefined) : undefined) ?? fail(404, 'not_found', '사용자가 없습니다')
  app.post('/api/admin/users/:id/revoke-sessions', (c) => {
    const db = c.get('db'), u = userRow(db, c.req.param('id'))
    const count = tx(db, () => { const k = Number(db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id).changes); audit(db, me(c), 'user.sessions_revoke', 'user', u.id, { count: k }); return k })
    return c.json({ count })
  })
  app.post('/api/admin/users/:id/undelete', (c) => {
    const db = c.get('db'), u = userRow(db, c.req.param('id'))
    if (!u.deleted_at) fail(409, 'not_deleted', '탈퇴 대기 상태가 아닙니다')
    tx(db, () => {
      db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(u.id)
      audit(db, me(c), 'user.restore', 'user', u.id, { by: 'admin', trees: restoreTreesOfUser(db, u.id, u.deleted_at!) }) // 본인 재로그인 복구(oauth.ts)와 같은 action
    })
    return c.body(null, 204)
  })

  // ---- 운영 동작 (사건 대응, 런북 §5): 전 세션 폐기 · 운영 기록 ----
  app.post('/api/admin/ops/revoke-sessions', (c) => {
    const db = c.get('db')
    const count = tx(db, () => {
      const n = Number(db.prepare('DELETE FROM sessions').run().changes)
      audit(db, me(c), 'system.sessions_revoke_all', 'settings', null, { count: n })
      return n
    })
    return c.json({ count }) // 관리자 본인도 로그아웃된다(의도)
  })
  app.post('/api/admin/ops/note', async (c) => {
    const b = await body<{ kind?: unknown; text?: unknown }>(c)
    if (b.kind !== 'incident' && b.kind !== 'restore' && b.kind !== 'note') fail(400, 'invalid', '기록 종류를 고르세요', 'kind')
    const text = optText(b.text, 200, 'text') ?? fail(400, 'invalid', '내용을 적어 주세요', 'text')
    audit(c.get('db'), me(c), `system.${b.kind as string}`, 'settings', null, { text })
    return c.body(null, 204)
  })

  // ---- 서버 (T3 #31·#32·#33·#38) ----
  /** admins.json 읽기(편집은 /etc 읽기 전용이라 SSH) + 내 provider:sub — 두 번째 운영자 온보딩용 */
  app.get('/api/admin/ops/admins', (c) => {
    const u = c.get('db').prepare('SELECT provider, provider_sub FROM users WHERE id = ?').get(me(c)) as { provider: string; provider_sub: string }
    let list: string[] = []
    try { const j = JSON.parse(readFileSync(env.adminsFile, 'utf8')) as unknown; if (Array.isArray(j)) list = j.filter((x): x is string => typeof x === 'string') } catch { /* 없음·깨짐 → 빈 목록 */ }
    return c.json({ file: env.adminsFile, list, me: `${u.provider}:${u.provider_sub}` })
  })
  app.get('/api/admin/ops/jobs', (c) => c.json(jobs()))
  /** 수동 백업·일일 작업: 자식 프로세스 1개, 동시 실행 409. 끝나면 jobs 의 running 이 false 로 돌아오고 backup.json/daily.json 이 새로 읽힌다 */
  app.post('/api/admin/ops/run/:job', (c) => {
    const job = c.req.param('job') as Job
    if (!(job in JOBS)) fail(404, 'not_found', '없는 작업입니다')
    if (running[job]) fail(409, 'running', '이미 실행 중입니다')
    running[job] = true
    hooks.spawn(JOBS[job], () => { running[job] = false })
    audit(c.get('db'), me(c), `system.${job}_run`, 'settings', null)
    return c.json({ running: true }, 202)
  })
  app.post('/api/admin/ops/checkpoint', (c) => {
    const db = c.get('db')
    const r = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy: number; log: number; checkpointed: number }
    audit(db, me(c), 'system.checkpoint', 'settings', null, r)
    return c.json(r)
  })
  /** 재시작 = 비정상 종료(1) → systemd Restart=on-failure 가 5초 뒤 되살린다(exit 0 은 안 뜬다). 응답이 나간 뒤 종료.
   *  자식(백업·일일)이 돌고 있으면 409 — KillMode=control-group 이라 함께 죽는다(r1 L2) */
  app.post('/api/admin/ops/restart', (c) => {
    if (running.backup || running.daily) fail(409, 'running', '작업이 끝난 뒤 재시작하세요')
    flushViews(c.get('db'))
    audit(c.get('db'), me(c), 'system.restart', 'settings', null)
    setTimeout(() => hooks.exit(1), 300)
    return c.body(null, 204)
  })
}
