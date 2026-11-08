# 오케스트레이션 — 재설계 구현 2단계: 서버·로그인·동기화·공유 링크·관리자 API (mock → 실구현)

작성 2026-11-08, 오케스트레이터. 사용자 지시: "나머지도 구현해"(UI-First 1단계 `orchestration_ui_first.md` 뒤). 설계 입력: `docs/specs/00_overview.md` §5 P2~P6, `03_account_admin.md`, `04_tree_sharing_sync.md`.

## 0. 범위

- **안**: Node 24 + `node:sqlite`(WAL) + Hono 1프로세스 서버(`server/`), Google·Kakao OAuth(PKCE) + 개발·E2E용 가짜 로그인, 세션 쿠키, `/api/me*`, 관리자 API·감사 로그·설정·신고, 일일 작업·백업 스크립트·배포 파일(systemd·cloudflared 안내), Dexie v2 `outbox`·`meta`, `sync.ts` push/pull(LWW·톰스톤·커서·`superseded`), 첫 로그인 병합, 공개 범위·slug API, `/t/:slug` OG 치환, 공유 보기·갤러리 실데이터, 처리방침 화면. 클라이언트 mock 스토어(`src/core/mock/*`)는 **전부 삭제**한다.
- **밖**: 실제 OAuth 앱 등록·도메인·Pi 설치(사용자 작업, D13·D14·D18 — 코드는 환경 변수로 받는다), Naver·Apple(D15), 폰트 런타임 캐시, VirtualKeyboard API, 네이티브 앱.
- **사용자 결정**: 00 §6 기본값. D14(회선 약관)·D18(보호책임자 이메일·도메인)은 `.env`의 `PUBLIC_ORIGIN`·`PRIVACY_CONTACT`로 비워 둔다(빈 값이면 화면에 "운영자 설정 필요" 표시).

## 1. 요구사항 → 담당 (완료 기준)

| # | 요구 | 담당 | 완료 기준 |
|---|---|---|---|
| S1 | 세션·OAuth(Google·Kakao·fake)·`/api/auth/*`·`/api/me*`·탈퇴 7일 유예·Kakao 웹훅 | SA | `server/account/account.check.ts` 가 fake 로그인 → `/api/me` 200 → 로그아웃 401, 탈퇴 → 재로그인 복구, CSRF·리밋 확인 |
| S2 | 관리자 API·`audit_log`·`settings`·점검 모드·신고·일일 작업·백업·배포 파일·런북 | SA | 같은 check 파일에서 admin 아닌 사용자 404, 정지·숨김·신고 처리·공지·점검 503, 일일 작업 purge |
| S3 | `/api/sync` push/pull·`/api/trees*`·공개 범위·slug·`/api/t/*`·`/t/:slug` OG·갤러리·`owner.ts` 함수 | SS | `server/sync/sync.check.ts` 가 conflicts.md C1~C20 중 서버 쪽 판정(LWW·톰스톤·id_taken·커서 만료·시계 깎기)과 공유 전이표(04 §3.3)를 assert |
| S4 | 클라이언트 계정·관리자 실연결(`me.ts`·로그인 버튼·계정·관리자·처리방침·MergeDialog 호출) | CA | mock 0, `fetch` 는 `api()` 경유만, 기존 화면 동작 유지 |
| S5 | 클라이언트 동기화·공유 실연결(Dexie v2·outbox·`sync.ts`·병합·공유 시트·공유 보기·갤러리·복제) | CS | mock 0, 두 브라우저 컨텍스트 동기화 E2E(오케스트레이터)가 통과할 수 있는 구조, 첫 화면 gzip 예산(01 §3.8: `sync.ts` 엔진은 동적 import) |
| S6 | 통합 E2E(가짜 로그인·두 기기 동기화·공유 링크 비로그인 학습·복제·관리자 숨김) | 오케스트레이터 | 기존 13 + 신규 통과 |

## 2. 가정

- A1 가짜 로그인: `AUTH_FAKE=1` 일 때만 `GET /api/auth/fake/start?as=user|admin&name=<닉네임>&return_to=` 가 `provider='fake'` 사용자를 만들고 세션을 준다. `as=admin` 은 role=admin. 프로덕션은 끈다(기동 로그에 표시).
- A2 OAuth 실제 왕복은 자격 증명이 없어 자동 검증하지 않는다. 대신 SA 가 토큰 교환·userinfo 호출부를 `fetch` 주입 가능한 함수로 만들어 check 에서 가짜 응답으로 검증한다.
- A3 백업은 `node:sqlite` `backup()` + 외부 `age`·`rclone` CLI 호출(있으면). 없으면 로컬 `data/backups/` 에 14개 보관만. 결과는 `data/backup.json`.
- A4 일일 작업은 `node server/account/daily.ts` CLI(systemd timer 가 호출) + 서버 기동 시 24시간 주기 in-process 실행 둘 다 허용하되 기본은 CLI(SA 판단, plan 에 기록).
- A5 이벤트(`events`)는 서버에 저장하지 않는다(D19). attempts 는 동기화 대상이지만 현재 클라이언트가 쓰지 않는다(00 §8) — 쓰기 시작은 범위 밖.
- A6 공유 보기 비로그인 학습 기록은 저장하지 않는다(D19). private 전환 시 slug 회수.

## 3. 공유 계약 (groundwork 커밋에 반영됨)

### 3.1 서버 골격 (오케스트레이터 소유 — 변경 요청은 `ask`)
- 실행: `node server/index.ts`(Node 24 type stripping, 빌드 없음). `npm run server`(`.env` 있으면 읽음), `npm run dev:server`(watch). dev 는 `npm run dev`(Vite :5173, `/api` → :3000 프록시) + `npm run dev:server`.
- `server/env.ts` `env.{port, host, origin, dataDir, distDir, adminsFile, google, kakao, authFake, privacyContact, secure}`. 새 변수가 필요하면 `ask`.
- `server/index.ts` 순서: 요청 로그 → `onError`(HttpError → 봉투) → `c.set('db')`·`c.set('user', null)` → `/api/*` **`sessionMiddleware`(SA)** → CSRF(Sec-Fetch-Site·Origin·JSON, `/api/auth/kakao/unlink-webhook` 제외) → **`maintenanceMiddleware`(SA)** → `/api/health` → **`registerAccount(app)`(SA)** → **`registerSync(app)`(SS)** → `/api/*` 404 → **`registerSharePages(app, shell)`(SS)** → 정적 `dist`(assets immutable) → SPA 폴백.
- `server/check.ts`: 메모리 DB 로 `createApp` 후 `app.request()` 로 검사. SA 는 `server/account/account.check.ts`, SS 는 `server/sync/sync.check.ts` 를 채운다(top-level await, assert). `npm run check` 에 포함됨.
- `tsconfig.server.json`(`npm run typecheck` 에 포함). 서버는 클라이언트 타입 `src/core/types.ts`·`src/core/api.ts` 를 `import type` 로 가져와도 된다.

### 3.2 DB (`server/db.ts`, 오케스트레이터 소유)
`openDb(file?)`(WAL·foreign_keys·busy_timeout, 마이그레이션 자동, pre-migrate 백업), `tx(db, fn)`(BEGIN IMMEDIATE), `DB` 타입. 마이그레이션 `server/migrations/NNN_*.sql`: **001_account.sql = SA 소유**(users·sessions·audit_log·settings·reports, `users.provider` 에 `'fake'` 허용, `use_provider_avatar` 포함), **002_trees.sql = SS 소유**(trees·nodes·srs·attempts·user_seq). 아직 배포 전이므로 각자 자기 파일을 **직접 고쳐도 된다**(새 파일 대신). 다른 사람 파일의 테이블이 필요하면 읽기만.

### 3.3 HTTP 헬퍼 (`server/http.ts`, 오케스트레이터 소유)
`AppEnv`(`c.get('user'): SessionUser|null`, `c.get('db')`), `SessionUser { id, role, nickname, sessionId }`, `HttpError`·`fail(status, code, message, field?)`(throw), `errorBody`, `requireUser`, `requireAdmin`(→ 404), `clientIp(c)`(CF-Connecting-IP, 저장·로그 금지), `hit(c, key, max, windowMs)`·`limit(name, max, windowMs)` 레이트 리밋, `body<T>(c, maxBytes)`, `now()`, `DAY`, `GRACE_MS`(7일).

### 3.4 클라이언트 API·로그인 상태 (CA 소유)
- `src/core/api.ts`: `api<T>(path, {method?, body?, signal?})` → 2xx JSON / 204 undefined / 그 외 `ApiError(status, code, message, field?, retryAfter?)`, 네트워크 실패 `ApiError(0,'offline')`. **모든 서버 호출은 이것만 쓴다**(SS 의 sync 포함). 응답 타입은 이 파일(03 §3.6·04 §3.6 snake_case 그대로).
- `src/core/me.ts`(현재 mock 재수출 → CA 가 실구현으로 교체, `mock/me.ts` 삭제): 반드시 유지할 이름 `useMe(): Me | null`(로딩 중도 null), `getMe(): Me | null`. 추가로 CA 가 정하는 것: `refreshMe()`, `logout()`, `loginUrl(provider, returnTo)`, 닉네임·아바타·세션·탈퇴 함수. **로그인 확인(/api/me 200, 새 사용자 id) 때 1회 `import('./sync').then(s => s.onLogin(user.id))`, 로그아웃 때 `s.onLogout()`** — 동적 import 로 동기화 엔진을 첫 화면 청크에서 뺀다.
- `GET /api/auth/providers` → `{ google: boolean, kakao: boolean, fake: boolean, privacy_contact: string }`(SA). 로그인 화면은 켜진 제공자만 활성, `fake` 면 "개발용 로그인(사용자/관리자)" 버튼.
- 로그인 버튼 = `location.href = /api/auth/:provider/start?return_to=<#/…>`(같은 창, 03 §3.2 standalone 규칙).

### 3.5 클라이언트 동기화 (CS 소유)
- `src/core/sync.ts`(현재 mock 재수출 → CS 실구현, `mock/sync.ts`·`mock/shared.ts` 삭제): 유지할 이름 `useSyncState(): SyncState`(타입 그대로 `saved|syncing|offline{pending}|error{reason,pending}`), `retrySync()`. 추가 계약: `onLogin(userId): Promise<MergePlan>`, `applyMerge(choice: 'upload' | 'wipe_other' | 'copy_other'): Promise<void>`, `onLogout(): void`, `MergePlan = { local: number; server: number; otherAccount: string | null }`(03 §3.3·04 §3.8 M1~M3). CA 의 `NavUser`/`MergeDialog` 가 `onLogin` 결과로 대화를 띄우고 `applyMerge` 를 부른다(L=0·S=0 이면 대화 없음, 무음).
- 첫 화면 예산: `useSyncState`·`retrySync` 는 작은 상태 모듈에 두고, push/pull 엔진은 `onLogin` 이후 동적 import 되는 별도 파일로(01 §3.8·DS §3.9 요청).
- `src/core/db.ts` Dexie v2(`outbox`·`meta`, `trees` 인덱스 `slug`), `src/core/repo.ts` 쓰기 함수에 outbox 기록(04 §3.1 "쓰기 훅" 표), `src/core/srs/index.ts` 는 `recordGrade` 의 outbox 기록 **한 군데만** 고친다(스케줄링 로직 수정 금지).
- 공유: `getSharedTree` → `api<SharedTree>('/api/t/:slug')`, 갤러리 → `/api/gallery`, 복제 → 로컬 `copyTree` + `POST /api/t/:slug/copy`, 공개 범위 → `PUT /api/trees/:id/visibility`·`POST /api/trees/:id/slug`(먼저 push 를 끝낸 뒤). 응답 모양은 04 §3.6 표 그대로. `SharedTree`(api.ts)와 다르면 **CS 가 SS 와 맞춰 api.ts 수정을 CA 에게 요청하지 말고 오케스트레이터에게 `ask`**.

### 3.6 SA ↔ SS 서버 경계
- SS 가 구현하고 SA 가 호출: `server/sync/owner.ts` 의 함수(시그니처 고정): `softDeleteTreesOfUser` `restoreTreesOfUser(db, ownerId, since)` `purgeUser` `purgeTombstones(db, cutoff)` `restoreTree` `treeIdBySlug` `treeCountOf` `treeStats` `listTreesForAdmin` `setHidden` `treesOfUser`.
- 경로 소유: SA = `/api/auth/*` `/api/me*` `/api/admin/*` `POST /api/t/:slug/report`. SS = `/api/sync` `/api/trees*` `GET /api/t/:slug` `POST /api/t/:slug/copy` `/api/gallery` `GET /t/:slug`. `registerAccount` 가 `registerSync` 보다 먼저 등록되므로 `/api/t/:slug/report` 는 SA 라우트가 먼저 잡는다.
- 숨김·삭제·탈퇴 유예 트리의 `/api/t/:slug` 응답: 403 `hidden` / 410 `deleted`(소유자 `users.deleted_at` 있으면 410) / 404 — 응답 시간 동일.

## 4. 작업 분할 (1차 병렬 4명)

| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 포트 |
|---|---|---|---|---|
| **SA** 서버 계정·관리자 | S1 S2 | `server/account/**`, `server/migrations/001_account.sql`, `config/**`, `deploy/**`, `docs/ops/**`, `docs/plans/agent_SA_server.md` | `server/*.ts`(골격), `server/sync/owner.ts`(시그니처), `src/core/api.ts` | 3011 |
| **SS** 서버 동기화·공유 | S3 | `server/sync/**`, `server/migrations/002_trees.sql`, `docs/plans/agent_SS_server.md` | 골격, `server/account/**`(세션 모양만) | 3012 |
| **CA** 클라이언트 계정·관리자 | S4 | `src/core/api.ts`, `src/core/me.ts`, `src/core/mock/me.ts`·`mock/admin.ts`(삭제), `src/core/inapp.ts`, `src/features/account/**`, `src/features/admin/**`, `docs/plans/agent_CA_client.md` | `src/core/sync.ts`(계약 이름), `server/**` | 5181(+서버 3021) |
| **CS** 클라이언트 동기화·공유 | S5 | `src/core/db.ts`, `src/core/repo.ts`, `src/core/sync.ts`(+ 새 `src/core/sync/**` 허용), `src/core/mock/sync.ts`·`mock/shared.ts`(삭제), `src/core/srs/index.ts`(recordGrade 1곳), `src/features/share/**`, `docs/plans/agent_CS_client.md` | `src/core/api.ts`, `src/core/me.ts`, `server/**` | 5182(+서버 3022) |

수정 금지(오케스트레이터 소유): `server/index.ts` `server/db.ts` `server/http.ts` `server/env.ts` `server/check.ts` `src/App.tsx` `src/router.ts` `src/core/types.ts` `src/core/source.ts` `package.json` `vite.config.ts` `playwright.config.ts` `e2e/**` `tsconfig*.json`. UI-First 1단계 소유자(DS·LM·LS)의 파일(`src/ui/**` `src/index.css` `src/features/{editor,flash,dnd}/**` `Toast.tsx` `TreeHeader.tsx`)도 수정 금지 — 필요하면 `ask`.
클라이언트 워커는 서버가 아직 스텁이어도 계약(03 §3.6·04 §3.6 표)대로 호출을 짜고, 자기 워크트리에서 `server/` 스텁에 대해 개발할 땐 응답을 기다리지 말고 타입으로만 맞춘다. 통합은 오케스트레이터가 한다.

## 5. 머지 순서와 통합 검증

1. SA → SS → CA → CS. 머지마다 `typecheck·lint·check·build`.
2. 오케스트레이터 E2E(`playwright.config.ts` 가 `node server/index.ts` 를 `AUTH_FAKE=1`·새 DB 로 띄움): 기존 13 + 신규 — ① 가짜 로그인 → 트리 생성 → 두 번째 컨텍스트 같은 사용자 로그인 → pull 로 트리 보임 ② 비로그인 로컬 트리 2개 → 로그인 → 병합 대화 → 저장 → 다른 컨텍스트에 보임 ③ 공유 시트 링크 → 비로그인 컨텍스트 `/t/<slug>` 보기·플래시 → 복제 → 목록에 생김 ④ 관리자 로그인 → 공개 트리 숨김 → `/t/<slug>` 403 화면 ⑤ 탈퇴 2단계 → 재로그인 복구.
3. UI-First QA(진행 중, `06_ui_qa.md`) 결과는 이 단계 머지 뒤 소유자에게 수정 지시.

## 6. 결과

(통합 후 기록)

## 진행 기록

- groundwork: `hono`·`@hono/node-server` 추가, `server/{env,db,http,index,check}.ts`, 마이그레이션 001·002(스펙 DDL), `server/account/index.ts`·`server/sync/{index,owner}.ts` 스텁, `tsconfig.server.json`, `.env.example`, `config/admins.json.example`, `src/core/api.ts` `api()`·`ApiError`, `src/core/me.ts`·`src/core/sync.ts`(mock 재수출, 화면 import 경로 이전), `#/privacy` 라우트·스텁, Vite `/api` 프록시, Playwright 가 Node 서버로 실행. typecheck(클라+서버)·lint·check(server.check ok)·build 통과, 기존 E2E 13/13(Node 서버 위).
- 1차 dispatch(시작 8947541): SA ctx_67cdc9bf76d1(agent-SA-server) · SS ctx_1d63a85a511c(agent-SS-server) · CA ctx_70729b1dadfa(agent-CA-client) · CS ctx_3807f182f266(agent-CS-client). 지시 원문 scratch `specs/spec_srv_*.txt`.
- 오케스트레이터: `public/og.png`(1200×630, Pretendard OFL, 중앙 안전 영역) 추가 — SS 의 `og:image` 경로.
- 결정(CS 질문): `GET /api/t/:slug` = api.ts `SharedTree` 평평한 모양 + `id` 추가(SS 응답·CA 타입·CS sourceTreeId). 원격 반영 이벤트 `dd:remote{treeIds}` → EditorPage·TreeListPage 구독은 머지 후 오케스트레이터. 401 → `refreshMe()` 동적 호출. M4(커서 만료 뒤 이 기기에만 있는 트리)는 '올리기' 자동 + 토스트.
- CA 에게 mock/sync.ts·mock/shared.ts 1줄 임시 수정 허용(CS 가 삭제 → 머지 때 삭제 쪽 채택).
- **SS 완료 → 머지 bd948d5**(sync/trees/share/gallery/OG, owner.ts 11함수, sync.check C1~3·C6~11·C13~15·C17·C18·전이표 11행). 변경: 커서 만료 = `since < user_seq.purged_seq`(정확 판정), og:image 절대 URL, 소유자·관리자는 /api/t hidden 통과. CS 에 push.seq 로 커서를 올리지 말 것 전달.
- UI QA 3차: LM(#16 + `dd:remote` 구독) → 머지 88b495b, DS(#5 #6 #7 #11 #12 #15 #24 + 테마 칸) → 머지 b645e2a. typecheck·lint·check 통과.
- **CA 완료 → 머지 4d37d56**(me.ts 실구현·로그인·계정·관리자·처리방침, mock/me·admin 삭제, QA #8 #17 #18 #20 #22). SA·CS 에 CA 요청 전달.
- **SA 완료 → 머지(2e6281b)**: 세션·OAuth(PKCE+fake)·/api/me*·관리자 API·신고·점검·일일 작업·백업·systemd·runbook, account.check ≈120 assert. 변경: auth 리밋은 start·callback·logout·webhook 만, 점검 면제는 GET /api/me 만, 관리자 trees `?deleted=1`·reports `?status=`, 숨김 처리 시 그 트리의 열린 신고 전부 종결. `.env.example` 에 BACKUP_* 추가. SA 후속(use_provider_avatar) 진행 중 ctx_94a051615a1a.
- 실서버 스모크(가짜 로그인 → /api/me → push → pull → 공개 범위 unlisted slug 발급) 통과. E2E 13/13.
