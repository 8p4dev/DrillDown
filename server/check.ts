// 서버 자가 검사 진입점 — 오케스트레이터 소유. 각 모듈의 *.check.ts 를 여기서 import 한다(SA: account, SS: sync).
// 메모리 DB 로 앱을 만들어 app.request() 로 호출한다. 실패하면 assert 가 throw → 종료 코드 1.
import assert from 'node:assert/strict'
import { openDb } from './db.ts'
import { createApp } from './index.ts'

const db = await openDb(':memory:')
const app = await createApp(db)
const r = await app.request('/api/health')
assert.equal(r.status, 200)
assert.deepEqual(await r.json(), { ok: true })
// F9 보안 헤더(CSP·COEP 는 없음 — 인라인 테마 스크립트·외부 아바타 이미지)
assert.equal(r.headers.get('x-content-type-options'), 'nosniff')
assert.equal(r.headers.get('x-frame-options'), 'SAMEORIGIN')
assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
assert.equal(r.headers.get('content-security-policy'), null)
assert.equal(r.headers.get('cross-origin-embedder-policy'), null)
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
// U48: 트리 복원(bumpChildren)의 노드 조회가 전체 SCAN 이 아니라 인덱스를 탄다
const { TREE_NODES_SQL } = await import('./sync/seq.ts')
const plan = (db.prepare('EXPLAIN QUERY PLAN ' + TREE_NODES_SQL).all('u', 't') as { detail: string }[]).map((x) => x.detail).join()
assert.match(plan, /USING INDEX/, plan)
await import('./account/account.check.ts')
await import('./sync/sync.check.ts')
console.log('server.check ok')
