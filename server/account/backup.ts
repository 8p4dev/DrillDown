// 백업 (03 §3.8, plan A3). systemd drilldown-backup.timer(03:00)가 `node server/account/backup.ts` 로 호출.
// sqlite backup() → data/backups/app-YYYYMMDD.db (14개 보관) → age·rclone 이 PATH 에 있고 환경 변수가 있으면 암호화·업로드 → data/backup.json
// 환경 변수(이 파일 전용): BACKUP_AGE_RECIPIENT (age 공개키 age1… 또는 파일 경로), BACKUP_RCLONE_REMOTE (예 b2:drilldown-backup)
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { backup } from 'node:sqlite'
import { openDb, type DB } from '../db.ts'
import { env } from '../env.ts'

const KEEP = 14
const has = (bin: string) => { try { execFileSync(bin, ['--version'], { stdio: 'ignore' }); return true } catch { return false } }

export interface BackupResult { at: number; bytes: number; ok: boolean; uploaded: boolean; error?: string }

export async function runBackup(db: DB, now = new Date()): Promise<BackupResult> {
  const r: BackupResult = { at: now.getTime(), bytes: 0, ok: false, uploaded: false }
  try {
    const dir = join(env.dataDir, 'backups')
    mkdirSync(dir, { recursive: true })
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
    const file = join(dir, `app-${ymd}.db`)
    rmSync(file, { force: true })
    await backup(db, file)
    r.bytes = statSync(file).size
    for (const f of readdirSync(dir).filter((x) => /^app-\d{8}\.db$/.test(x)).sort().slice(0, -KEEP)) rmSync(join(dir, f))

    const recipient = process.env.BACKUP_AGE_RECIPIENT, remote = process.env.BACKUP_RCLONE_REMOTE
    if (recipient && remote && has('age') && has('rclone')) {
      const enc = `${file}.age`
      execFileSync('age', [recipient.startsWith('age1') ? '-r' : '-R', recipient, '-o', enc, file], { stdio: 'ignore' })
      try { execFileSync('rclone', ['copyto', enc, `${remote.replace(/\/$/, '')}/app-${ymd}.db.age`], { stdio: 'ignore', timeout: 30 * 60_000 }) }
      finally { rmSync(enc, { force: true }) }
      r.uploaded = true
    }
    r.ok = true
  } catch (e) {
    r.error = (e as Error).message.slice(0, 200)
  }
  writeFileSync(join(env.dataDir, 'backup.json'), JSON.stringify(r))
  return r
}

if (import.meta.main) {
  const db = await openDb()
  const r = await runBackup(db)
  console.log(JSON.stringify(r))
  db.close()
  process.exitCode = r.ok ? 0 : 1
}
