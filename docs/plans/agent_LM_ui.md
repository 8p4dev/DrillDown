# 에이전트 LM plan — 목록·에디터 화면 + 레이아웃·키보드 (U5 U6 U7)

작성 2026-11-08. 상위 plan `docs/plans/orchestration_ui_first.md` §1 U5~U7, §3 계약, §4 LM 행(포트 8022). 설계 입력 `docs/specs/02_layout_mobile.md`(§2 D5~D9, §3.2 I1~I7·공통 규칙, §3.3 계약, §3.5, §3.6, §5(b)), `01_design_system.md` §3.1.1·§3.1.3·§3.3·§3.5·§3.6·§4·§5(b), `04` §3.10, `00` §4·§8. 설계 단계 기록은 `agent_LM_layout.md`(참고만).

## 접근 방식

- **서버 없음**: 목록은 Dexie(`repo.ts` `markTreeDeleted/restoreTree/purgeDeletedTrees`)만, 동기화 상태·공개 배지·공유 시트는 SH 스텁 컴포넌트를 계약 §3.2 이름으로 import.
- **viewport.ts** 는 모듈 상태 1개(`kb/height/open`) + `useSyncExternalStore`. `visualViewport` resize/scroll + `focusin/focusout` 을 rAF 로 합치고 정수가 바뀔 때만 `--kb`·`--vv-h`·`data-kb` 를 쓴다. `ensureVisible` 은 `scrollIntoView({block:'nearest'})` 뒤 보이는 영역(`innerHeight − kb − margin`) 아래면 가장 가까운 스크롤러(없으면 window)를 차액만큼 올린다. 입력칸 `scroll-margin-bottom: calc(var(--kb) + 1rem)` 는 CSS 에 둔다(I4~I6).
- **색**: `--accent`→`--text`, `--accent-soft`→`color-mix(in srgb, var(--text) 8%, transparent)`. 그림자 전부 삭제, 떠 있는 것(메뉴·배율 도구·단축키 시트)은 1px `--border-strong` + `--surface`. 반경 2px/0. 모션은 transform·opacity 만: `spring-in` → 자체 `@keyframes node-in`(scale .96→1 + opacity), `pulse-ring` → `::after` outline 페이드(opacity).
- **아이콘**: `src/ui/Icon` + `icons.ts`(`I.*`: plus download ellipsis pencil trash2 layers squareDashed file link)·`icons.all.ts`(zoomIn zoomOut maximize network keyboard list highlighter eraser clipboardPaste undo2 x chevronDown chevronUp copy).
- **삭제 흐름(D9)**: `confirm()` 삭제 → `markTreeDeleted` → 카드에 `.is-gone`(opacity 0 + scale .98, 200ms) → reload → `toast('"<제목>" 삭제', {되돌리기}, 10000)` + `setTimeout(purgeDeletedTrees(id), 10000)`. 되돌리기 = clearTimeout → `restoreTree` → reload. 마운트 때 `purgeDeletedTrees()` 1회.
- 검토한 대안: (a) 토스트 종료 콜백을 Toast 에 추가 → Toast 는 DS 소유라 불가, setTimeout 으로 대체. (b) 노드 `left/top` 을 transform 으로 → 01 §3.6 예외로 유지. (c) 터치 길게 누르기 끌기 → 범위 밖(지시). (d) heat 배지를 CSS `::after` + `attr()` 로 → `data-miss` 가 heat(소수) 라 숫자 n 이 없음 → NodeRow 에 `miss` prop(정수) 추가하고 TSX 로 그림.

## 수정/생성 파일

- `src/features/viewport.ts` (신규)
- `src/features/editor/TreeListPage.tsx`, `treelist.css`
- `src/features/editor/EditorPage.tsx`, `NodeRow.tsx`, `editor.css` (`GraphView.tsx` 는 변경 필요 없으면 손대지 않음)
- `docs/specs/evidence/ui/lm/*.jpg` (≤8장, ≤150KB)
- `docs/plans/agent_LM_ui.md` (이 파일)
- 읽기만: `src/ui/**`, `src/features/share/*`, `src/features/Toast.tsx`, `src/core/**`, `src/index.css`

## 단계별 작업

- [x] 1. `viewport.ts`: 타입·`startViewport()`·`useVisualViewport()`·`subscribeViewport()`·`ensureVisible()`; `startViewport` 는 1회만 설치
- [x] 2. `TreeListPage.tsx`: 헤더(SyncStatus·download 아이콘), 폼(plus+만들기), 빈 상태 `.empty` 타일(탭→포커스, coarse 자동 포커스 금지), 카드(`.avatar` toneOf/initialOf, VisibilityBadge, ⋯ 메뉴 아이콘+글자 3항목, ShareSheet), 모드 3칸 아이콘+짧은 글자(aria 유지), 소프트 삭제+되돌리기 10초, 마운트 purge, `startViewport()`
- [x] 3. `treelist.css`: accent/shadow/spring/pulse 제거, 빈 상태 타일, 카드 호버 테두리만, `.is-new` rise+outline 페이드, `.is-gone`, 메뉴 1px border-strong, 아바타 5색조 삭제, 반경 2px/0
- [x] 4. `editor.css`: accent 17곳·shadow 5곳·spring·backdrop 삭제, 반경, heat 30/100% + `--card-border: --border-strong`, 루트 2px `--text`, 선택 outline, `.zoom-tools` 직사각 + `:root[data-kb]` 숨김, `.badge::after` 바깥쪽만, `.keys` 2px·그림자 없음·`max-height: calc(70dvh − var(--kb))`, 서식 버튼 44px(모바일), `7rem`→`var(--tree-head-h)`, 불릿 사각, 입력칸 scroll-margin-bottom, `.miss` 배지, chevron 배지
- [x] 5. `NodeRow.tsx`: `miss` prop + `✕n` 배지(x 아이콘+숫자), 접기 배지 chevron 아이콘+숫자, `+ 내용` plus 아이콘(aria `+ 내용` 유지), `.spawn` 클래스 유지(keyframes 교체는 CSS)
- [x] 6. `EditorPage.tsx`: 배율 도구 Lucide, 툴바 Lucide(형광펜 3색 채움), 개요 summary 아이콘, textarea 모바일 rows 3, 내보낸 textarea → `[복사]` 버튼 + 접힘, `ensureVisible` 호출(startEdit·startNoteEdit·패널 onFocus·카드 제목 입력 포커스), 토스트 문구 ≤20자, 노드 삭제 되돌리기 10초, 키보드 열리면 `.keys` 닫기, `startViewport()`, `hint('editor', …)`(coarse)
- [x] 7. `npm run typecheck && npm run lint && npm run check && npm run build` 통과, 금지 토큰 grep 0건, 접근 가능한 이름 grep 확인
- [x] 8. dev 8022 + 임시 Playwright: `--kb` 주입 4검사 + 스크린샷 8장 → `docs/specs/evidence/ui/lm/`
- [x] 9. 커밋(viewport → 목록 → 에디터 → evidence/plan) 및 worker_done

## 검증 방법

- 1: typecheck + Playwright 에서 `document.documentElement.style.getPropertyValue('--kb')` 가 주입/해제되는지, `ensureVisible` 호출 뒤 활성 입력칸 `rect.bottom ≤ 844 − 336`.
- 2~3: 390/1440 라이트/다크 스크린샷 눈 확인, `confirm(` grep 0, 삭제 → 카드 사라짐 → 토스트 되돌리기 → 카드 복귀(Playwright), `li[data-tree-id]`·`트리 이름`·`편집` 이름 유지.
- 4~6: `grep -rn "var(--accent\|--shadow\|ease-spring\|spring-in\|pulse-ring\|backdrop-filter\|confirm(" src/features/editor` 0건, `--kb` 주입 시 `.zoom-tools` visibility hidden, `.badge` 확장 영역: `elementFromPoint(카드 중심)` 이 카드 자신.
- 7: 네 스크립트 종료 코드 0, lint 경고 0.

## 변경 사항

- `hint('editor', …)`: DS `src/features/Toast.tsx` 가 아직 `hint` 를 내보내지 않아 import 와 호출 두 줄을 주석으로 둠(`EditorPage.tsx`). DS 머지 뒤 오케스트레이터가 푼다.
- `data-miss` 는 E2E(`modes.spec`)가 heat 값(0.25)을 기대하므로 그대로 두고, ✕n 배지는 `NodeRow` 에 정수 `miss` prop 을 추가해 그린다(`srs.get(id)?.miss`).
- 터치 길게 누르기 끌기(02 §5(b) NodeRow 제안)는 지시대로 하지 않음(범위 밖).
- 토스트 종료 콜백이 Toast API 에 없어 트리 purge 는 10초 `setTimeout` 으로 처리(되돌리기 시 clearTimeout). `.toasts` 의 `:root[data-kb]` 상단 이동 규칙은 DS 소유 `index.css` 행이라 넣지 않음(검사 (2) 는 현재 FAIL 로 기록 — DS 적용 뒤 PASS 기대).
- `.tree-top .avatar` 에 크기·정렬만(색·톤 없음) 두어 DS `.avatar[data-tone]` 머지 전에도 카드 레이아웃이 유지되게 함.
- `ensureVisible` 은 `focusin` 전역 리스너가 모든 입력칸에 적용하고, `startEdit`(NodeRow 레이아웃 이펙트)·패널 제목 `onFocus` 는 명시 호출을 더함. 시각 뷰포트 축소는 Playwright 로 흉내낼 수 없어 ensureVisible 검사는 뷰포트 높이 508 로 대신함.
- 카드 ⋯ 메뉴 `title` 속성은 `data-tip` 로 교체(툴팁은 DS `Tooltip`).

## 검증 결과 (2026-11-08, dev 8022, Edge, 임시 스크립트 — 커밋 안 함)

- typecheck 0 / lint 0 / check 6 ok / build OK(precache 44개 505 KiB). 금지 토큰 `confirm( var(--accent --shadow ease-spring spring-in pulse-ring backdrop-filter` 0건.
- 자동 검사 29건 중 27 PASS. FAIL 2건은 모두 `:root[data-kb] .toasts` 상단 이동(DS index.css 미적용) — 의도된 기록.
  - D8: coarse 빈 상태 자동 포커스 없음, 타일 탭 → 입력 포커스.
  - 삭제 → 카드 사라짐 → 되돌리기 토스트 → 복귀; 새로고침 뒤 마운트 purge 로 소프트 삭제 트리 사라짐. `dialog` 이벤트 0.
  - `--kb: 336px` + `data-kb`: `.zoom-tools` hidden(390·1440), `.keys max-height` 254.8px(= 70dvh − 336), 패널 입력 `scroll-margin-bottom` 351px(= kb + 1rem).
  - 뷰포트 508: 패널 제목 492 / 패널 내용 354 / 개요 텍스트 471 / 카드 제목(startEdit) 345 — 모두 ≤ 508.
  - 카드 중심(하단 10px 위) `elementFromPoint` = 카드 자신(배지 아님), 390·1440.
- 스크린샷 7장 `docs/specs/evidence/ui/lm/`: trees-empty-390-light(12KB) trees-390-dark(18KB) trees-1440-light(29KB, ⋯ 메뉴 열림) editor-390-light(24KB) editor-390-dark(23KB) editor-1440-light(68KB) editor-1440-dark(66KB).
- 눈으로 확인한 것: 아바타는 DS `.avatar[data-tone]` 전이라 글자만 보임(예상). 트리 헤더 탭은 DS `TreeHeader` 전이라 캡슐 모양 그대로(예상). 그 외 와이어와 일치.

## 다른 워커에게 요청

- DS: `index.css` 에 `:root[data-kb] .toasts { top: calc(var(--nav-h) + .6rem + var(--safe-t)); bottom: auto }` 와 `.toasts { bottom: calc(1.25rem + var(--safe-b) + var(--kb)) }`(02 §3.2 규칙 5). `Toast.tsx` `hint(id, text)` export. `.avatar[data-tone]` 색.
- SH: `SyncStatus` 는 `.trees-head` 안 h1 오른쪽(44px 표적) 자리에 들어감 — 컨테이너는 flex, 별도 래퍼 없음. `VisibilityBadge` 는 제목 오른쪽 ⋯ 앞(`.tree-top .vis-badge` 가 세로 중앙 정렬만 함).
