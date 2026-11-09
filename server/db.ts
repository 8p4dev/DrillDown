// SQLite 연결 + 마이그레이션 — 오케스트레이터 소유 (orchestration_server.md §3.2). 규칙: 03 §3.8 "스키마 마이그레이션 규칙".
// server/migrations/NNN_<name>.sql 을 PRAGMA user_version 기준으로 순서대로 한 트랜잭션씩. 실행 전 pre-migrate 백업 1개.
import { mkdirSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync, backup } from 'node:sqlite'
import { env } from './env.ts'

const MIG_DIR = join(import.meta.dirname, 'migrations')

export type DB = DatabaseSync

export async function openDb(file = join(env.dataDir, 'app.db')): Promise<DB> {
  if (file !== ':memory:') mkdirSync(env.dataDir, { recursive: true })
  const db = new DatabaseSync(file)
  // synchronous=FULL (F3): seq 를 발급한 커밋이 전원 차단에도 남아야 한다. NORMAL 이면 마지막 커밋이 사라져 seq 가 되감기고 클라이언트 커서가 미래가 된다
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')
  await migrate(db, file)
  return db
}

async function migrate(db: DB, file: string) {
  const cur = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  const files = readdirSync(MIG_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
  const todo = files.filter((f) => Number(f.slice(0, 3)) > cur)
  if (!todo.length) {
    // 직전 성공 기동의 pre-migrate 백업은 지운다
    for (const f of readdirSync(env.dataDir).filter((x) => x.startsWith('pre-migrate-'))) rmSync(join(env.dataDir, f))
    return
  }
  if (file !== ':memory:' && cur > 0) await backup(db, join(env.dataDir, `pre-migrate-${String(cur).padStart(3, '0')}.db`))
  for (const f of todo) {
    const n = Number(f.slice(0, 3))
    db.exec('BEGIN')
    try {
      db.exec(readFileSync(join(MIG_DIR, f), 'utf8'))
      db.exec(`PRAGMA user_version = ${n}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`migration ${f} failed: ${(e as Error).message}`)
    }
  }
}

/** 트랜잭션 헬퍼: fn 이 throw 하면 ROLLBACK */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export const dbExists = (file = join(env.dataDir, 'app.db')) => existsSync(file)
