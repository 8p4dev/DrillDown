# 오케스트레이션: 전체 코드 리뷰 → 수정 (2026-11-14)

요구: "전체 코드 리뷰 후, 최대한 개선해". 리뷰 워커 4명(읽기 전용)의 보고서는 `docs/research/review_2026-11-14/`(r1 서버 · r2 코어 · r3 편집기·계정 · r4 학습·공유·관리자). 모든 항목은 리뷰어가 코드로 확인했고 H 는 재현됐다.
수정은 워커 3명이 파일 소유로 나눠 한다. 원칙: 리뷰 보고서의 "고치는 법(가장 짧은 diff)" 을 그대로 쓴다. 삭제가 최선. 새 추상화 금지.

## 0. 공통 규칙

- Orca 새 worktree(브랜치). 소유 파일만. 합류 계약(§4)은 양쪽이 같은 이름을 쓴다.
- 검증: `npm run typecheck && npm run lint && npm run check && npm run build`. 서버 로직은 `*.check.ts` 단언 추가(리뷰 "테스트 공백" 표 중 자기 항목). **`npm run e2e` 금지**(오케스트레이터 1회). 화면 변경은 `AUTH_FAKE=1` + Playwright(msedge) 로 눌러 확인.
- 새 npm 패키지 금지 — 예외 1개: F2 의 `fake-indexeddb`(devDependency, 동기화 엔진 check 용).
- 끝나면 자기 브랜치에 커밋(한국어, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`), push 금지. `worker_done` 에 브랜치·항목 표(ID·상태)·못 한 것·문서용 2줄.

| 워커 | 포트(vite/node) | 브랜치 | 소유 |
|---|---|---|---|
| F1 서버 | — / 4364 | agent-fix-server | `server/**`, `deploy/**`, `docs/ops/runbook.md` |
| F2 코어·편집기·계정 | 5365 / 4365 | agent-fix-core | `src/core/**`, `src/ui/**`, `src/features/editor/**`, `src/features/account/**`, `src/features/{Toast,feel,viewport}*`, `src/App.tsx`, `src/router.ts`, `src/main.tsx`, `src/index.css`, `package.json`(devDep 1개) |
| F3 학습·공유·관리자 | 5366 / 4366 | agent-fix-ui | `src/features/flash/**`, `src/features/dnd/**`, `src/features/share/**`, `src/features/admin/**` |

허용 예외(한 줄 수준): F2 는 `src/features/share/ShareSheet.tsx:107`·`VisibilityBadge.tsx:11` 의 `Tree` 캐스트 제거(타입 추가와 한 묶음). F3 는 `src/core/api.ts` 에 타입 추가(`SharedTree.flags?`, `OpsJobs`, `FEEDBACK_CATEGORY`, `REASON`)와 `src/core/fmt.ts` 신설, `src/features/account/Banners.tsx`·`AccountPage.tsx`·`FeedbackSheet.tsx` 의 중복 상수 import 교체, `src/App.tsx:128` key 한 줄. F1 은 클라이언트 파일을 건드리지 않는다.

## 1. F1 서버 — r1 전부 + 계약

| ID | 할 일 |
|---|---|
| r1 H1 | `legal.ts` takedown 의 `hidden_at` 은 "이 요청이 숨겼을 때만"(tx 밖 `hid = live && !isHidden`) |
| r1 H2 | `map.ts parseSrs` card 직렬화 길이 상한 2048 + attempts 사용자당 행 상한(20,000) 또는 일일 정리 |
| r1 M1 | 감사 삭제 컷오프를 트리거와 같은 식(초 단위, SQL 안에서 계산)으로, `daily.ts` 에서 감사 삭제를 맨 뒤로 |
| r1 M2 | `purgeUser` 에 appeals·feedback 삭제, daily 에 고아 appeals 정리 |
| r1 M3 | 자동 숨김은 `COUNT(DISTINCT reporter_id) … reporter_id IS NOT NULL` |
| r1 M4 | takedown 접수는 30일 임시조치(`hidden_until`), `confirm` 에서 `hidden_until=NULL` |
| r1 M5 | 기동 시 `authFake && secure` 면 throw |
| r1 L1 | booted 미들웨어 삭제 → `createApp` 에서 restarts +1 한 줄 |
| r1 L2 | 작업 실행 중 재시작 409 |
| r1 L3 | 사용자·트리 목록 N+1 → 상관 서브쿼리 |
| r1 L5 | `view_count` 는 메모리 Map 에 모아 5분 주기 반영(기존 `saveCounters` 재사용) |
| r1 L6 | `/t/:slug` 크롤러도 별도 키로 리밋 |
| r1 L7 | `sessionMiddleware` 에서 admin 이면 `admins.json` 재확인(60초 캐시) |
| r1 L8 | 점검 예약 `from` 만 있으면 400 |
| r1 L9·L10 | me.ts pre-handler 제거, admin.ts 두 번째 UPDATE 삭제 |
| 삭제 | `resolveAppeals`·`isHidden`·`ms()`·`UUID/CTRL`·`now()`·마스킹 정규식 중복 제거, `legalMe/productMe` 안 쓰는 인자 |
| 계약 A | push 본문 `userId?: string` — 있고 세션 사용자와 다르면 409 `user_mismatch`(sync.check 단언) |
| 계약 B | `GET /api/t/:slug` 응답에 `flags: { report: boolean; rating: boolean }` 추가(설정의 flags 그대로) |
| 계약 C | `GET /api/admin/ops/jobs` → `{ running: { backup: boolean; daily: boolean }, backup: <backup.json>, daily: <daily.json> }` (stats 보다 가벼운 폴링용) |
| 테스트 | r1 "테스트 공백" 의 H1·H2·M1·M2·M3·M4·M5·L2 단언, 마이그레이션 경로(003 적용 파일 DB → 기동 → 004~006 적용) 1건 |

## 2. F2 코어·편집기·계정 — r2 + r3 전부

| ID | 할 일 |
|---|---|
| r2 H1 | `engine.ts:239` `rescueOrphans` 호출 삭제(고아 복구는 pull 마지막에만) |
| r2 H2 | `onLogin` 에서 사용자가 바뀌면 `stop()`; push 본문에 `userId` 담기(계약 A, 409 면 중단·재로그인 안내) |
| r2 M1 | superseded 에서 `updatedAt` 같은 행은 집계·토스트에서 제외 |
| r2 M2 | attempts 경로는 **유지**(F3 가 기록을 넣는다). 삭제하지 말 것 |
| r2 L1·L2·L3 | `deletedAt: r.at`, `refreshMe` 캐스트 제거, `Row` 타입 1곳 |
| r2 삭제 | `getMe`, `NodeColor 'yellow'`, 죽은 아이콘 4개, icons.all 재수출 4줄(가져오는 쪽 `I.*` 로), 죽은 `export` 11곳, `--fs-2xl`, `db.version(1)`(Dexie 4 문서에서 upgrade 없는 과거 버전 제거 가능 여부 확인 후) |
| r2 테스트 | devDep `fake-indexeddb` + `src/core/sync/engine.check.ts`: H1(superseded 뒤 pull 로 부모 도착 시 루트 이동 없음), M1(같은 updatedAt → 변경 0), 410 분류, `reId` 매핑, `track` 제자리 갱신. `npm run check` 에 연결 |
| r3 H1 | `onRemote` 에서 `liveBase.current = next` |
| r3 M1 | `GraphView` RO 를 레이아웃 이펙트에서 `??=` 생성 |
| r3 M2·M3 | 닉네임 `onFocus` 에서 `done=false`; 세션 목록 실패 표시 |
| r3 L2·L3·L4·L5 | remote 리스너 의존성 ref 로, `narrow` 한 번 구독, Toast `undo: true` 필드, UNSET 안내 보이게 |
| r3 삭제 | `useVisualViewport`, 목록 "학습 기록 내보내기", `rel/ago` 하나로(`ui/` 또는 `core/`), `countTree`→`childIndex`, 인라인 아이콘 → `icons.all.ts`, CSS 중복 선택자 병합 |
| r4 보조 | `types.ts Tree.hiddenByAdmin?: boolean` 추가 + 캐스트 3곳 제거(engine.ts·ShareSheet·VisibilityBadge) |
| 건드리지 않음 | `FEEDBACK_CATEGORY`·`p2/when` 통합(F3), r3 L1(정지 사유 URL — 보류, 운영 판단) |

## 3. F3 학습·공유·관리자 — r4 전부

| ID | 할 일 |
|---|---|
| r4-01 (H) | 백지·빈칸 `grade()` 성공 뒤 `db.attempts.add` + `track([{kind:'attempt'…}])`(`source.ephemeral` 제외). `startedAt` 은 마운트 시각. `StudySource.attempt?` 로 한 곳에 |
| r4-02 | `App.tsx:128` `key={r.treeId + r.rootId}`, `SharedPage.tsx:315` `key={slug + rootId}` |
| r4-03 | 설정 로드 전엔 `Curation` 대신 `<Loading/>` |
| r4-04·16 | TwoStep 없는 파괴 버튼 전부 TwoStep(신고 숨김·보류·소명 해제·게시중단 재개·정보주체 완료·운영 스위치·점검 예약 저장) |
| r4-05 | 신고 폼 busy |
| r4-06 | 공유 보기: `t.flags?.report === false` 면 신고 메뉴 숨김, `rating === false` 면 별점 비활성(계약 B, 비로그인 포함). 갤러리 404 → "지금은 꺼져 있습니다" |
| r4-07 | ShareCard `tabIndex` + 키 핸들러(Enter/Space 선택, ←/→ 접기) |
| r4-08 | `.share-sheet`·`.sheet-head .sheet-x` 규칙을 `index.css` 의 `.sheet-head` 옆으로(F2 파일이지만 CSS 2규칙 이동만 허용) 또는 GalleryPage import 1줄 — 후자 선택 |
| r4-09·14·19 | copyTree try, localStorage try, record null 토스트 |
| r4-10 | 신고 묶음의 hidden 을 trees 에서 파생 |
| r4-11 | `rss_max` 0 이면 "한도 없음" |
| r4-12 | 작업 중 폴링은 `GET /api/admin/ops/jobs`(계약 C) 10초 |
| r4-15·17·18·20 | REASON 1벌(`core/api.ts`), 날짜 로컬 파싱, 백지 힌트 문구·id, Loading 통일(`onRetry?`) |
| r4 삭제 | FlashCard `rateable`·"참고", Minimap aria/키, FlashPage `fresh` 분기, `QuizShell` 로 dnd/blank 껍데기 합치기, `p2/when` → `src/core/fmt.ts`, `DAY`·`Dday` 1벌, `FEEDBACK_CATEGORY` → `core/api.ts`(account 2파일 import 교체 포함), `ACTION` 한 표로 합치기(Object.assign 6곳 제거), `GalleryPage` 의존 배열 `key` 제거, `SharedPage source` ref 1줄, `ProductStats.feedback_open` 을 Dashboard "열린 피드백" 카드로 사용 |
| 테스트 | 가능한 것: `flash.check`/`dnd.check` 에 attempts 생성 단언(memorySource 는 제외). e2e 는 쓰지 않는다(오케스트레이터가 r4 "테스트 공백" 중 갤러리 직접 진입·플래시 범위 전환을 추가) |

## 4. 합류 계약

- A. push 본문 `userId`: 클라이언트(F2)가 `meta.userId` 를 넣고, 서버(F1)는 세션과 다르면 `409 user_mismatch`. 클라이언트는 409 를 받으면 엔진 `stop()` 후 `refreshMe()`.
- B. `SharedTree.flags?: { report: boolean; rating: boolean }` — F3 가 타입(optional) 추가, F1 이 응답에 넣는다. 없으면 켜진 것으로 본다.
- C. `OpsJobs = { running: { backup: boolean; daily: boolean }; backup: AdminStats['backup']; daily: AdminStats['daily'] }` — F3 타입 추가·폴링, F1 라우트.

## 5. 병합 뒤(오케스트레이터)

F1 → F2 → F3 순 머지, 충돌은 `api.ts`·`admin.css`·`ShareSheet.tsx` 정도. typecheck·lint·check·build·**e2e**. e2e 2건 추가(갤러리 직접 진입 시트 CSS, 플래시 범위 전환 진행 보존). `docs/CODEBASE.md`·`docs/ADMIN_2026-11-14.md` 에 리뷰 반영 절 추가. 커밋·푸시.
