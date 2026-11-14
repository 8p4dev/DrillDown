# 보안 검토 종합 (2026-11-14)

리뷰 워커 4명(읽기 전용, 실제 공격 재현 포함)의 보고서를 오케스트레이터가 종합했다. 원문: `s1_auth.md`(인증·세션·OAuth·CSRF) · `s2_api.md`(API 권한·입력·주입·DoS) · `s3_client.md`(클라이언트·브라우저) · `s4_infra_privacy.md`(인프라·운영·개인정보·공급망). ✔ = 재현됨. 오케스트레이터가 코드로 재확인한 항목은 [확인] 표시.

## 0. 한 줄 결론

**런북대로 배포한 운영 구성(127.0.0.1 바인딩 + Cloudflare Tunnel + Access, `AUTH_FAKE=0`, https origin)에서는 Critical 이 없다.** 실제로 뚫리는 XSS·IDOR·SQL 주입·CSRF·오픈 리디렉트·프로토타입 오염은 전부 공격 후 막힘을 확인했다. 남은 위험은 세 갈래다.

1. **오설정 한 번에 무인증 관리자** — `AUTH_FAKE` 기동 가드가 https 스킴만 본다. `.env.example` 기본값이 `AUTH_FAKE=1` 이고 systemd 유닛이 강제로 끄지 않아, http origin 으로 배포되면 Access 밖 경로 한 줄로 관리자가 된다(S1 H1 = S4 H1, ✔).
2. **로그인 사용자 한 명이 Pi 디스크를 채울 수 있다** — `srs.auto_correct_days` 가 병합 경로에서 총량 상한 없이 누적된다(S2-01, ✔ 21회 요청에 1MB). 어제 고친 카드 상한의 형제 결함.
3. **개인정보 고지와 실제가 어긋난다** — 로컬 백업 14개는 평문인데 처리방침은 "암호화 백업", 피드백 글이 수집 항목 표에 없음, 미처리 게시중단 연락처가 무기한 잔존(S4 M1·M2).

## 1. 발견 통합표 (심각도 순)

| # | 심각도 | 출처 | 파일 | 문제 | 고치는 법(최소 diff) | 공수 |
|---|---|---|---|---|---|---|
| 1 | **High** (오설정 조건부) | S1 H1 · S4 H1 | `server/index.ts:21`, `deploy/*.service`, `.env.example:14` | 가드 `authFake && secure` 는 http origin 이면 통과. `HOST=0.0.0.0` 또는 터널 뒤 http origin 이면 `GET /api/auth/fake/start?as=admin` 으로 누구나 관리자. ✔ [확인: `.env.example` `AUTH_FAKE=1`, 유닛에 `AUTH_FAKE=0` 없음] | ① 가드를 바인딩까지: `if (env.authFake && (env.secure \|\| !['127.0.0.1','::1','localhost'].includes(env.host))) throw` ② 세 유닛 `Environment=AUTH_FAKE=0`(EnvironmentFile 뒤에) ③ `.env.example` 기본 `AUTH_FAKE=0` + 주석 | S |
| 2 | **High** | S2-01 (+S2-04) | `server/sync/push.ts:124-136`, `server/sync/map.ts:84-95` | `parseSrs` 는 1회 3,660개만 막고 `applyPush` 병합은 superseded 경로에서도 집합을 무제한 합침. 날짜 정규식이 달력을 안 봐 유효 문자열 공간이 ≈1억. ✔ 1회 3,660 → 20회 뒤 76,860개·1MB, 선형 증가 | 병합 뒤 `if (days.length > LIMITS.autoDays) days = days.slice(-LIMITS.autoDays)` + 달력 정규식(월 `0[1-9]\|1[0-2]`, 일 `0[1-9]\|[12]\d\|3[01]`). sync.check 에 총량 단언 | S |
| 3 | Medium | S1 M1 | `server/http.ts:48` | `clientIp` 가 `cf-connecting-ip ?? x-forwarded-for` — 직접 접속 경로에서 XFF 회전으로 모든 레이트 리밋 무력화. ✔ 13회 중 429=0. [확인: 코드 그대로. S2 의 "cf-only" 판정은 오독] | XFF 폴백 삭제: `c.req.header('cf-connecting-ip') ?? 'local'` | S |
| 4 | Medium | S2-02 | `server/account/legal.ts:129-131` | 게시중단 reject/resume 의 `unhide` 가 "현재 숨김이 이 요청 때문인지" 를 안 봐, 게시중단 뒤 관리자가 별도 사유로 숨긴 트리를 기각 순간 공개로 복귀. ✔ (r1 H1 의 해제 시점 잔여) | 해제 전 최근 `tree.hide` 감사의 `takedown_id === id` 인지 확인, 아니면 해제하지 않음. account.check 단언 | M |
| 5 | Medium | S4 M1 | `server/account/backup.ts:19-35`, `server/db.ts:30`, `PrivacyPage.tsx` | 로컬 백업 14개·`pre-migrate-*.db` 평문, 모드 644. 처리방침 "암호화 백업" 은 외부 전송본에만 참. ✔ [확인: chmod 없음] | `mkdirSync(dir,{mode:0o700})` + 백업 후 `chmodSync(file,0o600)`; 처리방침 ②·⑩ "로컬 사본은 평문·접근 통제, 외부 전송본만 age 암호화" 로 정정 | S |
| 6 | Medium | S4 M2 | `PrivacyPage.tsx ITEMS`, `server/account/legal.ts:37-38` | 피드백 글(user_id·500자·UA 축약) 이 수집 항목 표에 없음. 미처리 `takedowns`·`requests` 는 `resolved_at` NULL 이라 영구 잔존(연락처 포함), 트리 purge 뒤 고아 정리도 없음. [확인: ITEMS 에 피드백·게시중단 연락처 없음] | ITEMS 에 `피드백·문의 글 / 문의 처리 / 처리 후 90일`, `게시중단 요구자 성명·연락처 / 통보 / 처리 후 90일·미처리 180일` 추가; `legalDaily` 에 `received_at < now-180d` 미처리 건과 고아 건 삭제 | S |
| 7 | Low→Med | S2-03 | `server/sync/map.ts:100-108` | `attempts` 의 `treeId`/`rootId` 소유권·`nodeRecall`·`edgeAccuracy` 범위 미검증 → 관리자 지표 오염. ✔ 남의 트리·1e308 저장 | `parseAttempt` 에서 0..1 범위 밖 `bad`, 집계는 트리 소유자 조인 | S |
| 8 | Low | S1 L1 | `server/account/oauth.ts:82-84` | 쿠키 없이 반복 로그인하면 세션 행 무제한(각 180일). ✔ 25회=25행 | 로그인 시 사용자당 최신 20개만 남기고 DELETE | S |
| 9 | Low | S3-1 | `server/index.ts:28` | CSP 부재. 현재 전 싱크가 이스케이프되지만 `dangerouslySetInnerHTML` 4곳의 2차 방어선이 없다. XFO 는 있음 | `secureHeaders({ contentSecurityPolicy: {...} })` — 인라인 테마 스크립트는 해시 주입 필요 | M |
| 10 | Low | S4 L1 | `docs/ops/runbook.md`, `package.json` | Pi 에서 `sudo npm ci` 로 dev 의존성 467개·postinstall 이 root 로 실행. `npm audit` 6건은 전부 devDeps | 다른 기기에서 빌드해 `dist` + `npm ci --omit=dev` 만 Pi 로, `sudo` 제거 | M |
| 11 | Low | S4 L2 | `server/db.ts:5` | `node:sqlite` 실험적 API 의존 | `engines` 핀 유지 + 복원 리허설 때 `backup()`·`integrity_check` 검증 | — |
| 12 | Info | S1 Info · S3-2 | `server/index.ts:49-60`, `secureHeaders` | CSRF 의 content-type 게이트는 헤더 전부 생략 시 통과하나 SameSite+Origin 으로 실브라우저 재현 불가. HSTS 가 http 개발 origin 에도 나감 | 선택. 현행 유지 가능 | — |

## 2. 공격했으나 막힌 것 (근거는 각 보고서 "검토했으나 안전" 절)

- **인증**: OAuth state·PKCE(S256·timingSafeEqual·10분), 세션 고정 방지(로그인마다 새 sid), 쿠키 HttpOnly·Lax·Secure(https), 관리자 강등 즉시 반영(요청마다 `admins.json`), 카카오 웹훅 키 비교, 로그아웃 완전성, 오픈 리디렉트(`#/` 접두·CRLF 리터럴), 관리자 24h/유휴 60분.
- **API**: 트리·노드·srs·attempts IDOR 전부 404/`taken`/`dropped`, pull 소유자 격리, superseded 응답 누설 없음, 동적 SQL 전부 상수+바인딩(LIKE ESCAPE), 프로토타입 오염 없음, 깊은 중첩·1.9MB 문자열 400, 본문 2MB+500행, 익명 신고로 자동 숨김 불가, 게시중단 30일 임시화, ops 파일 접근 상수 경로·spawn 고정 스크립트, CSV 수식 주입 방지.
- **클라이언트**: 제목·노트·별칭·닉네임·공지·사유·신고·소명·게시중단·피드백 전 렌더 경로 이스케이프(OG 셸 `esc` 수치 엔티티, `toHtml` enum 클래스, React 텍스트) — Edge 에서 악성 트리 공개 후 다이얼로그 0, 정적 경로 탐색 9종 전부 셸만, SW 가 `/api`·관리자 청크 미캐시, 백업 `__proto__` 오염 0, 공지 URL `http(s)` 강제+`noreferrer`, 아바타 `no-referrer`, `X-Frame-Options: SAMEORIGIN`, postMessage/opener 미사용.
- **인프라·개인정보**: 감사 로그 트리거 API 우회 불가, 일일 작업 완결성(감사 삭제 맨 뒤·초 경계 일치), 탈퇴 purge 에 appeals·feedback 포함, 유닛 하드닝(비루트·ProtectSystem=strict·ReadWritePaths 최소), B2 쓰기 전용 키, Access 범위와 데이터 라우트 일치(관리자 청크에 비밀 없음), 요청 로그에 IP·UA·쿼리 없음, 저장소 비밀 유출 0, lockfile 무결성 전수.

## 3. 권장 조치 순서

1. **지금(S, 반나절)**: #1 AUTH_FAKE 가드·유닛·예시 파일, #2 auto_correct_days 총량 상한, #3 XFF 폴백 삭제, #5 백업 파일 권한, #6 처리방침 항목·보존 정리, #7 attempts 범위, #8 세션 상한. 전부 한두 줄이고 check 단언을 같이 넣는다.
2. **다음(M)**: #4 게시중단 해제 판정(감사 기반), #9 CSP(인라인 테마 스크립트 해시), #10 빌드 분리.
3. **운영 절차**: 런북 §1 에 "`.env` 의 `AUTH_FAKE` 줄 삭제 확인·`PUBLIC_ORIGIN` 필수" 체크 항목, 복원 리허설에 평문/암호문 두 경로 `integrity_check`.

## 4. 테스트 공백(보고서 종합)

AUTH_FAKE http+비루프백 기동 거부 · XFF 무시 · auto_correct_days 총량 · 게시중단 reject 가 독립 숨김을 유지 · attempts 범위·소유권 · 세션 상한 · 백업 파일 모드 0600 · PrivacyPage ITEMS ↔ 저장 테이블 1:1 · `toHtml`/`esc` 가 `<`·`>` 를 남기지 않음 · OG 셸 `<title>`·`content=` 두 컨텍스트 · 백업 `__proto__` 회귀 · Playwright 악성 트리 다이얼로그 0 상시.

## 5. 수정 결과와 재검토 (같은 날 저녁)

수정 워커 2명(X1 서버 daabe1c · X2 문서/클라이언트/테스트 170678d, 계획 `docs/plans/orchestration_security_fix.md`)이 통합표 #1~#12 와 OG 회귀 단언을 전부 반영했고, 재검토 워커 2명(V1 서버 재공격 `v1_server.md` · V2 클라이언트/문서/테스트 `v2_client_docs.md`)이 원래 재현 방식으로 다시 공격했다.

| # | 수정 | 재검토 |
|---|---|---|
| 1 | 가드 = https 또는 비루프백 바인딩이면 기동 거부(`::ffff:127.0.0.1` 포함), 세 유닛 `Environment=AUTH_FAKE=0`, `.env.example` 0 | ✔ 막힘(HOST 0.0.0.0·::·https 전부 거부, 루프백 http 허용) |
| 2 | 병합 뒤 총량 상한 `LIMITS.autoDays`(최신 유지) + 달력 검증(2/30·윤년) | ✔ superseded 20회 뒤 길이 = 상한 |
| 3 | XFF 폴백 삭제 | ✔ XFF·X-Real-IP 회전 막힘. ✘ 잔여: 서버에 **직접** 닿으면 `cf-connecting-ip` 위조로 우회 — 운영 전제(루프백 바인딩 + Tunnel)에서는 불가. 수용, `http.ts` 주석으로 명시 |
| 4 | 해제 = 현재 숨김이 게시중단 때문(감사 `takedown_id`) **이고** 같은 트리에 숨김을 요구하는 다른 게시중단(열림·확정·소제기)이 없을 때만 | ✔ 관리자 독립 숨김 유지. 재검토가 찾은 교차 2건 회귀(1건 기각 시 2건째 무시)도 고쳐 단언 추가 |
| 5 | 백업 폴더 700(기존 폴더도 chmod)·파일 600·pre-migrate 600, 처리방침 ②④⑩ 정정 | ✔ 코드 경로(Windows 라 리눅스 실모드는 배포 후 확인 필요) |
| 6 | 미처리 게시중단·요청 180일·고아 삭제, 처리방침 항목 3개 추가 | ✔ 처리 중 건은 유지 |
| 7 | attempts 0..1 범위·음수 카운트 400, 남의 트리 dropped | ✔ |
| 8 | 사용자당 세션 최신 20개 | ✔ (다기기 20대 초과 사용자는 가장 오래된 세션이 로그아웃 — 수용) |
| 9 | CSP(기동 시 `dist/index.html` 인라인 스크립트 해시, CRLF 정규화, HSTS 는 https 만) | ✔ Edge 전 화면 위반 0, 양성 대조(해시 없는 인라인·onclick·http img)는 막힘. 운영 주의: `dist` 교체 뒤 재시작 필수(런북 §3) |
| 12 | 본문 있는 비JSON 상태 변경 415 | ✔ 본문 없는 POST/DELETE·keepalive JSON 은 통과 |
| OG | `<title>`·`content=` 둘 다 수치 엔티티 | ✔ |

재검토가 추가로 바로잡은 것(4836a97·이후 커밋): 빈 `HOST=` 가 모든 인터페이스에 바인딩되던 문제(`e.HOST || '127.0.0.1'`), 처리방침 ⑧ `theme` 쿠키 문구(실제는 localStorage), 런북 HOST·보존 주기·CSP 재시작 안내, `content.check` 허용 태그를 정확 매칭으로(접두 lookahead 가 `<div onclick=` 을 통과시킴), `security.spec` 에 CSP 거부 콘솔 감지(CSP 아래서는 dialog 가 안 떠 이스케이프 회귀를 못 잡음).

검증: typecheck · lint · `npm run check`(보안 단언 약 30건 추가) · build · E2E 25개(기존 24 + `security.spec`) 통과. 단언 3종을 일부러 깨뜨려 실패하는 것도 확인했다(V2).

남은 운영 숙제: Pi 배포 뒤 `ls -l /var/lib/drilldown/backups`(700/600) 확인, `.env` 에서 `AUTH_FAKE` 줄 제거·`PUBLIC_ORIGIN` https 확인, 빌드를 다른 기기로 옮기기(런북 §1).
