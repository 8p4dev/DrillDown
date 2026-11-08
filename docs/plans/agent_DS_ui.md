# 에이전트 DS — 디자인 시스템 구현 (UI-First 1단계, U1~U4 · U12 기준선)

작성 2026-11-08. 상위: `docs/plans/orchestration_ui_first.md` §1 U1~U4, §3.2, §4 DS 행. 설계: `docs/specs/01_design_system.md`, `02_layout_mobile.md` §3.1·§3.2 규칙 4(a)·§3.5·§3.6. 시작 커밋 15b037c. dev 포트 8021.

## 접근 방식

- **CSS 는 index.css 한 파일에 전부**(툴팁·시트·2단계 버튼·세그먼트·아바타·빈 상태 포함). 파일을 쪼개면 청크마다 CSS 요청이 늘고 합계 예산(≤ 44 KB)만 중요하다. 토큰 블록(이미 교체됨)은 손대지 않고 그 아래를 다시 쓴다. `--accent`/`--accent-soft` 별칭은 토큰 블록에 남아 있으니(오케스트레이터 소유 블록) 내 규칙에서만 0건으로 만든다.
- **테마**: `useSyncExternalStore` 하나. 스토어 = localStorage `theme`. 구독은 `storage` + `matchMedia change`. DOM 동기화(`data-theme`·`meta[theme-color]`)는 스냅샷 계산 뒤 모듈 레벨 함수 `apply()` 가 한다. 부팅 스크립트는 01 §3.7 코드 그대로 `index.html` 에.
- **툴팁**: 전역 1개(`<TooltipLayer/>`). `document` 에 위임 리스너 4개(pointerdown/pointerup/pointercancel, mouseover/mouseout, focusin/focusout). 버블 1개를 `position: fixed` 로 두고 `getBoundingClientRect` 로 위/아래·좌우 클램프. CSS `::after` 호버 버전은 쓰지 않는다(터치·클램프 때문에 JS 가 필요하므로 한 경로만).
- **2단계 버튼**: 로컬 상태 `armed` + 3초 타이머. `pauseWhileFocused` ref 요소에 포커스가 있으면 타이머를 멈춘다(focusin/out 감시). 글자 교차 페이드는 CSS 로.
- **시트**: `<dialog>` 대신 `role=dialog` div(바닥 고정 + `--kb`). 바깥 탭은 backdrop div 클릭, Esc 는 keydown. 포커스는 열릴 때 첫 포커스 가능 요소로, 닫힐 때 원래 요소로.
- **토스트**: 큐 1개(동시 1개). 힌트는 같은 큐에 `kind: 'hint'` 로 들어가되 우선 처리되고, 떠 있는 동안 일반 토스트는 대기. `hint:<id>` 가 localStorage 에 있으면 무시.
- **트리 헤더**: 탭을 아이콘+짧은 글자로, `aria-label` 은 현재 라벨 유지. 헤더 높이는 `ResizeObserver` 1개로 `--tree-head-h` 에 쓴다(실측이 고정값보다 정확: 제목 줄바꿈·도구 유무).
- **폰트**: jsDelivr 에서 공식 서브셋 2개(Regular·Bold)와 LICENSE 를 받아 `public/fonts/` 에. `@font-face` 2개(`font-display: optional`, unicode-range 없음 — 지시). preload Regular 만. `tnum` 은 `.badge`·표·배율 숫자에만.
- 검토한 대안: 툴팁을 CSS-only `::after` 로(터치 길게 누르기·뒤집기·클램프 불가 → 기각), 시트를 `<dialog showModal>` 로(top-layer 가 `--kb` 와 토스트 z 순서를 흔들고 body 스크롤 잠금이 생김 → 기각), 헤더 높이를 고정 계산으로(제목 줄바꿈 시 틀림 → RO 1개가 더 작음).

## 수정/생성 파일 (plan §4 DS 소유 안)

- `src/index.css` 전면 정리(토큰 블록 제외)
- `src/ui/theme.ts` 신규 · `src/ui/ThemeToggle.tsx` 교체
- `src/ui/Tooltip.tsx` 신규(`TooltipLayer`) · `src/ui/TwoStep.tsx` · `src/ui/Avatar.tsx` · `src/ui/Sheet.tsx` · `src/ui/Hint.tsx`(= Toast 의 `hint` 재수출, U3 목록 이름 충족)
- `src/features/Toast.tsx` 재작성(동시 1개·큐·hint)
- `src/features/TreeHeader.tsx` · `src/features/tree-header.css`
- `index.html` · `vite.config.ts`
- `public/fonts/Pretendard-Regular.subset.woff2` · `Pretendard-Bold.subset.woff2` · `OFL.txt`
- `docs/specs/evidence/ds/bundle.md` "현재" 열 · `docs/specs/evidence/ui/ds/*.jpg`(≤ 6장)
- 이 파일
- **소유 밖 요청**: `src/App.tsx` 에 `<TooltipLayer/>` 1줄(오케스트레이터에게 ask). `editor.css:226` 의 `7rem` → `var(--tree-head-h)` 는 LM 소유(완료 보고에 요청으로 적음).

## 단계별 작업

- [x] 0. plan 작성
- [x] 1. index.css: 기본(링크·포커스·selection·checkbox), 상단 바(브랜드 마크·활성 밑줄·coarse 44·safe-t), 버튼 6종, 입력, 표(sticky th), `.card`, `.badge`, `.seg`, `.avatar[data-tone]`, `.empty`, `.c-*`, keyframes, `.route-loading`, 토스트, `.tip`, `.two-step`, `.sheet`, 메뉴 `.menu`
- [x] 2. `theme.ts` + `ThemeToggle.tsx` + `index.html`(meta 1개·부팅 스크립트·preload·color-scheme 삭제) + `vite.config.ts`(manifest 색·globIgnores·navigateFallbackDenylist)
- [x] 3. `Tooltip.tsx`(`TooltipLayer`) — 오케스트레이터에게 App.tsx 1줄 ask
- [x] 4. `TwoStep.tsx` · `Avatar.tsx` · `Sheet.tsx` · `Hint.tsx`
- [x] 5. `Toast.tsx`: 동시 1개 큐 · `toast(text, action?, ms)` 유지 · `hint(id, text, icon?)` · 되돌리기 아이콘
- [x] 6. `TreeHeader.tsx` + css: 아이콘+짧은 글자, aria 유지, 44px, `--tree-head-h`
- [x] 7. 폰트 2개 + OFL.txt 다운로드, `@font-face`, preload, 스택, `tnum`
- [x] 8. 아이콘: 추가 필요 없음(기존 58개로 충분). `Icon` size 64 이미 있음
- [x] 9. typecheck · lint · check · build 통과, grep 금지 패턴 0건
- [x] 10. Playwright 임시 스크립트: 테마 E2E (1)(2)(4)(5)(7), 스크린샷 6장(목록·에디터·플래시 × 390/1440, 라이트/다크 섞어), `contrast.mjs` 재실행
- [x] 11. `bundle.md` 현재 열 갱신(폰트 precache 제외 확인)
- [x] 12. 커밋, worker_done

## 검증 방법

| 단계 | 확인 |
|---|---|
| 1 | `npm run build` 통과 + `grep -E "var\(--accent|--shadow|--warn|ease-spring|pulse-ring|spring-in|backdrop-filter|border-radius: *(999|50%|[3-9]px|1[0-9]px)" src/index.css src/ui src/features/Toast.tsx src/features/TreeHeader.tsx src/features/tree-header.css` 0건 |
| 2 | Playwright: 01 §3.7 (1)(2)(4)(5)(7) — `--bg` 계산값·`data-theme`·localStorage·meta content·`aria-pressed` 1칸 |
| 3 | dev 서버에서 `[data-tip]` 버튼 hover 400ms 뒤 `.tip` 1개, 상단 60px 안이면 `data-tip-pos=below` |
| 4~6 | typecheck + 스크린샷 육안 |
| 7 | `ls -l public/fonts` ≈ 536 KB, `document.fonts.check('15px Pretendard')`, build 의 precache 목록에 fonts 없음 |
| 9 | `npm run typecheck && npm run lint && npm run check && npm run build` |
| 11 | vite 출력에서 JS·CSS 합산, precache 수치 |

## 측정 결과 (10단계, Playwright + Edge, dev 8021, 임시 스크립트 — 커밋 안 함)

| 항목 | 결과 |
|---|---|
| 01 §3.7 (1) 저장값 없음 + dark 에뮬레이션 | `data-theme` 없음, `--bg` rgb(18,18,18), meta `#121212` — PASS |
| (2) 다크 칸 클릭 | `data-theme=dark`, localStorage `theme=dark`, meta `#121212` — PASS |
| (3) 새로고침 직후 | `html[data-theme=dark]` 유지(부팅 스크립트) — PASS |
| (4) 자동 칸 | 속성 제거·키 삭제 — PASS |
| (5) auto + light 에뮬레이션 | `--bg` rgb(244,244,244), meta `#f4f4f4` — PASS |
| (6) light 고정 + dark 에뮬레이션 | 변화 없음 — PASS |
| (7) `aria-pressed` | 정확히 1칸 true — PASS |
| 폰트 | `document.fonts.check('15px Pretendard')` true, `[Pretendard 400 loaded, Pretendard 600-800 loaded]` |
| 접근성 이름 | 아이콘 전용 컨트롤 `aria-label` 누락 0, 모드 탭 aria `편집/플래시카드/빈칸 퀴즈/백지 퀴즈` 유지, 테마 칸 `data-tip` 3개 |
| 크기 | 상단 바 390: 48px · 테마 칸 32px · 모드 탭 1440: 36px, 390: 44px · `--tree-head-h` 1440: 38px(에디터, margin 0), 390: 119px |
| 대비 | `contrast.mjs` 재실행 FAIL 0건, `contrast.md` 변경 없음(토큰 동일) |
| 스크린샷 | `docs/specs/evidence/ui/ds/` list-390-light · list-1440-dark · editor-390-dark · editor-1440-light · flash-390-light · flash-1440-dark (jpg q70, 12~69 KB) |
| 예산 | `bundle.md` 재측정 절 참조: 첫 화면 gzip ≈ 118.3 KB, CSS 54.6 KB(index 16.0), precache 507 KiB, 폰트 precache 0 |

툴팁 버블(`TooltipLayer`)은 App.tsx 에 아직 마운트되지 않아(오케스트레이터 소유) 속성만 검증했다. 마운트 뒤 호버 400ms·길게 누르기 500ms·`data-tip-pos` 는 QA 에서 확인.

## 변경 사항

- `Hint.tsx` 는 U3 완료 기준의 이름 목록(`Hint`)을 채우기 위한 재수출 파일이다. 힌트 로직은 토스트 큐와 같은 파일(`Toast.tsx`)에 있어야 "힌트가 떠 있는 동안 일반 토스트 대기"가 한 큐로 성립한다.
- 폰트 Bold 는 지시대로 `Pretendard-Bold.subset.woff2`(01 §3.4 는 SemiBold 를 적었으나 지시가 우선). `font-weight` 600~800 요청을 Bold 하나로 받도록 `@font-face { font-weight: 600 800 }` 범위 선언, `font-synthesis: none`.
- `@font-face` 에 `unicode-range` 를 넣지 않았다(지시 "unicode-range 없음").
- `tnum` 은 `font-feature-settings: 'tnum'` 대신 상위 속성 `font-variant-numeric: tabular-nums` 로(`.badge, table, .tnum`). 같은 효과이고 시스템 폰트(기본 등폭)에서도 무해. 배율 숫자(`.zoom-tools`, LM 소유)는 `.tnum` 클래스를 붙이면 된다.
- `.menu` 규칙은 넣지 않았다(계약 §3.2 클래스 목록에 없고 LM `treelist.css` 가 이미 메뉴 스타일을 가짐).
- 1차 스크린샷에서 `.mode-tabs a { min-height: max(36px, var(--tap)) }` 가 `--tap: auto` 에서 무효 선언이 되는 것을 발견 → 36px 고정 + `(pointer: coarse)` 44px 로 수정, `.seg > a/button` 에 `box-sizing: border-box`(패딩 포함 44px).
- 툴팁 CSS 는 `src/ui/Tooltip.css` 가 아니라 `index.css` 에 두었다(CSS 파일 1개 유지, 계약 §3.2 "+css 또는 index.css").

## 2차 — QA 결함 수정 (2026-11-08, `06_ui_qa.md` DS 담당, main e5e9456 머지 후)

| # | 수정 | 확인(Playwright 임시 스크립트, Edge) |
|---|---|---|
| 5 | `:root:has(.sheet) .toasts` 를 `data-kb` 규칙과 합쳐 상단으로 | `.sheet` 주입 시 토스트 rect.top 61px(1440) |
| 6 | coarse 에서 `.toast button::after { inset: -9px 0 }` — 보이는 크기 유지, 표적 26+18 ≥ 44 | 390 coarse: 버튼 위 7px 지점 `elementFromPoint` = 버튼 |
| 7 | `.sheet-head .link { min-height: var(--tap); padding-inline: .5rem }` | coarse 44px, 1440 변화 없음(18px) |
| 11 | reduced-motion 전역 규칙에 `animation-delay: 0s !important; transition-delay: 0s !important` | `animation: rise 1s 300ms` 요소의 계산값 delay 0s |
| 12 | `theme.ts apply()`: `data-theme-switch` 켬 → 테마 바꿈 → `offsetWidth` 로 스타일 확정 → 다음 rAF 에서 끔. `index.css` `:root[data-theme-switch] *… { transition: none !important }` | 상단 바·카드 배경/테두리가 클릭 직후·40ms·300ms 모두 같은 값(보간 0), 속성은 다음 프레임에 제거됨 |
| 15 | `vite.config.ts globIgnores` 에 `'**/AdminPage-*.css'` | `dist/sw.js` 에 `AdminPage` 0건, `fonts/` 0건 |
| 24 | `Avatar` 가 인라인 `--avatar-size` 대신 `data-size`(24·32·36·72) → `.avatar:where([data-size])` 특이성 0 규칙. 화면 CSS 의 `--avatar-size`(SH `.share-avatar` 24px) 가 이긴다 | `data-size=24` → 24px, `data-size=32` + `.share-x{--avatar-size:24px}` → 24px |
| 판정 | 테마 칸 데스크톱 36×32 유지(`flex: none` 추가 — 1px 칸 사이 선 때문에 35.3px 로 줄던 것 수정), coarse 높이 44 | 1440: 36×32, 390 coarse: 44 |

typecheck(`tsc -b` + server) 0 · lint 0 · check 7 ok · build 통과. 머지 후 `npm ci` 필요(서버 의존성 hono).
