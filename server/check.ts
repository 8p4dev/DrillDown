// 서버 자가 검사 진입점 — 오케스트레이터 소유. 각 모듈의 *.check.ts 를 여기서 import 한다(SA: account, SS: sync).
// 메모리 DB 로 앱을 만들어 app.request() 로 호출한다. 실패하면 assert 가 throw → 종료 코드 1.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDb } from './db.ts'
import { env } from './env.ts'
import { createApp } from './index.ts'

const db = await openDb(':memory:')
const app = await createApp(db)
const r = await app.request('/api/health')
assert.equal(r.status, 200)
assert.deepEqual(await r.json(), { ok: true })
// F9 보안 헤더 + CSP(s3-1): script-src 는 self + dist/index.html 인라인 스크립트(테마·PWA register) 해시, unsafe-inline 없음. http 환경이라 HSTS 없음(s3-2). COEP 없음(외부 아바타 이미지)
assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN')
assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
assert.equal(r.headers.get('strict-transport-security'), null)
assert.equal(r.headers.get('cross-origin-embedder-policy'), null)
const csp = r.headers.get('content-security-policy')!
for (const d of ["default-src 'self'", "style-src 'self' 'unsafe-inline'", 'img-src \'self\' https: data:', "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'", "form-action 'self'"]) assert.ok(csp.includes(d), `${d} ∉ ${csp}`)
const scriptSrc = /script-src ([^;]*)/.exec(csp)![1]
assert.ok(scriptSrc.startsWith("'self'") && !scriptSrc.includes("'unsafe-inline'"), scriptSrc)
const shellPath = join(env.distDir, 'index.html')
if (existsSync(shellPath)) {
  const inline = [...readFileSync(shellPath, 'utf8').matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.ok(inline.length >= 2, 'dist/index.html 에 인라인 스크립트(테마·PWA register) 2개')
  // 브라우저가 해시하는 텍스트는 HTML 전처리(CR LF → LF) 뒤의 것 — CRLF 로 체크아웃된 index.html 에서도 맞아야 한다
  for (const s of inline) assert.ok(scriptSrc.includes(`'sha256-${createHash('sha256').update(s.replace(/\r\n?/g, '\n')).digest('base64')}'`), s.slice(0, 60))
} else assert.equal(scriptSrc, "'self'")
// F1 본문 상한: 3MB POST(익명 신고 경로) → 413 기존 봉투. 상한 바로 아래는 통과(라우트가 400 으로 거절)
const big = await app.request('/api/t/abcdefghijk/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'spam', note: 'x'.repeat(3 * 1024 * 1024) }) })
assert.equal(big.status, 413)
assert.equal(((await big.json()) as { error: { code: string } }).error.code, 'payload_too_large')
const under = await app.request('/api/t/abcdefghijk/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'spam', note: 'x'.repeat(2 * 1024 * 1024) }) })
assert.equal(under.status, 400)
// F10 요청 로그에서 공유 slug 가림
const logs: string[] = []
const origLog = console.log
console.log = (...a: unknown[]) => { logs.push(a.join(' ')) }
try { await app.request('/api/t/abcdefghijk') } finally { console.log = origLog }
assert.equal(logs.filter((l) => l.includes(' /api/t/:slug ') && !l.includes('abcdefghijk')).length, 1, logs.join('\n'))
const nf = await app.request('/api/nope')
assert.equal(nf.status, 404)
assert.equal(((await nf.json()) as { error: { code: string } }).error.code, 'not_found')
const csrf = await app.request('/api/anything', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })
assert.equal(csrf.status, 403)
// s1 Info: 출처 헤더·Content-Length 를 다 빼고 chunked 본문만 보내도 JSON 이 아니면 415. 본문 없는 POST(Content-Length: 0)는 통과(라우트 404)
assert.equal((await app.request('/api/anything', { method: 'POST', headers: { 'transfer-encoding': 'chunked', 'content-type': 'text/plain' }, body: '{"x":1}' })).status, 415)
assert.equal((await app.request('/api/anything', { method: 'POST', headers: { 'content-length': '0' } })).status, 404)
// U48: 트리 복원(bumpChildren)의 노드 조회가 전체 SCAN 이 아니라 인덱스를 탄다
const { TREE_NODES_SQL } = await import('./sync/seq.ts')
const plan = (db.prepare('EXPLAIN QUERY PLAN ' + TREE_NODES_SQL).all('u', 't') as { detail: string }[]).map((x) => x.detail).join()
assert.match(plan, /USING INDEX/, plan)
await import('./account/account.check.ts')
await import('./sync/sync.check.ts')
console.log('server.check ok')
