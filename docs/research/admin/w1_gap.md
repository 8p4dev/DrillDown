# W1 — 관리자 페이지(#/admin) 현황·격차 분석

작성 2026-11-14 · 대상 `C:\drilldown\app` (브랜치 main, 저장소 미수정). 조사 방식: 스펙 `docs/specs/03_account_admin.md` §3.4·§3.6 과 구현(`src/features/admin/AdminPage.tsx`·`admin.css`, `server/account/admin.ts`·`daily.ts`·`backup.ts`, `src/router.ts`, `src/core/api.ts`, `server/http.ts`, `server/account/index.ts`·`session.ts`·`oauth.ts`, `server/sync/owner.ts`, `src/features/account/Banners.tsx`) 대조 + `AUTH_FAKE=1` 서버를 포트 4291 에 띄워(`DATA_DIR` 은 스크래치) Playwright(Edge) 로 1440×900 / 390×844 실제 조작. 스크린샷·로그: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\f5e865a0-53ee-46a0-b1fb-467c517fd325\scratchpad\w1\` (`shots/*.png`, `notes.txt`, `notes2.txt`, `probe*.mjs`).

표기: `파일:줄` = 코드에서 확인한 사실. **[가정]** = 추측. **[실측]** = 4291 서버에서 눌러 본 결과. 상태 = 있음 / 부분 / 없음. 우선순위 = 높·중·낮. 공수 = S(≤반나절)·M(1~2일)·L(3일+).

## 0. 핵심 요약 (5줄)

1. 스펙 §3.4 의 4화면·API·audit_log·권한 404·관리자 24h 세션·admins.json 동기화는 **거의 전부 구현돼 있다**. 빠진 것은 "사용자 상세(세션 수·트리 목록)" UI, 공개 트리 `?visibility=` 필터, 대시보드의 백업/일일 작업 **오류 문자열** 정도다.
2. **치명 버그 1건 [실측]**: 에디터 CSS 의 전역 `.search { position:absolute; top:.75rem }`(`src/features/editor/editor.css:280`) 이 관리자 검색·공지 입력칸(`AdminPage.tsx:122`, `:272`)에 그대로 적용돼 PC 에서는 입력칸이 상단 바 뒤로 숨고(보이지 않음), 모바일에서는 제목·탭 위를 덮는다. 에디터 청크는 유휴 시간에 프리로드되므로 사실상 항상 발생.
3. **진입 경로 없음 [실측]**: 상단 바·계정 화면 어디에도 `#/admin` 링크가 없다(`NavUser.tsx`·`AccountPage.tsx` 에 `href.admin` 0건). 관리자는 주소를 직접 쳐야 한다.
4. 파괴 동작 UX 결함: 삭제의 "즉시" 체크박스를 누르면 2단계 버튼이 풀린다(`TwoStep.tsx:44-47` + `AdminPage.tsx:168` 에 `pauseWhileFocused` 없음), Esc 로 해제해도 사유 입력칸이 남는다, 점검 모드 토글은 확인·토스트 없이 즉시 전 사용자 503.
5. 점검 모드의 비로그인 경험이 깨진다: `Banners.tsx:14` 가 `me` 없으면 아무것도 안 그리고, 공유 보기는 503 을 "링크를 찾을 수 없습니다"로 보여 준다(`SharedPage.tsx:110` FAIL 맵에 503 없음). e2e 는 관리자 숨김 1시나리오뿐(`e2e/server.spec.ts:103-116`); 서버 API 는 `account.check.ts:136-196` 이 폭넓게 덮는다.

## 1. 현재 구현 개요

| 항목 | 위치 | 비고 |
|---|---|---|
| 라우트 | `src/router.ts:6,18,32,68` | `#/admin`(대시보드) `#/admin/users|trees|system`. 모르는 탭 → 대시보드로 조용히 |
| 청크 | `src/App.tsx:25,33,101,127` | lazy, 관리자 로그인 시 프리로드. precache 제외 `vite.config.ts` globIgnores |
| 화면 | `AdminPage.tsx` 300줄 | 탭 4개, `useGet`/`usePaged`(cursor "더 보기"), 404 → `#/` 리디렉트(`:24-27`), 비관리자 `return null`(`:55-56`) |
| 스타일 | `admin.css` 72줄 | PC sticky th(861+ `:43`), ≤760 표→카드(`:57-72`), 숫자 카드 4/3/2열 |
| 서버 | `server/account/admin.ts` | `requireAdmin`(404) + 120/분(`:126`), stats/users/trees/reports/settings/audit |
| 점검 모드 | `server/account/index.ts:11-19` | 관리자·`/api/me`·`/api/auth/*`·`/api/health` 면제, 503 + Retry-After 300 |
| 배너 | `src/features/account/Banners.tsx` | 공지(세션 동안 닫기) + 점검 배너, `me` 있을 때만 |
| 세션 | `server/account/session.ts:12,33,49` | 관리자 절대 상한 24h |
| 역할 | `server/account/oauth.ts:48-55,72,80` | `config/admins.json` 매 로그인 동기화. 파일 없음/깨짐 → 전원 user(조용히) |
| 일일 작업·백업 | `daily.ts`, `backup.ts` | `data/daily.json`·`data/backup.json` 으로 결과 전달, 대시보드가 읽음(`admin.ts:41,82-83`) |

## 2. 스펙 §3.4 화면 표 대조

### 2.1 대시보드

| 요소 | 왜 필요한가 | 데이터 출처 / 구현 단서 | 상태 | 우선순위 | 공수 |
|---|---|---|---|---|---|
| 가입자 총·오늘·7일 | 성장 확인 | `admin.ts:72-74`, `AdminPage.tsx:90` | 있음 | — | — |
| 가입 추이 14일 막대 | 추세 | `admin.ts:52-63`(로컬 자정), `AdminPage.tsx:99-107` | 있음(부분) | 낮 | S |
| 활성 7일·30일 | 리텐션 | `admin.ts:75-76`, `:91` | 있음 | — | — |
| 트리 수·공개 수(+숨김) | 콘텐츠 규모 | `owner.ts:71-79 treeStats`, `:92` | 있음 | — | — |
| 마지막 백업 시각·크기·성공 | 복구 가능성 확인 | `backup.ts:42` → `admin.ts:82`, `:94` | 부분 | 중 | S |
| 마지막 일일 작업 결과 | purge/정리 정상 여부 | `daily.ts:41` → `admin.ts:83`, `:95` | 부분 | 중 | S |
| 디스크 사용률 | Pi SD 카드 고갈 경고 | `admin.ts:69 statfsSync(env.dataDir)`, `:93` | 있음 | — | — |
| 서버 가동·메모리 | 재시작 여부 | `admin.ts:85-86`, `:96` | 있음 | — | — |
| 정지·탈퇴 대기 수 | (스펙 외 추가) | `admin.ts:77-78`, `:97` | 있음 | — | — |
| 로딩·오류 상태 | 빈 화면 방지 | `:84 if (!s) return null`, 오류는 `guard` 토스트만 `:26` | 없음 | 중 | S |

근거 메모
- 백업 카드는 `ok` 점과 바이트만 보여 준다. `AdminStats.backup.error?`(`api.ts:116`)가 타입에 있는데 UI 가 안 쓴다. 외부 업로드 여부 `uploaded`(`backup.ts:14`)는 `AdminStats` 타입에 아예 없어 전달되지 않는다. 일일 작업은 `purged_users`·`error` 를 안 보여 준다(`:95`).
- **[실측]** 상태 파일이 없는 신규 설치/개발 환경에서 백업·일일 작업 카드가 `—` + 빨간 점 + `0.0 MB` 로 나온다(`shots/pc-dashboard.png`). "아직 한 번도 안 돌았다"와 "실패했다"가 구분되지 않는다(`admin.ts:82-83` 기본값 `ok:false, error:'none'`).
- 14일 막대는 날짜 축 라벨이 없고 툴팁(`data-tip`)·`aria-label` 만 있다. 모바일에서 막대 14개가 20×3px 짜리 `tabIndex=0` 포커스 표적이다 **[실측]** (<44px 표적 13개). 스펙상 디스크는 `statfs('/')` 인데 구현은 `dataDir` 기준 — 같은 파티션이면 동일 **[가정]**.
- **[실측]** `/api/admin/stats` 가 500 이면 탭 머리만 남고 "실패했어요" 토스트. 재시도 버튼 없음(`shots/pc-dashboard-loading.png` 는 지연 중 빈 화면).

### 2.2 사용자

| 요소 | 왜 필요한가 | 데이터 출처 / 구현 단서 | 상태 | 우선순위 | 공수 |
|---|---|---|---|---|---|
| 검색(닉네임 부분일치·UUID·provider:sub) | 사용자 특정 | `admin.ts:137-140`, 300ms 디바운스 `AdminPage.tsx:117`, 40자 `:123` | 있음 | — | — |
| 보기: 가입·마지막 접속·트리 수·상태 | 현황 파악 | `:152-157`, `USER_COLS admin.ts:43` | 있음 | — | — |
| 보기: **세션 수** | 활동 기기 파악 | 서버 `GET /api/admin/users/:id` `admin.ts:150-155` 가 `sessions`·`trees` 반환. **UI 호출 0** (`AdminUserDetail` 타입 `api.ts:136-139` 미사용) | 없음(UI) | 중 | M |
| 정지/해제 (+사유 ≤200) | 악성 사용자 차단 | `:159-165`, 서버 `:157-169`(정지 시 세션 삭제 `:165`) | 있음 | — | — |
| 삭제(7일 유예) / 즉시 purge | 탈퇴 대행·법적 요청 | `:160,167-168`, 서버 `:171-182`, `purgeUserNow :97-100` | 있음(버그, §6 B3) | 높 | S |
| 자기 자신 정지·삭제 불가 | 잠금 사고 방지 | 클라 `disabled={self}` `:164,168`, 서버 403 `:162,175` | 있음 | — | — |
| 2단계 확인 | 오조작 방지 | `TwoStep` + `pauseWhileFocused={reason}` `:164` **[실측]** 사유 입력 중 3.5초 지나도 armed 유지 | 있음 | — | — |
| 페이지네이션 | 50명 초과 | cursor `created_at_id` `admin.ts:141-147`, "더 보기" `:47,132` | 있음 | — | — |
| 빈 상태 | — | `:131 "결과 없음"` **[실측]** | 있음 | — | — |
| 로딩 상태 | — | 없음(표 헤더만) | 없음 | 낮 | S |
| 정렬·상태 필터(정지만·탈퇴 대기만)·날짜 범위 | 운영 중 "정지자만 보기" | 서버 `ORDER BY created_at DESC` 고정 `admin.ts:143`, 필터 파라미터 없음 | 없음 | 낮 | M |
| UUID 표시/복사 | 지원 요청 대응·감사 로그 대조(끝 6자만 보임) | `AdminUser.id` 는 응답에 있음, UI 미표시 | 없음 | 중 | S |
| 사용자 상세(트리 목록·세션 폐기·탈퇴 취소) | 지원 대응 | 상세 API 있음(위). 탈퇴 취소는 사용자 재로그인만(`oauth.ts:80-82`), 관리자 경로 없음 | 없음 | 중 | M |
| 다른 관리자 정지 차단 | 관리자 2인 상호 잠금 방지 | 서버에 역할 검사 없음 `admin.ts:157-169` **[실측]** 타 관리자 정지 200 | 없음 | 낮 **[가정]** | S |

근거 메모
- 행마다 `treeCountOf` 1쿼리(`admin.ts:44,146`) = 50행 50쿼리. SQLite 로컬이라 **[실측]** 1ms, 문제 아님.
- 정지는 세션 삭제를 겸하므로 "정지 없이 전 기기 로그아웃" 은 없다. 운영 규모상 필요성 낮음 **[가정]**.

### 2.3 공개 트리

| 요소 | 왜 필요한가 | 데이터 출처 / 구현 단서 | 상태 | 우선순위 | 공수 |
|---|---|---|---|---|---|
| 목록(제목·소유자·노드 수·갱신·신고 수) | 콘텐츠 감시 | `owner.ts:81-98 listTreesForAdmin`, `open_reports admin.ts:192-193`, `AdminPage.tsx:194` | 있음 | — | — |
| 숨김/해제(+사유) | 정책 위반 대응 | `:240-245`, 서버 `:196-207`, `setHidden owner.ts:99-105`(seq 올려 동기화 전파) | 있음 | — | — |
| 신고 처리(사유 보기 → 숨김/기각) | 신고 큐 | `:198-209`, 서버 `:233-253` | 부분 | 높 | M |
| 신고된 트리 **미리보기 링크** | 심사 근거 | `AdminTree`·`Report` 에 `slug` 없음(`api.ts:141-162`), 테이블엔 `trees.slug` 있음(`002_trees.sql:7`) **[실측]** `/t/` 링크 0 | 없음 | 높 | S |
| 신고 시각·신고자 유무·누적 수 | 우선순위 판단 | `Report.created_at` 응답에 있음, UI 미표시 `:203` | 없음 | 중 | S |
| 처리된 신고 이력 | 재신고 판단 | 서버 `?status=resolved|all` `admin.ts:227-228` **[실측]** 동작. UI 미호출 | 없음(UI) | 낮 | S |
| 삭제 트리 복구(7일) | 사용자 요청 대응 | `:210-220`, 서버 `:209-219`, `restoreTree owner.ts:51-60`(7일 지나면 410) | 있음(버그, §6 B7) | 중 | S |
| `?visibility=` 필터 | 스펙 §3.6 파라미터 | 서버 무시 `admin.ts:184-194` **[실측]** `?visibility=private` 도 공개 목록 | 없음 | 낮 | S |
| 빈 상태·로딩 | 공개 트리 0건일 때 표 헤더만 | `:193-196` 에 빈 안내 없음(신고·삭제 목록엔 있음 `:199,211`) | 부분 | 낮 | S |
| 숨김 시각·사유 표시 | 언제 왜 숨겼는지 | `hidden_by_admin_at` 응답에 있으나 아이콘만 `:234` | 부분 | 낮 | S |
| 삭제 유예 트리 100개 상한·커서 없음 | — | `admin.ts:190-191` ponytail 주석, `?deleted=1` 별도 페이지 가능 | 부분 | 낮 | S |

근거 메모
- 신고→숨김 시 서버는 **같은 트리의 열린 신고를 모두** resolve 한다(`admin.ts:244`). 클라이언트는 누른 신고 1건만 목록에서 지운다(`:185`) → 같은 트리의 나머지 신고가 화면에 남고, 다시 누르면 서버는 200 + 감사 로그 `tree.hide` 중복 기록 **[코드 추론, 미실측]**.
- 신고 숨김/기각 버튼은 1탭(2단계 아님). 숨김은 되돌릴 수 있지만 **기각은 취소 경로가 없다**.

### 2.4 시스템

| 요소 | 왜 필요한가 | 데이터 출처 / 구현 단서 | 상태 | 우선순위 | 공수 |
|---|---|---|---|---|---|
| 공지 1줄(켜기/끄기, ≤80자) | 사용자 안내 | `:271-277`, 서버 `:256-279` **[실측]** 81자 400 | 있음 | — | — |
| 점검 모드 ON → `/api/*` 503 (관리자 제외) | 백업·마이그레이션 시간 확보 | `index.ts:11-19` **[실측]** 일반 사용자 `/api/trees` 503 + Retry-After 300, 관리자 통과 | 있음 | — | — |
| 점검 모드 → 로그인 사용자 배너 | 왜 저장이 안 되는지 알림 | `Banners.tsx:18-20`, `me.ts:165`(503 훅) **[실측]** 503 맞는 즉시 배너 | 부분 | 중 | S |
| 점검 모드 → **비로그인** 배너·공유 보기 문구 | 공유 링크 방문자가 "삭제됐다"고 오해 | `Banners.tsx:14 if (!me) return null`; `SharedPage.tsx:110` 503 → 404 문구 **[실측]** "링크를 찾을 수 없습니다", 갤러리 "불러오지 못했습니다" | 없음 | 중 | S |
| 점검 모드 토글 확인·피드백 | 오클릭 시 전 사용자 503 | `:279` `save()` 에 메시지 없음, 2단계 없음 **[실측]** 토스트 없음 | 없음 | 중 | S |
| 최근 감사 로그 50건 + 더 보기 | 책임 추적 | `:282-296`, 서버 `:281-288`(id 커서) **[실측]** 2페이지 연속 | 있음 | — | — |
| 감사 로그 **행위자(actor)** 표시 | 관리자 2인 중 누가 했는지 | `AuditRow.actor_id` 응답에 있음(`api.ts:172`), UI 열 없음(`:284`) | 없음 | 중 | S |
| 감사 로그 가독성 | — | 동작이 영문 raw(`:289`), 대상 `target_id.slice(-6)` → `settings enance`(`:290`), 메모 JSON 60자 잘림(`:291`) | 부분 | 낮 | S |
| 감사 로그 필터(동작·대상·기간) | 특정 사용자 이력 | 인덱스는 있음(`001_account.sql:35-36`), API 파라미터 없음 | 없음 | 낮 | M |
| 공지 변경의 사용자 측 반영 | — | `/api/me` 재확인(포커스 60초, `me.ts:171-174`) 때만. 해제도 같음 **[실측]** 공지 끄고 1.5초 뒤에도 배너 유지 | 부분 | 낮 | — |

근거 메모
- 점검 중 `PATCH /api/me` 가 경로 일치로 면제된다(`index.ts:13` 는 메서드 무관) **[실측]** 200. 비관리자의 `/api/admin/*` 는 점검 중 404 대신 503(미들웨어 순서 `index.ts:52` → `admin.ts:126`) **[실측]**. 둘 다 낮음.
- 점검 배너는 `me.maintenance` 가 true 가 되면 켜지고, 관리자가 꺼도 다음 `/api/me` 까지 남는다(`me.ts:165` 는 켜기만).

## 3. 권한 매트릭스 대조 (§3.4)

| 행동 | 스펙 | 구현 | 상태 |
|---|---|---|---|
| 대시보드·사용자 검색 비관리자 → 404 | 404 | `http.ts:41-44` **[실측]** user·anon 404 (점검 중엔 503) | 있음 |
| `#/admin` 화면 비관리자 | 숨기지 않음, 데이터만 404 | `AdminPage.tsx:55` `#/` 로 리디렉트 **[실측]** user·anon 모두 `#/` | 있음 |
| 자기 자신 정지 불가 | ✅ | 서버 403 `admin.ts:162`, 삭제도 403 `:175`, 클라 disabled | 있음 |
| 타인 닉네임·아바타 변경 불가 | ❌ | 경로 없음 | 있음 |
| 세션 목록·폐기 자기 것만 | ✅(자기 것) | `/api/me/sessions*` 만, 관리자용 없음 | 있음(스펙대로) |
| 역할 변경 경로 없음 | 설정 파일만 | `oauth.ts:72,80` 매 로그인 동기화. API 없음 | 있음 |
| 삭제 트리 복구(admin, audit) | ✅ | `admin.ts:209-219` `tree.restore` | 있음 |
| 공지·점검·감사 로그 admin 만 | ✅ | `app.use('/api/admin/*', requireAdmin)` `:126` | 있음 |
| 관리자가 다른 관리자 정지 | (미정) | 가능 **[실측]** 200 | **[가정]** 차단 권장 |

## 4. audit_log 대조

| 항목 | 스펙 | 구현 | 상태 |
|---|---|---|---|
| 스키마·인덱스 | §3.4 DDL | `server/migrations/001_account.sql:26-36` 동일 | 있음 |
| action 목록 | user.suspend/unsuspend/delete/purge, tree.hide/unhide, report.dismiss, settings.notice/maintenance, user.delete_requested, admin.login | 전부 기록(`admin.ts:166,179,203,215,246,249,275`, `me.ts:112`, `oauth.ts:85`) + 추가 `tree.restore`(`admin.ts:215`), `user.restore`(`oauth.ts:82`), 웹훅 `via:'kakao_unlink'`(`me.ts:48-49`) | 있음 |
| 시스템 작업 actor NULL | ✅ | `daily.ts:21 audit(db, null, …)` | 있음 |
| meta 에 개인정보·IP 금지 | ✅ | IP 없음. 단 `reason` 자유 텍스트가 meta 로 저장(`admin.ts:166,203`) → 운영자가 개인정보를 적으면 1년 보관 **[가정: 운영 지침 필요]** | 부분 |
| 1년 보관 후 삭제 | ✅ | `daily.ts:31` | 있음 |
| UI 열람 50건·커서 | ✅ | `AdminPage.tsx:255,282-296` | 있음(actor 미표시) |

## 5. 관리자 인증 대조

| 항목 | 스펙 | 구현 | 상태 |
|---|---|---|---|
| `config/admins.json` + 매 로그인 동기화 | ✅ | `oauth.ts:48-55,72,80`, `env.ts:16`, 운영 `/etc/drilldown/admins.json`(`deploy/drilldown-server.service:14`) | 있음 |
| 파일 없음/파싱 실패 처리 | — | 조용히 전원 `user`(`oauth.ts:52-54`). 로그 없음 → 운영자가 왜 강등됐는지 모름. 저장소에 `config/admins.json` 없음(`ls` 확인) | 부분 (낮, S: 시작 시 경고 로그) |
| Cloudflare Access `/api/admin/*` | ✅ | 문서만 `deploy/cloudflared.md:31-42`, JWT 검증 생략(스펙대로) | 있음(문서) |
| 관리자 세션 24h 상한 | ✅ | `session.ts:12,33,49`(요청 때 검사·삭제) | 있음 |
| `admin.login` 감사 | ✅ | `oauth.ts:85` | 있음 |
| AUTH_FAKE `?as=admin` | 개발 전용 | `oauth.ts:102-106`, `env.ts:20`; 로그인 화면 "관리자" 버튼 `LoginPage.tsx:47` | 있음(운영 금지 문서화 `CODEBASE.md:872`) |

## 6. 실제 화면 테스트에서 찾은 UX 결함·버그 [실측]

| # | 심각도 | 증상 | 원인(코드) | 수정 힌트 | 공수 |
|---|---|---|---|---|---|
| B1 | **높** | PC: 사용자 검색칸·공지 입력칸이 **화면에 없다**(상단 바 뒤 (35,12) 위치, `shots/pc-system-viewport.png` 에 "켜기 게시"만 남음). 모바일: 입력칸이 "관리자" 제목·탭 위를 덮음(`shots/m-users-viewport.png`) | `editor.css:280 .search { position:absolute; left:.75rem; top:.75rem; z-index:4 }` 가 전역 클래스. 관리자가 같은 이름 사용(`AdminPage.tsx:122,272`, `admin.css:27`). 에디터 청크는 유휴 프리로드(`App.tsx:12` 주석)라 거의 항상 로드됨. computed `position: absolute, top 11.25px` 확인 | 관리자 쪽 클래스명 변경(`admin-search`) 또는 `.editor .search` 로 범위 한정 | S |
| B2 | **높** | 관리자 페이지로 가는 링크가 UI 에 없다 (`#/`·`#/account` 에서 `a[href^="#/admin"]` 0개) | `NavUser.tsx`·`AccountPage.tsx` 에 `href.admin` 없음 | `me.user.role==='admin'` 일 때 계정 메뉴/상단 바에 "관리" 링크 | S |
| B3 | 중 | 삭제 "즉시" 체크박스를 누르면 2단계 버튼이 풀림(armed 1→0). 즉시 purge 하려면 삭제→체크→삭제→정말 삭제 4탭. 체크박스는 한 번 뜨면 계속 남고 체크 상태도 행에 유지됨(`shots/pc-users-delete-arming.png` erin 행) | `TwoStep.tsx:44-47` onBlur 에서 `relatedTarget` 이 `pauseWhileFocused` 밖이면 해제; `AdminPage.tsx:168` 삭제 TwoStep 에 `pauseWhileFocused` 없음, `arming` 은 confirm 때만 null(`:141,146`) | 체크박스를 `pauseWhileFocused` 범위에 넣거나 체크박스를 항상 노출 | S |
| B4 | 중 | Esc 로 정지 해제해도 사유 입력칸이 남음 | `arming` 리셋이 `take()`/confirm 에만(`:141`); TwoStep 의 Esc 는 내부 상태만 바꿈(`TwoStep.tsx:23`) | TwoStep 에 `onDisarm` 콜백 추가 | S |
| B5 | 중 | 점검 모드 체크박스 = 즉시 저장, 확인·토스트 없음. 전 사용자 503 이 한 클릭 | `:278-281` | 2단계 버튼 또는 토스트 + 되돌리기 | S |
| B6 | 중 | 점검 중 비로그인 공유 보기 "링크를 찾을 수 없습니다", 갤러리 "불러오지 못했습니다", 배너 없음(`shots/anon-shared-maint.png`) | `Banners.tsx:14`, `SharedPage.tsx:110` FAIL 맵에 503 없음 | 503 전용 문구 + `me` 없어도 점검 배너 | S |
| B7 | 중 | 비공개 트리(dave "형법 총론")를 복구하면 **공개 트리 표**에 나타남 | `:190 put({...r.tree, deleted_at:null})` → `live` 필터(`:179`)는 `deleted_at` 만 봄; 삭제 유예 목록은 visibility 무관(`owner.ts:83`) | 복구 뒤 목록에서 제거하거나 visibility 로 거름 | S |
| B8 | 중 | 신고 심사 정보 부족: 트리 보기 링크 없음, 신고 시각 없음, 같은 트리 중복 신고 각각 행 | §2.3 | slug·created_at 응답 추가, 트리별 묶음 | S~M |
| B9 | 낮 | 신규 설치 대시보드가 백업·일일 작업 "실패"처럼 보임(빨간 점·`—`·0.0 MB) | `admin.ts:82-83` 기본값, `:94-95` | "아직 없음" 상태 분기 + `error` 문자열 표시 | S |
| B10 | 낮 | 감사 로그 "대상" 열 `settings enance`, 메모 JSON 잘림, 동작 영문 raw, 행위자 없음 | `:289-291` | 한글 라벨 맵, target_id 전체 툴팁, actor 닉네임 조인 | S |
| B11 | 낮 | 로딩 시 빈 화면(대시보드·시스템), 오류 시 토스트만·재시도 없음 | `:84,256`, `:26` | `aria-busy` 플레이스홀더 + 재시도 버튼 | S |
| B12 | 낮 | 14일 막대 날짜 축 없음; 모바일 막대 20×3px `tabIndex=0` 13개 | `:104`, `admin.css:22-24` | 양끝 날짜 라벨, 막대는 `aria-hidden` + 표 대체 텍스트 | S |
| B13 | 낮 | 자기 행의 정지·삭제가 회색인 이유 안내 없음 | `:164,168` | `data-tip="본인 계정"` | S |
| B14 | 낮 | `#/admin/아무거나` → 대시보드로 조용히 | `router.ts:32` | 그대로 둬도 됨 | — |
| B15 | 낮 | "로그인하면 저장돼요" 힌트가 로그인된 관리자에게도 뜸(모든 스크린샷) | `NavUser.tsx:23` `me` 준비 전 null 에 반응 — 관리자 전용 아님 | `useMeReady` 로 가드 | S |

긍정 확인 [실측]: 정지 즉시 해당 사용자 `/api/me` 401·재로그인 요구; 사유 입력 중 타이머 정지; Enter 로 arm·Esc 로 해제; 모바일 가로 스크롤 0, 사용자·공개 트리 탭 44px 미만 표적 0; 사유 입력칸은 카드 마지막 줄 위(y 799/844) 로 스펙 I14 대로; PC th sticky; `/api/admin/users?q=` 닉네임·UUID·provider:sub 세 방식 모두 1건 일치; 신고→숨김 후 행 '해제', 해제 후 '숨김' 복귀; 복구 토스트·감사 로그 13건 기록.

## 7. "구현은 있는데 UI 노출 없음"

| 요소 | 서버/타입 | UI | 우선순위 | 공수 |
|---|---|---|---|---|
| 사용자 상세(세션 수·트리 목록) | `GET /api/admin/users/:id` `admin.ts:150-155` **[실측]** 200 | 호출 없음 | 중 | M |
| 처리된 신고 이력 | `?status=resolved|all` `admin.ts:227-228` | 없음 | 낮 | S |
| 삭제 유예 트리 별도 페이지 | `?deleted=1` `admin.ts:187` | 첫 페이지에 100개 덧붙임만 | 낮 | S |
| 감사 로그 `actor_id` | 응답 포함 | 열 없음 | 중 | S |
| 백업 `error`, 일일 `purged_users`·`error` | `AdminStats` 타입 `api.ts:116-117` | 미표시 | 중 | S |
| 백업 `uploaded`(외부 업로드 여부) | `backup.ts:14` 파일에만 | `AdminStats` 타입에 없음 | 중 | S |
| 사용자 UUID, 트리 `hidden_by_admin_at` 시각 | 응답 포함 | 미표시 | 중/낮 | S |
| `users.suspended_at`·`deleted_at` 시각 | 응답 포함 | 상태 글자만 | 낮 | S |

## 8. 스펙·구현 모두 없는데 명백히 빠진 것

| 요소 | 왜 필요한가 | 단서 | 우선순위 | 공수 |
|---|---|---|---|---|
| 관리자 진입 링크 | B2 | `href.admin` `router.ts:68` 이미 있음 | 높 | S |
| 점검 모드 비로그인 안내 | B6 | `Banners.tsx:14` | 중 | S |
| 사용자 상세에서 세션 전부 폐기(정지 없이) | 계정 탈취 의심 시 | 정지가 세션 삭제 겸함(`admin.ts:165`). `DELETE FROM sessions WHERE user_id` 한 줄 | 낮 **[가정]** | S |
| 탈퇴 대기 사용자 관리자 복구 | 사용자 "실수로 탈퇴" 요청 | 사용자 재로그인 경로만(`oauth.ts:80-82`) | 낮 | S |
| 다른 관리자 정지·삭제 차단 | 상호 잠금 | §3 | 낮 **[가정]** | S |
| 수동 백업·일일 작업 즉시 실행 버튼 | Pi 1대 운영자가 SSH 없이 점검 전 백업 | `runBackup`/`runDaily` 함수가 export 돼 있음(`backup.ts:16`, `daily.ts:13`) | 중 **[가정]** | M |
| 서버 버전·빌드 시각·DB 크기·마지막 마이그레이션 | 배포 확인 | `PRAGMA user_version`, `app.db` statSync | 낮 | S |
| 정렬·상태 필터·날짜 범위(사용자/트리/감사) | 규모 커지면 | §2.2 | 낮 | M |
| 신고 기각 취소 / 기각 사유 | 되돌릴 수 없는 1탭 | §2.3 | 낮 | S |
| 로딩·오류 재시도 상태 전 탭 | B11 | — | 낮 | S |
| 정지 사유를 사용자에게 보여 주기 | 문의 감소 | 로그인 실패 `e=suspended` 만(`router.ts:10`) | 낮 **[가정]** | M |
| 공지 미리보기·만료 시각 | — | — | 낮 | S |
| CSV 내보내기 | — | 운영자 1~2인엔 불필요 **[가정]** | 낮 | — |

## 9. 테스트 커버리지

| 범위 | 위치 | 내용 |
|---|---|---|
| e2e (Playwright) | `e2e/server.spec.ts:103-116` | 관리자 로그인 → `#/admin/trees` → 숨김 2단계 → 공유 보기 403. **그 외 0건**(`grep -c admin e2e/*.spec.ts` 다른 7파일 0) |
| 서버 단위 check | `server/account/account.check.ts:136-196` | 44개 assert: stats, users 검색·cursor, trees `?deleted=1`, users/:id, 자기 정지 403, reason 201자 400, suspend/unsuspend, settings 81자 400, 점검 503/Retry-After/관리자 면제/health, audit action 5종, admins.json 허용목록 → admin 역할 |
| 수동 QA 기록 | `docs/specs/06_ui_qa.md` #8 #15 #18 #20 #22 | 2026-11-08 스크린샷 기반. 이번 B1(`.search` 충돌)은 당시 미발견 — 에디터 CSS 미로드 상태였을 가능성 **[가정]** |

e2e 공백: 대시보드 렌더, 사용자 검색·정지·삭제(즉시/유예), 신고 처리, 삭제 트리 복구, 공지 게시→배너, 점검 모드→503/배너, 감사 로그 페이지, 모바일 카드, 비관리자 리디렉트.

## 10. 우선순위 종합 (착수 순서 제안)

1. **B1 `.search` 클래스 충돌** — 높 · S. 검색·공지 기능이 사실상 쓸 수 없다.
2. **B2 관리자 진입 링크** — 높 · S.
3. **신고 심사 정보(트리 링크·시각)** — 높 · S~M. 신고 큐가 "제목만 보고 숨김" 이다.
4. B3·B4 2단계 버튼 상태 정리(즉시 체크박스·Esc) — 중 · S.
5. B5 점검 모드 확인·토스트, B6 비로그인 점검 안내 — 중 · S.
6. B7 복구 트리 목록 오염 — 중 · S.
7. 대시보드 오류 문자열·"아직 없음" 상태(B9) + `uploaded` — 중 · S.
8. 사용자 상세(세션 수·트리·UUID) UI — 중 · M.
9. 감사 로그 행위자·한글 라벨(B10) — 중 · S.
10. e2e 추가(사용자 정지·삭제, 공지/점검, 신고 처리) — 중 · M.
