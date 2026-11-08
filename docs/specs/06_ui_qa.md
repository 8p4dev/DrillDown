# 06 — UI-First 통합 검수 (QA 2차)

작성 2026-11-08, 에이전트 QA. 대상 커밋 1118774(1차 5명 머지, E2E 13/13). `npm run build` → `vite preview --port 8026`(dist), Edge(`channel: 'msedge'`), Playwright 임시 스크립트(커밋 안 함). 컨텍스트 4개: 390×844(`isMobile`·`hasTouch`·DPR 2) / 1440×900 × 라이트/다크(`colorScheme`), `reducedMotion: 'reduce'`. 데이터는 앱 안에서 만들었다: 새 트리 "노동법" → 개요 9줄 가져오기 → 플래시 알음·모름 → 복습 → 빈칸 2장 놓고 채점 → 백지 1장 놓고 채점 → `/t/3fK9pQ2xT7m` 4탭·신고 시트 → 갤러리 → 로그인(Google mock) → 병합 대화 → 계정 → 목록(로그인)·공유 시트 → 관리자 데모 로그인 → 관리자 4탭. 컨텍스트당 26장, 총 104장 촬영, 그중 48장을 `evidence/ui/qa/` 에 커밋.

## 1. 요약

| 심각도 | 건수 |
|---|---|
| 높음 | 1 |
| 중간 | 14 |
| 낮음 | 9 |

판정: **조건부 통과**. 화면 10개(+갤러리)가 4조합 모두 그려지고 동작한다. 아이콘 전용 컨트롤의 이름 누락 0, 가로 넘침 0, 토큰 밖 색 0, 그림자·backdrop 0, `--kb` 주입 검사 6/6, 테마 상태 기계·FOUC 통과, 공유 보기 `srs` 무변경. 막는 것은 높음 1건(모바일 플래시 미니맵 셰브론이 거대하게 그려짐)이다. 예산은 첫 화면 gzip(130.4 KB > 120)과 CSS 합계(68.9 KB > 44)가 넘는다.

## 2. 결함 표

담당은 `orchestration_ui_first.md` §4 소유 파일 기준.

| # | 심각도 | 화면·폭·테마 | 문제 | 근거 | 수정 제안 | 담당 |
|---|---|---|---|---|---|---|
| 1 | 높음 | 플래시(내 트리·공유 보기) · 390 · 라이트/다크 | 접힌 미니맵 띠 위에 셰브론 아이콘이 폭 100%(≈100px 높이)로 그려져 미니맵을 덮는다. `.minimap svg { width: 100%; height: auto; max-height: 260px }`(`flash.css:122`)가 `.minimap-toggle` 안의 `Icon` svg 에도 걸린다 | `shared-flash-390-dark.jpg`, `flash-390-light.jpg`. 01 §3.3 미니맵 행, 01 §3.5 "미니맵 접기/펼치기 아이콘 전용" | 선택자를 `.minimap > svg` 로 좁히거나 `.minimap-toggle svg { width: 16px; height: 16px }` | LS |
| 2 | 중간 | 상단 바 · 전 화면 · 전 조합 | 오늘 복습 due 배지(`•n`)가 없다. 복습 목록에 "노동법 1개"가 있는데 상단 `복습`/`오늘의 복습` 옆에 숫자가 없다 | `review-390-light.jpg`. 01 §3.5 상단 "오늘의 복습" 행, 02 §3.1 결정된 상단 바(`dueByTree()` 합계) | `App.tsx` 복습 링크 안에 `<span className="badge">{n}</span>`(0이면 숨김), 데이터 `dueByTree()` 합 | 오케스트레이터 |
| 3 | 중간 | 공유 보기 · 390 · 비로그인·로컬 트리 0개 | 상단 바 `내 트리` 가 보인다(새 컨텍스트에서 `/t/3fK9pQ2xT7m` 진입, `isVisible()` = true) | 02 §3.1 "공유 보기(anon)에서도 같은 바, 단 `내 트리`는 비로그인·로컬 트리 0개면 숨김" | `App.tsx` 에 `inShared && !me && 로컬 트리 0` 조건. App.tsx 주석은 "LM/SH 가 조건을 넣는다"인데 파일은 오케스트레이터 소유 | 오케스트레이터 |
| 4 | 중간 | 빈칸·백지(내 트리·공유) · 전 폭 · 전 테마 | 채점 뒤 캔버스 위 결과 마크가 틀렸다. 채운 슬롯(정답 `근로조건명시`, 오답 `통상임금`)에는 ✓/✕ 가 안 보이고, 빈 슬롯의 ✕ 는 슬롯 **바깥** 오른쪽 위에 회색으로 그려진다. 트레이 카드의 ✕ 는 정상 | `dnd-1440-light.jpg`, `dnd-390-dark.jpg`, `blank-1440-dark.jpg`. 01 §3.3 D&D 슬롯 행(정답 ok 실선 + ✓ / 오답 danger dashed + ✕), §3.6 #10 | `.dnd-mark`(absolute) 의 기준 요소가 없다 — `.dnd-slot`·`.dnd-slot > .dnd-card` 에 `position: relative`. 캔버스 카드 `overflow: hidden` 이 마크를 자르는지도 확인 | LS |
| 5 | 중간 | 병합 대화·공유 시트 · 390·1440 · 전 테마 | 토스트가 열린 하단 시트 **위에** 겹쳐 시트 버튼을 가린다("로그인됨"이 공유 시트 `링크` 칸을, "로그인됨/저장됨"이 병합 대화 버튼 줄을 덮음). 토스트 z 100 > 시트 z 91, 둘 다 하단 중앙 | `merge-390-dark.jpg`, `share-sheet-1440-light.jpg`. 02 §3.2 규칙 4(a)·5, 02 §3.5 토스트 행("하단 바를 밀어 올리지 않게") | 시트가 열린 동안 토스트를 상단으로: `:root:has(.sheet) .toasts { top: calc(var(--nav-h) + .6rem + var(--safe-t)); bottom: auto }`(이미 있는 `data-kb` 규칙과 같은 꼴) | DS |
| 6 | 중간 | 토스트 · 390 coarse | 토스트 행동 버튼(`실행 취소`·`되돌리기`·`확인`) 높이 26~27px. `.toast button { min-height: 0 }`(`index.css:236`) | 자동 검사 (b): `실행 취소` 99×27, `확인` 47×26. 02 §3.6 44px | coarse 에서 `min-height: var(--tap)` 또는 `::after` 로 표적만 44 | DS |
| 7 | 중간 | 시트 · 390 coarse | 시트 머리의 `닫기`(`.link`) 26×18 | 자동 검사 (b) `share-report`·`share-sheet`. 02 §3.6 | `.sheet-head .link` 에 `min-height: var(--tap); padding-inline` 또는 아이콘 전용 `x`(aria `닫기`) | SH(마크업)·DS(`.sheet-head`) |
| 8 | 중간 | 관리자 사용자·공개 트리 · 390 coarse | 모바일 카드의 2단계 버튼(`정지`·`삭제`·`숨김`·`해제`) 75×32 | 자동 검사 (b) `admin-users` 104건 중 100건이 이 버튼. 02 §3.1 관리자 390 와이어(`[정지] [삭제]` 44) | `admin.css` 의 ≤760 카드에서 `td.act button { min-height: var(--tap) }` | AA |
| 9 | 중간 | 공유 보기 4탭 · 전 폭 · 전 테마 | 모드 탭 글자에 밑줄이 그려진다(`a` 기본 밑줄). 내 트리의 `TreeHeader` 탭에는 없다 | `shared-view-390-light.jpg`, `shared-view-1440-light.jpg`. 01 §3.3 탭(모드) 행 — 밑줄 없음, 선택은 반전 | `.share-tabs a { text-decoration: none }` | SH |
| 10 | 중간 | 공유 보기 보기 탭 · 전 조합 | 와이어는 "읽기 전용 캔버스(배율 도구만)"인데 들여쓰기 목록이다. 01 §4 의 "읽기 전용" 배지(글자)도 없다 | `shared-view-*.jpg`. 02 §3.1 공유 보기 와이어, 01 §4 공유 보기 행. SH plan 접근 방식에 목록 선택이 기록돼 있음(GraphView 는 LM 소유) | (a) 목록 유지를 오케스트레이터가 스펙 변경으로 승인하거나 (b) 3차에서 `GraphView` 읽기 전용 prop(LM) + SH 연결. 배지는 헤더 제목 옆 `.badge` 1개 | 오케스트레이터 판정 → SH/LM |
| 11 | 중간 | 빈칸·백지 채점 · 전 조합 (reduced-motion) | `prefers-reduced-motion: reduce` 에서도 결과 순차 지연(`--d` 최대 600ms)이 남는다. 450ms 뒤 스크린샷에 트레이 8장 중 4장만 마크가 있다 | `blank-1440-dark.jpg`. 전역 규칙 `index.css:212` 가 duration 만 1ms 로 바꾸고 `animation-delay`·`transition-delay` 는 그대로. 01 §3.6 #10 reduced-motion "순차·shake 없음, 색·마크 즉시" | 전역 규칙에 `animation-delay: 0s !important; transition-delay: 0s !important` 추가(DS), 또는 `dnd.css` 의 `--d` 를 reduce 에서 0 | DS(전역) / LS |
| 12 | 중간 | 테마 토글 · 전 화면 | 테마를 바꾸면 버튼·입력·카드 테두리 색이 120ms 동안 보간된다(`button.primary` 배경 125→217→237, 43·85·126ms 표본). 바탕(`body`)은 즉시라 요소마다 타이밍이 다르다. LS 가 보고한 채점 결과 순차 색 전환(≤600ms)도 같은 원인 | `theme.mjs` 측정. 01 §3.6 #2 "페이지 색 전환 없음(요소마다 타이밍이 달라 얼룩)" | `theme.ts` 의 `apply()` 에서 1프레임 동안 `:root[data-theme-switch] *, *::before, *::after { transition: none !important }` 를 켰다 끄기 | DS |
| 13 | 중간 | 예산 · 첫 화면 | 목록 첫 진입 전송 gzip **130.4 KB**(목표 ≤ 120). 초과 원인과 후보는 §5 | §5 표. 01 §3.8 | §5 후보 | 오케스트레이터(+SH·DS) |
| 14 | 중간 | 예산 · CSS | CSS 합계 **68,891 B**(목표 ≤ 44 KB) | §5 표. 01 §3.8 | §5 후보 | 오케스트레이터(+각 화면 소유자) |
| 15 | 중간 | 예산 · precache | `AdminPage-*.css`(4,018 B)가 precache 에 들어간다. `globIgnores` 패턴이 `**/admin-*.css` 인데 실제 파일명은 `AdminPage-*.css` | `dist/sw.js` 에 `assets/AdminPage-BINheMos.css`. 01 §3.8 "관리자 청크 precache 제외" | `vite.config.ts` `globIgnores` 에 `'**/AdminPage-*.css'` | DS |
| 16 | 낮음 | 에디터 패널 · 390 coarse | `개요 붙여넣기 · 내보내기` summary 높이 26px | 자동 검사 (b). 02 §3.6 | `summary { min-height: var(--tap) }`(coarse) | LM |
| 17 | 낮음 | 로그인 · 390 coarse | `로그인 없이 계속 ›` 107×23, `개인정보` 39×17, `약관` 19×17, `관리자로 로그인(데모)` 97×17 | 자동 검사 (b). 02 §3.6 | 링크 줄 `min-height: var(--tap); display: inline-flex; align-items: center` | AA |
| 18 | 낮음 | 계정·관리자 시스템 · 390 coarse | 토글 체크박스 표적 높이 21~32px(`label.toggle`) | 자동 검사 (b) | `label.toggle { min-height: var(--tap) }` | AA |
| 19 | 낮음 | 플래시 · 390 coarse | `더 들어가기` 배지 49×26, `::after inset -8px` 로 넓혀도 42px | 자동 검사 (b) + `flash.css:75`. 02 §3.6 | `::after { inset: -9px -8px }` 이상 | LS |
| 20 | 낮음 | 관리자 표 상태 점 · 공유 신고 시트 라디오 | `.dot { border-radius: 50% }`(`admin.css:17`, 화면당 50~58개), 신고 사유 라디오 50%(네이티브) | 자동 검사 (e). 01 §3.3 반경 0/2/2 | `.dot` 반경 0(사각 점). 라디오는 `appearance: auto` 네이티브라 예외로 둘지 오케스트레이터 판정 | AA / SH |
| 21 | 낮음 | 공유 보기 · 전 조합 | 공유 보기에서 학습하면 로컬 Dexie `events` 에 행이 남는다(플래시 2평가 + 빈칸 채점 → `events` 0→3, treeId = slug). `srs`·`attempts`·`trees` 는 0 유지 | `ev.mjs` 측정. 04 §3.4.2 "학습 기록은 저장하지 않는다", LS 미결 | `ephemeral` 소스면 `logEvent` 생략(LS `study.ts`) | LS |
| 22 | 낮음 | 관리자 시스템 · 전 조합 | 감사 로그가 오래된 순(11/02 → …)이다 | `admin-system-*.jpg`(커밋 안 함). 03 §3.4 "최근 감사 로그 50건" | 최신순 정렬 | AA |
| 23 | 낮음 | 갤러리 · 전 조합 | 카드 전체가 링크라 제목·작성자·메타 세 줄 모두 밑줄 | `gallery-390-light.jpg`. 01 §3.1.1 링크 = 밑줄(본문 링크 기준) | 카드 링크는 `text-decoration: none`, 제목만 밑줄 또는 호버 테두리 | SH |
| 24 | 낮음 | 공유 보기 헤더 | 소유자 아바타가 32px(SH 의도 24px, `className="share-avatar"` 의 `--avatar-size` 가 적용 안 됨) | 측정 32×32. SH plan 변경 사항 | DS `Avatar` 가 `--avatar-size` 를 읽게 하거나 `size` 에 24 추가 | DS / SH |

판정 보류(결함 아님, 기록만): 테마 칸 36×32(01 §3.7 이 32×36 을 정했고 02 §3.6 의 44 와 충돌 — 오케스트레이터 판정), 상단 바 브랜드 마크 390 에서 23×44(폭만 작음), 에디터 `+ 내용` 표적 ≈ 23×16(02 §3.6 이 "보이는 크기 유지, 바깥쪽 확장"을 허용).

## 3. 화면별 대조표

기호: P = PASS, F = FAIL(결함 #), — = 해당 없음. "와이어" 02 §3.1, "형태" 01 §3.3 상태표, "인벤토리" 01 §3.5, "인터랙션" 01 §3.6, "키보드" 02 §3.2(`--kb: 336px` + `data-kb` 주입, 400ms 뒤 측정).

| 화면 | 와이어 | 형태 | 인벤토리 | 인터랙션 | 키보드 |
|---|---|---|---|---|---|
| 상단 바 | F #2(due 배지) · F #3(공유 anon `내 트리`) · P 390 `[■] 내 트리 복습 [◐][사람]` 48px / 1440 `[■ Drill Down] … [◐][로그인]` | P 활성 밑줄 2px, 테마 칸 반전 | P 브랜드 ≤760 마크만, 비로그인 390 아이콘 / 1440 글자, 로그인 아바타(390)·아바타+닉네임(1440) | P #2 칸 반전 / F #12 색 보간 | — |
| 목록 | P 헤더(h1·동기화·⤓)·폼·카드(아바타·제목·⋯·모드 3칸)·빈 상태 큰 + 타일, 1440 3열 260px | P 카드 surface+border, 메뉴 1px border-strong | P 만들기 아이콘+글자, ⋯ 아이콘, 메뉴 아이콘+글자 3항목, 모드 짧은 글자(aria 유지), 동기화 저장됨=아이콘·오프라인=`1건 대기` | P #13 삭제 토스트(E2E·LM), #14 생성, #17 오프라인→저장됨 | P I1 토스트: 주입 시 top 57(상단 바 아래), 해제 시 bottom 825 |
| 에디터 | P 1440 2단·390 1단, 배율 도구 직사각 | P 루트 2px, 선택 outline, heat(LM 검증) | P 배율 Lucide, 형광펜 3색(D1 기본값), 개요 summary 아이콘+글자 | P #15(LM) | P `.zoom-tools` hidden, `.keys` max-height 254.8px, ensureVisible(뷰포트 508): 패널 제목 bottom 125/347, 개요 텍스트 419/370 ≤ 508 |
| 플래시 | F #1(390 미니맵) · P 1440 2단 + 미니맵 220px, 390 하단 바 60px | P 띠(연두 dashed)·틴트·마크 ✓/✕·결과 버튼 채움 | P 알음/모름 글자+아이콘, ✓N ✕M, 더 들어가기 아이콘+숫자, 다음/요약 아이콘+글자 | P #3 #4 #5 #6 | P `.flash-nav` bottom 508 |
| 복습 | P 목록 카드 2줄(390)·1줄(1440), 세션 진행 막대 | P 막대 `--text`, 반경 0 | P `플래시카드` 아이콘+글자, `복습 시작` 글자 | P | — |
| 빈칸 | P 범위 select(crosshair+네이티브 화살표), 캔버스 좌→우, 390 트레이 시트 + 채점 바 | F #4 캔버스 마크 · P 슬롯 dashed, 오답 danger dashed | P 채점 글자+아이콘, 정답 보기/다시 하기 아이콘+글자, 점수 `1 / 6` 숫자 | P #7~#10 / F #11(reduce 순차) | P `.dnd-bar`(채점 뒤) bottom 508 |
| 백지 | P 내 트리/원본 트리 2열(1440) | F #4 · P 원본 트리 패널 | P | P #11 / F #11(reduce) | P(빈칸과 같음) |
| 로그인 | P 390 상단 1/3(y≈340), 1440 중앙 카드 | P 제공자 버튼 브랜드색 예외·반경 2px·44px | P "Google로 계속/카카오로 계속" 글자 유지 + 로고 | P #18 로그인됨 토스트·아바타 | — (입력 없음) |
| 계정 | P 아바타 72 정사각·닉네임·연결·기기·휴지통·내보내기·로그아웃·탈퇴 맨 아래 | P 탈퇴 danger 테두리 | P 변경/내보내기/로그아웃 아이콘+글자 | P #22 2단계: 1탭 `data-armed` + aria-live "한 번 더 누르면 탈퇴", 3초 뒤 해제 | P I9(닉네임 상단) |
| 관리자 | P 1440 표 + sticky 헤더(스크롤 600 뒤 th top 52), 390 카드, 4탭, 14일 막대 14개 | F #20 상태 점 원형 · P 표 반경 0 | P 정지·삭제·숨김 2단계(글자) | P #22(AA 검증: 사유 포커스 중 타이머 정지) | P I10·I14(AA `scroll-margin-bottom`) |
| 공유 보기 | F #10(목록 vs 캔버스·배지) · P 헤더 제목+소유자+⧉+⋯, 390 보기 탭 하단 복제 바만, 다른 탭은 헤더 ⧉ | F #9 탭 밑줄 | P 복제 아이콘+글자(1440)/아이콘(390 헤더)·바 글자, ⋯ → 신고·링크 복사 | P 복제 → 트리 1·노드 25, 토스트 "복제됨 · 원본이…", 체험 토스트 1회 | P 복제 바 bottom 508, 신고 시트 bottom 508·max-height 460px(=844−336−48), 메모 시트 안 |
| 갤러리 | P 20건, 정렬 2개(세그먼트), 복제 수 | F #23 밑줄 | P 공개 아이콘 globe | — | — |
| 공유 시트·병합 대화 | P 3칸 세그먼트, 비로그인 문구(SH 검증) | F #5 토스트 겹침 | P | — | P 시트 `bottom: var(--kb)` |

## 4. 자동 검사 수치

104장(26 상태 × 4조합) 각각에서 보이는 요소 전수. 스크립트 `qa.mjs`·`kb.mjs`·`theme.mjs`·`ev.mjs`·`misc.mjs`(scratch).

| 검사 | 결과 | 비고 |
|---|---|---|
| (a) 아이콘 전용 컨트롤 접근 이름 누락 | **0** / 상태당 9~113개 컨트롤 | `button, a[href], [role=button|tab|menuitem], summary` 중 보이는 글자·aria-label·labelledby·title 모두 없음. 입력칸 이름 누락도 0 |
| (b) 44px 미만 터치 표적(390 coarse) | 상태당 4~10개(관리자 사용자 104 — 2단계 버튼 100개) | 공통 4개 = 브랜드(23×44)·테마 3칸(36×32). 나머지는 #6~#8 #16~#19. 목록 `a.tree-open`(17px)은 `::after` 로 카드 전체라 제외 |
| (c) 가로 넘침(scrollWidth > innerWidth) | **0** / 104 | |
| (d) 토큰 밖 계산 색 | **0** / 104 | `color`·`background-color`·테두리 4변·outline 을 색상(hue)으로 판정: 무채색 또는 그 테마 `--ok`/`--danger` 색상 ±10°. `mark`·제공자 버튼 제외. 의사요소 포함 |
| (e) `box-shadow` / `backdrop-filter` / 반경 > 2px | 그림자 1(포커스된 `.trees-form` 의 `inset 0 0 0 1px` — 01 §3.1.1 입력 포커스 규칙이라 허용) / backdrop **0** / 반경: `.dot` 50%(관리자), 신고 라디오 50% | #20 |
| (f) 다크 본문·muted 대비 ≥ 4.5 | 토큰 쌍 PASS(DS `contrast.mjs`·이번 재계산 동일). 요소 전수(직접 글자 노드, 조상 배경 합성): 4.5 미만 1종 = 플래시 결과 버튼 `알음`(1.0~1.1) | 측정 오류: 채움이 `::before` `scaleX` 라 조상 배경 합성에 안 잡힘. 스크린샷에서 `--on-fill` 글자가 초록 채움 위로 읽힘(`flash-390-light`, `shared-flash-390-dark`) → PASS |
| (g) 공유 보기 메모리 소스 `srs` 행 수 | 4조합 모두 **무변경**(8→8, 9→9). 빈 DB 에서 `srs` 0→0, `attempts` 0→0, `events` 0→**3**(#21) | 체험 토스트 "체험 중 — 기록은 저장되지 않아요" 1회 |
| (h) 테마 auto→dark→light→auto, FOUC | `data-theme`·localStorage·meta·`aria-pressed` 전부 기대값. auto + 시스템 dark → meta `#121212`, light 고정 + 시스템 dark → 변화 없음. dark 저장 후 새로고침 첫 rAF: `data-theme=dark`, `body` 배경 rgb(18,18,18) → **FOUC 없음** | 색 보간 120ms 는 #12 |
| `--kb` 주입 6건 | `.zoom-tools` hidden · `.flash-nav` 508 · `.dnd-bar` 508 · 복제 바 508 · 신고 시트 508/460px · 토스트 top 57 → **6/6** | 첫 측정은 주입 직후 동기 읽기라 reduce 의 1ms 전환 시작값(844)이 나왔다. 400ms 뒤 재측정값이 위 수치 |
| 툴팁 | 1440 호버 150ms 없음 → 550ms "학습 기록 내보내기" `data-tip-pos=above`; 390 길게 누르기 650ms "더 보기" 표시, 손 떼면 사라짐 | 01 §3.5·02 §3.5 |
| 콘솔 오류·`dialog` | 0 / 0 | `confirm()` 없음 |

## 5. 예산

`npm run build`(이 커밋) + `dist` 파일을 `zlib.gzipSync(level 9)` 로 압축. 첫 화면은 `requestIdleCallback` 을 막아(유휴 프리패치 제외) `/` 진입 → `.trees` 표시 + 1.5초 동안 요청된 파일, 폰트 제외(01 §3.8 폰트는 예산 밖).

| 예산 | 단위 | 목표 | 현재 | 판정 |
|---|---|---|---|---|
| precache | 비압축 KiB | ≤ 600 | **568.58**(55개) | PASS |
| 폰트 precache | — | 0 | 0(`globIgnores fonts/**`) | PASS |
| 관리자 청크 precache 제외 | — | JS·CSS 제외 | JS 제외, CSS 포함(#15) | FAIL |
| 첫 화면 전송(목록) | gzip | ≤ 120 KB | **130,416 B**(favicon 1,485 포함; 빼면 128,931) | FAIL |
| CSS 합계 | 비압축 | ≤ 44 KB | **68,891 B**(9개) | FAIL |
| 의존성 | 개수 | +0 | +0 | PASS |

첫 화면 구성(gzip B): `index-*.js` 68,565 · `repo-*.js` 32,097(Dexie 포함) · `index-*.css` 4,305 · `icons-*.js` 3,735 · `TreeListPage-*.js` 3,706 · `jsx-runtime` 3,329 · **`shared-*.js` 2,980**(mock 공유 데이터, `repo.ts` → `mock/shared.ts` import) · `me-*.js` 2,161 · `share-*.css` 1,648 · `TreeListPage-*.css` 1,542 · favicon 1,485 · 나머지 12개 ≈ 4,900.

줄일 후보(큰 순):
1. `shared-*.js` 2,980 — `setVisibility` 의 `mockIssueSlug` 를 동적 import(SH, 이미 미결로 기록). 
2. `index-*.js` 68.6 KB 안의 앱 셸 코드 중 목록에 필요 없는 것(관리자 프리패치 분기·`Banners`·`NavUser` 의 `MergeDialog` 트리거)을 확인 — `MergeDialog` 는 이미 lazy. `vite build --sourcemap` 으로 구성 측정이 필요(이번엔 안 함).
3. `share-*.css` 1,648 — 목록이 `SyncStatus`·`VisibilityBadge` 때문에 공유 화면 CSS 전체를 받는다. 목록용 규칙만 `treelist.css` 로(SH↔LM).
4. favicon.svg 9,522 B 비압축 — 14px 사각형 마크에 비해 큼(DS).
5. `repo-*.js` 32 KB 는 Dexie 라 줄일 수 없음.
합계 ≈ 6~7 KB 로 목표(120)에 근접하나 확실히 들어가려면 2의 측정이 필요.

CSS 구성(B): `index` 17,386 · `flash` 12,442 · `EditorPage` 12,115 · `useDragDrop`(dnd) 7,819 · `share` 5,894 · `TreeListPage` 5,330 · `AdminPage` 4,018 · `account` 3,186 · `layout` 696. 01 §3.8 의 목표 44 KB 는 기준선 49.6 KB 에서 삭제분 ≈ 6 KB 를 뺀 값이고 신규 화면 3개(계정·관리자·공유) CSS 13.1 KB 를 셈하지 않았다. 후보: 화면별 lazy CSS 는 이미 분리돼 있으므로 "합계"가 아니라 **첫 화면 CSS**(현재 `index`+`TreeListPage`+`share` = 28,610 B)로 예산을 재정의할지 오케스트레이터 판정. 합계를 지키려면 `flash.css`·`editor.css` 의 중복(버튼·세그먼트 재정의)을 DS 공용 클래스로 옮기는 정리가 필요(각 2~3 KB 추정, 미측정).

## 5-1. 1차 워커 미결의 실제 영향

| 워커 미결 | 화면에서 확인한 것 |
|---|---|
| LM `:root[data-kb] .toasts` | 반영됨. 주입 시 토스트 top 57 |
| LM `hint('editor')` | 코드상 해제됨. 화면에서 따로 확인하지 않음(캡처 흐름에서 `확인` 으로 닫음) |
| LS 메모리 소스 IndexedDB 무변경 | `srs` 무변경 PASS, `events` 는 기록됨(#21) |
| LS 테마 전환 시 채점 색 순차 전환 ≤600ms | 재현(원인 같음) → #11·#12 |
| LS 아이콘 자식 공백 | 오케스트레이터가 고침(진행 기록). 이번엔 재확인 안 함 |
| AA 공지 배너 비로그인 미표시 | mock 한계, 화면 결함 아님(서버 단계) |
| AA `table{overflow:hidden}` 과 sticky | 관리자 사용자 표 th sticky 동작(스크롤 600 뒤 top 52). 감사 로그 표는 확인 안 함 |
| AA MergeDialog M3·M4 | 범위 밖. 병합 대화는 계정이 바뀔 때마다(관리자 데모 포함) 1회 뜬다 — mock 의도대로 |
| SH Avatar 24px | 적용 안 됨(32px) → #24 |
| SH 로컬 public 트리 갤러리 미합류 | 확인: 갤러리는 mock 20건만 |
| SH `repo.ts` → `mock/shared` | 첫 화면 gzip 2,980 B 차지 → #13 후보 1 |
| 오케스트레이터 Toast 큐(일반 > 힌트) | 동작: 힌트가 떠 있어도 "로그인됨"·"복제됨" 즉시. 단 시트와의 겹침은 #5 |

## 6. 보지 못한 것

- 실기기: iOS Safari·Chrome Android·PWA standalone 의 실제 키보드(`visualViewport`), 안전 영역, 가로 모드(02 §3.6 D11), iOS 확대 판정(02 §3.2 규칙 1, I3 8px 렌더). `--kb` 는 주입으로만 검사했다.
- 인앱 브라우저 UA(카카오톡) 로그인 화면 — AA 가 UA 위장으로 검증, 이번엔 안 함.
- 스크린 리더 실제 낭독(NVDA·VoiceOver). 접근 이름은 DOM 속성으로만 셌다.
- 폰트 `font-display: optional` 의 첫 방문/재방문 차이·SW 런타임 캐시(다음 단계 범위).
- 300노드 트리 성능, 오래 쓰기(토스트 큐 누적), 다중 탭 테마 동기화(`storage` 이벤트).
- 768px 폭(이번 범위 390·1440 만).
- 커밋한 스크린샷 48장 외 56장(관리자 사용자·공개 트리·시스템의 4조합 일부, 신고 시트, 빈칸/백지 채점 전, 복습 세션 등)은 scratch 에만 있다.

## 증거 파일

`docs/specs/evidence/ui/qa/` 48장(jpg q60, 최대 81 KB): 11화면 × 4조합 = `{list,editor,flash,review,dnd,blank,login,account,admin-dashboard,shared-view,gallery}-{390,1440}-{light,dark}.jpg` 44장 + `admin-users-390-light`(모바일 카드·2단계 버튼) `shared-flash-390-dark`(#1) `share-sheet-1440-light`(#5) `merge-390-dark`(#5).
