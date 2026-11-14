# R1 서버 전체 코드 리뷰 (server/**, deploy/*, migrations 001~006)

기준: 2026-11-14 작업 트리. 읽기 전용. `tsc -p tsconfig.server.json`·`oxlint server`·`node server/check.ts` 모두 통과 상태에서 리뷰했고, 아래 H·M 의 재현 가능한 항목은 메모리 DB + `app.request()` 스크립트로 직접 확인했다(재현 표시 ✔).

## 핵심 5줄

1. **H1 게시중단(takedown) 기각·재개가 다른 사유로 숨긴 트리를 풀어 버린다** — `takedowns.hidden_at` 을 "이 요청이 숨겼는지"와 무관하게 적어서, 관리자가 스팸으로 숨긴 트리나 다른 확정 게시중단이 걸린 트리가 `reject`/`resume` 한 번에 공개로 돌아간다(✔ 재현). 한 줄 수정.
2. **H2 push 의 `srs.card` 크기 무제한** — 로그인 사용자가 1.5MB JSON 카드를 넣으면 그대로 저장된다(✔). 2MB×300회/분이면 Pi 디스크를 몇 분에 채운다. 한 줄 상한.
3. **M1 감사 로그 삭제 트리거와 일일 작업의 1초 미만 경계 불일치** — `daily.ts` 가 ms 기준, 트리거는 초 단위라 1년 전 같은 초에 적힌 행이 있으면 DELETE 가 ABORT 되고(✔) 그 뒤 단계(임시조치 해제·daily_stats)가 그날 통째로 건너뛴다.
4. **M2 탈퇴 purge 가 appeals·feedback 을 남긴다**(✔) / **M3 익명 신고 3건(IP 1개로 가능)으로 아무 공개 트리든 30일 숨김**(✔) / **M4 익명 POST 1번으로 영구 숨김(takedown)** — 개인정보·남용 측면의 설계 구멍.
5. 권한 검사(`/api/admin/*` 는 모두 `requireAdmin` 뒤), SQL 인젝션(문자열 조립은 전부 상수 조각 + 바인딩), 세션·CSRF·쿠키, 마이그레이션 004~006 스키마는 **문제 없음**. 중복 헬퍼 7곳과 죽은 래퍼 몇 개는 지울 수 있다.

## 발견 표

| ID | 심각도 | 분류 | 파일:줄 | 문제 | 고치는 법 | 공수 |
|---|---|---|---|---|---|---|
| H1 | H | 버그·데이터(공개 상태) | `server/account/legal.ts:84-89`, `:127` | `hidden_at = live ? now : null` 이라 이미 숨겨진 트리(관리자 숨김·앞선 게시중단)에도 `hidden_at` 이 찍힌다. `reject`/`resume` 의 `unhide = … && k.hidden_at && isHidden(...)` 가 참이 되어 다른 사유의 숨김을 해제한다. 재현: 관리자 hide → takedown → reject ⇒ `hidden_by_admin_at=NULL`; 같은 트리 takedown 2건, 1건 confirm 후 2건 reject ⇒ 해제. | tx 밖에서 `const hid = live && !isHidden(db, treeId)` 를 한 번 계산해 `if (hid) setHidden…` 과 `hidden_at: hid ? now : null` 에 같이 쓴다. | S |
| H2 | H | 보안(디스크 DoS)·데이터 | `server/sync/map.ts:85`, `server/sync/push.ts:132` | `parseSrs` 는 `card` 가 object 인지만 본다. 본문 상한 2MB(`LIMITS.bytes`) 안에서 카드 하나가 1.5MB 라도 200 으로 저장(✔ `length(card)=1500025`). 분당 300 push 허용이라 로그인 사용자 1명이 Pi 디스크를 고갈시킬 수 있다. `attempts` 도 행 수 상한이 없다(느리지만 같은 방향). | `parseSrs` 에 `if (JSON.stringify(o.card).length > 2048) bad(f + '.card')` 한 줄(ts-fsrs Card 는 수백 바이트). attempts 는 사용자당 행 수 상한(예: 20,000) 또는 일일 작업에서 오래된 행 삭제. | S |
| M1 | M | 버그·오류 처리 | `server/account/daily.ts:33`, `server/migrations/004_appeals_audit_ro.sql:4-6`, `daily.ts:17-43` | JS 컷오프 `now-365*DAY`(ms) vs 트리거 `strftime('%s','now')*1000-…`(초 절삭). `ts ∈ [초컷오프, ms컷오프)` 인 행이 있으면 DELETE 전체가 `audit_log is append-only` 로 ABORT(✔). 일일 작업 자체가 매일 04:00:00.xxx 에 `user.purge`·`tree.unhide` 감사 행을 쓰므로 1년 뒤 같은 초에 걸릴 확률이 실제로 있다. 걸리면 try 하나라 뒤의 reports/appeals 삭제·`legalDaily`(임시조치 해제)·`productDaily`(daily_stats) 가 그날 모두 건너뛰고 다음 날은 메우지 않는다. | 컷오프를 트리거와 같은 식으로: `DELETE FROM audit_log WHERE ts <= CAST(strftime('%s','now') AS INTEGER)*1000 - 365*86400000` (파라미터 없이). 겸해서 감사 삭제를 `legalDaily`·`productDaily` 뒤(마지막)로 옮긴다. | S |
| M2 | M | 개인정보 원칙 | `server/sync/owner.ts:19-22`, `server/account/daily.ts:35` | `purgeUser` 가 ratings·srs·attempts·nodes·trees·user_seq·reports 만 정리한다. 탈퇴 7일 뒤에도 그 사용자의 `appeals.text`(≤500자 자유 글)·`feedback.text`(≤500자) 가 user_id 와 함께 남는다(✔). 또 미처리 appeals 는 트리가 purge 돼도 영원히 남는다(`resolved_at < ?` 만 삭제). | `purgeUser` 목록에 `'DELETE FROM appeals WHERE user_id = ?'`, `'DELETE FROM feedback WHERE user_id = ?'` 두 문자열 추가. daily 에 `DELETE FROM appeals WHERE tree_id NOT IN (SELECT id FROM trees)` 한 줄. | S |
| M3 | M | 남용(가용성) | `server/account/admin.ts:141`, `:157-160`, `:36` | 익명 신고 한도 5/시/IP, 자동 숨김 기본 3건. 열린 신고를 **건수**로 세므로 IP 1개에서 3번 POST 하면 아무 공개 트리든 30일 숨김(✔). Pi 앞이 Cloudflare 라도 IP 는 바뀐다. | 자동 숨김 계산을 로그인 신고자 기준으로: `SELECT COUNT(DISTINCT reporter_id) n FROM reports WHERE tree_id = ? AND resolved_at IS NULL AND reporter_id IS NOT NULL`. 익명 신고는 큐에만 쌓인다. | S |
| M4 | M | 남용(가용성)·정책 | `server/account/legal.ts:71-72`, `:85` | `/api/takedown` 은 비로그인, 이름·연락처·주장 텍스트·attest:true 만 있으면 **즉시 확정 숨김(만료 없음)**. 저작권법 §103 ② 즉시 중단은 맞지만, 한도가 IP 3/시 라 사실상 누구나 POST 1번으로 임의 공개 트리를 무기한 내릴 수 있고, 관리자가 큐를 안 보면 영원히 안 풀린다. | 설계 결정이지만 최소한 `setHidden(db, treeId, true, now, now + HOLD_MS)` 로 30일 임시조치로 걸고(이미 `legalDaily` 가 만료 처리), takedown `confirm` 액션에서 `UPDATE trees SET hidden_until = NULL WHERE id = ?` 한 줄. 운영자 부재 시 자동 복원된다. | S |
| M5 | M | 보안(운영 안전장치) | `server/index.ts:73-76`, `server/env.ts:20`, `.env.example` | `.env.example` 이 `AUTH_FAKE=1` 이고 systemd 는 `EnvironmentFile` 이 `Environment=` 를 덮어쓰므로 유닛에서 강제로 끌 수 없다. 켠 채 배포되면 `/api/auth/fake/start?as=admin` 로 누구나 관리자. 서버는 기동 로그 한 줄만 찍는다. | `if (import.meta.main)` 블록 첫 줄에 `if (env.authFake && env.secure) throw new Error('AUTH_FAKE on https origin')`. 한 줄로 사고 경로가 막힌다. | S |
| L1 | L | 버그(지표) | `server/account/product.ts:179-184` | "기동 시 restarts +1" 미들웨어가 `registerProduct` 에서 등록돼, 그보다 먼저 등록된 라우트(`/api/me`, `/api/auth/*`, `/api/notices`)가 응답하면 안 돈다(✔ 첫 요청 `/api/me` 후 daily_stats 0행, 404 요청 뒤에야 1행). 앱 부팅 첫 요청이 `/api/me` 라 실제로는 늦게/우연히 센다. 주석의 "db 를 못 받으므로" 는 사실이 아니다(`createApp(db)`). | 미들웨어 6줄 삭제. `createApp` 에서 `db.prepare('INSERT INTO daily_stats(day, restarts) VALUES(?,1) ON CONFLICT(day) DO UPDATE SET restarts = restarts+1').run(dayOf(Date.now()))` 한 줄(check 의 `:memory:` 에서도 동작). | S |
| L2 | L | 오류 처리(자식 프로세스) | `server/account/ops.ts:160-164`, `:20` | 재시작이 `running.backup/daily` 를 보지 않는다. systemd 기본 `KillMode=control-group` 이면 메인 exit 때 돌고 있는 rclone 업로드 자식이 함께 죽고, `backup.json` 은 갱신되지 않는다. | `/ops/restart` 첫 줄 `if (running.backup || running.daily) fail(409, 'running', '작업이 끝난 뒤 재시작하세요')`. | S |
| L3 | L | 성능(N+1) | `server/account/admin.ts:71,216`, `:263-265`, `server/account/me.ts:23-26` | 사용자 목록 50행마다 `treeCountOf` 1쿼리, 트리 목록(기본 1쪽 = 50+100행)마다 open_reports 1쿼리. Pi 에서 수 ms 수준이라 급하진 않다. | 각각 상관 서브쿼리 `(SELECT COUNT(*) FROM trees WHERE owner_id=u.id AND deleted_at IS NULL) tree_count` 로 한 번에. | S |
| L4 | L | 성능 | `server/account/product.ts:86-89`, `:115-121` | `fsrsRetention` 이 `srs.updated_at >= ?` 로 최대 2만 행을 `json_extract` 4번씩 하며 풀스캔(인덱스 없음). `recallAt` 윈도 함수도 `attempts` 전체를 2번. 관리자 전용·120/분이지만 수십만 행이면 요청당 수백 ms. | 지표 화면이 느려지면 `productDaily` 에서 하루 1번 계산해 `daily_stats` 컬럼으로. 지금은 주석대로 두어도 된다. | M |
| L5 | L | 성능(SD 수명) | `server/sync/index.ts:18`, `server/db.ts:16` | `synchronous=FULL` 이라 익명 조회마다 `view_count+1` 커밋 = fsync 1회(`/t/:slug` 와 `/api/t/:slug` 각각). 60/분/IP 라 폭주는 아니지만 SD 카드 쓰기가 조회 수에 비례한다. | `gallery_hits` 처럼 메모리 Map 에 모아 `saveCounters` 5분 주기에 `UPDATE … view_count + ?` 로 반영. | S |
| L6 | L | 레이트 리밋 우회 | `server/sync/index.ts:136` | `/t/:slug` 는 UA 가 크롤러면 리밋을 건너뛴다. UA 는 위조 가능하므로 `/t/:slug` 는 사실상 무제한(DB 조회+`readFileSync`+40ms pad). Cloudflare 가 앞에 있어 영향은 작다. | 크롤러도 별도 키로 센다: `hit(c, 'tpage:' + (crawler ? 'bot' : ip), crawler ? 600 : 60, MIN)`. | S |
| L7 | L | 권한(운영 절차) | `server/account/oauth.ts:78,86`, `server/account/session.ts:49-53`, `server/account/ops.ts:96` | 관리자 역할은 **로그인 시점**에만 `admins.json` 과 맞춘다. 파일에서 빼도 `users.role='admin'` 과 세션(최대 24h·유휴 60분)이 살아 있다. ops.ts 의 안내문("admins.json 에서 빼고 SSH 로")이 이 점을 말하지 않는다. | 런북에 `UPDATE users SET role='user' WHERE id=…; DELETE FROM sessions WHERE user_id=…` 를 적거나, `sessionMiddleware` 에서 admin 이면 `isListedAdmin` 재확인(파일 읽기 1회, 60초 캐시). | S |
| L8 | L | 설정 검증 | `server/account/admin.ts:365-372`, `:30` | 점검 예약은 `from` 만 있고 `until` 이 없어도 통과한다 → `from` 이후 무기한 503. 관리자는 503 을 안 받으므로 눈치채기 어렵다. | `if (from != null && until == null) fail(400, 'invalid', '종료 시각이 필요합니다', 'maintenance')` 또는 UI 에서 강제. 무기한이 의도면 `manual` 로 충분하다. | S |
| L9 | L | 단순화 | `server/account/me.ts:68`, `:123-131` | `/api/me/delete` 의 3/시 리밋을 별도 pre-handler(`next()` 호출)로 등록하고 실제 핸들러는 55줄 아래. | 68행 삭제, 123행 핸들러 첫 줄에 `hit(c, 'medel:' + uid(c), 3, 3_600_000)`. | S |
| L10 | L | 단순화(중복) | `server/account/admin.ts:317-318` | `resolution='hidden'` 처리에서 트리의 열린 신고 전부 UPDATE 한 뒤 같은 id 를 다시 UPDATE. 이미 처리된 신고를 재처리하는 경우만 두 번째가 의미 있다. | 두 번째 UPDATE 삭제(이미 처리된 신고 재처리를 막으려면 위에서 `r.resolved_at` 이면 409). | S |

검토했지만 문제 없음(기록용): `/api/admin/*` 전 라우트가 `admin.ts:193` 의 `requireAdmin`+120/분 뒤에 등록됨(ops·legal·product 포함, 다른 관리자 정지·삭제 403 상호 잠금 포함); 모든 동적 SQL 조각은 상수(`where` 배열·`key`·`cols`·플레이스홀더)이고 값은 바인딩 — 인젝션 없음; `tx()` 중첩 없음(owner.ts 함수는 tx 를 열지 않음, daily.ts 는 사용자별 BEGIN IMMEDIATE 수동); 세션은 해시 저장·로그인마다 신규(고정 공격 방지)·관리자 24h/유휴 60분·정지·탈퇴 즉시 무효; CSRF 는 `sec-fetch-site`+`origin`+JSON 3중(카카오 웹훅만 예외, 관리 키 timingSafeEqual); OAuth 는 PKCE S256+state+10분 TTL+timingSafeEqual, return_to 는 `#/` 접두만; 쿠키 `HttpOnly`·`Lax`·https 시 `Secure`, oauth 쿠키는 `/api/auth` 경로 한정; IP·이메일·원문 UA 는 어디에도 저장·로그되지 않음(takedown 연락처는 문서화된 예외·처리 후 90일 삭제, 요청 로그는 slug 마스킹·쿼리스트링 없음); 005 의 notice→notices 변환과 `getSettings` 의 레거시 `enabled` 처리 일치; 004 트리거는 M1 경계 외에는 의도대로; 005·006 인덱스는 큐 조회(`resolved_at, …`)와 일치; 점검 예약 판정(`from<=now<until`)과 `maintenance_scheduled` 예고 분기 일치; `daily.ts` 호출 순서(세션→purge→톰스톤→감사→신고·소명→legal→product→checkpoint)는 의존성상 문제 없음(M1 의 재배치만 권장); spawn 은 `--watch` 제거·`stdio:'ignore'`·exit/error 양쪽에서 플래그 해제, `process.exit` 는 감사 커밋 뒤 300ms(WAL+FULL 이라 데이터 손실 없음); deploy 유닛의 `ReadWritePaths=/var/lib/drilldown` 은 서버가 쓰는 모든 파일(app.db·backups·*.json)을 덮는다.

## 삭제·단순화 목록

| 대상 | 지금 | 대신 |
|---|---|---|
| `resolveAppeals` | `admin.ts:122`, `legal.ts:47` 두 벌(시그니처만 다름) | admin.ts 것을 `export`, legal.ts 는 import(now 인자 추가) |
| `isHidden` | `legal.ts:49` 함수 + `admin.ts:159` 인라인 같은 쿼리 | legal.ts 것을 export 해 admin.ts 자동 숨김에서 재사용 |
| `ms()` 기간 검증 | `admin.ts:47`(공지) 와 `admin.ts:368`(점검) 동일 람다 | 모듈 상단 함수 1개 |
| `UUID`·`CTRL` 정규식 | `map.ts:36,39` 와 `admin.ts:57-58` 중복 정의 | map.ts 가 admin.ts 것을 import(CTRL 범위 `\u007f-\u009f` 는 admin 쪽이 넓음 — 넓은 쪽으로 통일) |
| `http.ts:83 now()` | `Date.now` 래퍼, `sync/index.ts` 에서만 사용 | 삭제, `Date.now()` |
| `index.ts:28` 로그 경로 마스킹 정규식 | `metrics.ts:7 maskPath` 와 같은 식(uuid 마스킹만 빠짐) | `maskPath(c.req.path)` 호출 |
| `product.ts:179-184` booted 미들웨어 | L1 | createApp 의 INSERT 한 줄 |
| `me.ts:68` pre-handler | L9 | 핸들러 안 `hit` |
| `admin.ts:318` 두 번째 UPDATE | L10 | 삭제 |
| `legalMe(db, _userId)`, `productMe(db, _userId)` | 안 쓰는 인자 | 인자 제거(호출부 2곳) |
| `ops.ts:34-46 gitHead()` 13줄 | HEAD·packed-refs·worktree 파싱 | 배포 시 `git rev-parse --short HEAD > dist/BUILD` 를 `build` 스크립트에 붙이고 파일 1개 읽기. 지금도 동작하니 우선순위 낮음 |
| 의존성·CSS | 서버는 hono·@hono/node-server·ts-fsrs(`fsrs-7` 곡선, 클라이언트와 공유)만 사용 — 지울 것 없음. 서버 영역에 CSS 없음 | — |

## 테스트 공백

- **H1**: 관리자 숨김 상태에서 takedown → reject 가 숨김을 유지하는지; 같은 트리 takedown 2건에서 1건 confirm 후 다른 건 reject. `account.check.ts:337` 은 "두 번째는 다시 숨기지 않음"만 본다.
- **H2**: push 행 하나의 바이트 상한(card·aliases·note 합). `sync.check.ts` 는 행 수(500)와 본문 2MB 만 본다.
- **M1**: `runDaily` 가 한 단계 실패에도 나머지를 끝내는지(감사 삭제를 throw 하게 만들고 `legalDaily`·`productDaily` 효과 확인). 트리거 경계는 실제 시계 기준으로 `ts = floor(now/1000)*1000 - 365d + 1` 행을 넣고 `runDaily(db)` 가 `ok:true` 인지.
- **M2**: purge 뒤 `appeals`·`feedback` 에 user_id 가 남지 않는지.
- **M3·M4**: 익명 신고 N건이 자동 숨김으로 이어지지 않는지(정책 확정 후), takedown 임시조치 만료.
- **M5**: `authFake && secure` 기동 거부.
- **마이그레이션 경로**: 003 까지 적용된 실제 파일 DB(레거시 `notice` 설정·`maintenance:{enabled}` 포함)에서 기동 → 004~006 적용·`pre-migrate-003.db` 생성·다음 기동에 삭제. 현재 check 는 `:memory:` 신규만 돈다.
- **L2**: 작업 실행 중 재시작 409.
- **점검 모드 범위**: `/api/me` 는 예외인데 `/api/me/sessions`·`/api/me/feedback`·`/api/notices` 는 503 인 것이 의도인지 — 테스트가 없어 어느 쪽이 맞는지 코드로 확정되지 않았다(클라이언트는 아무 503 이든 배너로 처리하므로 사용자 영향은 없다).
- `e2e/server.spec.ts` 는 로그인·동기화·공유·탈퇴 복구만 다룬다. 관리자 ops/legal/product 는 check 스크립트에만 있다(그 자체는 충분히 촘촘하다).

재현 스크립트: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\248b38d8-49e1-423b-b997-21690d5051cb\scratchpad\repro.ts` (`node repro.ts`, 저장소 변경 없음).
