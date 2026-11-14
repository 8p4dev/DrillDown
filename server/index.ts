// 서버 진입점 — 오케스트레이터 소유 (orchestration_server.md §3.1). Node 24 가 .ts 를 직접 실행한다: node server/index.ts
// 순서: 로그 → 오류 봉투 → db·세션 → CSRF → 점검 모드 → /api 라우트(SA·SS) → /t/:slug(SS) → 정적 dist
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { openDb, type DB } from './db.ts'
import { env } from './env.ts'
import { errorBody, HttpError, type AppEnv } from './http.ts'
import { registerAccount, sessionMiddleware, maintenanceMiddleware } from './account/index.ts'
import { registerSync, registerSharePages } from './sync/index.ts'
import { LIMITS } from './sync/map.ts'
import { maskPath, recordError } from './metrics.ts'
import { dayOf, flushViews } from './account/product.ts'

export async function createApp(db: DB) {
  // r1 M5 + s1 H1: AUTH_FAKE 를 켠 채 https origin 이거나 루프백 밖에 바인딩하면(폰 테스트용 HOST=0.0.0.0 + http) 누구나 관리자 — 기동을 거부한다
  if (env.authFake && (env.secure || !['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(env.host))) throw new Error('AUTH_FAKE on https origin or non-loopback host')
  // #49 가용성 대용: 기동 시 오늘 행 restarts +1 (r1 L1 — 첫 요청 미들웨어는 /api/me 보다 늦게 등록돼 세지 못했다)
  db.prepare('INSERT INTO daily_stats(day, restarts) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET restarts = restarts + 1').run(dayOf(Date.now()))
  // r1 L5: 공유 조회 수는 메모리에 모아 5분마다 반영(요청당 fsync 금지)
  setInterval(() => flushViews(db), 5 * 60_000).unref()
  const app = new Hono<AppEnv>()

  // F9 보안 헤더 + CSP(s3-1, dangerouslySetInnerHTML 4곳의 2차 방어선). 인라인 <script>(테마·PWA register)는 기동 시 dist/index.html 에서 sha256 해시를 뽑아 허용 —
  // renderShare 는 <title>·<head> 끝만 바꿔 해시가 그대로다. 브라우저는 HTML 전처리로 CR LF → LF 한 뒤 해시하므로(CRLF 체크아웃) 같이 정규화한다. dist 가 없으면(check) 해시 없이.
  // HSTS 는 https origin 일 때만(s3-2). COEP 는 hono 기본값이 꺼짐(외부 아바타 이미지)
  const hashes = (() => {
    try { return [...readFileSync(join(env.distDir, 'index.html'), 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1].replace(/\r\n?/g, '\n')).digest('base64')}'`) } catch { return [] }
  })()
  app.use(secureHeaders({
    contentSecurityPolicy: { defaultSrc: ["'self'"], scriptSrc: ["'self'", ...hashes], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'https:', 'data:'], connectSrc: ["'self'"], frameAncestors: ["'none'"], baseUri: ["'self'"], objectSrc: ["'none'"], formAction: ["'self'"] },
    strictTransportSecurity: env.secure,
  }))
  // 요청 로그: ts method path status ms 만 (IP·UA·쿼리스트링 금지, 03 §3.7). 공유 slug 는 :slug 로 가린다(F10)
  app.use(async (c, next) => {
    const t = performance.now()
    await next()
    if (c.req.path.startsWith('/api/') || c.req.path.startsWith('/t/'))
      console.log(`${new Date().toISOString()} ${c.req.method} ${maskPath(c.req.path)} ${c.res.status} ${Math.round(performance.now() - t)}`)
  })
  app.onError((e, c) => {
    if (e instanceof HttpError) return c.json(errorBody(e.code, e.message, e.field), e.status as 400)
    console.error(e)
    recordError(e, c.req.method, c.req.path)
    return c.json(errorBody('internal', '서버 오류'), 500)
  })
  // F1 본문 상한: 다 읽기 전에 끊는다(익명 /api/t/:slug/report 포함). 동기화 상한(C8) + JSON 봉투 여유
  app.use('/api/*', bodyLimit({ maxSize: LIMITS.bytes + 64 * 1024, onError: (c) => c.json(errorBody('payload_too_large', '요청이 너무 큽니다'), 413) }))
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
      // 본문이 있으면(Content-Length≠0 또는 chunked) JSON 만. 브라우저는 본문 없는 POST 에 Content-Length: 0 을, DELETE 에는 아무것도 안 붙인다(s1 Info)
      const hasBody = c.req.header('transfer-encoding') != null || (c.req.header('content-length') ?? '0') !== '0'
      if (hasBody && !ct.startsWith('application/json')) throw new HttpError(415, 'unsupported_media', 'JSON 만 받습니다')
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
