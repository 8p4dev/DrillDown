// 일일 작업 (03 §3.8 표 1~7). systemd drilldown-daily.timer(04:00)가 `node server/account/daily.ts` 로 호출. 결과 → data/daily.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb, type DB } from '../db.ts'
import { env } from '../env.ts'
import { DAY, GRACE_MS } from '../http.ts'
import { purgeTombstones } from '../sync/owner.ts'
import { audit, purgeUserNow } from './admin.ts'
import { legalDaily } from './legal.ts'
import { productDaily } from './product.ts'
import { ABS_USER } from './session.ts'

export interface DailyResult { at: number; ok: boolean; purged_users: number; purged_sessions: number; purged_tombstones: number; error?: string }

export function runDaily(db: DB, now = Date.now()): DailyResult {
  const r: DailyResult = { at: now, ok: true, purged_users: 0, purged_sessions: 0, purged_tombstones: 0 }
  try {
    // 1. 만료·180일 세션 (관리자 24h 는 세션 미들웨어가 요청 때 지운다)
    r.purged_sessions = Number(db.prepare('DELETE FROM sessions WHERE expires_at < ? OR created_at < ?').run(now, now - ABS_USER).changes)
    // 2. 탈퇴 7일 경과 purge — 사용자마다 한 트랜잭션. 한 명이 실패해도 롤백·기록하고 나머지는 계속(F15)
    for (const { id } of db.prepare('SELECT id FROM users WHERE deleted_at < ?').all(now - GRACE_MS) as { id: string }[]) {
      db.exec('BEGIN IMMEDIATE')
      try { purgeUserNow(db, id); audit(db, null, 'user.purge', 'user', id); db.exec('COMMIT'); r.purged_users++ } catch (e) {
        db.exec('ROLLBACK')
        r.ok = false
        r.error = `purge ${id}: ${(e as Error).message}`.slice(0, 200)
        console.error('daily purge failed', id, e)
      }
    }
    // 3. SH 톰스톤
    r.purged_tombstones = purgeTombstones(db, now - GRACE_MS)
    // 5. 처리된 신고·소명 90일, 트리가 purge 된 소명(고아, r1 M2)
    db.prepare('DELETE FROM reports WHERE resolved_at < ?').run(now - 90 * DAY)
    db.prepare('DELETE FROM appeals WHERE resolved_at < ? OR tree_id NOT IN (SELECT id FROM trees)').run(now - 90 * DAY)
    legalDaily(db, now)
    productDaily(db, now)
    // 4. 감사 로그 1년 — 컷오프는 004 트리거(audit_no_delete)와 같은 식(초 단위, SQL 안에서)이어야 한다. ms 컷오프면 같은 초의 행에서 DELETE 전체가 ABORT 되므로(r1 M1) 맨 뒤에 둔다
    db.exec("DELETE FROM audit_log WHERE ts <= CAST(strftime('%s', 'now') AS INTEGER) * 1000 - 365 * 86400000")
    // 6.
    db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA optimize;')
  } catch (e) {
    r.ok = false
    r.error = (e as Error).message.slice(0, 200)
  }
  // 7.
  mkdirSync(env.dataDir, { recursive: true })
  writeFileSync(join(env.dataDir, 'daily.json'), JSON.stringify(r))
  return r
}

if (import.meta.main) {
  const db = await openDb()
  const r = runDaily(db)
  console.log(JSON.stringify(r))
  db.close()
  process.exitCode = r.ok ? 0 : 1
}
