// 운영 동작·운영 지표 — 사건 대응(전 세션 폐기·운영 기록), 수동 백업/일일/checkpoint, 버전·재시작, 관리자 목록, OAuth 상태, 복원 안내, 감사 필터/CSV, 메모리 카운터.
// docs/research/admin/00_synthesis.md T1 #13·#15·#16, T3 #31~#38, w2_ops.md. 전부 requireAdmin 뒤에 등록된다(admin.ts).
import type { Context, Hono } from 'hono'
import type { OpsStats } from '../../src/core/api.ts'
import { tx, type DB } from '../db.ts'
import { body, fail, type AppEnv } from '../http.ts'
import { audit, optText } from './admin.ts'

/** GET /api/admin/stats 의 ops 부분 — DB·WAL 크기, 세션 수, 카운터, 버전, OAuth 상태 등 (opsStats 를 채운다) */
export function opsStats(_db: DB): OpsStats {
  return {}
}

export function registerOps(app: Hono<AppEnv>) {
  const me = (c: Context<AppEnv>) => c.get('user')!.id
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

}
