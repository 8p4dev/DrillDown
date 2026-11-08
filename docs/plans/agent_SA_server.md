# 에이전트 SA — 서버 계정·인증·관리자·운영 (S1 S2)

상위: `orchestration_server.md` §1 S1·S2, §3, §4. 설계: `docs/specs/03_account_admin.md` §3.2~§3.8, `evidence/aa/flows.md`, 04 §3.12 D3·D4.

## 접근 방식

- Hono 라우트 + `node:sqlite` 준비 문장 직접 호출. 의존성 추가 없음. 쿠키는 `hono/cookie`(hono 내장), 해시·난수는 `node:crypto`.
- 모듈: `session.ts`(쿠키·세션·미들웨어·UA 축약), `oauth.ts`(PKCE·제공자 설정·토큰 교환/userinfo = fetch 주입 순수 함수·로그인 완료 공통 `signIn`), `me.ts`(`/api/me*`·logout·카카오 웹훅), `admin.ts`(`/api/admin/*`·신고 POST·settings·audit 헬퍼), `daily.ts`·`backup.ts`(CLI 겸용), `index.ts`(미들웨어 + `registerAccount`). 검증 헬퍼는 각 파일에 몇 줄씩(별도 validate 모듈은 만들지 않음).
- 대안 검토: JWT 무상태 세션(즉시 폐기 불가 → 기각), OIDC id_token 검증(JWT 라이브러리 필요 → userinfo 호출), in-process 일일 작업 타이머(A4: CLI + systemd timer 만 — 프로세스 1개에 스케줄 상태를 두지 않음).
- check: `server/check.ts` 가 이미 `env` 를 읽은 뒤 import 하므로, `account.check.ts` 는 `env` 객체 필드(`authFake`·`google`·`dataDir`)를 직접 덮어쓴다(평범한 객체라 런타임 변경 가능). 라우트는 `env` 를 요청 시점에 읽게 짠다 → ask 불필요.

## 수정/생성 파일

- `server/account/{index,session,oauth,me,admin,daily,backup,account.check}.ts`
- `server/migrations/001_account.sql`(필요 시)
- `deploy/drilldown-server.service`, `deploy/drilldown-daily.{service,timer}`, `deploy/drilldown-backup.{service,timer}`, `deploy/cloudflared.md`
- `docs/ops/runbook.md`
- 소유 범위 밖 필요 없음.

## 단계

- [x] 1. plan 작성
- [x] 2. `session.ts`: sid 발급·해시·쿠키, 미들웨어(만료·절대 180일/관리자 24h·슬라이딩·last_seen 1분·정지/탈퇴 무효), UA 축약
- [x] 3. `oauth.ts`: start/callback(google·kakao), PKCE·state 쿠키, 토큰·userinfo 주입형, `signIn`(UPSERT·허용목록·복구·정지·세션·302), fake start, providers
- [x] 4. `me.ts`: `/api/me` GET/PATCH, sessions, revoke-others, export, delete, logout, kakao unlink webhook
- [x] 5. `admin.ts`: stats·users·user 상세·suspend/unsuspend·delete·trees·hide/unhide/restore·reports·resolve·settings·audit + 신고 POST
- [x] 6. `index.ts`: 미들웨어 export, 점검 모드, 레이트 리밋 배치, `registerAccount`
- [x] 7. `daily.ts` `runDaily` + CLI, `backup.ts` `runBackup` + CLI
- [x] 8. `account.check.ts` (지시 13 항목 전부)
- [x] 9. 배포 파일·런북
- [x] 10. typecheck·lint·check·build, 서버 3011 기동 확인, 커밋

## 검증 방법

- 2~7: `npm run typecheck`, `node server/check.ts`(account.check 의 assert).
- 서버 실행: `PORT=3011 AUTH_FAKE=1 DATA_DIR=.dev-SA node server/index.ts` → curl 로 fake 로그인·`/api/me`·`/api/admin/stats`.
- 9: 문서 검토(systemd 키 이름은 `systemd-analyze verify` 불가 환경 — 육안).
- 10: `npm run typecheck && npm run lint && npm run check && npm run build`.

## 변경 사항

- 레이트 리밋 `/api/auth/*` 10/분/IP 는 `start`·`callback`·`logout`·`kakao/unlink-webhook` 에만 건다. `GET /api/auth/providers`(로그인 화면마다 호출)와 `fake/start`(AUTH_FAKE 전용, E2E 가 같은 IP 로 연속 로그인)는 일반 300/분. 이유: E2E·화면 새로고침이 10/분에 걸려 실패하지 않게. 실제 공격 표면(OAuth 왕복·웹훅)은 그대로 10/분.
- 점검 모드 예외는 지시대로 `/api/me`(GET 정확 일치), `/api/auth/*`, `/api/health` + 관리자. `/api/me/*` 하위(세션·탈퇴)는 점검 중 503.
- 토큰 교환·userinfo 실패도 `#/login?e=state`(클라이언트 문구 "다시 시도해 주세요")로 보낸다 — 새 오류 코드를 만들지 않음.
- 탈퇴 시 Kakao `/v1/user/unlink` 호출(flows.md §4)은 하지 않는다: 지시 5 의 탈퇴 정의에 없고, unlink 하면 7일 내 재로그인 복구 때 재동의가 필요해진다. 웹훅 수신만 구현.
- `GET /api/admin/trees` 는 기본 공개 트리, `?deleted=1` 이면 삭제 유예 트리(SH `listTreesForAdmin({deleted:true})`). `GET /api/admin/reports?status=open|resolved|all`(기본 open).
- 신고 처리 `hidden` 은 같은 트리의 열린 신고를 전부 `hidden` 으로 닫는다.
- 백업 업로드 경로는 `<BACKUP_RCLONE_REMOTE>/app-YYYYMMDD.db.age`(B2 쓰기 전용 키라 `latest/` 덮어쓰기 대신 날짜 파일, 버킷 수명주기 14일). 런북도 그 경로.

## 결과

- check: `account.check ok`(assert 약 120개: fake 로그인·쿠키 속성·sid 해시 저장·PATCH 21자 400·세션 목록/revoke-others·export·로그아웃 401·탈퇴 401→재로그인 복구·CSRF 교차 출처/Origin 403·return_to 오픈 리디렉트 차단·state 불일치/쿠키 없음/거부 302·설정 없는 제공자 404·가짜 fetch Google 토큰(PKCE verifier=challenge 확인)·userinfo→허용목록 admin·비관리자 404/관리자 200 모양·사용자 검색/커서·정지(자기 자신 403·reason 201자 400·세션 401·재로그인 e=suspended)·공지 81자 400·점검 503+Retry-After 300(관리자·/api/me·health 통과)·감사 로그 action·신고 400/201(미저장)/6번째 429·관리자 restore 410·카카오 웹훅 401/200 유예/INCOMPLETE purge·세션 슬라이딩·관리자 24h·runDaily 8일 전 탈퇴 purge+daily.json).
- 실서버 3011: fake admin 로그인 302 → `/api/me` 200 → stats 200 → logout 204 → 401. `backup.ts`·`daily.ts` CLI ok.
- typecheck·lint(경고 0)·check·build 통과.
