# 에이전트 AA — UI-First 구현: 로그인·계정·상단 바 계정 슬롯·배너·MergeDialog·관리자 4탭 (U9 U10)

작성 2026-11-08. 상위 `orchestration_ui_first.md` §1 U9·U10, §4 AA 행. 설계 `03_account_admin.md`, `02_layout_mobile.md` §3.1 로그인·계정·관리자, `01_design_system.md` §3.5·§3.6 #18 #22·§4, `00_overview.md` §2·§6, `evidence/aa/flows.md` §5. 시작 커밋 15b037c. dev 포트 8024.

## 접근 방식

- **서버 0, mock 스토어.** `src/core/mock/me.ts`(세션·세션 목록·공지)·`src/core/mock/admin.ts`(관리자 fixture + 변경 함수) 둘 다 `useSyncExternalStore` 스토어. 로컬 트리는 `repo.ts`(`listTrees`·`restoreTree`)·`db.trees`(휴지통 읽기만).
- **DS 공용 컴포넌트 부재 대응(변경 사항 1).** 계약 §3.2 의 `src/ui/TwoStep`·`Avatar`·`Sheet`·`Toast.hint` 가 groundwork 에도 DS 워크트리에도 아직 없다 → `src/features/account/ds-shim.tsx`(+`ds-shim.css`) 1개에 **계약 시그니처 그대로** 구현하고 내 화면은 shim 에서만 import 한다. DS 머지 뒤에는 shim 2파일 삭제 + import 경로를 `../../ui/*`·`../Toast` 로 바꾸면 끝(파일 머리에 적어 둔다). 클래스 이름(`.avatar[data-tone]` `.two-step` `.sheet`)은 계약과 같게 둬서 DS CSS 가 들어오면 그대로 입혀진다.
- **관리자 사유 입력(I14) 표시**: TwoStep 에 prop 을 더하지 않고(계약 유지) 2단계 버튼을 감싼 요소의 `onClickCapture` 로 "1탭" 을 감지해 사유 input 을 보인다. 타이머 정지는 계약의 `pauseWhileFocused` ref.
- **MergeDialog 트리거**: 로그인 화면은 로그인 직후 이동해 언마운트되므로, 항상 떠 있는 `NavUser` 가 `me.user.id` 변화를 보고 세션당 1회(`sessionStorage merge:<id>`) 띄운다. 대화 컴포넌트는 lazy.
- **배너**: `Banners.tsx` 는 만들되 App.tsx 는 못 고치므로 `AccountPage`·`AdminPage` 상단에서만 렌더. 오케스트레이터에게 `<Banners/>` 1줄 추가 요청.
- 대안·트레이드오프: (a) DS 컴포넌트를 기다리며 `ask` 로 멈추기 → 전 작업이 막힘, 머지 순서상 DS 가 먼저 들어오므로 shim 이 더 싸다. (b) 관리자 탭을 파일 4개로 분리 → 공유 로직(표→카드·행 동작)이 작아 1파일 + CSS 1개로 둔다(≈500줄 넘으면 분리). (c) 전체 백업 JSON(`exportAll`) → `events.ts` 수정 금지라 범위 밖, `exportEvents()` 그대로.

## 수정/생성 파일

| 파일 | 작업 |
|---|---|
| `docs/plans/agent_AA_ui.md` | 이 문서 |
| `src/core/api.ts` | `AdminTree.deleted_at?` 추가(삭제 트리 복구 목록용). 이름 변경 없음 |
| `src/core/inapp.ts` (신규) | `INAPP_RE` 1개, `isInApp(ua?)` `isIOS(ua?)` `chromeIntentHref()` |
| `src/core/mock/me.ts` | 기존 시그니처 유지 + `mockServerTreeCount=2`, `useSessions()` `mockSessions()` `revokeSession(id6)` `revokeOtherSessions()`, `getLastLoginAt()` |
| `src/core/mock/admin.ts` (신규) | fixture(통계·사용자 50·공개 트리 12·신고 5·감사 30·설정) + `suspendUser unsuspendUser deleteUser hideTree unhideTree restoreTree resolveReport putSettings` + `useAdmin()` |
| `src/features/account/ds-shim.tsx` `ds-shim.css` (신규, 임시) | `TwoStep` `Avatar` `Sheet` `hint` 계약 구현 |
| `src/features/account/NavUser.tsx` + `nav-user.css` (신규) | 스텁 교체: 비로그인 아이콘/텍스트, 아바타+닉네임, 동기화 점, rise, 힌트, MergeDialog 트리거. 배너 스타일도 이 CSS |
| `src/features/account/Banners.tsx` (신규) | 공지·점검 배너 |
| `src/features/account/MergeDialog.tsx` (신규) | Sheet 기반 1개, L/S 문구 |
| `src/features/account/LoginPage.tsx` + `account.css` (신규) | 스텁 교체 |
| `src/features/account/AccountPage.tsx` | 스텁 교체 |
| `src/features/admin/AdminPage.tsx` + `admin.css` (신규) | 스텁 교체, 4탭 |
| `docs/specs/evidence/ui/aa/*.jpg` | 스크린샷 ≤8장, 각 ≤150KB |

소유 범위 밖 수정: 없음. 요청 1건(App.tsx `<Banners/>`)은 완료 보고에 적는다.

## 단계별 작업

- [x] 0. plan 작성, `npm ci`
- [x] 1. `api.ts` 보강, `inapp.ts`, `me.ts` 확장
- [x] 2. `mock/admin.ts` fixture + 변경 함수 + `useAdmin`
- [x] 3. `ds-shim.tsx/.css` — TwoStep(3초·Esc·포커스 이탈·pauseWhileFocused·aria-live)·Avatar(toneOf·initialOf·img onerror)·Sheet(`bottom: var(--kb)`)·hint(localStorage `hint:<id>`)
- [x] 4. `NavUser` + `nav-user.css` + `Banners` + `MergeDialog`
- [x] 5. `LoginPage` + `account.css` (브랜드 버튼·인앱 안내·`?e=` 토스트·관리자 데모 링크)
- [x] 6. `AccountPage` (아바타 변경·토글·닉네임 인라인·연결·통계·기기·휴지통·내보내기·로그아웃·체크·TwoStep 탈퇴)
- [x] 7. `AdminPage` + `admin.css` (대시보드 카드·14일 막대 / 사용자 검색·표·정지/삭제 TwoStep+사유 / 공개 트리·신고·복구 / 시스템 공지·점검·감사) — 1440 표 sticky, ≤760 카드
- [x] 8. `npm run typecheck && npm run lint && npm run check && npm run build` 통과, `dist/assets/AdminPage-*.js` 분리 확인, `fetch(` 0건·hex 검사
- [x] 9. 임시 Playwright(scratch): 로그인→계정→닉네임→탈퇴 2단계 타임아웃 복귀 / 관리자 4탭·정지 2단계 + 사유 포커스 3초 유지 / 비관리자 `#/admin`→`#/`; 스크린샷 8장 → `docs/specs/evidence/ui/aa/`
- [x] 10. 커밋(의미 단위) → `worker_done`(Banners 요청 포함 — 재개 지시에서 요청은 worker_done 에 적으라 함)

## 검증 방법

| 단계 | 확인 |
|---|---|
| 1~3 | `npm run typecheck`, `npm run lint` |
| 4~7 | dev 서버 8024 에서 눈으로 + 9 의 Playwright 상태 검사(`location.hash`, 버튼 글자 변화, 3초 뒤 복귀) |
| 8 | 4개 스크립트 종료 코드 0, 경고 0, `ls dist/assets/AdminPage-*.js`, `grep -rn "fetch(" src/features/account src/features/admin src/core/mock src/core/inapp.ts` = 0, hex grep 은 브랜드 색만 |
| 9 | 스크린샷 파일 크기 `≤150KB` |

## 변경 사항

1. **DS shim** (위 접근 방식). 계약 §3.2 의 모듈 경로 대신 `./ds-shim` 에서 import. 머지 시 교체 지점: `NavUser.tsx` `AccountPage.tsx` `MergeDialog.tsx` `AdminPage.tsx` 의 import 1줄씩 + shim 2파일 삭제.
2. **`hint('login', …)`** 도 shim 에 구현(Toast 계약: localStorage `hint:<id>` 1회성). DS `Toast.tsx` 에 `hint` 가 생기면 import 만 바꾼다.
3. **MergeDialog 계정 전환(M3)·커서 만료(M4) 문구** 는 mock 에서 생략.
4. **전체 백업 JSON(`exportAll`)** 범위 밖 — `exportEvents()` 그대로(`events.ts` 수정 금지).
5. **공지 배너는 로그인 사용자에게만** 보인다 — mock `Me` 에 notice 가 실리기 때문(서버 단계에서 anon 도 `GET /api/me` 대신 공개 설정 엔드포인트가 필요하면 그때).

## 결과 (2026-11-08)

- `npm run typecheck` 0 / `lint` 경고 0 / `check` ok / `build` ok — `dist/assets/AdminPage-*.js` + `AdminPage-*.css` 별도 청크. precache 55개 543.88 KiB(폰트 없음 기준).
- 검사: `fetch(` 0건(account·admin·mock·inapp). 하드코딩 hex 는 `account.css` 의 Google/Kakao 버튼 색(`#ffffff #1f1f1f #747775 #f2f2f2 #fee500 #f4dc00`)과 `providers.tsx` 로고뿐. `--accent --shadow --warn ease-spring pulse-ring spring-in backdrop-filter` 0건.
- 임시 Playwright(Edge, scratch, 커밋 안 함) 35개 단언 전부 PASS: 로그인 → 토스트 "로그인됨" → MergeDialog(L=1,S=2 문구) → 계정 닉네임 변경(상단 바 반영) → 탈퇴 2단계 3초 뒤 복귀·2탭 시 로그아웃 → 기기 "다른 기기 모두 로그아웃" → 비관리자 `#/admin`→`#/` / 관리자 데모 로그인 → 대시보드 막대 14개 → 사용자 50명·검색·자기 자신 정지 비활성·정지 1탭 사유 input 표시·사유 포커스 3.5초 뒤에도 armed 유지·2탭 정지 반영 → 공개 트리 11+삭제 1·신고 5 기각·복구 → 시스템 공지 게시 → 배너, 점검 토글 → danger 배너, 감사 로그 추가 → PC `th` sticky(스크롤 600 후 top=52px) / 모바일 카드 / 인앱 UA 에서 Google 비활성 + `intent://` 링크 / `?e=denied` 토스트.
- 스크린샷 8장 `docs/specs/evidence/ui/aa/`: `login-1440-light` `login-390-dark` `account-1440-light` `account-390-dark` `admin-dashboard-1440-light` `admin-dashboard-390-dark` `admin-users-1440-light` `admin-users-390-dark` (각 14~80 KB).
- 발견: `index.css` 의 `table { overflow: hidden }` 은 sticky 헤더를 막는다(표가 스크롤 컨테이너가 됨) → `admin.css` 에서 `.admin table { overflow: visible }` 로 덮었다. DS 가 전역 표 규칙을 손볼 때 참고.
- 미해결: 상단 바 `.nav-login`/`.nav-avatar` 는 index.css 의 `.topnav a`(알약 반경·`--accent-soft`) 규칙을 상속한다 — DS 소유라 안 건드림. 토스트가 동시에 3개 쌓이는 것은 DS Toast(동시 1개) 머지 후 해결. 테마 토글은 DS 스텁 그대로.
