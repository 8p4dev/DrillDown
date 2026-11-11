# 워커 WE — 편집기: 아이콘 · 방향별 위치 · 휠 확대 · 화면 맞춤 삭제 · 개요 시트 · 자동 맞춤

오케스트레이션: `docs/plans/orchestration_editor_share.md` §1.2 R2·R3·R4·R5·R6·R8. base `5222a15`. 포트 vite 5362 / 서버 4362. DATA_DIR `.research-data/WE`.

## 접근 방식

- **R2 아이콘**: 자동 정렬 버튼 아이콘만 `sparkles`(icons.all) 로 바꾼다. 세로 보기 토글은 그대로.
- **R3 방향별 위치 (C1)**: `layout.ts` 의 right 분기가 core 에 넘기는 offset 을 `{x: vy, y: vx}` 로(축 교환은 core 가 하므로 전치해 넣으면 화면축 vx→x, vy→y 로 돌아온다). x·y 는 right 에서 무시. `GraphView.offsetOf(n, dx, dy, dir)` 가 현재 방향의 키에만 더하고 나머지 키는 보존. `onMove` 의 offset 타입은 `NonNullable<TreeNode['offset']>`(기존 `{x,y}` 의 상위 집합 — WS 의 no-op 호출은 그대로 통과). `autoArrange` 는 현재 방향 키만 0/삭제, 두 방향 모두 비면 `offset: undefined`. 버튼 표시 = 현재 방향에 값이 있는 노드가 있음. `layout.check.ts` 단언 추가.
  - 대안: 방향별 offset 을 별도 필드(`voffset`)로 — 계약 C1 이 한 열이므로 불가.
- **R4 휠**: `useZoom.ts` 휠 리스너에서 수정자 조건 제거. 항상 `preventDefault` + 커서 기준 1.1배. 시그니처·반환 모양 불변.
- **R5**: '화면 맞춤' 버튼·`maximize` import 삭제. `fitZoom` 래퍼는 호출처가 없어지면 함께 지운다(lint 0).
- **R6 개요 시트**: `<details className="io">` → `ui/Sheet`. 여는 곳: 패널 '개요 붙여넣기 열기'(aria-label 유지) + 패널 아래 글자 버튼 + 루트만 있는 트리 진입 시 자동(기존 `setIoOpen(ns.length===1)`). 시트 안: `sheet-head`(h2 + `ghost sheet-x` 닫기), 설명 한 줄, textarea(aria-label·placeholder 유지, 모바일 3줄), 버튼 4개(조건 동일), 내보낸 개요(복사 + 접힌 textarea). 가져오기 성공 시 `setIoOpen(false)` + 기존 토스트. 진입 자동 열림일 때는 아웃라이너 대신 textarea(데스크톱)에 포커스 — 캔버스 단축키가 시트 입력과 섞이지 않게. 시트 DOM 은 `.side` 안이라 keydown 이 `.outline`(onNavKey) 로 버블되지 않고, window 의 `/`·Ctrl+K 리스너는 textarea 를 이미 제외한다. CSS: `.io*` 를 시트용으로 정리(`.side details/summary` → `.io`), `.editor .sheet-x` 터치 크기.
- **R8 자동 맞춤**: `GraphView` 가 보이는 카드 집합이 바뀌었을 때 **또는 dir 이 바뀌었을 때** 실측 배치를 마치면 `onSettled`. `EditorPage.onSettled`: `restorePending`(첫 진입 복원) 이면 복원만. 아니면 배율 = clamp(min(1, (cw−16)/w, (ch−16)/h))(하한 0.3) 를 `zoomRef+setZoom` 으로 놓고, 가운데 맞출 카드(`centerAfter` 또는 선택) 를 `fitPending` 에 적어 둔다. 레이아웃 이펙트 안이라 `flushSync`(=`fit()`) 를 못 쓰므로, 부모의 deps 없는 `useLayoutEffect` 가 "배율 상태 == zoomRef" 가 된 커밋에서 `centerOn` 한다(선택 ref 는 부모 이펙트에서 갱신되므로 GraphView 의 콜백보다 늦게 읽는 편이 맞다). `fitPending(불리언)`·"넘칠 때만"·`centerPending`·`centerRoot`·`settledRoot` 삭제. `pickDepth`·`importOutline` 의 fitPending 세팅 삭제. `useLayoutEffect([dir])` 는 `saveDir` 만 남긴다.
  - 대안: `queueMicrotask(() => fit(sel))` — 페인트 전이긴 하지만 React 커밋 바깥 타이밍에 의존. 기존 패턴(zoomRef+setZoom+이펙트) 유지.

## 수정 파일 (모두 소유 범위 안)

- `src/features/editor/graph/layout.ts` — right 분기 vx·vy
- `src/features/editor/graph/layout.check.ts` — 단언
- `src/features/editor/graph/GraphView.tsx` — offsetOf 방향별, onMove 타입, dir 바뀔 때 onSettled
- `src/features/editor/graph/useZoom.ts` — 휠
- `src/features/editor/EditorPage.tsx` — R2·R3·R5·R6·R8
- `src/features/editor/editor.css` — .io 시트, .arrange 등
- `docs/plans/agent_WE_editor.md` — 이 문서

수정 없음: `NodeRow.tsx`, `TreeHeader.tsx`, `tree-header.css`(필요 없음).

## 단계

- [x] 0. plan 작성, `npm ci`
- [x] 1. R3 layout.ts + layout.check.ts (`npm run check` 의 layout 단언)
- [x] 2. R3 GraphView offsetOf/onMove/dir-settle, EditorPage autoArrange·버튼 조건
- [x] 3. R2 sparkles, R5 버튼 삭제, R4 휠
- [x] 4. R8 onSettled 재작성, 불필요 ref 삭제
- [x] 5. R6 Sheet + CSS
- [x] 6. typecheck · lint(0) · check · build
- [x] 7. 서버(4362, AUTH_FAKE=1, DATA_DIR=.research-data/WE) + 스크래치 Playwright(msedge): 휠 / 가로 드래그→세로→복귀 / 접기 배율 / 개요 시트 열기·가져오기·닫힘 / 새 트리 진입 시 시트 자동 열림 + E2E 흐름. 끝나면 PID 종료
- [x] 8. 커밋, worker_done

## 검증 방법

- 1: `npx tsx src/features/editor/graph/layout.check.ts` — right 가 vx·vy 만, down 이 x·y 만 쓰는 단언.
- 2~5: `npm run typecheck`, `npm run lint`, `npm run build`.
- 7: 빌드를 서버로 띄우고 Playwright 스크립트(scratchpad) 로 실제 동작 확인. 기존 E2E 셀렉터(C4) 는 변경 없음.

## 변경 사항 (계획과 다른 점)

- `fitZoom` 래퍼는 호출처가 없어져 삭제했다(lint 0 규칙). 훅의 `fit` 은 그대로(WS 가 쓴다).
- `centerPending` 은 이름만 `fitPending`(가운데 맞출 카드 id) 으로 남았다 — 레이아웃 이펙트 안에서 flushSync 를 못 쓰는 제약 때문에 "배율 놓고 다음 커밋에서 스크롤" 은 여전히 필요하다.
- 진입 자동 열림 시 포커스는 textarea(데스크톱만, 터치는 키보드가 튀어나오므로 시트 기본 포커스) — 시트와 캔버스 포커스가 겹치지 않게 하려는 과제 요구의 구체화.

## 결과

- 게이트: typecheck · lint(경고 0) · check(layout.check 단언 포함 42개 ok) · build 통과.
- 스크래치 Playwright(msedge, 1280×720 + 390×844 터치, 빌드를 4362 서버로): 56/56 통과 — 새 트리 진입 시 시트 자동 열림·E2E 흐름(fill → '선택 노드의 자식으로 추가')·닫힘·토스트 / 가져오기 뒤 맞춤 36% / 접기 36→39 / 펼치기 39→36 / 제목 입력 중 배율 불변 / 이 가지만 보기 100% · 전체 보기 36% / 화면 맞춤 버튼 없음 / 가로 드래그 → 세로 전환(세로는 자동 배치, 자동 정렬 버튼 없음) → 세로 드래그 → 가로 복귀 시 끈 위치 유지 → 새로고침 유지 → 가로 자동 정렬이 세로 위치를 건드리지 않음 / 자동 정렬 아이콘 ≠ 세로 보기 아이콘 / 휠만으로 100→91→83→91→100, scrollLeft·scrollTop 0 유지 / 시트 Esc·바깥 클릭·닫기 버튼 / 시트 안 Enter·H 가 캔버스 단축키로 새지 않음 / 기존 E2E extras 흐름(83% 에서 83px 끌면 새로고침 뒤 offsetTop +100, 배율 83% 복원) 그대로.
- 남은 위험: Enter 로 카드를 추가하는 순간에도 집합이 바뀌어 맞춤이 돈다(plan §6 알려진 위험). 모바일에서 패널 아래 글자 버튼은 하단 토스트(되돌리기 10초)와 겹칠 수 있다 — 옛 summary 와 같은 자리.
