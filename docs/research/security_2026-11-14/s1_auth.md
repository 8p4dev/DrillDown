# S1 보안 검토 — 인증·세션·OAuth·CSRF

기준: 2026-11-14 작업 트리(C:\drilldown\app). 읽기 전용(저장소 변경·커밋·`npm run e2e` 없음). 메모리 DB + `app.request()` 공격 스크립트(`scratchpad/s1/attack.ts`, AUTH_FAKE 환경)로 직접 조작해 확인했다. 어제 리뷰 `r1_server.md` 가 "세션·CSRF·쿠키·OAuth 문제 없음"으로 적은 항목을 다시 공격했고, 그 중 한 곳(AUTH_FAKE 기동 가드)에서 미완성 지점을 찾았다.

## 핵심 5줄

1. **기본 운영 구성(HOST=127.0.0.1, PUBLIC_ORIGIN=https, AUTH_FAKE=0)에서는 Critical·High 가 없다.** OAuth state/PKCE·세션 재발급·쿠키 속성·관리자 강등·카카오 웹훅 인증은 공격해도 모두 막혔다(아래 '안전' 목록, 재현 근거 포함).
2. **H1 — AUTH_FAKE 기동 가드가 https 스킴만 본다.** `createApp` 의 `if (env.authFake && env.secure)` 는 origin 이 http 면 통과한다. `.env.example` 기본값이 `AUTH_FAKE=1` 이고, 운영자가 폰 테스트용으로 `HOST=0.0.0.0` 을 켜고 `PUBLIC_ORIGIN` 을 비워 두면(http) 가드가 안 걸리고, LAN 의 누구나 `GET /api/auth/fake/start?as=admin` 한 줄로 관리자가 된다(✔ http origin 에서 fake 관리자 로그인 성공). 한 줄 수정.
3. **M1 — `clientIp` 가 X-Forwarded-For 를 신뢰한다.** 설계·r1 는 "CF-Connecting-IP 만 신뢰"라고 적었지만 코드는 `cf-connecting-ip ?? x-forwarded-for ?? 'local'` 이다. Cloudflare 를 거치지 않고 origin 에 직접 닿는 경로(HOST 0.0.0.0·LAN·터널 우회)에서 XFF 를 돌리면 레이트 리밋이 전부 무력화된다(✔ XFF 회전 13회 중 429=0).
4. **L1 — 계정당 세션 수 상한이 없다.** 쿠키를 안 들고 반복 로그인하면 세션 행이 무한히 쌓인다(✔ 25회 로그인 = 25행). `signIn` 은 쿠키가 있을 때만 이전 세션을 지운다.
5. **Info — CSRF 미들웨어의 content-type/length 게이트는 건너뛸 수 있으나 실제 교차 사이트 공격으로는 재현 불가**(SameSite=Lax 가 쿠키를 막고, 실브라우저는 교차 출처 요청에 Origin 을 항상 붙인다 — ✔ cross-site·null·evil Origin 모두 403). 심층 방어 메모로만 남긴다.

## 위협 모델

| 자산 | 공격자 | 진입점 |
|---|---|---|
| 세션 쿠키(sid) → 계정 탈취 | 교차 사이트 웹페이지, 네트워크 도청, XSS(별도 영역) | `/api/*` 쿠키, `Set-Cookie` 속성 |
| 관리자 권한 | 일반 사용자, 비로그인, LAN 내 기기 | `/api/auth/fake/start?as=admin`, `admins.json`, 관리자 라우트 |
| OAuth 로그인 흐름 | 로그인 CSRF 공격자, 코드 가로채기(중간자) | `/api/auth/:provider/start`·`/callback`, `oauth` 쿠키, `state`·PKCE |
| 리다이렉트 신뢰 | 피싱(오픈 리디렉트) | `return_to` 파라미터 |
| 레이트 리밋(브루트포스·남용 억제) | 비로그인·직접 접속 기기 | `clientIp` 키(`cf-connecting-ip`/XFF) |
| 카카오 탈퇴 웹훅 | 위조 웹훅 발신자 | `/api/auth/kakao/unlink-webhook` |
| 가용성(세션·디스크) | 로그인 사용자, 반복 로그인 | `sessions` 테이블 |

전제: 운영은 `127.0.0.1:3000` 바인딩 + Cloudflare Tunnel, 관리자 경로 앞 Cloudflare Access 2차, 포트포워딩 0. 아래 심각도는 이 전제를 기준으로 하되, 전제가 깨지는 흔한 오설정(H1·M1)을 명시한다.

## 발견 표

| ID | 심각도 | OWASP | 파일:줄 | 공격 시나리오(구체적 요청) | 영향 | 재현 | 고치는 법(최소 diff) | 공수 |
|---|---|---|---|---|---|---|---|---|
| H1 | High(오설정 조건부) | A05 보안 설정 오류 / A07 인증 실패 | `server/index.ts:524`, `server/env.ts:502`, `server/account/oauth.ts:98` | `.env` 가 `AUTH_FAKE=1`·`PUBLIC_ORIGIN` 미설정(→ origin=`http://localhost`, `secure=false`)·`HOST=0.0.0.0` 인 상태로 기동. 가드 `if (env.authFake && env.secure)` 는 http 라 통과한다. 같은 네트워크에서 `GET http://<pi-ip>:3000/api/auth/fake/start?as=admin` → 302 + `sid` 쿠키(비‑Secure) → 관리자. | 네트워크상 누구나 무인증 관리자(전체 사용자·트리 열람·정지·삭제·설정 변경). 쿠키도 비‑Secure. 기본 `.env.example` 이 `AUTH_FAKE=1` 이라 실수 유입이 쉽다. | ✔ http origin 에서 `fake/start?as=admin` → 302·sid 발급·`/api/admin/stats` 200 확인 | 가드를 스킴뿐 아니라 바인딩까지 보게: `const loopback = ['127.0.0.1','::1','localhost'].includes(env.host); if (env.authFake && (env.secure || !loopback)) throw new Error('AUTH_FAKE on non-loopback/https')` | S |
| M1 | Medium | A04 안전하지 않은 설계 / A07 | `server/http.ts:48` (`clientIp`) | Cloudflare 를 거치지 않고 origin 에 직접 닿는 경로(H1 처럼 HOST=0.0.0.0, 또는 터널 설정 오류)에서 `X-Forwarded-For` 를 매 요청 다른 값으로 보내면 레이트 리밋 버킷이 매번 새로 잡힌다. `GET /api/auth/google/start` 를 XFF 회전으로 수십 회 → 429 없음. | 로그인·신고(`/api/t/:slug/report`)·게시중단(`/api/takedown`)·피드백·탈퇴 등 모든 메모리 레이트 리밋이 무력화. 브루트포스·남용 억제가 사라진다. 설계·문서(`03 §3.6`, r1 '안전') 의 "CF-Connecting-IP 만 신뢰" 주장과 코드가 불일치. | ✔ XFF 회전 13회 중 429=0 / XFF 고정 13회 중 429=3(10회 뒤 차단) | 터널 뒤에서 합법적 클라이언트 IP 는 `cf-connecting-ip` 뿐이므로 XFF 폴백 삭제: `c.req.header('cf-connecting-ip') ?? 'local'`. (직접 접속은 전부 `'local'` 한 버킷으로 묶여 오히려 안전) | S |
| L1 | Low | A04 안전하지 않은 설계(가용성) | `server/account/oauth.ts:82-84`, `server/account/session.ts:187` | 쿠키를 안 들고 로그인을 반복(새 브라우저, 또는 로그인 계정으로 실제 OAuth 왕복을 10/분/IP 한도까지 반복). `signIn` 은 `c.get('user')` 가 있을 때만 이전 세션을 지우므로 매번 새 행이 생긴다. | `sessions` 행이 계정당 무제한 증가(각 행 최대 180일 생존, 일일 작업은 '만료' 행만 삭제). 느린 디스크·행 폭증. Pi 1대라 누적되면 영향. | ✔ 쿠키 미동반 로그인 25회 → 세션 25행 | 로그인 시 같은 (user, ua) 의 이전 세션 정리, 또는 사용자당 상한(예: 최신 20개만 남기고 오래된 것 DELETE). | S |
| Info | — | A05(심층 방어) | `server/index.ts:552-563` (CSRF 미들웨어) | `PATCH /api/me` 에 `Sec-Fetch-Site`·`Origin`·`Content-Length` 를 모두 빼고 바디만 보내면 200(게이트 `(content-length ?? '0') !== '0'` 가 거짓이라 CT 검사 생략, `body()` 는 CT 무관하게 JSON 파싱). | 실브라우저 교차 사이트 공격으로는 **재현 불가**: SameSite=Lax 가 교차 사이트 요청에 쿠키를 안 싣고, 브라우저는 교차 출처 상태 변경에 Origin 을 항상 붙인다(모두 403 확인). 비브라우저 클라이언트에는 피해자 쿠키가 없다. | ✔ 헤더 전부 생략 시 200, 그러나 cross-site/null/evil Origin·cross-site SFS 는 전부 403 | (선택) CT 검사를 content-length 와 무관히 강제: `if (m 상태변경 && !ct.startsWith('application/json') && c.req.header('content-type') !== undefined ...)` — 실익 낮음. 현행 유지 가능. | S |

## 검토했으나 안전 (근거 파일:줄 — 전부 공격 후 막힘 확인)

- **오픈 리디렉트 없음.** `safeReturn`(`oauth.ts:23`)은 `#/` 접두·≤200자·공백/역슬래시/제어문자 금지. `#//evil.com`·`#/%0d%0aX`·`#/한`(유니코드)은 **허용되지만 전부 같은 출처의 해시 프래그먼트**라 교차 출처 이동이 아니고, 클라이언트 라우터(`src/router.ts` parseHash)가 미지의 경로를 `#/`(트리 목록)로 떨군다. `#/\evil`·`/evil`·`https://evil.com`·301자 입력은 모두 `#/` 로 폴백(✔). Location 헤더에 `%0d%0a` 는 **리터럴 문자열**로 들어가 CRLF 주입 아님(✔ 302 Location = `/#/%0d%0aX`).
- **OAuth state·PKCE.** `start` 가 state(43자 base64url)·verifier 를 HttpOnly `oauth` 쿠키에 담고 S256 challenge 송신(`oauth.ts:109-116`). `callback` 은 길이 선검사 후 `timingSafeEqual`(`eq`, `oauth.ts:90,129`)로 state 비교, provider 일치(`ck.p !== p`)·code 존재·10분 TTL 검사, 깨진 쿠키는 불일치 처리. nonce 는 userinfo(액세스 토큰) 방식이라 불필요. 로그인 CSRF·코드 가로채기 차단.
- **세션 고정 방지.** 로그인마다 새 sid(`createSession`, `session.ts:187`), 쿠키가 있으면 이전 세션 삭제(`oauth.ts:82-83`). 재로그인 후 옛 sid 는 401, 새 sid 200(✔ T5).
- **관리자 강등(r1 L7 재확인).** `admins.json` 에서 빼면 **다음 요청**에 `sessionMiddleware`(`session.ts:209-212`)가 역할 재검증 → 404 + `role='user'` 로 UPDATE + 세션 폐기(✔ 제거 즉시 `/api/admin/stats` 404, DB role=user). fake 세션은 `provider !== 'fake'` 로 제외.
- **쿠키 속성.** `sid`: HttpOnly·SameSite=Lax·Path=/·https 면 Secure·Max-Age(`session.ts:174`). `oauth`: 추가로 Path=/api/auth·Max-Age 600(`oauth.ts:89,111`). DB 엔 `sha256(sid)` 만(`session.ts:190`, ✔ check).
- **카카오 unlink 웹훅 인증.** 길이 선검사 + `timingSafeEqual`(`me.ts:276`). 무인증·오키·빈 Bearer 전부 401, 정확한 `KakaoAK <adminKey>` 만 200 + 소프트 삭제(✔ T4). 인증 실패는 `auth` 버킷(10/분)으로 키 추측 억제.
- **로그아웃.** 현재 세션 삭제·쿠키 만료, 세션 없어도 204(`me.ts:263-269`, ✔ T10). 교차 출처 text/plain 로그아웃은 403(✔).
- **관리자 라우트 게이팅.** 모든 `/api/admin/*` 가 `requireAdmin`(비관리자 404) + 120/분 뒤(`admin.ts:190`). 비관리자·비로그인 `/api/admin/stats` 404(✔ check).
- **다중 탭·계정 전환.** push 가 `meta.userId !== 세션 user` 면 409(`sync/index.ts:38`, r2 H2 반영).
- **관리자 절대·유휴 상한.** 24h 절대 + 60분 유휴(`session.ts:156,158,207-208`).

## 테스트 공백

- **H1 가드.** `account.check.ts` 는 http 메모리 DB 로만 돌아 `authFake && secure`(https) 거부만 검증하고, **http + 비‑loopback HOST** 조합(실제 위험 경로)은 테스트가 없다.
- **M1.** `clientIp` 가 XFF 를 무시해야 한다는(설계상 cf-only) 테스트가 없다. 현재 코드는 XFF 를 신뢰하며 이를 잡는 검사가 전무.
- **CSRF 네거티브.** `server/check.ts` 는 cross-site → 403 한 줄만 본다. "헤더 전부 생략 시 통과"(Info)와 "same-origin/none 통과"의 경계 케이스 테스트 없음.
- **세션 상한(L1).** 계정당 세션 수 제한 테스트 없음.
- **점검 모드 예외 집합.** `/api/me` 만 예외이고 `/api/me/sessions`·`/api/notices`·`/api/sync`·`/api/trees` 는 503 (✔ T8). 의도 확정 테스트가 없다 — 보안 영향은 없음(클라이언트는 아무 503 이든 배너 처리).

재현 스크립트: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\b0444a2b-e66c-4aea-8cfd-79e9f11d2620\scratchpad\s1\attack.ts` (`node attack.ts`, 저장소 변경 없음, AUTH_FAKE 메모리 환경).
