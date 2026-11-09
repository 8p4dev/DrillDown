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
