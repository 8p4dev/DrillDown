# 03. 로그인·계정·관리자·서버 (AA)

작성 2026-11-08 · 담당 에이전트 AA · 상위 plan `../plans/orchestration_redesign.md` §1 R5(서버)·R8·R9, §3.3 서버 모델. 증거: `evidence/aa/` (`memory_measure.md` 측정, `cost_table.md` 계산, `flows.md` 흐름도, `sources.md` 출처 발췌).
근거 등급: **[결정]** 이 문서가 정함 / **[제안]** AA 추천, 오케스트레이터 확인 필요 / **[가정]** 확인 안 됨 / **[출처 n]** §7 / **[코드]** 현재 코드 사실 / **[측정]** `evidence/aa/memory_measure.md`.

## 1. 목적과 범위

- 담당 요구: **R8** 로그인·계정(프로필 이미지 등), **R9** 관리자 페이지, **R5의 서버 측면**(사양·월 비용 최소) [결정].
- 전제: 수익화 목표 폐기, Pi 자체 호스팅, LLM 없음(decisions 6~9) [출처 0]. 로그인은 OAuth만(Google·Kakao), 비밀번호·이메일·실명·전화번호 저장 없음(A4, 11 §6) [결정]. 로컬(Dexie)이 기준이고 서버는 백업·공유·여러 기기용(A10) [결정]. 관리자는 운영자 1~2인 전용(A5) [결정].
- 범위 밖: 트리 동기화·공유 규칙·`trees`/`nodes` 스키마(SH, `04_tree_sharing_sync.md`), 색·형태·폰트(DS), 화면 레이아웃·키보드(LM). 경계는 §3.10 "타 문서 의존·요청" 표에 적는다 [결정].

## 2. 결정 요약표

| 항목 | 결정 | 대안 | 근거 |
|---|---|---|---|
| 서버 스택 | **Node 24 LTS 1프로세스 + 내장 `node:sqlite`(WAL) + Hono 라우터, 정적 파일·`/t/:slug` HTML 치환(SH)도 같은 프로세스가 서빙** [제안] | Node+Postgres / Go+SQLite / PocketBase / Supabase 셀프호스트 (§3.1 표) | Pi 1대·1인 운영·백업 = 파일 1개·클라이언트 TS와 타입 공유. 측정 RSS 63 MB [측정]. SQLite는 10만 hit/일 이하 사이트에 적합 [출처 18]. `node:sqlite` 안정성 1.2 Release candidate(Node 25.7 기준), Node 버전 고정 규칙은 §3.1 끝 [출처 19] |
| 서버 대수 | **Pi 5 4GB 1대** (11 §2의 2대 권고 대신) [제안] | 2대 + Postgres 복제(11) | "리소스 최소" 요구. RTO는 "아무 Linux 기기에서 백업 복원" 수 시간으로 대체. 서버 유실 시에도 로컬 Dexie가 기준(A10) → 영향 낮음 |
| 외부 공개 | Cloudflare DNS + Tunnel(포트포워딩 0) [결정, 11 §2 유지] | 공인 IP + Caddy | 집 IP 비노출. Free 플랜 |
| TLS·정적 파일 | Cloudflare가 TLS 종료·정적 캐시. **Caddy/nginx 없음** [제안] | Caddy 리버스 프록시 | 프로세스 1개 줄임(Caddy 유휴 30~60 MB [출처 30]) |
| OAuth 제공자 | Google·Kakao 필수. Naver·Apple 미결(§6) [결정] | — | Kakao 닉네임·프로필 사진은 비즈 앱 없이 "기본 제공" [출처 8]. Google openid·profile은 검증 불필요 [출처 4] |
| OAuth 방식 | Authorization Code + **PKCE S256** + `state` + `client_secret`, 사용자 정보는 **OIDC userinfo 엔드포인트**로 통일 [결정] | ID 토큰 JWT 검증 | 둘 다 S256 지원 확인 [출처 2·10]. userinfo 호출이면 JWT 라이브러리가 필요 없다 |
| 요청 스코프 | Google `openid profile` / Kakao `openid profile_nickname profile_image` — **이메일 스코프 없음** [결정] | email 추가 | 11 §6 최소 수집. Kakao 이메일은 비즈 앱 필요 [출처 8] |
| 세션 | 서버 세션 테이블 + `sid` 쿠키(HttpOnly·Secure·SameSite=Lax·30일 슬라이딩·절대 180일). DB에는 SHA-256 해시만 [결정] | JWT 무상태 | 즉시 폐기·기기별 목록 가능. DB 유출 시 세션 재사용 불가 |
| CSRF | SameSite=Lax + 상태 변경 요청에 `Origin`/`Sec-Fetch-Site` 검사 + JSON 본문 강제 [결정] | CSRF 토큰 | 해시 라우터 SPA·동일 출처 API. 토큰 없이 충분 [출처 32 + 추론] |
| 프로필 이미지 | **기본 = 생성 아바타**(닉네임 첫 글자 + 톤 0~5, DS 팔레트). 제공자 이미지는 사용자가 켤 때만 URL 저장(바이트 저장 없음) [제안] | 서버 축소 저장 / 제공자 URL 항상 사용 | 이미지 처리 의존성·디스크·초상 개인정보 없음. URL 만료는 "실패 시 생성 아바타" 폴백 |
| 계정 삭제 | **7일 유예**(soft delete → 일일 정리). 트리 삭제(SH)와 같은 7일. 유예 중 재로그인 = 취소(SH 함수로 트리 `deleted_at=NULL` 복원). 삭제된 공유 링크는 **410**. Kakao unlink는 즉시 [결정, 3차 M1] | 즉시 삭제 / SH 초안 30일 | 실수 복구 + Kakao "탈퇴 시 모든 개인정보 파기" 정책 충족 [출처 13]. 유예 하나로 통일(plan §3.5 M1) |
| 신고(`reports`) | **AA 소유 확정**(3차 H1). 스키마는 §3.4, 경로는 `POST /api/t/:slug/report`(tree id 비노출), 리밋 anon IP당 5/시·user 20/시(메모리 카운터만) [결정] | SH 안(`ip_hash` 저장, 5/일) | 처리 화면·`audit_log`와 같은 소유. IP 미저장은 §3.7과 일치 |
| 관리자 인증 | `users.role='admin'` ← 서버 설정 파일 허용목록(`provider:sub`) + **`/api/admin/*`만 Cloudflare Access(2차)** 뒤에 둠. 관리자 라우트는 해시 `#/admin` 유지, 관리자 JS 청크 노출 허용(비밀 없음) [결정, 3차 M7] | DB에서 역할만 / `/admin` 경로 라우트 | Access Free 50석 [출처 23]. 해시 라우트는 서버에 도달하지 않으므로 Access로 가릴 수 없음(RV M7) |
| 감사 로그 | `audit_log` 테이블, 관리자 행동 + 사용자 삭제 요청만 기록. IP·UA 기록 없음. 1년 보관 [결정] | 전체 요청 로그 | 접속기록 1년 기준 [출처 36]. 최소 수집 |
| 백업·운영 | 매일 03:00 `sqlite.backup()` → `age` 암호화 → `rclone`으로 B2, 14일 보관. 복원 런북·일일 작업(스케줄러 AA 소유)·마이그레이션(`server/migrations/NNN.sql` + `PRAGMA user_version`)은 §3.8 [결정] | Litestream 상시 복제 | 데몬 하나 덜 띄움. RPO 24h는 A10 덕에 허용. Litestream은 업그레이드 경로 [제안] |
| 월 비용 | **현금 약 2,050원/월**, 하드웨어 1회 약 28만 원(보유 Pi면 0) [계산] | 11 B안 2,800원 + 66만 원 | `evidence/aa/cost_table.md` |
| 구현 순서·공수 | 로그인 **M** → 계정 **M** → 관리자 **M~L** (합계 약 5~8일) [제안] | — | §3.9 |

## 3. 상세 설계

### 3.1 서버 스택 비교와 추천 [R5·R8]

기준: ① Pi 5(ARM64) 메모리·CPU ② 1인 운영 부담 ③ 백업·복구 단순성 ④ OAuth 구현 난이도 ⑤ 클라이언트(TS)와 타입 공유.

| 후보 | 유휴 메모리 | ① | ② 운영 | ③ 백업·복구 | ④ OAuth | ⑤ 타입 공유 | 판단 |
|---|---|---|---|---|---|---|---|
| **A. Node + `node:sqlite`** (Hono) | **63 MB** [측정, x64 Windows. ARM64는 같은 자릿수 [가정]] | 프로세스 1개 | 데몬 1개(systemd). 의존성 Hono 1개 | `backup()` 온라인 백업 [출처 19] → 파일 1개 복사. 복원 = 파일 놓고 기동 | 직접 구현 ≈ 300줄 [가정] (fetch + 쿠키). PKCE·state 포함 | `src/core/types.ts` 그대로 import, API 타입 1개 파일 공유. Node 24는 `.ts` 직접 실행(type stripping) [출처 19 인접 문서; 가정: 25.x 기본값] | **추천** |
| B. Node + Postgres | Node 55 MB [측정] + Postgres 최소 튜닝 22~59 MB [출처 26] | 프로세스 2개 | 데몬 2개, 버전 업그레이드·`pg_dump` 스케줄·`max_connections` 튜닝 | `pg_dump` 덤프. 복원에 Postgres 설치 필요 | A와 동일 | A와 동일 | 동시 쓰기·복제가 필요해질 때. 지금은 과함 |
| C. Go 단일 바이너리 + SQLite | 10~30 MB [가정: 공개 측정 없음, Go 런타임 일반값] | 가장 작음 | 바이너리 1개. 그러나 **팀 언어가 TS** → 두 언어 유지 | A와 동일 | Go OAuth2 라이브러리 성숙 | **없음**(코드 생성 필요) | 메모리 30 MB 차이가 두 언어 비용을 못 넘는다 |
| D. PocketBase | 15~30 MB [출처 28, 3자] | 작음 | 바이너리 1개, 관리자 UI 내장 | SQLite 파일 + 내장 백업 | Google 내장. **Kakao 미확인**(문서 목록에 없음) [출처 28] → 커스텀 훅 필요 | JS SDK 있음. 스키마는 PB 콘솔이 소유 → `TreeNode` 타입과 이중 관리 | Kakao·권한 매트릭스·관리자 화면 커스텀을 하면 A와 공수 비슷. "personal project, no promises" [출처 28] |
| E. Supabase 셀프호스트 | 960~1,450 MiB (arm64, 11개 컨테이너) [출처 27 3자], 공식 최소 RAM 4GB [출처 27] | **Pi 4GB 한계** | Docker 11개, 커뮤니티 지원 [11 S8] | Postgres 덤프 + 스토리지 | Kakao 내장 | 생성 타입 | 리소스 최소 요구와 정면 충돌. 제외 |

**결론 [제안]: A.** Node 24 프로세스 1개가 API·정적 파일·SQLite·백업 스케줄을 모두 맡는다. 메모리는 C·D보다 30~50 MB 크지만 Pi 5 4GB에서 의미 없는 차이이고, 운영 대상이 "systemd 유닛 1개 + 파일 1개"로 줄며, 클라이언트와 같은 언어·같은 타입 파일을 쓴다. SQLite는 단일 writer지만 "a write transaction only takes milliseconds … multiple writers can simply take turns" [출처 18]. 11 §2.3의 피크 가정(초당 10요청)은 측정 세션 조회 5.3 µs [측정]와 비교하면 4자릿수 여유다 [추론].

11 §2의 **2대 Postgres 복제 vs 1대**: 2대 안의 가치는 보드 고장 RTO 30분~2시간이었다. 1대 안의 RTO는 "B2 백업을 아무 Linux 기기(노트북·임시 VPS)에 내려 같은 명령으로 기동"으로 수 시간 [추론] — Node 1개 + SQLite 파일 1개라서 가능하다. 서버 측 24시간 RPO는 A10(로컬이 기준)으로 완화된다: 클라이언트가 다음 동기화 때 다시 올린다(규칙은 SH). 시험 직전 장애 리스크(11 §2.4)는 "운영 중단 시에도 로컬 학습 계속"으로 받는다 [결정]. 비용·운영 시간 비교는 `evidence/aa/cost_table.md` §6.

**배치 (1대)** [제안]
```
[브라우저] ⇄ HTTPS ⇄ [Cloudflare: DNS·TLS·캐시(정적)·Access(/api/admin/* 만)] ⇄ Tunnel ⇄ [Pi 5]
  Pi 5 (Raspberry Pi OS Lite 64-bit, NVMe)
    ├─ cloudflared (systemd)            → localhost:3000
    ├─ drilldown-server (systemd, Node 24 LTS)
    │    ├─ /api/*          Hono 라우트 (이 문서 + SH API)
    │    ├─ /t/:slug        dist/index.html 을 읽어 <title>·OG 태그 치환 후 응답 (SH §3.4.1 소유, 같은 프로세스. HTML 60초 캐시)
    │    ├─ /*              dist/ 정적 서빙 (Cache-Control: immutable 해시 파일, index.html no-cache)
    │    └─ data/app.db     SQLite WAL (users·sessions·audit_log·settings·reports + SH 테이블)
    ├─ daily.timer (04:00)  → 일일 작업 (§3.8: 세션 정리·7일 purge·감사 1년·SH 톰스톤 정리 호출)
    └─ backup.timer (03:00) → sqlite.backup → age → rclone → B2(14일)
```
제외한 의존성 [결정]: Postgres, Redis(레이트 리밋·세션은 메모리·SQLite), Caddy/nginx, Docker, ORM(Prisma·Drizzle — `node:sqlite` 준비 문장으로 충분), JWT 라이브러리(userinfo 호출로 대체), 이미지 처리(sharp — 생성 아바타로 대체), 메일 발송.

**Node·`node:sqlite` 버전 규칙** [결정, 3차 L12]: `node:sqlite`는 문서상 Stability **1.2 Release candidate**(Node 25.7.0에서 승격) [출처 19]. Node 24 LTS에서는 "experimental" 등급이며 v22.13/v23.4 이후 플래그 없이 동작한다 [출처 19]. 이 저장소의 측정(Node 24.19.0)에서는 실행 시 경고가 출력되지 않았다 [측정]. 규칙: `package.json` `engines.node: ">=24.19 <25"` + `.nvmrc` `24`로 고정하고, Pi에는 NodeSource 24.x LTS를 설치한다. 경고가 보이면 `--no-warnings=ExperimentalWarning`을 systemd `ExecStart`에 둔다. Node 26 LTS(2026-10 예정 [가정])에서 1.2 이상이면 그때 올린다.

### 3.2 OAuth 로그인 [R8]

#### 제공자별

| | Google | Kakao | Naver (미결) | Apple (미결) |
|---|---|---|---|---|
| 등록 | Cloud Console 프로젝트 → OAuth 동의 화면(External) → 클라이언트 ID(Web) → 리디렉션 URI 등록. 프로덕션 게시에 홈페이지·처리방침·약관 URL 필수 [출처 6] | Kakao Developers 앱 → 플랫폼(Web) 도메인 → 카카오 로그인 ON → Redirect URI → 동의항목(닉네임·프로필 사진) → 클라이언트 시크릿(기본 ON) [출처 7] | 개발자센터 앱 → 제공 정보 선택 → 서비스·Callback URL → **검수 요청 필수**(화면 캡처·테스터 ID) [출처 15, 2차] | Developer Program **$99/년** [출처 17] → App ID → Services ID → 키. 도메인 검증 |
| 스코프 | `openid profile` → `sub` `name` `picture` [출처 1·2] | `openid profile_nickname profile_image` → OIDC userinfo `sub` `nickname` `picture` [출처 8·10] | `id` `nickname` `profile_image` [가정] | `name`(최초 1회만) — 프로필 이미지 없음 |
| 사업자·검수 | 검증 불필요(비민감 스코프) [출처 4·5]. 이름·로고 노출만 brand verification [출처 6] | **비즈 앱 불필요**: 닉네임·프로필 사진 "기본 제공" [출처 8]. 이메일부터 비즈 앱(개인 개발자도 전환 가능 [출처 14, 가정]) | 검수 필수. 검수 전 "개발중" 표시 [출처 15] | 유료 멤버십만 |
| 식별자 | `sub` ("never reused") [출처 1] | OIDC `sub` = 회원번호 | `response.id` | `sub` |
| 토큰 수명 | 액세스 1h(일반) | 액세스 REST 6h, 리프레시 2개월 [출처 11] — 우리는 **리프레시 토큰을 저장하지 않는다**(로그인 1회성) [결정] | — | — |
| 로그아웃·해제 | revoke 엔드포인트(토큰 보유 시) [출처 2] | `/v1/user/unlink`(어드민 키 + `target_id`) [출처 9]. 외부 연결 끊기 **웹훅** 수신 필수(3초 내 200) [출처 12] | — | — |
| 운영 정책 | — | 탈퇴 메뉴 필수, 탈퇴 시 모든 개인정보 파기, 캐시는 UX 개선 목적만 [출처 13] | — | App Store 앱에만 4.8 적용. 웹은 비해당 [출처 16] |
| 판단 | 필수 | 필수 | **보류** [제안]: 검수 공수·"개발중" 기간 때문. 수험생 수요(네이버 카페 유입)가 확인되면 추가 | **제외** [제안]: $99/년은 월 비용의 4배, 프로필 이미지 없음, PWA엔 의무 없음 |

#### 콜백 흐름·보호 장치 (상세 `evidence/aa/flows.md` §1)

1. `GET /api/auth/:provider/start?return_to=` → 서버가 `state`(32B)·`code_verifier`(32B)·`return_to`·`provider`를 **`oauth` 쿠키**(HttpOnly·Secure·SameSite=Lax·Max-Age 600·Path=/api/auth)에 넣고 제공자 authorize로 302 [결정]. `return_to`는 `#/`로 시작하는 해시만 허용(오픈 리디렉트 차단) [결정].
2. 콜백 `GET /api/auth/:provider/callback?code&state` — 쿠키의 `state`와 불일치·쿠키 없음·10분 초과 → **302 `#/login?e=state`**(브라우저 top-level 요청이라 JSON 400 대신 화면으로 돌려보낸다; 서버 로그에는 사유 코드 `oauth_state_mismatch`만) [결정, 3차 L13]. 제공자 `error` 파라미터(동의 거부) → `#/login?e=denied`로 302 [결정].
3. 토큰 교환(`code_verifier` + `client_secret`) → OIDC userinfo 호출 → `(provider, sub)`로 `users` UPSERT. 신규면 `nickname` = 제공자 이름(없으면 "사용자-xxxx"), `avatar_url` = NULL(생성 아바타) [결정]. 기존이면 `last_seen_at`만 갱신하고 닉네임은 덮어쓰지 않는다(사용자가 바꾼 값 보존) [결정].
4. `suspended_at` → 302 `#/login?e=suspended`. `deleted_at`(7일 내) → 복구 후 진행 [결정].
5. 세션 생성 → `sid` 쿠키 → `return_to`로 302. 로그인 시 항상 **새 세션 id**(고정 공격 방지) [출처 31].

#### 세션 쿠키 [결정]
- `sid`: 32바이트 CSPRNG base64url(256비트 ≥ OWASP 64비트 [출처 31]). DB엔 `sha256(sid)`.
- 속성: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`(30일). 요청 시 잔여 15일 미만이면 30일 연장 + 재발급(슬라이딩). 절대 상한 `created_at + 180일` [제안].
- `sessions.last_seen_at`·`ua`(User-Agent 원문 아님: 브라우저·OS 2단어로 축약, 예 "Chrome · Android") [결정: 최소 수집].
- 만료 행은 일일 작업으로 삭제.

#### CSRF [결정]
- SameSite=Lax가 교차 사이트 POST의 쿠키를 막는다 [출처 32]. 추가로 모든 상태 변경 요청(POST/PUT/DELETE)에서 ① `Sec-Fetch-Site`가 `same-origin`/`none`이 아니면 403 ② `Origin`이 있으면 우리 도메인과 일치 ③ `Content-Type: application/json` 아니면 415. 토큰 없음.
- OAuth 콜백은 top-level GET이라 Lax에서도 `oauth` 쿠키가 동반된다 [출처 32]. 콜백은 **읽기 전용 GET이 아니라 세션을 만드는 요청**이므로 `state` 검증이 CSRF 방어 역할(로그인 CSRF 차단).

#### 로그아웃·기기별 세션 [결정]
- `POST /api/auth/logout` → 현재 세션 삭제, 쿠키 만료. 제공자 세션은 건드리지 않음.
- 계정 화면 "로그인된 기기": `GET /api/me/sessions` → `[{id(앞 6자), ua, created_at, last_seen_at, current}]`. `DELETE /api/me/sessions/:id`, `POST /api/me/sessions/revoke-others`.

#### 인앱 브라우저·PWA standalone에서의 로그인 [3차 M8]

공유 링크의 주 유입 채널은 카카오톡이다(SH §3.4.1 OG 설계). 카카오톡 안에서 링크를 열면 인앱 브라우저(WebView)에서 "Google로 계속"을 누르게 된다.

- **Google 정책**: "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent" [출처 39]. 임베디드 UA로 판정되면 Google이 `disallowed_useragent` 오류 화면을 보여 준다 [가정: 오류 코드명은 커뮤니티 보고, 정책 페이지에 명시 없음]. Kakao는 카카오톡 인앱에서 자사 로그인을 허용한다 [가정].
- **대응** [결정]: 로그인 화면이 UA에서 인앱 브라우저 표식(`KAKAOTALK`, `NAVER(inapp`, `Instagram`, `FBAN|FBAV`, `Line/`, Android `; wv)`)을 감지하면 Google 버튼을 비활성화하고 한 줄 안내 "외부 브라우저에서 열어 주세요"와 ① Android: `intent://<host>/#/login#Intent;scheme=https;package=com.android.chrome;end` 링크 ② iOS: "우측 하단 ⋯ → Safari로 열기" 안내(문구는 DS 최소 텍스트 규칙, 배치 LM)를 띄운다. Kakao 버튼은 그대로 둔다. 카카오톡 Android 인앱이 실제로 `disallowed_useragent`를 받는지는 실기기에서 확인한다(아래 체크리스트).
- **iOS 홈 화면(standalone) PWA**: OAuth는 `location.href`로 같은 창에서 제공자 페이지로 302 왕복한다(팝업·새 탭 금지 — standalone에서 새 탭은 Safari로 빠져 쿠키 저장소가 갈린다) [결정]. iOS 16.4+ standalone은 앱 단위 저장소를 쓰므로 Safari에서 로그인해도 standalone에는 세션이 없다 → 안내 없이 standalone 안에서 다시 로그인하면 된다(쿠키는 `oauth`·`sid` 모두 서버 설정이라 저장소 분리와 무관) [추론]. Android 설치형은 Chrome 저장소를 공유한다 [가정].
- **실기기 체크리스트** (LM M6 PWA standalone 항목과 함께 실행) [결정]:

| # | 기기·환경 | 확인 |
|---|---|---|
| A1 | Android 카카오톡 인앱 → `/t/<slug>` → 로그인 → Google | 비활성 + 안내 표시 / 외부 Chrome 열기 링크 동작 |
| A2 | 같은 환경 → Kakao | 로그인 완료 후 `return_to`로 복귀, `sid` 쿠키 유지 |
| A3 | iOS 카카오톡 인앱 → Google | 안내 표시, "Safari로 열기" 후 로그인 성공 |
| A4 | iOS Safari → 홈 화면 추가 → standalone → Google·Kakao | 302 왕복이 standalone 안에서 끝나고 `#/account`로 복귀 |
| A5 | Android Chrome 설치형 PWA → Google·Kakao | 같은 창 왕복, 복귀 |
| A6 | A4에서 로그아웃 → Safari 탭에서 로그인 상태 | 저장소 분리 확인(기대: 서로 독립) |
| A7 | 인앱 감지 UA 목록이 데스크톱 Chrome·Samsung Internet을 오탐하지 않음 | 버튼 활성 |

### 3.3 계정 화면 [R8]

| 요소 | 동작 | 저장 |
|---|---|---|
| 닉네임 | 인라인 편집(목록의 트리 이름 변경과 같은 패턴 [코드 TreeListPage `tree-rename`]). 1~20자, 앞뒤 공백 제거, 제어문자 금지. 중복 허용(식별자는 UUID) [결정] | `users.nickname` |
| 프로필 이미지 | 기본 **생성 아바타**: 닉네임 첫 글자(한글 1음절·영문 대문자) + 톤 0~5(`toneOf(nickname)` 재사용 [코드 TreeListPage:17]) + DS 팔레트(흰·검·초록·빨강·회색 안, 사각형 R2). 토글 "Google/Kakao 프로필 사진 사용" ON → 서버가 그 시점의 `picture` URL을 `avatar_url`에 저장하고 `<img referrerpolicy="no-referrer" loading="lazy">`로 표시, 로드 실패(`onerror`) 시 생성 아바타로 폴백 [제안] | `users.avatar_url NULL` |
| 연결된 로그인 | 제공자 아이콘 1개 + "연결됨" (계약 §3.3은 사용자당 제공자 1개). 다중 제공자 연결은 `identities` 분리가 필요 → 미결(§6) [제안: 하지 않음] | `users.provider` |
| 내 데이터 내보내기 | 버튼 → 백로그 #1의 JSON(trees·nodes·srs·events·attempts)을 **로컬 Dexie에서** 생성해 내려받기. 서버 호출 없음(로컬이 기준 A10). 서버만 가진 데이터(계정 메타)는 `GET /api/me/export`로 `{user, sessions}` JSON 추가 [결정] | — |
| 로그인된 기기 | §3.2 목록·개별 로그아웃·"다른 기기 모두 로그아웃" | `sessions` |
| 로그아웃 | §3.2 | — |
| 계정 삭제 | **2단계 버튼**(DS 카탈로그 #22, 3차 M11): `[탈퇴]` 탭 → 같은 자리가 `[정말 탈퇴]`(danger) 3초 → 탭 시 `POST /api/me/delete`. 모달·홀드·입력 없음. 버튼 위 한 줄 "7일 안에 다시 로그인하면 취소됩니다". 성공 후 로컬 데이터 처리 선택 "이 기기의 트리도 지우기"(기본 꺼짐, SH M6·M7) → `#/` [결정] | `users.deleted_at` |

**프로필 이미지 선택지 비교** (추천 = 생성 아바타 기본 + 제공자 URL 옵트인)

| 선택지 | 리소스 | 개인정보 | 만료·깨짐 | 판단 |
|---|---|---|---|---|
| 제공자 URL 그대로 | 0 바이트 저장, 외부 요청 1회/표시 | 제공자 도메인에 Referer 노출(→ `no-referrer`), 얼굴 사진이 우리 DB에 URL로 남음 | Google·Kakao 모두 URL 안정성 문서 없음 [출처 1·11]. Kakao는 "값이 변경되거나 삭제될 수 있다" [출처 11] → 폴백 필수 | 옵트인으로만 |
| 서버 축소 저장 | 이미지 디코더 의존성(sharp는 ARM 네이티브 빌드), 디스크 ~5KB/인, 업로드 검증(폭탄 이미지) | 초상 **원본을 우리가 보관** → 유출 시 신고 대상 확대 | 없음 | **제외** |
| 생성 아바타 | 0 바이트. SVG 인라인 ≈ 200 B [계산] | 수집 항목 0 | 없음 | **기본** |

**로그인 전 로컬 트리 UX** (데이터 규칙은 SH §3.8 M1~M7, UX는 `evidence/aa/flows.md` §5) [결정, 3차 M2]: 확인 대화 **컴포넌트 1개**(`MergeDialog`)를 SH M1·M2·M4가 재사용한다. 로컬 L개·서버 S개(`sync.onLogin`이 SH 핸드셰이크에서 받음)에 따라 — (0,0) 무음 / (L>0, S=0) 대화 "이 기기의 트리 L개를 계정에 저장합니다 [저장]" (M1, 선택해서 올리기 없음) / (L=0, S>0) 무음 + 완료 토스트 "계정의 트리 S개를 가져왔어요" (M2의 내려받기만) / (L>0, S>0) 같은 대화에 "+ 계정의 트리 S개를 가져옵니다" 한 줄 추가 (M2 합집합). **"이 기기 것만 유지" 선택지는 없다**(SH §3.8 끝 근거). 다른 계정 데이터가 남은 기기(`meta.userId ≠ me`)는 SH M3의 계정 전환 대화 "u1의 트리 지우고 시작(기본) / 이 계정으로 복제"가 먼저 뜬다. 로그아웃해도 로컬은 유지(M6). 호출 지점: `useMe()`가 `/api/me` 200을 받으면 `sync.onLogin(user.id)` 1회 호출(§5(b)).

| SH 의존 | 내용 |
|---|---|
| 병합 규칙 | SH §3.8 M1~M7 (LWW·톰스톤·id 충돌 재발급·tree_limit) |
| 서버 트리 개수 | `sync.onLogin` 핸드셰이크 응답(SH `GET /api/sync?since=0` 또는 `/api/trees` 카운트) — AA는 대화 문구에만 사용 |
| 계정 전환(M3) | 대화 문구·버튼은 AA, 데이터 처리는 SH |
| 탈퇴 시 트리 삭제 | AA 탈퇴 흐름이 SH 함수 `softDeleteTreesOfUser(ownerId)`(= `UPDATE trees SET deleted_at=now WHERE owner_id=?`) 호출. 유예 중 `/t/<slug>`는 **410**. **7일** 경과 purge는 AA 일일 작업이 SH `purgeUser(ownerId)` 호출(§3.8) |
| 탈퇴 취소 | 7일 내 재로그인 시 AA가 SH 함수 `restoreTreesOfUser(ownerId)`(= `UPDATE trees SET deleted_at=NULL WHERE owner_id=?`) 호출. 사용자가 탈퇴 **전에** 직접 지운 트리까지 되살아나는 문제 → SH 함수가 `deleted_at >= users.deleted_at`인 행만 복원하도록 요청(§3.4 요청 표) |

### 3.4 관리자 페이지 [R9]

운영자 1~2인. 라우트 `#/admin`(해시 라우터, 3차 M7 유지) [결정]. 모바일에서도 열린다 — 레이아웃은 LM §3.1 관리자·D10: PC 우선 표 + sticky 헤더, ≤760은 표 행을 카드로, 검색·공지 입력은 상단(키보드 안전), **파괴 버튼(정지·삭제)은 행 오른쪽 끝·모바일 카드에서는 마지막 줄 오른쪽 정렬, 확인은 2단계 버튼(`[삭제]` → `[정말 삭제]` 3초, DS #22)** [LM안 채택, 3차 L15]. ⋯ 메뉴는 쓰지 않는다.

| 화면 | 내용 | 데이터 출처 |
|---|---|---|
| 대시보드 | 가입자(총·오늘·7일) + **가입 추이 일별 14일 막대**(3차 L18), 활성(7일·30일), 트리 수, 공개 트리 수, 마지막 백업(시각·크기·성공 여부), 마지막 일일 작업 결과, 디스크 사용률, 서버 가동 시간·메모리 | `users` (`deleted_at IS NULL`, `created_at`, `last_seen_at`; 추이는 `SELECT date(created_at/1000,'unixepoch','localtime') d, COUNT(*) … WHERE created_at >= now-14d GROUP BY d`) · SH `trees`(`COUNT`, `visibility='public' AND hidden_by_admin_at IS NULL`) · 상태 파일 `data/backup.json`(백업 스크립트가 씀: `{at, bytes, ok, error}`) · `data/daily.json`(일일 작업 결과) · `fs.statfs('/')` · `process.uptime()` `memoryUsage()` |
| 사용자 | 검색(닉네임 부분일치·UUID·`provider:sub`), 보기(가입·마지막 접속·트리 수·세션 수·상태), **정지/해제**, **삭제**(즉시 purge 옵션) | `users` · `sessions` · SH `trees` COUNT |
| 공개 트리 | 목록(제목·소유자 닉네임·노드 수·갱신·신고 수), **숨김/해제**, 신고 처리(신고 사유 보기 → 숨김 또는 기각), **삭제 트리 복구**(사용자 요청 대응, 7일 내) | SH `trees`(`visibility='public'`, `deleted_at`) + **`reports`**(AA 소유 확정) + `trees.hidden_by_admin_at`(SH 반영 완료) |
| 시스템 | 공지 1줄(켜기/끄기·내용 ≤ 80자), 점검 모드(ON이면 `/api/*`가 503 + 클라이언트 배너, 관리자 제외), 최근 감사 로그 50건 | **`settings`**(key-value, AA 소유 제안) · `audit_log` |

**관리자 인증** [제안]
1. 서버 설정 파일 `config/admins.json`: `["google:1098…","kakao:2345…"]`. 로그인 콜백에서 `(provider, sub)`가 목록에 있으면 `role='admin'`, 없으면 `'user'`로 **매 로그인마다 동기화**(목록에서 빼면 다음 로그인 때 강등) [결정]. DB에서 직접 role을 바꾸는 경로 없음.
2. Cloudflare Access 정책: **`/api/admin/*`만** "이메일 OTP 또는 Google 로그인, 허용 이메일 2개" [출처 23]. 관리자 화면 라우트 `#/admin`은 해시라 서버에 도달하지 않아 Access로 가릴 수 없고, 가릴 필요도 없다 — 관리자 JS 청크에는 비밀이 없고 데이터는 전부 `/api/admin/*`에서 온다(3차 M7) [결정]. 서버는 Access가 붙이는 `Cf-Access-Jwt-Assertion` 검증은 생략하고 "Access 뒤에만 노출"로 둔다(Tunnel 설정으로 보장) [제안]. 로컬 개발에선 Access 없음.
3. 관리자 세션은 일반 세션과 같되 **절대 상한 24시간** [제안].

**`audit_log` 스키마** (AA 소유) [결정]
```sql
CREATE TABLE audit_log(
  id INTEGER PRIMARY KEY,
  ts INTEGER NOT NULL,               -- epoch ms
  actor_id TEXT,                     -- users.id (시스템 작업은 NULL)
  action TEXT NOT NULL,              -- 'user.suspend' 'user.unsuspend' 'user.delete' 'user.purge'
                                     -- 'tree.hide' 'tree.unhide' 'report.dismiss'
                                     -- 'settings.notice' 'settings.maintenance' 'user.delete_requested'(본인) 'admin.login'
  target_type TEXT,                  -- 'user' | 'tree' | 'report' | 'settings'
  target_id TEXT,
  meta TEXT                          -- JSON: {reason?, before?, after?} — 개인정보·IP 금지
);
CREATE INDEX audit_ts ON audit_log(ts);
CREATE INDEX audit_target ON audit_log(target_type, target_id);
```
보관 1년 후 삭제(일일 작업) [출처 36 기준 준용]. 삭제된 사용자의 `actor_id`/`target_id`는 UUID만 남는다(식별 불가).

**권한 매트릭스** (역할명 계약 §3.3: `anon` 비로그인 / `user` 로그인한 타인 / `owner` 본인 / `admin`) [결정]

| 행동 | anon | user | owner | admin |
|---|---|---|---|---|
| OAuth 시작·콜백 | ✅ | ✅(재로그인) | ✅ | ✅ |
| `GET /api/me` | ❌ 401 | — | ✅ | ✅(자기 것) |
| 닉네임·아바타 변경 | ❌ | ❌ 403 | ✅ | ❌(타인 변경 불가, 정지만) |
| 세션 목록·개별 폐기 | ❌ | ❌ | ✅ | ✅(자기 것) |
| 계정 삭제 요청 | ❌ | ❌ | ✅ | ✅(자기 것) / 타인은 `admin/users/:id` 경로 |
| 내 데이터 내보내기 | ❌(로컬 JSON은 로그인 없이 가능 [코드 events.ts `exportEvents` 확장]) | ❌ | ✅ | ✅(자기 것) |
| 공개 트리 보기(`/t/<slug>`) | ✅(SH) | ✅ | ✅ | ✅ |
| 공개 트리 신고(`POST /api/t/:slug/report`) | ✅(IP당 5/시, `reporter_id` NULL) | ✅(20/시) | ❌(자기 트리 신고 불가, 3차 L2 — SH가 맞춤) | ✅ |
| 삭제 트리 복구(7일) | ❌ | ❌ | ✅(SH `POST /api/trees/:id/restore`) | ✅(`POST /api/admin/trees/:id/restore`, 사용자 요청 대응, audit) |
| 대시보드·사용자 검색 | ❌ 404 | ❌ 404 | ❌ 404 | ✅ |
| 사용자 정지·해제·삭제 | ❌ | ❌ | ❌(본인은 삭제 요청만) | ✅(자기 자신 정지 불가) |
| 공개 트리 숨김·해제·신고 처리 | ❌ | ❌ | ❌(자기 트리는 비공개로 전환 = SH) | ✅ |
| 공지·점검 모드 | ❌ | ❌ | ❌ | ✅ |
| 감사 로그 열람 | ❌ | ❌ | ❌ | ✅ |
| 역할 변경 | ❌ | ❌ | ❌ | ❌(설정 파일만) |

관리자 **API** 경로는 권한 없을 때 403이 아니라 **404**로 응답해 존재를 숨긴다. 관리자 화면 청크 자체는 숨기지 않는다(3차 M7) [결정].

**SH 소유 테이블에 요청하는 필드·API** (SH 3차 반영 여부는 통합 때 오케스트레이터가 확인)

| 요청 | 이유 | 상태 |
|---|---|---|
| `trees.hidden_by_admin_at INTEGER NULL` | 관리자 숨김. 공유 보기·갤러리는 `visibility='public' AND hidden_by_admin_at IS NULL`만 노출 | SH DDL 반영 확인(RV) |
| `trees.owner_id` COUNT 인덱스 | 사용자 보기 화면 | SH `trees_owner_seq` 인덱스가 덮음(RV) |
| 탈퇴 유예 중 공유 링크 응답 **410** | `users.deleted_at IS NOT NULL`인 소유자의 트리(= 일괄 `deleted_at` 설정됨)는 `/t/<slug>` 410 "삭제된 트리" — SH §3.3 deleted 행과 동일 | 3차 M1 |
| `softDeleteTreesOfUser(ownerId)` | 탈퇴 요청 시 `UPDATE trees SET deleted_at=now WHERE owner_id=? AND deleted_at IS NULL` | SH D3 |
| `restoreTreesOfUser(ownerId, since)` | 탈퇴 취소 시 `UPDATE trees SET deleted_at=NULL WHERE owner_id=? AND deleted_at >= ?`(since = `users.deleted_at`, 탈퇴 전 사용자가 직접 지운 트리는 되살리지 않음) | 3차 M1 신규 |
| `purgeUser(ownerId)` | 7일 경과 purge: `trees/nodes/srs/attempts` + `user_seq` 물리 삭제. **`events`는 서버 미저장이라 제외**(3차 M1) | SH 함수 명세 |
| `purgeTombstones()` | SH 톰스톤(7일 지난 `deleted_at`) 물리 삭제 — AA 일일 작업이 호출(§3.8). 유예 30일 → **7일**로 통일 | 3차 M1·M15 |
| `GET /api/admin/trees?visibility=public` 응답 `node_count`, `owner_nickname` 조인 | 공개 트리 목록 | 요청 유지 |
| 관리자 복구 `POST /api/admin/trees/:id/restore` → SH `restoreTree(id)` 재사용 | 사용자 요청 대응(3차 L2) | 신규 |

**AA 소유 테이블(계약 §3.3 추가, 3차 H1로 `reports` 확정; `settings`는 [제안] 유지)**
```sql
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
-- key: 'notice' {text, enabled} / 'maintenance' {enabled}
CREATE TABLE reports(id TEXT PRIMARY KEY, tree_id TEXT NOT NULL, reporter_id TEXT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('copyright','spam','abuse','other')), note TEXT,
  created_at INTEGER NOT NULL, resolved_at INTEGER NULL, resolution TEXT NULL);  -- 'hidden'|'dismissed'
CREATE INDEX reports_tree ON reports(tree_id, resolved_at);
-- ip_hash 없음(§3.7 "IP 미기록"). 신고 경로는 slug 기반 POST /api/t/:slug/report → 서버가 slug→tree_id 해석 후 저장
```

### 3.5 테이블 (AA 소유, 계약 §3.3 이름 그대로) [결정]

```sql
CREATE TABLE users(
  id TEXT PRIMARY KEY,                               -- UUID
  provider TEXT NOT NULL CHECK(provider IN ('google','kakao')),
  provider_sub TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar_url TEXT NULL,                              -- 옵트인 시에만
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
  created_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  suspended_at INTEGER NULL, deleted_at INTEGER NULL,
  UNIQUE(provider, provider_sub)
);
CREATE TABLE sessions(
  id TEXT PRIMARY KEY,                               -- sha256(sid) hex
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL,
  ua TEXT NOT NULL                                   -- 'Chrome · Android' 수준
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_exp ON sessions(expires_at);
```
계약 §3.3 대비 추가: `sessions.last_seen_at`(기기 목록용) [제안]. `users` 필드는 계약과 동일.

### 3.6 API 목록 [R8·R9]

공통 [결정]: 접두사 `/api`, JSON. 성공 2xx, 오류는
```json
{ "error": { "code": "unauthorized", "message": "로그인이 필요합니다", "field": "nickname?" } }
```
코드: `unauthorized`(401) `forbidden`(403) `not_found`(404) `invalid`(400, `field` 포함) `unsupported_media`(415) `rate_limited`(429, `Retry-After`) `maintenance`(503) `oauth_state_mismatch`(400) `oauth_denied`(302→`#/login?e=denied`) `suspended`(403).

레이트 리밋 [결정]: 프로세스 메모리 토큰 버킷, 키 = `CF-Connecting-IP`(Tunnel 뒤라 신뢰). `/api/auth/*` 10/분, `/api/me/delete` 3/시, **`POST /api/t/:slug/report` anon IP당 5/시 · user(세션) 20/시**(3차 H1), `/api/admin/*` 120/분, 그 외 300/분. 초과 시 429. **카운터는 메모리에만 있고 IP는 저장·로그하지 않는다**(§3.7 "로그에 남기지 않을 것"과 일치). 재시작하면 초기화(허용) [결정].

입력 검증 [결정]: 라이브러리 없이 엔드포인트별 함수(`src/core/api.ts`의 타입과 1:1). 문자열은 길이·제어문자, id는 UUID 정규식, enum은 목록. 본문 ≤ 16KB(계정 API).

| 메서드·경로 | 권한 | 요청 | 응답 |
|---|---|---|---|
| `GET /api/auth/:provider/start?return_to=` | anon | `provider ∈ google,kakao`, `return_to` `#/…` | 302 제공자 |
| `GET /api/auth/:provider/callback?code&state` | anon(oauth 쿠키) | — | 302 `return_to` + `Set-Cookie sid`. 실패: 302 `#/login?e=state\|denied\|suspended` (3차 L13) |
| `POST /api/auth/logout` | owner | `{}` | 204 + 쿠키 만료 |
| `POST /api/auth/kakao/unlink-webhook` | Kakao 서버(`Authorization: KakaoAK <admin key>` 일치) | `{app_id, user_id, referrer_type}` [출처 12] | 200 `{}` (3초 내). 해당 사용자 → `deleted_at=now` + 세션 삭제 + `softDeleteTreesOfUser` — **같은 7일 규칙**(3차 M1: 7일 내 카카오 재연결 로그인이면 복구). 예외: `referrer_type='INCOMPLETE_SIGN_UP'`은 즉시 purge — 카카오 정책 "24시간 내 가입하지 않으면 모든 개인정보 파기" [출처 13] |
| `GET /api/me` | owner | — | `{ user: {id, provider, nickname, avatar_url, role, created_at}, notice: {text}\|null, maintenance: bool }` → 클라이언트 `useMe()`가 200을 받으면 `sync.onLogin(user.id)` 1회 호출(SH) |
| `PATCH /api/me` | owner | `{ nickname?: string(1~20), use_provider_avatar?: bool }` | `{ user }`. `use_provider_avatar=true`: 서버는 picture URL을 보관하지 않으므로 응답 `{ user, relogin_required: true }` → 클라이언트가 "다시 로그인하면 사진이 적용됩니다 [다시 로그인]"을 띄우고, 다음 콜백에서 `users.use_provider_avatar=1`이면 `avatar_url`을 채운다. `false`: 즉시 `avatar_url=NULL` [결정, 3차 L13 — 재로그인 안으로 확정]. `users`에 `use_provider_avatar INTEGER NOT NULL DEFAULT 0` 추가 필요(§6 8) |
| `GET /api/me/sessions` | owner | — | `{ sessions: [{id6, ua, created_at, last_seen_at, current}] }` |
| `DELETE /api/me/sessions/:id6` | owner | — | 204 |
| `POST /api/me/sessions/revoke-others` | owner | `{}` | `{ revoked: n }` |
| `GET /api/me/export` | owner | — | `{ exported_at, user, sessions }` (트리 JSON은 로컬에서) |
| `POST /api/me/delete` | owner | `{}` | 204 + 쿠키 만료 |
| `POST /api/t/:slug/report` | anon·user (owner는 403) | `{ reason: 'copyright'\|'spam'\|'abuse'\|'other', note?: ≤300자 }` — tree id는 서버가 slug로 해석 | 201 `{ id }`. slug가 없어도·숨김·삭제여도 201(존재 여부 비노출). anon 5/시·user 20/시 (3차 H1) |
| `GET /api/admin/stats` | admin | — | `{ users: {total, today, d7, active7, active30, suspended, pending_delete, signups_14d: number[14] /* 오래된 날 → 오늘, 로컬 자정 기준 */}, trees: {total, public, hidden, pending_delete}, backup: {at, bytes, ok, error?}, daily: {at, ok, purged_users, purged_sessions, purged_tombstones}, disk: {total, free}, uptime_s, rss }` (3차 L18) |
| `GET /api/admin/users?q=&cursor=&limit=50` | admin | `q` ≤ 40자 | `{ items: [{id, provider, nickname, role, created_at, last_seen_at, suspended_at, deleted_at, tree_count}], next }` |
| `GET /api/admin/users/:id` | admin | — | 위 항목 + `{ sessions: n, trees: [{id, title, visibility, updated_at}] }` |
| `POST /api/admin/users/:id/suspend` / `unsuspend` | admin | `{ reason?: ≤200자 }` | `{ user }` |
| `POST /api/admin/users/:id/delete` | admin | `{ purge_now?: bool }` | 204 |
| `GET /api/admin/trees?visibility=public&cursor=` | admin | — | `{ items: [{id, title, owner: {id, nickname}, node_count, updated_at, hidden_by_admin_at, open_reports}], next }` (SH 조인 요청) |
| `POST /api/admin/trees/:id/hide` / `unhide` | admin | `{ reason? }` | `{ tree }` |
| `POST /api/admin/trees/:id/restore` | admin | `{ reason? }` | `{ tree }` — SH `restoreTree(id)` 재사용, 7일 내만(지나면 410 `purged`), `audit_log action='tree.restore'` (3차 L2) |
| `GET /api/admin/reports?status=open` | admin | — | `{ items: [{id, tree: {id, title}, reason, note, created_at}] }` |
| `POST /api/admin/reports/:id/resolve` | admin | `{ resolution: 'hidden'\|'dismissed' }` | `{ report }` (`hidden`이면 트리 숨김도 수행) |
| `GET /api/admin/settings` / `PUT /api/admin/settings` | admin | `{ notice: {text ≤80, enabled}, maintenance: {enabled} }` | `{ settings }` |
| `GET /api/admin/audit?cursor=&limit=50` | admin | — | `{ items: [audit_log 행], next }` |
| `GET /api/health` | anon | — | `{ ok: true }` (외부 업타임 핑용. 버전·호스트명 없음) |

클라이언트 타입 파일 [제안]: `src/core/api.ts`에 `User` `Session` `AdminStats` `ApiError` 등을 두고 서버(`server/`)가 import. 구현 때 결정.

### 3.7 개인정보·보안 [R8]

**수집 항목 인벤토리** (11 §6 "OAuth 고유 ID와 닉네임만" 대조 → ✔ 일치, 추가 항목은 모두 선택 또는 운영 필수)

| 항목 | 출처 | 목적 | 보존 | 11 §6 대조 |
|---|---|---|---|---|
| `provider` + `provider_sub` | 제공자 | 로그인 식별 | 탈퇴 유예 7일 후 삭제 | ✔ "OAuth 고유 ID" |
| `nickname` | 제공자 초기값 → 사용자 수정 | 표시·공유 보기 소유자 표시 | 같음 | ✔ "닉네임" |
| `avatar_url` | 제공자(옵트인) | 표시 | 같음. 토글 OFF 시 즉시 NULL | 추가(선택). 바이트 저장 없음 |
| `role` `created_at` `last_seen_at` `suspended_at` `deleted_at` | 서버 | 운영·통계 | 같음 | 운영 필수, 개인 식별 안 됨 |
| `sessions.ua`(축약) `created_at` `last_seen_at` | 브라우저 | 기기 목록·만료 | 세션 만료·로그아웃 시 | 추가(운영). 원문 UA·IP 없음 |
| `audit_log` | 관리자 행동 | 책임 추적 | 1년 | 운영 필수 |
| `reports.note` | 신고자 | 신고 처리 | 처리 후 90일 [제안] | 추가. 자유 텍스트라 개인정보 섞일 수 있음 → 안내 문구 "개인정보를 적지 마세요" |
| 트리·노드·학습 기록 | 사용자 | 동기화·공유 | SH | 11 §6 "계정과 연결되므로 같은 등급" |
| 백업(위 전부, 암호화) | 서버 | 복구 | 14일 | 외부 처리자 Backblaze 명시 |
| **수집하지 않음** | | | | 이메일·실명·전화번호·생년월일·성별·IP·원문 UA·위치·결제 |

**개인정보 처리방침 항목** (법 제30조 1항 [출처 33] + 지침 [출처 35]) [결정]: ① 처리 목적(로그인·동기화·공유·운영) ② 항목·보유 기간(위 표) ③ 제3자 제공: 없음 ④ 파기 절차·방법(7일 유예 → 삭제, 백업 14일) ⑤ 처리위탁·국외이전: Cloudflare(트래픽 경유, 미국), Backblaze(암호화 백업, 미국) ⑥ 정보주체 권리·행사 방법(계정 화면에서 열람·정정·삭제·내보내기 즉시) ⑦ 보호책임자 연락처(운영자 이메일 1개) ⑧ 자동 수집 장치: 쿠키 `sid`·`oauth`·`theme`(기능 필수, 광고 없음) ⑨ AI 학습 활용: 없음 [출처 35 2026 개정] ⑩ 안전성 확보조치 요약(암호화 전송·백업 암호화·접근 통제·감사 로그). 공개 위치: 로그인 화면·계정 화면·푸터 [출처 35].

**유출 신고 의무** [출처 37]: 1천 명 이상, 민감·고유식별정보, **외부 불법 접근**은 규모 무관 72시간 내 신고. 우리 DB에 민감·고유식별정보는 없다. 해킹이면 1명이라도 대상 → 대응: 수집 최소화(위 표), 백업 암호화, 침해 탐지(§보안 표). 신고 절차서를 `docs/ops/`에 둔다(구현 단계) [제안].

**위협·대응표** [결정]

| 위협 | 대응 |
|---|---|
| 세션 탈취(쿠키 유출) | HttpOnly·Secure, DB에는 해시만, 30일 슬라이딩·180일 절대, 기기 목록에서 즉시 폐기, 로그인 시 id 교체 [출처 31] |
| CSRF | SameSite=Lax + `Sec-Fetch-Site`/`Origin` 검사 + JSON 강제 (§3.2) |
| 로그인 CSRF·콜백 위조 | `state`를 HttpOnly 쿠키에 묶어 비교, 10분 만료, PKCE S256으로 코드 가로채기 무력화 [출처 2·10], `redirect_uri` 제공자 측 고정 |
| 오픈 리디렉트 | `return_to`는 `#/` 접두 해시만 |
| 관리자 계정 탈취 | 허용목록 파일(DB 변조로 승격 불가) + **`/api/admin/*` 앞 Cloudflare Access 2차**(해시 라우트 `#/admin`은 가리지 않음 — 청크에 비밀 없음, 데이터는 전부 API 뒤) + 관리자 세션 24h + 모든 행동 `audit_log` + 자기 자신 정지 불가 |
| 인앱 브라우저 OAuth 거부·피싱 혼동 | 인앱 감지 시 Google 버튼 비활성 + 외부 브라우저 안내(§3.2). 제공자 로그인은 항상 top-level 302라 주소창이 보인다(Google 정책 "verify the current connection" [출처 39]) |
| Pi 침해 | 포트포워딩 0·Tunnel만 [11 §6], SSH는 Tailscale/Access 뒤·키 전용, 별도 VLAN, `unattended-upgrades`, Node 프로세스 비루트·`systemd` `ProtectSystem=strict` `ReadWritePaths=data/`, 시크릿은 `EnvironmentFile` 600 권한 |
| 백업 유출 | `age` 공개키 암호화 후 송신, 비밀키는 운영자 2인 오프라인 보관, B2 키는 쓰기 전용(목록·삭제 불가) [제안] + 버킷 수명주기 14일 |
| 계정 열거 | 로그인은 제공자 화면이라 존재 여부 노출 없음. 관리자 경로 404. 신고 API는 `tree_id` 존재 여부와 무관하게 201 |
| 무차별·남용 | 레이트 리밋(§3.6), Cloudflare WAF 기본 규칙 |
| DB 파일 유출 | 세션 해시, 이메일 없음 → 유출 시 노출은 `provider_sub`·닉네임·학습 트리. 신고 의무는 발생(해킹) |
| 공급망 | 의존성 Hono 1개 + Node 내장. 월 1회 `npm audit` |

**로그에 남기지 않을 것** [결정]: IP 주소(Cloudflare가 24h 보관하는 것은 처리방침에 적음), 원문 User-Agent, 쿠키·`sid`·`state`·`code`·토큰, 사용자 정보 응답 원문, 닉네임(요청 로그에는 UUID만), 쿼리스트링(`return_to` 포함). 요청 로그 형식: `ts method path status ms` 만, 7일 보관.

### 3.8 비용·운영 [R5] (계산 `evidence/aa/cost_table.md`)

| 항목 | 월 | 근거 |
|---|---|---|
| 전력(Pi 5 1대, 평균 4W) | 약 750원 | 11 §3.1 산식 [출처 0] |
| 도메인 .com | 약 1,300원 | $11.17/년 [출처 22] |
| Cloudflare(DNS·Tunnel·Access·캐시) | 0원 | Free·Zero Trust Free 50석 [출처 23] |
| Backblaze B2(≤10GB) | 0원 | [출처 24] |
| 회선·이메일·LLM | 0원 | 한계비용·미사용 |
| **현금 합계** | **약 2,050원/월(연 약 2.5만 원)** | |
| 하드웨어 1회(Pi 5 4GB + PSU + 쿨러 + M.2 HAT + NVMe 256GB) | 약 $202 ≈ **28만 원**(보유 시 0) | [출처 20·11 S3]. 36개월 감가 약 7,900원/월 |
| 운영 시간 | **월 2~3.5시간** | 업데이트 1h, 복원 리허설 20분, 장애 1~2h [가정] |

11 §3 대비: 2대(2,800원 + 66만 원) → 1대(2,050원 + 28만 원). 메모리 예산 합계 300~430 MB로 4GB의 1/10 [측정·가정]. 2GB 모델($77.5)도 동작하나 페이지 캐시 여유를 위해 4GB [제안].

**복원 런북** (3차 M15. 월 1회 리허설은 이 절차를 노트북에서 끝까지 수행) [결정]
1. 복호화 키: `age` 비밀키는 운영자 2인이 각자 오프라인(종이·암호 관리자)에 보관. 서버에는 공개키만(`/etc/drilldown/backup.pub`). 리허설 기기에 비밀키를 임시 복사하고 끝나면 지운다.
2. 새 기기(Pi 또는 임의 Linux x64/ARM64, 또는 임시 VPS)에 Node 24 LTS·`cloudflared`·`age`·`rclone` 설치, 저장소 clone → `npm ci && npm run build`.
3. `rclone copy b2:drilldown-backup/latest/ ./restore/` → 파일: `app-YYYYMMDD.db.age`(`sqlite.backup()` 결과라 **WAL이 이미 합쳐진 단일 파일**. 서버의 `app.db-wal`·`-shm`은 복사 대상이 아니다).
4. `age -d -i key.txt app-YYYYMMDD.db.age > data/app.db` → `sqlite3 data/app.db 'PRAGMA integrity_check'` = `ok` 확인.
5. `PRAGMA user_version` 확인 → 코드의 `server/migrations/`보다 낮으면 기동 시 자동 마이그레이션(아래 규칙).
6. `.env`(OAuth client id/secret, Kakao admin key, `ADMINS` 경로, `DATA_DIR`) 복원 — 비밀값은 백업에 **없다**. 운영자 암호 관리자에서 가져온다.
7. `systemctl start drilldown-server` → `curl localhost:3000/api/health` = `{ok:true}`.
8. Tunnel 재연결: `cloudflared tunnel run <tunnel>` (자격 증명 `~/.cloudflared/<id>.json`도 암호 관리자에서). 같은 터널 이름이면 DNS·Access 정책 변경 없음. 옛 Pi가 살아 있으면 먼저 `systemctl stop cloudflared`(커넥터 2개 동시 연결 방지).
9. 확인: 외부에서 `https://<domain>/api/health`, 관리자 로그인 → 대시보드 `backup.at`·`users.total`이 백업 시점과 일치, 공유 링크 1개 열기.
10. 사용자 공지(`settings.notice`)에 "HH:MM 이후 서버 저장분은 다음 동기화 때 다시 올라갑니다" 1줄 → 24시간 뒤 끈다. `audit_log action='system.restore'` 기록. 소요 목표 60분 [가정].

**일일 작업** (`daily.timer` 04:00, 스케줄러 소유 = **AA**, SH 함수 호출) [결정]
| 순서 | 작업 | 구현 |
|---|---|---|
| 1 | 만료 세션 삭제 | `DELETE FROM sessions WHERE expires_at < now OR created_at < now-180d` |
| 2 | 탈퇴 7일 경과 사용자 purge | `SELECT id FROM users WHERE deleted_at < now-7d` → 각각 SH `purgeUser(id)` → `DELETE FROM users WHERE id=?` → `audit_log('user.purge', actor NULL)` |
| 3 | SH 톰스톤 정리 | SH `purgeTombstones()`(7일 지난 `deleted_at` 트리·노드·srs 물리 삭제) |
| 4 | 감사 로그 1년 초과 삭제 | `DELETE FROM audit_log WHERE ts < now-365d` |
| 5 | 처리 완료 신고 90일 초과 삭제 | `DELETE FROM reports WHERE resolved_at < now-90d` |
| 6 | `PRAGMA wal_checkpoint(TRUNCATE)`; `PRAGMA optimize` | WAL 크기 억제 |
| 7 | 결과를 `data/daily.json` `{at, ok, purged_users, purged_sessions, purged_tombstones, error?}`에 기록 → 대시보드 | 실패 시 외부 알림(텔레그램 봇 1줄) [가정: 11 §2 감시 항목 재사용] |
백업(03:00)이 일일 작업(04:00)보다 먼저 돌아, purge 직전 상태가 마지막 백업에 남는다(14일 보관) [결정].

**스키마 마이그레이션 규칙** [결정]
- `server/migrations/NNN_<name>.sql` (001부터, AA·SH 테이블 모두 한 디렉터리. 파일 머리에 `-- owner: AA|SH`).
- 기동 시 `PRAGMA user_version` 읽기 → `NNN > user_version`인 파일을 순서대로 한 트랜잭션씩 실행 → `PRAGMA user_version = NNN`. 기동 직전 `sqlite.backup()`으로 `data/pre-migrate-<NNN>.db` 1개 보관(다음 성공 기동 때 삭제).
- 전방 전용. 롤백 = 직전 코드 + `pre-migrate` 파일 복원. 컬럼 삭제는 `DROP COLUMN`(SQLite 3.35+) 또는 그대로 둔 채 미사용.
- 클라이언트 Dexie 버전(SH v2)은 서버와 독립. 서버 응답에 `schema: NNN`을 넣어 구버전 클라이언트가 알 수 없는 필드를 무시하도록 한다(필드 추가만 허용, 이름 변경 금지).

### 3.9 구현 공수와 순서 [제안]

| 단계 | 내용 | 공수 |
|---|---|---|
| 1. 로그인 | `server/` 골격(Hono + node:sqlite + 정적), `users`·`sessions`, Google·Kakao PKCE 흐름, `sid`, CSRF 검사, `/api/me`, `login` 라우트·화면, `App.tsx` 로그인 상태, systemd·Tunnel 설정, 백업 스크립트 | **M**(2일) |
| 2. 계정 | `account` 화면(닉네임·생성 아바타·옵트인·기기 목록·내보내기·삭제), 7일 유예·일일 정리, Kakao unlink·웹훅, 처리방침 페이지 | **M**(1.5일) |
| 3. 관리자 | `admin` 화면 4개, `/api/admin/*`, `audit_log`·`settings`·`reports`, Cloudflare Access 정책, 점검 모드 | **M~L**(2~3일) |
| 합계 | | 약 5.5~6.5일. SH 동기화와 병렬 가능(의존: `trees` 스키마·COUNT API) |

## 4. 화면별 적용

| 화면 | 이 문서가 더하는 것 |
|---|---|
| 목록 | 상단 바에 아바타 버튼(로그인 시 생성 아바타/제공자 이미지, 비로그인 시 "로그인" 아이콘) → `#/account` 또는 `#/login`. 공지 1줄 배너(`notice.enabled`). 점검 모드 배너. 로그인 후 로컬 트리 병합 바텀시트(§3.3) |
| 에디터·플래시·복습·빈칸·백지 | 변화 없음. 비로그인도 그대로(A10). 점검 모드 중에도 로컬 학습 계속, 동기화만 중단(SH) |
| 로그인 (`#/login`) | 설명 1줄 + Google·Kakao 버튼 2개(제공자 브랜드 가이드 준수 — 색 예외, plan A6 보강) + 처리방침·약관 링크 + "로그인 없이 계속" 링크. 오류 `?e=denied\|suspended\|state` 토스트. 인앱 브라우저 감지 시 Google 비활성 + 외부 브라우저 안내(§3.2) |
| 계정 (`#/account`) | §3.3 요소. 위험 영역(탈퇴 2단계 버튼 DS #22)은 맨 아래 빨강 테두리(DS). SH 요청 섹션 2개: "휴지통(7일)" 복구 목록, "이 기기 데이터 지우기" |
| 관리자 (`#/admin`, `#/admin/users`, `#/admin/trees`, `#/admin/system`) | §3.4. 비관리자는 `#/`로 리디렉트(API는 404; 화면 청크 노출은 허용). 모바일: 표 → 카드, 검색창 상단 고정, 파괴 버튼은 카드 마지막 줄 오른쪽 + 2단계(LM) |
| 공유 보기 (`/t/<slug>`) | 신고 버튼(⋯ 메뉴, anon 허용, SH와 통일 M10·L20) → `POST /api/t/:slug/report`. 숨김 403·삭제/탈퇴 유예 410(SH) |
| 갤러리(미결) | 공개 트리 목록은 `hidden_by_admin_at IS NULL` 필터(SH) |

## 5. 검증

### (a) 요구사항 대조표

| 요구 (plan §1 완료 기준) | 어디서 충족 | 증거 |
|---|---|---|
| R8 흐름도(로그인·로그아웃·탈퇴·재로그인 시 로컬 병합) | §3.2, §3.3, `evidence/aa/flows.md` §1~§7 | mermaid·ASCII 흐름 7개 |
| R8 테이블·API | §3.5, §3.6 | DDL 2개, 엔드포인트 24개 + 오류 형식·레이트 리밋·검증 |
| R8 개인정보 인벤토리 | §3.7 표 | 11 §6 대조 열 ✔ |
| R8 위협·대응표 | §3.7 | 11개 위협(요구된 7개 포함) |
| R8 비용 | §3.8, `evidence/aa/cost_table.md` | 월·1회·운영시간 |
| R8 OAuth만·비밀번호 없음·저장 최소·httpOnly 세션 | §2, §3.2, §3.5 | 스코프 표·DDL |
| R8 계정 화면(닉네임·아바타·연결 계정·내보내기·탈퇴) | §3.3 | 표 7행 + 아바타 비교 |
| R8 로그인 없이 로컬 사용 유지 | §4, §3.3 SH 의존 | A10 |
| R9 화면 목록 + 데이터 출처 | §3.4 표 | 테이블·쿼리·상태 파일 |
| R9 권한 매트릭스 | §3.4 | 14행 × 4열 빈칸 0 |
| R9 감사 로그 | §3.4 DDL | 액션 목록·보관 |
| R9 `role=admin` 허용목록 | §3.4 관리자 인증 1 | 설정 파일 |
| R9 모바일 열람 | §4 관리자 행 | LM 의존 명시 |
| R5 서버 = Pi 1대, 사양·월 비용 최소 | §3.1, §3.8 | 측정 63 MB, 2,050원/월 |
| R5 제외한 의존성 목록 | §3.1 끝 | 9개 |
| 지시 1 스택 비교(5후보·기준 5·출처/가정 구분·1대 평가) | §3.1 | 표 + 2대 vs 1대 문단 |
| 지시 2 OAuth(Google·Kakao 필수, Naver·Apple 평가, 등록·스코프·사업자·콜백·state·PKCE·쿠키·CSRF·로그아웃·기기 목록, 출처 URL) | §3.2 | 출처 1~17 |
| 지시 3 계정 화면 + 로컬 트리 UX + SH 의존 표 | §3.3 | — |
| 지시 4 관리자 + SH 요청 표 | §3.4 | — |
| 지시 5 API 스키마·에러·레이트 리밋·검증 | §3.6 | — |
| 지시 6 인벤토리·처리방침 항목·유출 신고·위협표·로그 제외 | §3.7 | — |
| 지시 7 비용표·하드웨어·운영 시간·11 §3 갱신 | §3.8, evidence | — |
| 지시 8 공수 S/M/L·순서 | §3.9 | — |

### (b) 코드베이스 대조 — 현재 코드가 어떻게 바뀌어야 하는지 (구현 단계용, 이번엔 수정 없음)

| 파일 | 현재 [코드] | 변경 |
|---|---|---|
| `src/router.ts` | `Route` = `trees \| Mode+treeId \| review`. `parseHash`가 `tree/`·`review`만 인식 | `Route`에 `{name:'login', e?}` `{name:'account'}` `{name:'admin', tab?: 'users'\|'trees'\|'system'}` 추가. `href.login(returnTo?)` `href.account()` `href.admin(tab?)`. `shared`는 SH. 해시 라우터는 OAuth 콜백과 충돌 없음(콜백은 `/api/auth/*` 서버 경로) |
| `src/App.tsx` | `topnav`에 "내 트리"·"오늘의 복습" 링크 2개. 로그인 상태 없음 | `useMe()` 훅(`GET /api/me`, 401이면 `null`, 결과를 React context로; **200이면 `sync.onLogin(user.id)` 1회 호출** — SH §4·RV §4 2). `topnav` 우측에 아바타/로그인 아이콘. `load`에 `login` `account` `admin` lazy 추가(관리자 청크는 `role==='admin'`일 때만 프리패치, precache 제외 — plan §3.5 M6). 공지·점검 배너 컴포넌트. 로그인 화면용 인앱 브라우저 감지 유틸 `src/core/inapp.ts`(UA 정규식 1개) |
| `src/core/db.ts` | Dexie 5 테이블 v1. 사용자 개념 없음 | AA는 변경 없음(로컬은 계정과 무관, A10). Dexie v2(`outbox`·`meta`)는 SH 소유 |
| `src/core/types.ts` | `Tree`에 `ownerId` 없음 | **AA는 `Tree`·`TreeNode` 타입 변경 없음. 선택 필드 추가는 SH R-T1 참조**(3차 L19). 서버 `trees.owner_id`는 서버 전용 |
| 신규 `src/core/api.ts` | — | `User` `Session` `ApiError` `AdminStats` 등 응답 타입 + `api<T>(path, init)` fetch 래퍼(`credentials:'same-origin'`, JSON, 401→`me=null`, 429 토스트, 503→점검 배너) |
| 신규 `src/features/account/LoginPage.tsx` `AccountPage.tsx` | — | §4 로그인·계정. 생성 아바타는 `TreeListPage`의 `toneOf`를 `src/core/avatar.ts`로 옮겨 공용화 [코드 TreeListPage:17] |
| 신규 `src/features/admin/AdminPage.tsx`(+ 3 탭) | — | §3.4 화면. `admin.css` lazy |
| `src/features/editor/TreeListPage.tsx` | `toneOf` 로컬 함수, `.tree-avatar`는 `--accent` 혼합 색 [코드 treelist.css:37~47] | `toneOf` import로 교체. 톤 색은 DS가 4색 팔레트로 재정의(`--accent` 폐기 시) — DS 의존 |
| `src/core/events.ts` | `exportEvents()`만 | 백로그 #1 전체 백업 JSON(`exportAll()`)로 확장 → 계정 화면 "내 데이터 내보내기"가 호출. SH와 형식 합의 |
| `src/index.css` | 토큰 정의 | 변경 없음(DS) |
| `vite.config.ts` | PWA 플러그인. dev 프록시 없음 | dev에서 `/api` → `localhost:3000` 프록시 추가. PWA `navigateFallbackDenylist: [/^\/api/, /^\/t\//]` |
| 신규 `server/` | — | `index.ts`(Hono + node:sqlite + 정적 + `/t/:slug` 치환 라우트 마운트(SH 모듈)), `auth.ts`(Google·Kakao), `admin.ts`, `reports.ts`, `migrations/001_init.sql`…(AA·SH 공용, `PRAGMA user_version`), `daily.ts`, `backup.mjs`, `drilldown.service` + `daily.timer` + `backup.timer`, `config/admins.json.example`, `.nvmrc`. `package.json`에 `hono` 1개 + `engines.node` + 스크립트 `server`, `server:dev` — **의존성 추가는 구현 오케스트레이션 때** |
| `e2e/` | 13개 spec | 로그인은 제공자 화면이라 E2E 불가 → 서버에 `AUTH_FAKE=1`일 때 `/api/auth/fake/callback?sub=`로 테스트 세션 발급(프로덕션 빌드에서 제외) [제안] |

### (c) 직접 측정·계산

| 항목 | 값 | 어디서 |
|---|---|---|
| Node 24 `node:http` 유휴 RSS | 54.7 MB | `evidence/aa/memory_measure.md` |
| + `node:sqlite` + 사용자·세션 1만 | 63.1 MB | 같음 |
| 세션 → 사용자 JOIN 조회 | 5.3 µs/건 | 같음 |
| 사용자 1만 + 세션 1만 적재 | 51 ms, DB 4.0 MB(≈400 B/인) | 같음 |
| 월 현금 비용 / 하드웨어 1회 | 약 2,050원 / 약 28만 원 | `evidence/aa/cost_table.md` §1~2 |
| 메모리 예산 합계 | 300~430 MB (4GB의 1/10) | 같음 §4 |
| 운영 시간 | 월 2~3.5시간 | 같음 §5 |
| 생성 아바타 SVG | `<svg viewBox="0 0 32 32"><rect width="32" height="32" fill="…"/><text x="16" y="21" text-anchor="middle" font-size="16" font-weight="700" fill="…">가</text></svg>` ≈ 190 B | 계산(문자 수) |

측정 한계: Windows x64에서 측정했다. Pi 5 ARM64 Linux 값은 **미측정**이고 "같은 자릿수"는 [가정]이다. cloudflared·OS 유휴 메모리는 공개 측정값을 찾지 못해 [가정]이다. 출시 전 Pi에서 `smem`으로 1회 확인한다.

### (d) 스스로 찾은 약점과 보완

| # | 약점 | 보완 |
|---|---|---|
| 1 | **Kakao 운영정책의 "캐시 제한"** [출처 13]: 카카오 데이터 캐시는 UX 개선 목적만. `avatar_url` 저장은 UX 목적이라 해당 [추론]. 그러나 닉네임을 사용자가 수정하지 않고 계속 쓰는 경우 "최신 유지" 의무가 생긴다 | 로그인마다 닉네임이 **사용자 수정 이력이 없으면**(`nickname_edited_at IS NULL` [제안 필드]) 제공자 값으로 갱신. 계약 `users`에 필드 1개 추가 필요 → 오케스트레이터 확인 |
| 2 | **Kakao 외부 연결 끊기 웹훅**은 어드민 키로 인증되고 3초 내 응답 필요 [출처 12]. Pi가 다운이면 놓친다 | 웹훅 재시도 여부가 문서에 없음 [가정] → 보완: 웹훅도 7일 유예 규칙으로 처리하되(3차 M1) 가입 미완료(`INCOMPLETE_SIGN_UP`)만 즉시 purge. 놓친 웹훅은 일일 작업에서 `last_seen_at` 2년 초과 계정 정리로 보완 [제안] |
| 3 | **Google 'picture'·Kakao 이미지 URL 만료 정책이 문서에 없음** [출처 1·11] | 옵트인 + `onerror` 폴백(§3.3). 로그인 때마다 URL 갱신 |
| 4 | **집 회선 약관**: KT·SKB 인터넷 이용약관의 "서버 운영 금지" 조항을 이번에도 원문에서 확인 못 함(11 Z3 미해결). 검색된 KT 2025-05 약관 PDF는 열람 실패 | 사용자 질문(§6). 금지면 업무용 회선 또는 $4~5 VPS(월 6~7천 원)로 바뀌어 §3.8이 3배가 된다 |
| 5 | **Pi 5 가격 변동**: 출처마다 4GB $85~110, 8GB $130~180 [출처 20] | 표에 범위로 표기. 보유 Pi면 무관 |
| 6 | **SQLite 단일 writer**: SH 동기화가 노드 단위로 잦은 쓰기를 하면 쓰기 큐가 길어질 수 있다 | WAL + `synchronous=NORMAL` + 동기화 요청당 1 트랜잭션(배치). 11 §2.3 피크 10 req/s에서 ms 단위 트랜잭션이면 문제 없음 [추론]. 부하 테스트(k6 반나절)는 11 Z1과 함께 |
| 7 | **1대 구성의 RPO 24h**: 서버에만 있는 데이터(공유 링크 slug, 관리자 설정, 감사 로그)는 하루치 유실 가능 | 허용 [결정]. 필요해지면 Litestream 추가(데몬 1개, 설정 10줄) [출처 29] |
| 8 | **Cloudflare Access 2차 인증**이 로컬 개발·E2E에 없다 | 관리자 API는 Access 없이도 `role` 검사로 동작. Access는 "추가 벽"일 뿐 유일한 벽이 아님 |
| 9 | **`PATCH /api/me use_provider_avatar`**: 로그인 콜백 뒤에는 제공자 picture URL을 모른다 | **재로그인 안으로 확정**(3차 L13, §3.6): 토글 ON → `users.use_provider_avatar=1` + 응답 `relogin_required` → 다음 콜백에서 `avatar_url` 저장. 옵트인 전에는 URL을 보관하지 않아 최소 수집 유지 |
| 10 | **개인정보처리자 해당 여부**: 대법원 2026-04 판결 요지(언론·검색 요약, 판결문 본문 미확인 — [가정])는 영리 여부와 무관하게 "업무 목적" 운용이면 처리자 [출처 34, 요약 출처]. 취미 서비스라도 처리방침·안전조치·신고 의무를 전제로 설계했다 | 변경 없음. 1만 명 미만이면 내부 관리계획은 생략 가능 [출처 36, 2차 자료 — 고시 원문 대조 필요 [가정]] |
| 11 | **Naver 미지원 시 유입 손실**: 비치헤드(노무사 2차)는 네이버 카페 중심 [02] | §6 질문. 추가 시 공수 S(검수 대기 별도) |
| 12 | 계약 §3.3에 없는 `settings` `reports` 테이블과 `sessions.last_seen_at` `users.nickname_edited_at` `users.use_provider_avatar` 필드를 제안했다 | `reports`는 3차 H1로 **AA 소유 확정**. `settings`·필드 3개는 [제안] 유지(§6 8). 거부되면 공지·점검은 설정 파일로 대체 가능 |
| 13 | **탈퇴 취소 시 트리 복원 범위**: `UPDATE trees SET deleted_at=NULL WHERE owner_id=?`를 그대로 쓰면 탈퇴 전 사용자가 직접 지운(7일 내) 트리까지 되살아난다 | SH 함수에 `since` 인자(`users.deleted_at`) 요청(§3.4 요청 표). 탈퇴 일괄 삭제 시각이 트리 `deleted_at`과 같으므로 `deleted_at >= since`로 구분 가능 [추론] |
| 14 | **인앱 브라우저 감지는 UA 문자열 의존**: 오탐(Samsung Internet)·미탐(새 메신저) 가능 | Kakao 버튼은 항상 활성이라 로그인 자체는 막히지 않음. 체크리스트 A7. Google이 실제로 거부하면 그때 오류 페이지에서 같은 안내를 다시 보여 줌(`?e=denied` 처리에 UA 안내 포함) [제안] |

## 6. 미결·사용자 질문

1. **Pi 보유 여부와 모델**(2GB/4GB/8GB) — 하드웨어 비용 28만 원이 0이 되는지, 2GB면 메모리 예산 재확인.
2. **가정 회선 통신사와 약관 확인**(KT/SKB/LGU+ "금지행위" 조항) — 금지면 VPS 전환 비용 월 6~7천 원 [가정].
3. **Naver 로그인 추가 여부** — 검수 필수, 공수 S + 검수 대기. Apple은 제외 권고($99/년).
4. **공개 갤러리 운영 여부**(plan §2 미결) — 운영하면 신고 처리가 관리자 업무가 됨. `reports` 테이블은 운영 시에만.
5. **계정 삭제 유예 7일**이 적절한지(즉시 삭제 선호 시 `purge_now` 기본 ON).
6. **관리자 2차 인증을 Cloudflare Access로 둘지**(운영자 이메일 2개 등록 필요) 아니면 생략할지.
7. **처리방침 보호책임자 연락처**로 쓸 이메일 1개.
8. 오케스트레이터 확인: `settings` 테이블 AA 소유 추가(`reports`는 H1로 확정됨), `users.nickname_edited_at` `users.use_provider_avatar` `sessions.last_seen_at` 필드 추가(§5(d) 1·9·12).
9. SH 확인: `restoreTreesOfUser(ownerId, since)`의 `since` 인자(§5(d) 13), 톰스톤 유예 30일 → 7일 반영, `purgeUser`에서 `events` 제외.

## 7. 출처 (확인일 2026-11-08, 발췌는 `evidence/aa/sources.md`)

- [출처 0] 저장소 내부(경로는 본 저장소 `C:\drilldown\app` 기준 `../drilldown-biz`; 워크트리에는 없음): `../../../drilldown-biz/brief/decisions.md` 6~9, `../../../drilldown-biz/reports/11_cost_recovery.md` §2·§3·§6(그 안의 S1~S17 재인용), `04_tech.md` §4·§7, `../research/R4_platform.md` #12·#13, `../research/feature_backlog.md` #1
- [출처 1] Google OpenID Connect — https://developers.google.com/identity/openid-connect/openid-connect
- [출처 2] Google OIDC Discovery — https://accounts.google.com/.well-known/openid-configuration
- [출처 3] Google OAuth 스코프 — https://developers.google.com/identity/protocols/oauth2/scopes
- [출처 4] Google 앱 검증 — https://support.google.com/cloud/answer/13463073
- [출처 5] Google 게시 상태·테스트 사용자 100명 — https://support.google.com/cloud/answer/15549945
- [출처 6] Google 브랜딩·프로덕션 필수 링크 — https://support.google.com/cloud/answer/10311615
- [출처 7] Kakao 로그인 설정 — http://developers.kakao.com/docs/ko/kakaologin/prerequisite
- [출처 8] Kakao 동의항목 표 — http://developers.kakao.com/docs/ko/kakaologin/utilize
- [출처 9] Kakao REST API — http://developers.kakao.com/docs/ko/kakaologin/rest-api
- [출처 10] Kakao OIDC Discovery(S256) — https://kauth.kakao.com/.well-known/openid-configuration
- [출처 11] Kakao 로그인 이해하기(토큰 수명·연결 끊기) — http://developers.kakao.com/docs/ko/kakaologin/common
- [출처 12] Kakao 연결 끊기 알림 — http://developers.kakao.com/docs/ko/kakaologin/callback
- [출처 13] Kakao 디벨로퍼스 운영정책 — http://developers.kakao.com/terms/ko/site-policies
- [출처 14] Kakao 개발자 포럼(비즈 앱 전환, 2차) — https://devtalk.kakao.com/t/how-can-i-switch-to-a-biz-app-if-i-do-not-have-any-business-registration-number/71983
- [출처 15] 네이버 로그인 검수 안내(채널톡, 2차; developers.naver.com 직접 접근 불가) — https://docs.channel.io/clickn/ko/articles/네이버-아이디로-로그인-261c8aeb
- [출처 16] Apple App Store 심사 지침 4.8 — https://developer.apple.com/app-store/review/guidelines/
- [출처 17] Apple Developer Program $99 — https://developer.apple.com/programs/
- [출처 18] SQLite 적합성 — https://www.sqlite.org/whentouse.html
- [출처 19] node:sqlite — https://nodejs.org/api/sqlite.html
- [출처 20] Pi 5 가격(Phoronix 2026-10-01) — https://www.phoronix.com/news/Raspberry-Pi-5-2GB-Price-77.50 ; 상충 표 https://www.tomshardware.com/raspberry-pi/raspberry-pi-and-mini-pc-home-lab-prices-hit-parity-as-dram-costs-skyrocket-price-hikes-force-hobbyists-to-weigh-up-performance-versus-power-consumption
- [출처 21] Pi 5 공식 — https://www.raspberrypi.com/products/raspberry-pi-5/
- [출처 22] .com 가격(3자) — https://costgoat.com/pricing/cloudflare-domains
- [출처 23] Cloudflare Zero Trust Free 50석 — https://blog.cloudflare.com/teams-plans ; https://www.cloudflare.com/sase/products/access/
- [출처 24] Backblaze B2 — https://www.backblaze.com/cloud-storage/pricing
- [출처 25] Pi 4B 1GB 웹 스택 사례 — https://deepakness.com/blog/pi-website-stack/
- [출처 26] Postgres 150MB 미만 — https://stevenpg.com/posts/postgres-on-less-than-150mb-of-memory/
- [출처 27] Supabase 셀프 호스팅 — https://supabase.com/docs/guides/self-hosting/docker ; arm64 측정(3자) https://www.dreamhost.com/guides/supabase/supabase-or-plain-postgres/
- [출처 28] PocketBase — https://pocketbase.io/faq/ ; https://pocketbase.io/docs/authentication/
- [출처 29] Litestream — https://litestream.io/guides/backblaze/ ; https://litestream.io/guides/s3-advanced/
- [출처 30] Caddy 유휴 메모리(3자) — https://markaicode.com/benchmarks/celery-vs-nginx-benchmark/
- [출처 31] OWASP Session Management — https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- [출처 32] OWASP SameSite — https://community.owasp.org/SameSite
- [출처 33] 개인정보 보호법 제30조 — **2차 자료(요약 출처)** https://itwiki.kr/w/개인정보_보호법_제30조 ; 법제처 원문 https://www.law.go.kr/법령/개인정보보호법 은 본문 fetch 실패 → 조문 열거는 [가정] 등급, 구현 전 원문 대조 (3차 L11)
- [출처 34] 대법원 2026-04-16 개인정보처리자 판결 — PDF https://www.scourt.go.kr/sjudge/1776736872554_110112.pdf 는 존재하나 본문 추출 불가. 요지는 **검색 요약(2차)**에 의존 → [가정] (3차 L11)
- [출처 35] 처리방침 작성지침 2025·2026 개정 — **언론 보도(요약 출처)** https://newsseoul.co.kr/news/view/1065585619471455 ; https://mobile.newsis.com/view/NISX20260424_0003604909 ; 지침 원문(pipc.go.kr PDF)은 미열람 → [가정] (3차 L11)
- [출처 36] 안전성 확보조치 기준 제8조 — **2차 자료(요약 출처)** https://itwiki.kr/w/개인정보의_안전성_확보조치_기준_제8조 → [가정] (3차 L11)
- [출처 37] 유출 신고 72시간 — https://pipc.go.kr/np/default/page.do?mCode=D030040000 ; https://www.kisa.or.kr/1030402 (11_cost_recovery S17 재인용)
- [출처 38] Cloudflare 영상 전송 약관·Tunnel — https://blog.cloudflare.com/updated-tos/ ; https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/
- [출처 39] Google OAuth 2.0 Policies(임베디드 UA 금지: "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent", "All browsing environments must allow the user to verify the current connection to the Google OAuth server") — https://developers.google.com/identity/protocols/oauth2/policies (확인일 2026-11-08). `disallowed_useragent` 오류명은 정책 페이지에 없음 → [가정]

## 8. 3차 변경 기록 (RV `05_review.md` §2 → plan §3.5 판정 반영, 2026-11-08)

| RV # | 변경 위치 | 내용 |
|---|---|---|
| H1 | §2 신고 행(신규), §3.4 AA 소유 테이블·권한 매트릭스, §3.6 레이트 리밋·`POST /api/t/:slug/report`, §4 공유 보기 | `reports` AA 소유 확정. 경로 `/api/reports` 삭제 → `POST /api/t/:slug/report`(tree id 비노출). anon IP당 5/시·user 20/시, 메모리 카운터만·IP 미저장(§3.7 일치 명시). `ip_hash` 없음. 처리 화면·`audit_log` 연결 유지 |
| M1 | §2 계정 삭제 행, §3.3 SH 의존 표, §3.4 요청 표, §3.6 Kakao 웹훅 행, §5(d) 2·13, flows.md §4 | 유예 7일 통일(탈퇴·트리), 삭제·탈퇴 유예 링크 **410**, 취소 시 `restoreTreesOfUser` = `UPDATE trees SET deleted_at=NULL WHERE owner_id=?`(+`since` 인자 요청), `events` purge 대상 제외, Kakao 웹훅도 7일 규칙(가입 미완료만 즉시 purge, 출처 13 근거) |
| M2 | §3.3 "로그인 전 로컬 트리 UX"·SH 의존 표, §5(b) App.tsx 행, flows.md §5 | SH §3.8 M1~M4에 맞춤: 확인 대화 컴포넌트 1개 재사용, "이 기기 것만 유지" 삭제, M3 계정 전환 대화는 SH 규칙·AA 문구, `useMe()` → `sync.onLogin` 호출 지점 명시 |
| M5 | §2 서버 스택 행, §3.1 배치도, §5(b) server/ 행 | `/t/:slug` → `dist/index.html` 치환 라우트(SH 소유) 추가. Node 단일 프로세스 유지, Caddy 없음 |
| M7 | §2 관리자 인증 행, §3.4 관리자 인증 2·404 문장, §3.7 위협표, §4 관리자 행 | Access는 `/api/admin/*`만. `#/admin` 해시 유지, 관리자 청크 노출 허용(비밀 없음) |
| M8 | §3.2 신규 소절 "인앱 브라우저·PWA standalone", §3.7 위협표 행, §4 로그인 행, §5(b) `inapp.ts`, §5(d) 14, §7 [출처 39] | 인앱 감지 시 Google 비활성 + 외부 브라우저 안내(Google 정책 출처), iOS standalone 302 왕복·저장소 분리, 실기기 체크리스트 A1~A7(LM M6와 함께) |
| M11 | §3.3 계정 삭제 행, §4 계정 행, flows.md §4 | "2초 홀드" → 2단계 버튼 `[탈퇴]` → `[정말 탈퇴]` 3초 (DS #22) |
| M15 | §2 백업·운영 행, §3.1 배치도 `daily.timer`, §3.8 복원 런북 10단계·일일 작업 표·마이그레이션 규칙, §3.4 대시보드 `daily.json`, §3.6 stats `daily`, §5(b) server/ 행 | 복호화 키 위치·WAL 합쳐진 단일 파일·기동·Tunnel 재연결·확인 순서. 일일 작업 7개(스케줄러 AA, SH `purgeUser`·`purgeTombstones` 호출). `server/migrations/NNN.sql` + `PRAGMA user_version` |
| L2 | §3.4 권한 매트릭스, 요청 표, §3.6 | owner 신고 ❌ 유지. `POST /api/admin/trees/:id/restore` **추가**(SH `restoreTree` 재사용, 7일, audit). 매트릭스에 "삭제 트리 복구" 행 추가 |
| L11 | §7 [출처 33]·[34]·[35]·[36], §5(d) 10 | 법령·판결·지침 2차 자료에 "요약 출처"·[가정] 표시 |
| L12 | §2 서버 스택 행, §3.1 끝 "Node·node:sqlite 버전 규칙" | Stability 1.2 RC(Node 25.7), Node 24 LTS 고정(`engines`·`.nvmrc`), 경고 처리 |
| L13 | §3.2 콜백 2, §3.6 콜백·`PATCH /api/me` 행, §5(d) 9 | state 불일치 → 302 `#/login?e=state` 통일. 아바타 옵트인 = 재로그인 안 확정(`users.use_provider_avatar`) |
| L15 | §3.4 첫 문단, §4 관리자 행 | 모바일 행 동작 LM안(카드 마지막 줄 오른쪽 정렬 + 2단계 버튼). ⋯ 메뉴 삭제 |
| L18 | §3.4 대시보드 행, §3.6 `GET /api/admin/stats` | `signups_14d: number[14]` + 쿼리 |
| L19 | §5(b) `types.ts` 행 | "AA는 `Tree` 타입 변경 없음, SH R-T1 참조" |
| M3·M4·M6·L5·L14·L17·L20 | — | 타 담당(SH·DS·LM) 반영 사항. AA 문서는 이미 일치하거나(M3 봉투 = AA 형식, L14 AA 값 권장) 참조만 갱신(§4 공유 보기 M10·L20) |
