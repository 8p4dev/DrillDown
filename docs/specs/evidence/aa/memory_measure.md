# AA 측정 — Node 24 + `node:sqlite` 서버 프로세스 메모리

측정일 2026-11-08. 측정 환경: Windows 11 x64, Node v24.19.0 (이 저장소 개발 PC). Pi 5(ARM64 Linux)가 아니므로 절대값은 **[가정] 같은 자릿수**로만 쓴다. ARM64 Linux glibc 환경의 Node RSS는 보통 Windows보다 작거나 비슷하다 [가정: 미측정].

## 결과

| 케이스 | RSS | heapUsed | external | 비고 |
|---|---|---|---|---|
| `node:http` 서버만, 5초 유휴 | **54.7 MB** (54,693,888 B) | 8.1 MB | 4.0 MB | 프레임워크 없음 |
| `node:http` + `node:sqlite`, users·sessions·audit_log 스키마, 사용자 1만 + 세션 1만 시드 후 조회 1천 회, 5초 유휴 | **63.1 MB** (63,053,824 B) | 9.9 MB | 4.1 MB | WAL 모드 |

부가 측정(같은 실행):
- 사용자 1만 + 세션 1만 INSERT(단일 트랜잭션): **51 ms**
- 세션 id → 사용자 JOIN 조회: **5.3 µs/건** (1천 회 평균, 준비된 문장)
- DB 크기(page_count × page_size): **3,997,696 B ≈ 4.0 MB** → 사용자 1명 + 세션 1개 ≈ **400 B**. 가입 1만 명·세션 3만 개여도 수십 MB 수준 [계산].

## 해석
- 인증·계정·관리자 API 서버는 **Node 프로세스 1개 ≈ 60~70 MB RSS**로 돈다(측정값 + 라우터·쿠키 처리 여유 [가정 +10 MB]). Pi 5 2 GB에도 들어가고, 4 GB면 OS 페이지 캐시 여유가 충분하다 [추론].
- Postgres를 따로 띄우는 최소 구성(약 20~60 MB, 출처: 03 §7 표)보다 프로세스 수·백업 절차가 하나 적다. 메모리 차이 자체는 크지 않다. 차이는 **운영 단순성**이다(스펙 §3.1).
- `node:sqlite`는 Node 24에서 플래그 없이 쓰이며(실행 시 경고 없음, 이 측정으로 확인) 문서상 안정성 1.2(Release candidate, Node 25.7 기준) [출처: nodejs.org/api/sqlite.html 2026-11-08].

## 스크립트 (그대로 재실행 가능. 커밋하지 않은 임시 코드)

`bare.mjs`
```js
import http from 'node:http'
const s = http.createServer((req, res) => res.end('{"ok":true}'))
s.listen(0, () => setTimeout(() => {
  const m = process.memoryUsage()
  console.log(JSON.stringify({ case: 'node_http_only', node: process.version, rss: m.rss, heapUsed: m.heapUsed, external: m.external }))
  process.exit(0)
}, 5000))
```

`sqlite.mjs`
```js
import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
const db = new DatabaseSync('m.db')
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, provider TEXT, provider_sub TEXT, nickname TEXT, avatar_url TEXT, role TEXT, created_at INT, last_seen_at INT, suspended_at INT, deleted_at INT, UNIQUE(provider, provider_sub));
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, user_id TEXT, created_at INT, expires_at INT, ua TEXT, last_seen_at INT);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY, ts INT, actor_id TEXT, action TEXT, target_type TEXT, target_id TEXT, meta TEXT);`)
const N = 10000, t0 = performance.now()
const iu = db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,NULL,NULL)')
const is = db.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)')
db.exec('BEGIN')
for (let i = 0; i < N; i++) {
  const uid = randomUUID(), now = Date.now()
  iu.run(uid, i % 2 ? 'google' : 'kakao', String(1e9 + i), '사용자' + i, null, 'user', now, now)
  is.run(randomUUID(), uid, now, now + 30 * 864e5, 'Mozilla/5.0 (test)', now)
}
db.exec('COMMIT')
const seedMs = performance.now() - t0
const q = db.prepare('SELECT u.id, u.nickname, u.role, s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?')
const ids = db.prepare('SELECT id FROM sessions LIMIT 1000').all().map(r => r.id)
const t1 = performance.now()
for (const id of ids) q.get(id)
const lookupUs = ((performance.now() - t1) / ids.length) * 1000
http.createServer((req, res) => res.end(JSON.stringify(q.get(ids[0])))).listen(0, () => setTimeout(() => {
  const m = process.memoryUsage()
  const size = db.prepare('SELECT page_count*page_size AS b FROM pragma_page_count(), pragma_page_size()').get().b
  console.log(JSON.stringify({ case: 'node_http_sqlite_10k', node: process.version, rss: m.rss, heapUsed: m.heapUsed, external: m.external, seedMs: Math.round(seedMs), sessionLookupUs: +lookupUs.toFixed(1), dbBytes: size }))
  process.exit(0)
}, 5000))
```

원본 출력:
```
{"case":"node_http_only","node":"v24.19.0","rss":54693888,"heapUsed":8078736,"external":4012731}
{"case":"node_http_sqlite_10k","node":"v24.19.0","rss":63053824,"heapUsed":9859296,"external":4073929,"seedMs":51,"sessionLookupUs":5.3,"dbBytes":3997696}
```
