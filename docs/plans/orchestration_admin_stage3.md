# 오케스트레이션: 관리자 페이지 3단계 — 남은 요소 전부 (2026-11-14)

요구: "남은 것도 모두 구현하고 오늘 구현 내용을 알기 쉽고 간단히 설명하는 md 문서 작성". 근거는 `docs/research/admin/00_synthesis.md`(종합)와 워커 보고서 `w1_gap.md`·`w2_ops.md`·`w3_product.md`·`w4_external.md`.
1·2단계(T0 전부, T1 #10·11·12·14·17·18·19·20·21, T2 #22·#24·#30)는 main 에 있다(07bd38e, f4119c3). 이번은 나머지.

## 0. 공통 규칙 (워커 3명 전원)

- 작업 폴더는 Orca 가 만든 새 worktree(브랜치). **자기 소유 파일만 고친다**(아래 표). 공용 파일을 꼭 고쳐야 하면 "허용 범위" 열의 지점만, 다른 워커 영역은 건드리지 않는다.
- 합류 지점은 이미 있다: `server/account/admin.ts` 의 `stats()` 가 `opsStats(db)`·`productStats(db)` 를 부르고 `registerAdmin` 이 `registerOps/registerLegal/registerProduct` 를 부른다(`/api/admin/*` 는 `requireAdmin` 뒤). `server/account/me.ts` GET `/api/me` 가 `legal: legalMe()`·`product: productMe()` 를 합친다. `server/account/daily.ts` 가 `legalDaily()`·`productDaily()` 를 부른다. 타입 스텁 `OpsStats`·`ProductStats`·`LegalMe`·`ProductMe` 는 `src/core/api.ts` 에 빈 인터페이스로 있다 — **자기 인터페이스만 채운다**.
- 관리자 화면은 탭마다 파일 하나(`src/features/admin/*`). 공용 훅·포맷은 `shared.ts`, 컴포넌트는 `widgets.tsx`. 새 감사 action 라벨은 **자기 탭 파일에서** `Object.assign(ACTION, {...})` 로 등록(shared.ts 를 고치지 않는다).
- 마이그레이션 번호는 고정: B = `005_legal.sql`, C = `006_product.sql`. A 는 마이그레이션 없음(메모리·파일·PRAGMA 만).
- 원칙(03 §3.7, w2 §4): IP·이메일·원문 UA 저장 금지, 요청당 SQLite 쓰기 금지(카운터는 메모리), 무거운 전체 집계 금지(`nodes` GROUP BY 등), 백업 파일 다운로드 금지, 실시간 로그 금지. 디자인 시스템은 무채색+초록+빨강(`--warn` 없음), 파괴 동작은 `TwoStep`, 입력칸 클래스는 `.admin-search`(`.search` 금지), 모바일 ≤760 카드 규칙은 `admin.css` 그대로.
- 검증: `npm run typecheck && npm run lint && npm run check && npm run build` 통과. 서버 로직은 `server/account/account.check.ts`(또는 자기 파일 `*.check.ts` 를 `npm run check` 에 연결)에 단언 추가. **`npm run e2e` 는 돌리지 않는다**(오케스트레이터가 병합 후 1회). 화면은 `AUTH_FAKE=1` 서버 + Playwright(msedge) 로 직접 눌러 보고 스크린샷으로 확인한다(포트는 아래 표).
- 끝나면 자기 브랜치에 커밋(메시지 한국어, 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`), push 하지 않는다. `worker_done` 에 브랜치 이름, 구현 항목 표(#번호·한 줄·상태), 못 한 것과 이유, 문서용 2~3줄 요약을 담는다.
- 비용 제한: Pi 1대·운영자 1~2인. 가장 짧은 구현을 고른다. 표준 라이브러리·이미 설치된 의존성만, 새 패키지 금지.

| 워커 | 포트(vite / node) | 브랜치 이름 제안 |
|---|---|---|
| A 운영 | 5361 / 4361 | agent-admin-ops |
| B 법규·통지 | 5362 / 4362 | agent-admin-legal |
| C 제품 지표 | 5363 / 4363 | agent-admin-product |

## 1. 워커 A — 운영 (w2_ops.md 전부, w1 §7·§8 잔여)

소유: `server/account/ops.ts`, `server/metrics.ts`, `src/features/admin/Dashboard.tsx`, `src/features/admin/SystemTab.tsx`, `src/features/admin/UsersTab.tsx`, `deploy/drilldown-server.service`, `docs/ops/runbook.md`(SSH 대신 화면으로 바뀐 항목만). 허용 범위: `src/core/api.ts` 의 `OpsStats`·`AdminUserDetail`·`AdminUser`, `server/http.ts` `hit()`(429 카운트 1줄), `server/sync/index.ts`·`server/account/oauth.ts`(카운터 호출 1줄씩), `server/account/admin.ts` 의 `GET /api/admin/audit`(필터 파라미터)·`USER_COLS`(provider_sub), `server/account/session.ts`(세션 수 쿼리가 필요하면 읽기만), `src/main.tsx`(window.onerror 1곳), `admin.css`(자기 섹션 추가만).

| # | 요소 | 핵심 |
|---|---|---|
| T1 #13 | DB·WAL 크기, page/freelist, 백업 폴더 합계, RSS/512M | `statSync(app.db, app.db-wal)`, PRAGMA 3개 → 대시보드 카드 |
| T1 #15 | 세션 수(총·만료 대기·관리자) | COUNT 3 |
| T1 #16 | 429 키별 카운터, 동기화 카운터(push/pull 수·410·superseded·dropped), 재시작 이후 | `metrics.ts` 에 `count(name)` + 스냅샷, `http.ts hit()`·`sync/index.ts` 에서 호출. SQLite 쓰기 금지 |
| T4 #48 | 클라이언트 오류 카운트 | `POST /api/client-error {message≤200, version}` 분당 제한 → 메모리 카운터 + 최근 10건, `src/main.tsx` `window.onerror`/`unhandledrejection` |
| T3 #31 | 수동 백업·일일 작업 실행 버튼 + 진행 중 표시 | **서버 안에서 `runBackup` 직접 호출 금지**(`execFileSync` 30분 블로킹) → `child_process.spawn(process.execPath, ['server/account/backup.ts'])`, 동시 실행 플래그, 끝나면 `backup.json` 재읽기, audit `system.backup_run`/`system.daily_run`. `deploy/drilldown-server.service` `Environment=` 에 `RCLONE_CONFIG=/etc/drilldown/rclone.conf` 1줄 |
| T3 #32 | 배포 버전(git HEAD 읽기·`dist/index.html` 의 index-<hash>.js·시작 시각)·재시작 필요 여부(dist/server mtime > 시작 시각)·[재시작] | 재시작 = audit 후 `process.exit(1)`(Restart=on-failure). `/api/health` 에는 넣지 않는다 |
| T3 #33 | `admins.json` 내용(읽기), 내 `provider:sub`, 사용자 상세에 `provider_sub` | 편집은 불가(/etc 읽기 전용) |
| T3 #34 | 사용자 상세 패널(행 클릭/버튼): 세션 수·트리 목록·UUID 복사·세션 전부 폐기(정지 없이)·탈퇴 취소 | `GET /api/admin/users/:id` 는 이미 있음. 추가 POST `revoke-sessions`·`undelete`(deleted_at NULL + `restoreTreesOfUser`), audit |
| T3 #35 | 감사 로그 필터(action·target_id·기간)·CSV(≤5,000행) | `audit_ts`·`audit_target` 인덱스 있음 |
| T3 #36 | OAuth 제공자 상태(id·secret 설정, 콜백 실패 수, 제공자별 마지막 로그인) | `oauth.ts` 실패 지점 카운터 |
| T3 #37 | 복원 안내 패널 + 로컬 백업 파일 목록(이름·크기·날짜) | 다운로드 없음 |
| T3 #38 | WAL checkpoint 버튼 | `PRAGMA wal_checkpoint(TRUNCATE)` + audit |
| w1 §8 | 다른 관리자 정지·삭제 차단(서버 403), 사용자 정렬·상태 필터(정상/정지/탈퇴 대기), 로딩·재시도 상태 | 작게 |
| T4 #49 일부 | 대시보드 "마지막 복원 리허설 N일 전"(audit `system.restore` 최신) | 1 쿼리 |

## 2. 워커 B — 법규·통지 (w4_external.md §3·§5, T2 잔여)

소유: `server/account/legal.ts`, `server/migrations/005_legal.sql`, `src/features/admin/TreesTab.tsx`, `src/features/admin/RequestsTab.tsx`, `src/features/admin/NoticeForm.tsx`, `src/features/share/TakedownPage.tsx`, `src/features/share/ReportStatusPage.tsx`, `src/features/account/Banners.tsx`, `src/features/account/TermsPage.tsx`. 허용 범위: `src/core/api.ts` 의 `LegalMe`·`Settings`·`Report`·`AdminTree`(필드 추가), `server/account/admin.ts` 의 `registerReport`(자동 숨김·응답 id)·`getSettings`/`PUT /api/admin/settings`(공지 배열·점검 예약), `server/account/index.ts` `maintenanceMiddleware`(예약 판정), `server/sync/owner.ts` `setHidden`/목록 쿼리(hidden_until), `server/sync/share.ts`(공개 판정에 hidden_until), `src/features/share/SharedPage.tsx`(신고 후 접수번호 안내·링크), `src/core/me.ts`(공지 닫기 키가 바뀌면), `admin.css`.

| # | 요소 | 핵심 |
|---|---|---|
| T2 #23 | 저작권 게시중단 요청 폼(`#/takedown`, 비로그인 가능) + 상태 큐 | `takedowns(id, slug/tree_id, claimant_contact, claim, state, received_at, hidden_at, owner_notified_at, counter_at, resume_due, resolved_at)`. 상태: 접수→중단(즉시 숨김)→소유자 통보→(30일 내 재개 요구 = 기존 `appeals` 재사용 또는 counter)→재개 예정일 통보→재개/소제기. 연락처는 이 목적 한정·처리 후 90일 삭제. 관리자 큐는 TreesTab 또는 RequestsTab. 익명 폼 레이트 리밋 IP당 3/시(IP 저장 금지, 메모리 버킷) |
| T2 #25 | 정보주체 요청 큐(열람·정정·삭제·처리정지·미성년·기타) + D-10 | `requests(id, kind, channel, received_at, due_at, target_type, target_id, state, note, resolved_at)`, 관리자가 수동 입력(이메일로 온 요청). 기한 지나면 빨강. 완료 시 audit `dsr.<kind>` |
| T2 #26 | 접수 상태 조회 `#/report/<id>` | 신고·게시중단 접수번호로 상태만(연락처 없이). 신고 POST 응답 id 를 SharedPage 가 "접수번호 + 링크"로 보여 줌 |
| T2 #27 | 임시조치 30일 타이머·만료 임박 카드, 숨김 2종(보류/확정) | `trees.hidden_until`(005). 보류 숨김은 30일 뒤 `legalDaily` 가 해제하거나 확정으로 바꾸게 관리자 결정 유도(TreesTab 에 D-N) |
| T2 #28 | 열린 신고 N건(기본 3) 자동 숨김 | `registerReport` 에서 COUNT≥N → `setHidden(..., 'auto')` + audit actor NULL. N 은 settings `auto_hide_reports` |
| T2 #29 | 공지 복수·기간·링크·대상(전체/로그인만) + 점검 예약(시작·종료 시각) | `settings.notices: [{id,text≤160,url?,from,until,audience}]`, `settings.maintenance: {enabled, from?, until?}`. `getSettings()` 또는 미들웨어에서 `effective = enabled || (from≤now<until)` 계산(스케줄러 없음). 배너는 기간 안 공지만, 비로그인 대상 공지는 `/api/auth/providers` 또는 `/api/me` 401 경로로도 받을 수 있게(최소: 로그인 사용자 + 비로그인은 `audience='all'` 공지를 `/api/auth/providers` 응답에 포함). `<input type="datetime-local">` 네이티브 |
| 약관 | TermsPage 5항에 `#/takedown` 링크, 접수번호 안내 | |

## 3. 워커 C — 제품 지표·피드백·스위치 (w3_product.md, T4)

소유: `server/account/product.ts`, `server/migrations/006_product.sql`, `src/features/admin/MetricsTab.tsx`, `src/features/admin/FeedbackTab.tsx`, `src/features/account/FeedbackSheet.tsx`(새), `src/features/share/GalleryPage.tsx`. 허용 범위: `src/core/api.ts` 의 `ProductStats`·`ProductMe`, `server/sync/index.ts`·`server/sync/share.ts`(`/t/:slug`·`/api/t/:slug` 조회 수 +1, 갤러리 featured·flags), `server/sync/owner.ts`(필요한 집계 함수 추가만), `src/features/account/AccountPage.tsx`(피드백 버튼 + 내 피드백 상태), `src/App.tsx`(갤러리 탭 숨김 플래그 1곳), `admin.css`.

| # | 요소 | 핵심 |
|---|---|---|
| T4 #40 | 학습 지표 카드: K2(14일 내 같은 트리 백지 2회 비율), 회독별 재현율(1→3회차 `node_recall` 중앙값), 자기채점 비율·뒤집기 비율, 구조 오답(`edge_accuracy`), FSRS 평균 예측 유지율(`json_extract(card,'$.stability')`, `$.last_review`), 활성화율(가입 72h 내 백지 완료), 제공자별 가입, 신고 처리 SLA(최장 대기·7일 내 처리율·사유별), 1년 미접속 수, DB 크기/사용자 | 전부 현재 스키마 SQL. 기간 선택(30/90일/전체). 무거운 집계면 LIMIT·인덱스 확인, 1 요청 100ms 목표 |
| T4 #41 | `daily_stats(day PK, dau, wau, mau, retrieval_active, new_users, new_trees, attempts, share_views, copies, gallery_hits, client_errors, open_reports, public_trees)` + 30/90일 선그래프(SVG 직접, 라이브러리 금지) | `productDaily` 가 04:00 에 1 INSERT(어제 기준). 집계값만 |
| T4 #42 | 공유 링크 조회 수 `trees.view_count`(006) | `/t/:slug`·`/api/t/:slug` +1(크롤러 UA 제외는 기존 판정 재사용). 유니크 불가 → 요청 수 |
| T4 #43 | 피드백·버그 수집함 | `feedback(id, user_id NULL, category('bug'|'idea'|'content'|'other'), text≤500, tree_id, client(sessions.ua 수준), created_at, resolved_at, note)`. `POST /api/feedback`(anon IP 5/시·user 20/시, 메모리 버킷), 계정 화면 버튼 → FeedbackSheet, `GET /api/me/feedback`(내 것·상태·운영자 메모), 관리자 FeedbackTab(목록·처리·메모). 90일 삭제. 입력란 "연락처 적지 마세요" |
| T4 #44 | 운영 스위치 `settings` key `flags: {gallery, report, rating, publish}` | `GET/PUT /api/admin/product/settings`(자기 키만 — admin.ts 의 settings 핸들러는 B 소유), `productMe` 로 `flags` 전달, 서버 라우트도 같은 값 확인(갤러리 404·신고 403·별점 403·공개 전환 403). `App.tsx` 갤러리 탭 숨김 |
| T4 #45 | 시드 트리 표식·필터(소유자 role=admin), 추천 고정(`settings.featured_slugs` → 갤러리 상단), 소유자·신고자 단위 신고 집계, 복제 계보(`source_tree_id` 원본 제목) | 갤러리 캐시 60초 그대로 |
| T4 #49 | 운영 기준 카드: 사고 기록 목록(audit `system.incident`, 72h 카운트다운), 가용성 대용(`daily_stats.restarts` 기동 시 +1) | |
| 보류(하지 않음) | 후원 막대(창업자 미결), `user_activity` 코호트(처리방침 결정 필요), 허용 표현 승인 큐(클라이언트 채점 변경 필요), 익명 핑, 태그·카테고리, 웹 푸시, UTM | MetricsTab 하단에 "보류 — 결정 필요" 한 줄로 표시 |

## 4. 오케스트레이터 병합 뒤

세 브랜치를 main 에 순서대로 머지(충돌은 api.ts·admin.css·admin.ts 합류 지점 정도), typecheck·lint·check·build·**e2e 1회**, `docs/CODEBASE.md` 관리자 절 갱신, `docs/ADMIN_2026-11-14.md`(오늘 구현 요약, 쉬운 말) 작성, 커밋·푸시.
