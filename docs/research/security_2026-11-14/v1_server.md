# V1 서버 재공격 보고서 (보안 수정 재검토)

- 날짜: 2026-11-14
- 영역: V1 서버 재공격 (`server/**`, `deploy/**`, `.env.example`)
- 기준: main `4836a97` (브리핑의 `ba4a374` 위에 V2 수정 `4836a97` 이 머지돼 있어 **4836a97 을 재검토했다**)
- 방식: 읽기 전용. 저장소 미수정. 원래 재현 스크립트 방식(메모리 DB + 순수 함수 + `app.request()`)으로 각 항목을 다시 공격. 단일 스펙·`npm run e2e` 전체 실행은 하지 않음.
- 재현 스크립트 위치: `…/5d9cb1c9-…/scratchpad/` 의 `guard.mjs`·`attack.mjs`·`sess.mjs`·`http.mjs`·`http2.mjs`·`td.mjs`·`daily.mjs`·`csp2.mjs`

## 0. 한 줄 결론

**#1~#9·#12·OG 의 수정은 전부 원래 공격을 막는다(✔).** 코드가 뚫리는 결함(Critical/High)은 없다. 다만 **#3 은 우회 변형이 남았다**: XFF·X-Real-IP 위조는 막혔지만 `cf-connecting-ip` 위조는 **터널 없이 직접 접속하면 그대로 레이트 리밋을 무력화**한다(설계상 "터널 뒤" 가정에 전적으로 의존). 그 외는 막힘이고, 수정으로 생긴 **동작 변화(회귀) 5건**과 보안엔 영향 없는 **데이터 품질·워크플로 결함 2건**을 아래 적는다.

## 1. 항목별 재공격 결과표

| # | 결과 | 요청 예시 / 증상 |
|---|---|---|
| 1 AUTH_FAKE 가드 | **막힘 ✔** | `AUTH_FAKE=1`+`HOST=0.0.0.0`/`::`/`::ffff:127.0.0.1` (http) → 기동 거부. `AUTH_FAKE=1`+https origin → 거부. 루프백(`127.0.0.1`·빈 값·`localhost`·`::1`)+http → 기동 허용(개발). `AUTH_FAKE=0`+`0.0.0.0` → 허용(가드는 fake 전용). 세 유닛 모두 `Environment=AUTH_FAKE=0` 이 `EnvironmentFile=` **뒤**에 있어 env 파일을 덮어씀 |
| 2 auto_correct_days 총량 | **막힘 ✔** | 같은 노드에 3,000개씩 20회 push(정상 경로) → 병합 길이 `3660` 고정. 더 오래된 updatedAt 으로 3,000개 추가(superseded 경로) → `3660` 고정. 상한 경계: 1회 3,660 허용·3,661 → 400. `9999-99-99`·`2023-13-01`·`2023-00-10`·`2023-01-32` → 400 |
| 3 clientIp(레이트 리밋) | **막힘 ✔ + 우회됨 ✘** | **✔** `x-forwarded-for`·`x-real-ip` 를 매 요청 회전시켜 13회 → 4회째부터 429(모두 `local` 버킷 공유). 대소문자 무관(hono 소문자화). **✘** `cf-connecting-ip` 를 `9.9.9.0`…`9.9.9.12` 로 회전 13회 → **429 0건**(각 위조 IP = 별도 버킷). 터널 없이 서버에 직접 닿을 수 있으면(직접 접속·LAN·동일 호스트·헤더를 통과시키는 터널 오설정) 레이트 리밋 전부 우회 |
| 4 게시중단 reject/resume 판정 | **막힘 ✔** | S1 게시중단만 → reject ⇒ 공개 복귀(정상 해제). S2 게시중단 → 관리자 `/hide`(독립 사유) → 같은 게시중단 reject ⇒ **숨김 유지**(r1 H1·s2-02 회귀 재발 없음). S3 같은 트리 게시중단 2건 교차 → 숨긴 1건 reject ⇒ 공개(2건째는 애초에 재숨김 안 함). S4 관리자 hide→unhide→reject ⇒ 공개 유지, 크래시 없음(200) |
| 5 백업·pre-migrate 모드 | **막힘 ✔(코드 경로)** | `backup.ts`: `mkdirSync(…,{mode:0o700})` + 기존 폴더도 `chmodSync(dir,0o700)` + 파일 `chmodSync(file,0o600)`. `db.ts` pre-migrate: `chmodSync(pre,0o600)`. **Windows 에서 chmod 는 부분 no-op(쓰기 비트만)이라 이 개발기에서 실모드 검증 불가** — 실제 0600/0700 확인은 리눅스 실행에서(계획의 `platform!=='win32'` 단언 경로) |
| 6 legalDaily 180일·고아 | **막힘 ✔** | 처리됨 91일 → 삭제, 처리됨 10일 → 유지. 미처리 181일 → 삭제, 미처리 10일 → 유지. **처리 중(resume_notified)·최근·트리 존재 → 유지**(처리 중 건 안 지움). 고아(대상 트리 purge, 최근이어도) → 삭제. 트리 없는 접수(tree_id NULL) → 180일까지 유지. requests 도 동일 |
| 7 attempts 범위·소유권 | **막힘 ✔** | `nodeRecall=1e308`·`1.0000001`·음수 → 400. `edgeAccuracy=-0.1` → 400. 카운트 `-1`·`1e308` → 400. 남의 트리 참조 attempt → `dropped`. 내 트리 attempt → 저장. 공유 복제본은 내 owner_id 라 정상 저장, 휴지통(소프트삭제) 내 트리 attempt 는 내 소유면 저장(무해) |
| 8 세션 상한 20 | **막힘 ✔** | 한 사용자 25세션 생성 후 트림 쿼리 → 최신 20개만(`s5`…`s24`), 오래된 5개 삭제. UA(관리자 UA·모바일 UA)·role 섞여도 `user_id` 단위라 20 유지 |
| 9 CSP | **막힘 ✔** | 헤더 존재. `script-src 'self' sha256×2`(dist/index.html 인라인 2개와 일치, CRLF→LF 정규화로 CRLF 체크아웃에서도 일치), `'unsafe-inline'` 없음. `style-src 'self' 'unsafe-inline'`, `img-src 'self' https: data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`. HSTS 는 http 에서 없음. **공유 셸 `/t/:slug`·SPA 셸·`/api`·`/assets` CSP 전부 동일**. PWA SW·manifest·아바타 미차단(분석: worker/manifest→`default-src 'self'`, 등록 인라인 스크립트는 해시됨, 아바타 `https:`·`data:` 허용) |
| 12 CSRF CT 강제 | **막힘 ✔** | 실제 본문(Content-Length 세팅 시) `text/plain` → 415, CT 없음+본문 → 415, `transfer-encoding: chunked`+비JSON → 415. **정상 클라이언트 안 깨짐**: 본문 없는 POST(CL:0)·DELETE → 통과, `application/json` 본문 → 통과, `fetch(keepalive, json)` 의 `/api/client-error` → 204. 교차 출처(`sec-fetch-site`·foreign `origin`) → 403 |
| OG 셸 이스케이프 | **막힘 ✔** | 제목 `"><script>alert(2)</script>` 공개 → `<title>` 요소·`og:title content="…"` 속성 **두 컨텍스트 모두 수치 엔티티**(`&#60;script&#62;…`), raw `<script` 0. `$&` 포함 제목도 함수형 replacer 로 리터럴 유지. renderShare 는 `<title>`·`</head>` 만 바꿔 인라인 스크립트 해시 불변(CSP 유효) |

## 2. 우회됨 (상세)

### #3 — `cf-connecting-ip` 회전으로 레이트 리밋 우회 (조건부, 설계상 수용된 잔여)

- **재현**: `http.mjs`/`http2.mjs`. `POST /api/takedown` 를 `cf-connecting-ip: 9.9.9.0..12` 로 13회 → 429 0건. (대조: XFF 회전은 4회째 429 — ✔ 막힘.)
- **원리**: `server/http.ts:48` `clientIp = c.req.header('cf-connecting-ip') ?? 'local'`. 이 헤더를 **무조건 신뢰**한다. 운영 가정(서버 `127.0.0.1` 바인딩 + Cloudflare Tunnel 이 CF-Connecting-IP 를 덮어씀)에서는 외부인이 못 넣는다. 하지만 서버에 직접 닿으면(LAN·동일 호스트·`HOST` 비루프백 오설정 + `AUTH_FAKE=0` 이라 #1 가드 미발동·헤더를 통과시키는 터널) 위조·회전으로 모든 IP 기준 리밋(takedown 3/시, report 30/분, oauth 10/분, notices 60/분)을 무력화.
- **평가**: 원래 #3(XFF)과 **같은 신뢰 경계 문제가 헤더만 바뀐 것**. 수정 주석도 "터널 뒤라 CF-Connecting-IP 만 신뢰" 로 명시 — 네트워크 격리에 전적으로 의존. Critical 아님(운영 구성에서 실제 외부 공격 불가), 그러나 "터널 없이 위조 가능한가?" 의 답은 **가능**.
- **남은 결함 / 최소 diff** (`server/http.ts:48`): 네트워크로만 막는 대신 터널 공유 비밀로 게이트하면 직접 접속 시 위조를 무력화한다(선택).
  ```ts
  // 터널이 주입하는 비밀 헤더가 있을 때만 CF-Connecting-IP 신뢰. 없으면 단일 버킷
  export const clientIp = (c: Context) =>
    (process.env.TUNNEL_SECRET && c.req.header('x-tunnel-secret') === process.env.TUNNEL_SECRET)
      ? (c.req.header('cf-connecting-ip') ?? 'local') : 'local'
  ```
  비용 없이 유지하려면 런북에 "서버를 터널로만 노출(127.0.0.1 바인딩), 직접 접속 금지" 를 레이트 리밋 전제로 명시.

## 3. 회귀 (기존 check·e2e 는 통과하나 동작이 바뀜)

| 항목 | 증상 | 근거 |
|---|---|---|
| #3 XFF 폴백 삭제 | Cloudflare 없이(개발·직접 노출) 모든 클라이언트가 단일 `local` 버킷을 **공유** → 한 클라이언트의 요청이 같은 인스턴스의 다른 모두를 429 로 만든다(원래 작업 지시서가 예로 든 "개발 환경 레이트 리밋 공유") | `http.ts:48`, `http.mjs` XFF 13회가 서로 다른 IP인데도 공유 버킷으로 429 |
| #8 세션 상한 20 | 동시 기기 20대 초과 사용자는 로그인할 때마다 **가장 오래된(created_at 기준) 세션이 조용히 삭제**돼 그 기기에서 로그아웃. 활동/last_seen 이 아니라 생성 시각 기준이라 오래 쓰던 저사용 기기가 먼저 밀림 | `oauth.ts:86`, `sess.mjs` 25→20, `s0..s4` 삭제 |
| #1 가드 | `AUTH_FAKE=1` + `HOST=::ffff:127.0.0.1`(IPv4 사상 루프백, 실제 루프백) 로 **개발 기동이 거부**됨 — 보안상 fail-closed 라 무해하나 정상 루프백 바인딩이 막히는 오탐 | `index.ts:22` 허용목록에 `::ffff:127.0.0.1` 없음, `guard.mjs` |
| #2 날짜 정규식 | 달력 검증이 아님 — `2023-02-30`·`2021-02-29`(평년)·`2023-04-31`·`0000-01-01` 등 **존재하지 않는 날짜를 통과**. DoS 는 총량 상한이 막으므로 보안 영향 없음. 관리자 통계/달력 UI 에 가짜 날짜가 섞일 수 있는 데이터 품질 문제 | `map.ts:95`, `attack.mjs` regex 결과 |
| #4 교차 게시중단 | 같은 트리에 게시중단 2건이 겹치면, 숨긴 1건을 reject/resume 하는 순간 **아직 열려 있는 2건째가 있어도 공개로 복귀**(2건째는 접수 당시 이미 숨김이라 재숨김 안 됨, 이후 reject 해도 `hidden_at` NULL 이라 재숨김도 없음). 수정 의도(다른 사유 숨김 미해제)는 지켜지나, 복수 권리자 상황에서 미처리 게시중단이 보호를 못 함 | `legal.ts:130-134`, `td.mjs` S3: reject C1 후 트리 공개·C2 state='hidden' 잔존 |

### 최소 diff 제안 (모두 저우선)

- **#1 오탐** (`server/index.ts:22`): 허용목록에 IPv4 사상 루프백 추가
  ```ts
  if (env.authFake && (env.secure || !['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1'].includes(env.host))) throw …
  ```
- **#2 달력 정규식** (`server/sync/map.ts:95`, 선택 — 보안 무관): 정규식 뒤 Date 왕복 검증
  ```ts
  autoCorrectDays: days.map((d, i) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    const ok = m && (() => { const dt = new Date(Date.UTC(+m[1], +m[2]-1, +m[3])); return dt.getUTCMonth()===+m[2]-1 && dt.getUTCDate()===+m[3] })();
    return ok ? d : bad(`${f}.autoCorrectDays[${i}]`) }),
  ```
- **#4 교차 게시중단** (`server/account/legal.ts:132` 부근): 해제 전 같은 트리의 다른 미처리 게시중단 유무 확인, 있으면 숨김 유지
  ```ts
  const otherOpen = tid && db.prepare("SELECT 1 FROM takedowns WHERE tree_id=? AND id<>? AND resolved_at IS NULL AND state IN ('hidden','resume_notified') LIMIT 1").get(tid, id)
  const unhide = (action==='resume'||action==='reject') && tid && k!.hidden_at && isHidden(db, tid) && !otherOpen && (JSON.parse(lastHide?.meta ?? '{}') as {takedown_id?:string}).takedown_id === id
  ```

## 4. 검토했으나 안전 확인(수정이 실제로 막음)

- #1 세 유닛 `Environment=AUTH_FAKE=0` 이 `EnvironmentFile=` 뒤(server/backup/daily), `.env.example` 기본 `AUTH_FAKE=0`.
- #2 총량 상한이 LWW 승·패 **두 경로 모두**에 적용(`push.ts:126`), 상한 경계 정확.
- #9 CSP 해시가 실제 `dist/index.html` 두 인라인(테마·PWA register)과 바이트 일치, 공유/SPA/정적 전부 동일 헤더, `script-src` 에 `'unsafe-inline'` 없음.
- #12 본문 없는 POST/DELETE·JSON·keepalive 비컨 미파손, 비JSON 본문만 415.
- OG 두 컨텍스트 수치 엔티티 이스케이프, `$&` 리터럴 안전.

## 5. 한계

- #5 파일 모드는 **Windows 개발기라 실모드 검증 불가**(chmod 부분 no-op). 코드 경로는 올바름. 리눅스 실행에서 `stat -c %a` 로 백업/pre-migrate 가 `600`, `data/backups` 가 `700` 인지 확인 필요.
- 런타임(CSP 적용 뒤 브라우저에서 테마/PWA/아바타/콘솔 위반 0)은 V2(클라이언트·Playwright) 영역 — 본 보고서는 서버가 내보내는 헤더·해시 일치까지 검증.
