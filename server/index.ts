// 서버 진입점 — 오케스트레이터 소유 (orchestration_server.md §3.1). Node 24 가 .ts 를 직접 실행한다: node server/index.ts
// 순서: 로그 → 오류 봉투 → db·세션 → CSRF → 점검 모드 → /api 라우트(SA·SS) → /t/:slug(SS) → 정적 dist
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { openDb, type DB } from './db.ts'
import { env } from './env.ts'
import { errorBody, HttpError, type AppEnv } from './http.ts'
import { registerAccount, sessionMiddleware, maintenanceMiddleware } from './account/index.ts'
import { registerSync, registerSharePages } from './sync/index.ts'

export async function createApp(db: DB) {
  const app = new Hono<AppEnv>()

  // 요청 로그: ts method path status ms 만 (IP·UA·쿼리스트링 금지, 03 §3.7)
  app.use(async (c, next) => {
    const t = performance.now()
    await next()
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/t/'))
      console.log(`${new Date().toISOString()} ${c.req.method} ${c.req.path} ${c.res.status} ${Math.round(performance.now() - t)}`)
  })
  app.onError((e, c) => {
    if (e instanceof HttpError) return c.json(errorBody(e.code, e.message, e.field), e.status as 400)
    console.error(e)
    return c.json(errorBody('internal', '서버 오류'), 500)
  })
  app.use(async (c, next) => { c.set('db', db); c.set('user', null); await next() })
  app.use('/api/*', sessionMiddleware)

  // CSRF (03 §3.2): 상태 변경 요청은 same-origin + JSON 만. 카카오 웹훅은 서버 간 호출이라 제외
  app.use('/api/*', async (c, next) => {
    const m = c.req.method
    if (m !== 'GET' && m !== 'HEAD' && m !== 'OPTIONS' && c.req.path !== '/api/auth/kakao/unlink-webhook') {
      const site = c.req.header('sec-fetch-site')
      if (site && site !== 'same-origin' && site !== 'none') throw new HttpError(403, 'forbidden', '허용되지 않은 출처입니다')
      const origin = c.req.header('origin')
      if (origin && origin !== env.origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, 'forbidden', '허용되지 않은 출처입니다')
      const ct = c.req.header('content-type') ?? ''
      if ((c.req.header('content-length') ?? '0') !== '0' && !ct.startsWith('application/json')) throw new HttpError(415, 'unsupported_media', 'JSON 만 받습니다')
    }
    await next()
  })
  app.use('/api/*', maintenanceMiddleware)

  app.get('/api/health', (c) => c.json({ ok: true }))
  registerAccount(app)
  registerSync(app)
  app.all('/api/*', (c) => c.json(errorBody('not_found', '없는 경로입니다'), 404))

  // 공유 보기 HTML(OG 치환)은 정적 서빙보다 먼저 (04 §3.4.1)
  const shell = () => readFileSync(join(env.distDir, 'index.html'), 'utf8')
  registerSharePages(app, shell)

  // 정적: 해시 파일은 immutable, 그 외(index.html·sw) no-cache. SPA 폴백 = index.html
  const root = relative(process.cwd(), env.distDir) || '.'
  app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable') })
  app.use('/*', serveStatic({ root }))
  app.get('*', (c) => { c.header('Cache-Control', 'no-cache'); return c.html(shell()) })
  return app
}

if (import.meta.main) {
  const db = await openDb()
  const app = await createApp(db)
  serve({ fetch: app.fetch, port: env.port, hostname: env.host }, (i) => console.log(`drilldown-server http://${env.host}:${i.port} (origin ${env.origin}${env.authFake ? ', AUTH_FAKE' : ''})`))
}
