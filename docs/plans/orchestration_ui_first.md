# 오케스트레이션 — 재설계 구현 1단계: UI-First (UI + mock 데이터)

작성 2026-11-08, 오케스트레이터. 설계 입력: `docs/specs/00_overview.md`(종합)·`01`~`05`. 사용자 지시(2026-11-08): "기본값대로 진행하고 구현 오케스트레이션 시작. UI-First — 우선 UI, Mock data 만으로 구현 후 알려줘."

## 0. 범위와 산출물

- **범위**: 설계 문서의 10개 화면 전부를 **서버 없이** 동작하는 UI 로 구현한다. 로컬 데이터(트리·노드·SRS)는 지금처럼 Dexie 가 진실이다. 서버가 주는 것(세션·계정·관리자 통계·공유 트리·갤러리·동기화 상태)은 `src/core/mock/*` 의 인메모리/localStorage 스토어가 준다.
- **범위 밖(다음 단계)**: `server/`, OAuth 실제 흐름, Dexie v2 `outbox`·`meta`, `sync.ts` push/pull, `/t/:slug` 서버 서빙·OG, 웹폰트 서브셋 **파일 생성은 범위 안**(D2 기본값)이지만 SW 캐시 전략은 다음 단계.
- **사용자 결정**: 00 §6 의 **기본값 전부 채택**. D14(회선 약관)·D18(보호책임자 이메일·도메인)은 UI 에 영향 없어 보류. 정리: 형광펜 3색 현행 유지, Pretendard 정적 서브셋 2개, 갤러리 켬, 파랑 폐기, 상단 바만, 관리자 PC 우선, 2단계 버튼, 7일 유예, Apple 제외·Naver 보류.
- **완료 기준(전체)**: `npm run typecheck`·`lint`·`build`·`check` 통과, 기존 E2E 13개 통과(오케스트레이터가 통합 후 1회 실행, 라벨 변경에 따른 셀렉터 수정 허용), 10개 화면이 390/1440 × 라이트/다크에서 스펙 와이어대로 그려짐(워커별 스크린샷 증거), precache ≤ 600 KiB·첫 화면 gzip ≤ 120 KB(01 §3.8).

## 1. 요구사항 → 작업 (완료 기준 포함)

| # | 요구 | 담당 | 완료 기준 |
|---|---|---|---|
| U1 | 디자인 시스템 적용: 토큰(완료, 오케스트레이터)·반경·그림자 삭제·버튼/입력/표/토스트 상태표·`--accent` 사용처 제거·형광펜 유지 | DS | `grep -r "var(--accent\|--shadow\|--warn\|ease-spring\|pulse-ring\|spring-in\|backdrop-filter" src` 0건(DS 소유 파일 기준; 다른 워커 파일은 그 워커가 0건으로) |
| U2 | 테마 3상태(auto/light/dark) + 부팅 스크립트 + `theme-color` 1개 + manifest 색 | DS | 01 §3.7 E2E 항목 (1)(2)(4)(7) 을 Playwright 스크립트로 직접 확인(커밋 금지), FOUC 없음 |
| U3 | 아이콘·툴팁·2단계 버튼·로더·힌트 공용 컴포넌트 | DS | `src/ui/` 에 `Icon` `ThemeToggle` `Tooltip` `TwoStep` `Avatar` `Sheet` `Hint`; 아이콘 전용 컨트롤 `aria-label` 누락 0 |
| U4 | 웹폰트 Pretendard 정적 서브셋 2개(Regular·Bold) + `@font-face`(`font-display: optional`, preload Regular) | DS | `public/fonts/*.woff2` 2개 합계 ≈ 536 KB, 첫 화면에 적용 |
| U5 | 레이아웃·키보드: `viewport.ts`(`--kb`·`data-kb`·`ensureVisible`), 하단 UI 규칙, 상단 바 44px, 안전 영역, 토스트 위치 | LM | `--kb` 주입 검사 4건(02 §3.3 끝)을 Playwright 로 직접 확인 |
| U6 | 목록 화면: 빈 상태 큰 + 타일, 모드 3칸 아이콘+짧은 글자, ⋯ 메뉴(이름 변경·공유…·삭제), **confirm 제거 → 소프트 삭제 + 되돌리기 10초**, 아바타 6톤, 동기화 상태 슬롯·공개 배지(SH 컴포넌트 삽입) | LM | E2E `ux.spec` 트리 목록 테스트 통과, `confirm(` 0건 |
| U7 | 에디터: Lucide 아이콘, 배율 도구 직사각·키보드 때 숨김, 노드 카드 heat 30/100% + ✕n 배지, 루트 2px, 선택 outline, 패널 툴바 아이콘, `.badge::after` 탭 버그, 탭 44px·`--tree-head-h` | LM | E2E `core-flow`·`extras` 통과 |
| U8 | 플래시·복습·빈칸·백지 재스킨(띠·틴트·마크 4단계, 알음/모름 아이콘+글자, ✓N ✕M, select 네이티브 화살표, 슬롯 dashed, 점수 카드) + **`source` prop 주입**(04 §3.4.2) + `.flash-nav`/`.dnd-bar` `bottom: var(--kb)` | LS | E2E `modes`·`mobile` 통과, `source` 없이 호출하면 동작 동일 |
| U9 | 로그인·계정·상단 바 계정 슬롯·공지/점검 배너·인앱 브라우저 안내·MergeDialog(mock) | AA | 10개 화면 중 로그인·계정이 390/1440·라이트/다크 스크린샷으로 와이어와 일치, 탈퇴 2단계 버튼 동작 |
| U10 | 관리자 4탭(대시보드 14일 막대·사용자 검색/정지/삭제·공개 트리 숨김/복구·신고 처리·시스템 공지/점검/감사 로그) mock | AA | 1440 표 + sticky 헤더, 390 카드, 정지·삭제 2단계 버튼 + 사유 입력 때 타이머 정지 |
| U11 | 공유 보기 `/t/<slug>`(보기·플래시·빈칸·백지 탭, 메모리 소스, 복제 바/아이콘, ⋯ → 신고 시트·링크 복사), 공유 시트(3상태·링크 줄·첫 공개 고지), 동기화 상태 표시, 공개 배지, 갤러리, mock 공유 트리·갤러리 데이터, `copyTree` | SH | `/t/<mock slug>` 에서 4탭 전부 동작, 복제 → 내 트리에 생김, 비로그인 첫 채점 토스트 1회 |
| U12 | 리소스 예산 재측정 `evidence/ds/bundle.md` | DS(3차) + 오케스트레이터 | 표의 "현재" 열 갱신, 초과 시 분할 |

## 2. 가정

- A1 "UI-First" = 서버 호출 0, 데이터는 mock 스토어. 서버가 생기면 `useMe`·`useSyncState`·공유 트리 로더만 실제 구현으로 바뀌고 시그니처는 유지한다.
- A2 mock 로그인은 로그인 화면의 제공자 버튼이 `mockLogin(provider)` 를 부른다. 관리자 데모는 로그인 화면 하단의 작은 링크 "관리자로 로그인(데모)" (`mockLogin('google', {admin:true})`). 프로덕션 빌드에서 빼는 일은 서버 단계.
- A3 공유 보기 데모 slug 는 mock 데이터 2개(예: `3fK9pQ2xT7m`·`Bn7Rt2Lp9Wq`)를 고정하고 갤러리에도 같은 2개를 보인다. 복제는 로컬 Dexie 에 실제로 트리를 만든다.
- A4 Dexie 스키마는 바꾸지 않는다(선택 필드 추가만). `visibility`·`slug` 변경은 `db.trees.update` 로 로컬에 저장(서버 없으니 slug 는 클라이언트가 임시 발급).
- A5 E2E 셀렉터 안정화: 보이는 글자가 짧아져도 **접근 가능한 이름은 현재 라벨을 유지**한다(`aria-label`/`title`). 예: 모드 탭 `플래시`(보임) + `aria-label="플래시카드"`, 상단 `복습` + `aria-label="오늘의 복습"`, `다음 개념 →` 버튼은 `aria-label="다음 개념 →"` 유지. 셀렉터 목록은 §3.7.
- A6 폰트 파일은 DS 가 Pretendard 공식 서브셋(`Pretendard-Regular.subset.woff2`·`Pretendard-Bold.subset.woff2`, OFL)을 받아 `public/fonts/` 에 커밋한다(≈ 536 KB). precache 에서 제외(`globIgnores`), 런타임 캐시 전략은 다음 단계.
- A7 `NodeColor` 의 `'yellow'` 는 타입에 남기되 CSS 에서 `.c-yellow` 만 지운다(core 변경 최소).
- A8 워커는 E2E 를 실행하지 않는다. 대신 Playwright 로 자기 화면의 스크린샷·상태 검사를 **임시 스크립트**(scratch, 커밋 금지)로 찍어 `docs/plans/agent_<ID>_*.md` 에 결과를 적는다. dev 서버 포트는 §4.

## 3. 공유 계약 (모두 커밋 497220b 이후 groundwork 커밋에 반영됨)

### 3.1 라우터·앱 셸 (오케스트레이터 소유 — 변경 요청은 보고)
- `src/router.ts`: `Route` 에 `login(e?, returnTo?)` `account` `admin(tab: dashboard|users|trees|system)` `gallery` `shared(slug, mode: view|flash|dnd|blank, rootId?)`. `parseLocation(location)` 이 `/t/<slug>` 를 우선 인식, `useRoute` 는 `hashchange`+`popstate`. `href.login(returnTo?)` `href.account()` `href.admin(tab?)` `href.gallery()` `href.shared(slug, mode?, rootId?)`, `navigateShared()`.
- `src/App.tsx`: 상단 바 `[■ Drill Down] 내 트리 복습(≤760)/오늘의 복습 … <ThemeToggle/> <NavUser/>`, lazy 페이지 전부 연결, 관리자 청크는 `role==='admin'` 일 때만 프리패치. 클래스 훅: `.topnav-spacer` `.nav-long/.nav-short` `.brand-mark`, `main.main-shared`.
- `src/core/types.ts`: `Tree` 에 `visibility? slug? sourceTreeId? deletedAt?`, `Visibility` 타입.

### 3.2 UI 공용 (DS 소유, 경로 고정)
| 모듈 | 내보내기 | 비고 |
|---|---|---|
| `src/ui/icons.ts` | `I`(22개, 메인 청크) `IconName` | Lucide 1.70.0 자식 요소 문자열(생성됨) |
| `src/ui/icons.all.ts` | 나머지 36개 named export(`zoomIn` `chevronDown` …) | 화면 청크가 필요한 것만 import |
| `src/ui/Icon.tsx` | `Icon({ d, size?: 16\|20\|24\|64, label?, className? })` | 있음 |
| `src/ui/ThemeToggle.tsx` | default `ThemeToggle` | 스텁 → DS 교체 (3칸 세그먼트 32×36) |
| `src/ui/theme.ts` | `useTheme(): { theme: 'auto'\|'light'\|'dark'; set(t) }` | DS 신규 |
| `src/ui/Tooltip.tsx` (+css) | `useTooltip()` 또는 `data-tip` 속성 처리 전역 1개 | 01 §3.5·02 §3.5. 아이콘 전용 버튼은 `aria-label` + `data-tip` 만 붙이면 됨 |
| `src/ui/TwoStep.tsx` | `TwoStep({ label, confirmLabel, onConfirm, className?, pauseWhileFocused?: RefObject })` | 01 §3.6 #22. 3초, `aria-live` |
| `src/ui/Avatar.tsx` | `Avatar({ name, url?, size?: 32\|36\|72 })` | `toneOf`·`initialOf`(`src/core/avatar.ts`) 사용, `<img onerror>` 폴백 |
| `src/ui/Sheet.tsx` (+css) | `Sheet({ open, onClose, label, children })` 하단 시트 | 02 §3.2 규칙 4(a): `bottom: var(--kb)`, `max-height: calc(100dvh − var(--kb) − var(--nav-h))` |
| `src/features/Toast.tsx` | `toast(text, action?, ms?)` 유지, **동시 1개**, `hint(id, text)` 1회성(localStorage `hint:<id>`) | DS 소유로 이관 |
| `src/features/TreeHeader.tsx` + `tree-header.css` | 탭 아이콘+짧은 글자(aria 는 현재 라벨), 44px, 헤더 높이 → `--tree-head-h` | DS 소유 |
| `src/index.css` | 전역 규칙. 토큰 값은 이미 교체됨(`--on-fill` `--kb` `--vv-h` `--safe-t` `--tree-head-h` 포함, 다크 2벌) | DS 소유 |
CSS 클래스 계약(모든 워커가 쓰고 DS 가 정의): 버튼 `button`(기본) `.primary` `.danger` `.ok` `.ghost`(아이콘 전용) `.link`; 입력 기본; `.card`; `.badge`; `.avatar[data-tone=0..5]`; `.seg`(세그먼트 컨테이너) `.seg > button[aria-pressed]`; `.sheet`; `.empty`(빈 상태 타일); `.two-step`; `.tip`.

### 3.3 서버 응답 타입 (`src/core/api.ts`, AA 소유, 이름 변경 금지)
`User Me Session AdminStats AdminUser AdminTree Report ReportReason Settings AuditRow SharedTree GalleryItem ApiErrorBody Provider Role` — 03 §3.6·04 §3.6 의 snake_case 그대로.

### 3.4 mock 스토어 (`src/core/mock/`)
| 파일 | 소유 | 내보내기 |
|---|---|---|
| `me.ts` | AA | `useMe(): Me\|null` `getMe()` `mockLogin(provider, {admin?, nickname?})` `mockLogout()` `mockPatchMe(patch)` `mockSetNotice(notice, maintenance?)` — localStorage `mock:me` |
| `sync.ts` | SH | `useSyncState(): SyncState` (`saved\|syncing\|offline{pending}\|error{reason,pending}`) `setSyncState()` `retrySync()` |
| `admin.ts` (신규) | AA | `AdminStats`·사용자 50명·공개 트리·신고·감사 로그 fixture + 변경 함수(정지·삭제·숨김·복구·해결·설정) |
| `shared.ts` (신규) | SH | `getSharedTree(slug): SharedTree\|null`, `listGallery(sort, page): GalleryItem[]`, `mockIssueSlug()`, 데모 트리 2개(노드 ≥ 20) |
규칙: 스토어는 `useSyncExternalStore` 기반, 화면은 스토어만 읽는다. **AA 가 `me.ts` 에, SH 가 `sync.ts` 에 함수를 더하는 건 자유, 기존 시그니처는 유지.**

### 3.5 학습 화면 데이터 소스 (`src/core/source.ts`, 오케스트레이터 소유)
`StudySource { nodes() srs() record(nodeId, ok) ephemeral? }`, `dexieSource(treeId)`. `FlashPage` `DndPage` `BlankDndPage` 는 `source?: StudySource` prop 을 **이미 받는다**(시그니처만). **LS 가 내부에서 `source ?? dexieSource(treeId)` 를 쓰도록 구현**하고, `FlashCard` 의 `recordResult` 호출도 소스 경유로 바꾼다. SH 의 `SharedPage` 는 메모리 소스(`ephemeral: true`)를 넘긴다. `ReviewPage` 는 Dexie 직접(공유 보기에 없음).

### 3.6 저장소 (`src/core/repo.ts`, SH 소유)
있음: `markTreeDeleted` `restoreTree` `purgeDeletedTrees(treeId?)` `listTrees`(deletedAt 필터) `childrenOf`((order,id) 정렬). SH 추가: `copyTree(shared: SharedTree): Promise<Tree>`(id 재발급·private·`sourceTreeId`), `setVisibility(treeId, v)`(mock slug 발급·회수). LM 의 `TreeListPage` 는 `markTreeDeleted`/`restoreTree`/`purgeDeletedTrees` 를 호출한다(앱 시작 시 `purgeDeletedTrees()` 1회는 `TreeListPage` 마운트에서).

### 3.7 E2E 가 의존하는 접근 가능한 이름 (바꾸지 말 것)
`getByLabel`: 새 트리 제목 · 트리 이름 · 개요 텍스트 · 노드 제목 · 패널 제목 · 패널 내용 · 노드 내용 · 평가 집계 · 배율 · 미니맵 · 원본 트리 · `<제목> 아래 빈칸`. `getByRole('button', {name})`: 선택 노드의 자식으로 추가 · 알음 · 모름 · 채점 · 확대 · 화면 맞춤 · 형광펜 분홍 · 처음부터 다시 · 요약 · 실행 취소 · `다음 개념 →` · `+ 내용`. `getByRole('link', {name:'편집'})`, `getByRole('tree')`, `getByRole('list', {name:'하위 개념'})`, `getByRole('navigation', {name:'현재 위치'})`. 셀렉터: `.node-row[data-node-id]` `button[data-concept-id]` `[data-card]` `[data-drop="tray"]` `li[data-tree-id]` `li[data-node-id]` `p[role=status][data-total]` `.node-note mark.hl-p` `.node-note .ln.b` `.flash-concept-title` `.toast` `.dnd-canvas button.dnd-node.root` `.w-handle.r` `figure[aria-label=미니맵] g.mm-node[aria-current=location]`. 보이는 글자를 줄일 때는 `aria-label` 로 위 이름을 유지한다.

## 4. 작업 분할 (1차 병렬 5명 → 2차 QA 1명)

| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 | 포트 |
|---|---|---|---|---|---|
| **DS** 디자인 시스템 | U1~U4, U12 기준선 | `src/index.css`, `src/ui/**`(icons 재생성 포함), `src/core/avatar.ts`, `src/features/Toast.tsx`, `src/features/TreeHeader.tsx`, `src/features/tree-header.css`, `index.html`, `vite.config.ts`, `public/fonts/**`, `public/favicon.svg`, `docs/specs/evidence/ds/bundle.md`, `docs/plans/agent_DS_ui.md` | 나머지 전부 | — | 8021 |
| **LM** 목록·에디터·키보드 | U5~U7 | `src/features/editor/**`, `src/features/viewport.ts`, `docs/plans/agent_LM_ui.md` | `src/ui/**`(계약 §3.2 이름으로 import), `src/features/share/*`(스텁 props) | — | 8022 |
| **LS** 학습 화면 | U8 | `src/features/flash/**`, `src/features/dnd/**`, `docs/plans/agent_LS_ui.md` | `src/core/source.ts`, `src/ui/**` | — | 8023 |
| **AA** 계정·관리자 | U9·U10 | `src/features/account/**`, `src/features/admin/**`, `src/core/api.ts`, `src/core/mock/me.ts`, `src/core/mock/admin.ts`, `src/core/inapp.ts`, `docs/plans/agent_AA_ui.md` | `src/ui/**`, `src/core/mock/sync.ts` | — | 8024 |
| **SH** 공유·동기화 UI | U11 | `src/features/share/**`, `src/core/repo.ts`, `src/core/mock/sync.ts`, `src/core/mock/shared.ts`, `docs/plans/agent_SH_ui.md` | `src/core/source.ts`, `src/features/flash/*`·`dnd/*`(prop 시그니처만), `src/ui/**` | — | 8025 |
| **QA** (2차) | 10화면 × 390/1440 × 라이트/다크 스크린샷, 스펙 대조, 접근성 이름, 예산 | `docs/specs/evidence/ui/**`, `docs/plans/agent_QA_ui.md`, `docs/specs/06_ui_qa.md` | 전부 | 1차 머지 | 8026 |

공용 파일 처리: `App.tsx` `router.ts` `types.ts` `source.ts` 는 오케스트레이터가 groundwork 로 끝냈다. 워커가 바꿔야 하면 **멈추고 보고**. `src/core/srs/**` `events.ts` `db.ts` `outline.ts` 는 이번 단계 수정 금지.
DS 의 스타일이 머지되기 전까지 다른 워커는 계약 §3.2 의 클래스·컴포넌트 이름을 믿고 쓴다(스텁이 있어 빌드는 통과). 모양이 안 맞는 부분은 2차 QA 가 잡는다.

## 5. 머지 순서와 통합 검증

1. DS → 2. LS → 3. LM → 4. SH → 5. AA (충돌 가능 지점: 없음 — 파일 배타. 스텁 교체는 소유자 파일이라 자동).
2. 머지마다 `npm run typecheck && npm run lint && npm run check && npm run build`. 전부 끝나면 오케스트레이터가 **E2E 1회**(13개; 라벨 변경으로 깨지면 셀렉터를 §3.7 기준으로 고친다) + `bundle.md` 재측정 + 10화면 수동 확인(dev 서버 4173 preview).
3. 2차 QA 워커 → 결함 목록 → 오케스트레이터가 `send` 로 소유 워커에게 수정 지시(3차) 또는 직접 소규모 수정.

## 6. 결과

(통합 후 기록)

## 진행 기록

- groundwork: 토큰 교체·라우터·타입·`api.ts`·mock 스토어 2개·`source.ts`·`repo.ts` 소프트 삭제·아이콘 테이블 58개·`Icon`·스텁 10개·`App.tsx`. typecheck 0 / lint 0 / build OK(precache 43개 499.65 KiB) / E2E 13/13.
- 1차 dispatch(2026-11-08, 시작 커밋 15b037c): DS ctx_cfe8e7694d3e(agent-DS-ui) · LM ctx_7f1171a3bb43(agent-LM-ui) · LS ctx_8b1293f83036(agent-LS-ui) · AA ctx_c095f6cf24fc(agent-AA-ui) · SH ctx_c327d2e7bf6a(agent-SH-ui). 지시 원문은 오케스트레이터 scratch `specs/spec_ui_*.txt`.
- 1차 중단(2026-11-08 17:35): 5명 모두 사용량 한도로 멈춤. LM 은 완료 후 멈춤(4커밋) → **머지 086ddfa**(typecheck·lint·check·build 통과, precache 44개 505.35 KiB). DS·LS·AA·SH 는 미커밋 작업 상태에서 계정 교체 후 `send` 로 재개: DS ctx_32671d6d5d39 · LS ctx_8cf28e1fb056 · AA ctx_5c16b1d7f06f · SH ctx_25d0ba95114a.
- LM 미결: `hint('editor')` 2줄 주석(DS `hint` 머지 후 해제), `:root[data-kb] .toasts` 규칙은 DS 지시에 포함됨, `data-miss` 는 heat 유지 + 정수 miss prop 추가.
