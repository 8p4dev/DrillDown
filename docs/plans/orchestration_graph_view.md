# 오케스트레이션 plan — 노드 그래프 뷰 + 전체 스타일 정리

작성: 오케스트레이터 · 2026-11-01 · 저장소 `C:\drilldown\app` (main)
선행 문서: `docs/plans/orchestration_core_features.md` (S 범위 구현 결과 §8)

## 0. 요구사항 (사용자 원문)
1. 노드들이 노드 그래프처럼 표현되어야 함 (위에서 아래로)
2. CSS 스타일 적용해서 깔끔하게
3. 노드들이 텍스트 수에 따라 알아서 정돈되고, 마우스로 끌어서 위치 조정 가능

## 1. 구체화와 완료 기준

### G1. 위→아래 트리 그래프 (에디터 화면)
- 에디터의 세로 목록을 **루트가 맨 위, 자식이 아래 줄**에 놓이는 트리 그래프로 바꾼다. 부모 하단 중앙 → 자식 상단 중앙을 곡선(SVG path)으로 잇는다.
- 노드 = 카드(둥근 모서리, 테두리, 그림자). 학습 상태 색(`c-*`)은 카드 배경/테두리로 표현, `c-misplaced` 는 주황 외곽선, 선택·잘라냄 상태 표시 유지.
- 접힌 노드는 하위를 숨기고 카드에 "+N" 배지. 배지/토글 클릭으로 접기·펴기.
- 캔버스는 화면 폭을 넘으면 스크롤(overflow auto). 선택 노드가 바뀌면 보이도록 스크롤.
- **완료 기준**: 3단계 이상 트리가 겹침 없이 위→아래로 그려지고 간선이 부모-자식을 정확히 잇는다.

### G2. 텍스트 길이에 따른 자동 정돈
- 노드 폭 = 제목 텍스트 폭 + 여백 (최소 64px, 최대 240px; 넘으면 줄바꿈 → 높이 증가).
- 레이아웃(순수 함수): 각 서브트리 폭 = max(노드 폭, 자식 서브트리 폭 합 + 간격). 자식은 부모 아래 가운데 정렬, 형제 순서 = `order`. 같은 깊이의 행 높이 = 그 깊이 노드의 최대 높이. 서로 다른 서브트리가 겹치지 않음.
- 제목 편집·추가·삭제·접기 시 즉시 재배치. 편집 중에는 입력 텍스트 기준으로 노드가 늘어난다.
- **완료 기준**: 레이아웃 점검 스크립트(`layout.check.ts`, tsx 실행) — 겹침 없음, 부모가 자식들 가운데, 긴 제목 노드가 더 넓음, 접힌 하위 제외.

### G3. 마우스 드래그로 위치 조정
- 노드를 끌면 그 노드와 **서브트리 전체**가 함께 이동한다. 이동량은 `TreeNode.offset` 에 저장(자동 배치 위치 기준, 자손에 누적 적용) → 새로고침 후 유지.
- 4px 미만 이동은 클릭(선택)으로 처리. 더블클릭 = 편집(기존과 동일).
- 드래그 1회 = 실행취소 1단계 (기존 commit 경로 사용).
- "자동 정렬" 버튼: 모든 offset 제거 (실행취소 가능).
- 드래그로 부모 바꾸기(재부모화)는 **범위 밖** — 구조 변경은 기존 Ctrl+X/V.

### G4. 키보드 (그래프 방향에 맞게 재배치)
- ↑ 부모 / ↓ 첫 자식(접혀 있으면 펼침) / ← → 이전·다음 형제 / Alt+← → 형제 순서 이동.
- 나머지(Space·F2 편집, Enter 형제, Tab 자식, Shift+Tab 내어쓰기, H 접기, Delete, Ctrl+X/V/Z/Y, IME 조합 중 무시)는 그대로. 도움말 문구 갱신.

### S1. 전체 스타일 정리 (에디터 외 화면 + 공통)
- 상단 바, 본문 배경, 버튼(기본/보조/위험), 입력·textarea·select, 표, 목록, 상태 메시지를 디자인 토큰(§3)으로 통일. 다크 모드 대응(토큰이 처리).
- 대상: 트리 목록, 학습(드릴다운), 백지 퀴즈 입력·결과, 오늘의 복습.
- **완료 기준**: 모든 화면이 같은 토큰·버튼·입력 스타일을 쓴다. 기능·텍스트·aria-label 변화 없음(E2E 그대로 통과).

## 2. 가정
- B1. 그래프 뷰가 에디터의 유일한 뷰다(목록 뷰 토글 없음). 학습·퀴즈 화면은 기존 세로 형태 유지.
- B2. 줌·미니맵·패닝 드래그는 범위 밖(스크롤로 대신). 요청 시 추가.
- B3. offset 은 DB 인덱스가 아니므로 Dexie 스키마 버전 변경 불필요.
- B4. 노드 크기 측정 방식(canvas measureText 또는 DOM 측정)은 G 담당이 결정.

## 3. 공유 계약 (Wave 0 에서 오케스트레이터가 커밋)
- `src/core/types.ts`: `TreeNode.offset?: { x: number; y: number }` 추가.
- `src/index.css` 디자인 토큰(이름 고정, 값 조정 가능): `--bg --surface --border --text --muted --accent --accent-soft --danger --radius --shadow`. `.c-green .c-lightgreen .c-yellow .c-red .c-none .c-misplaced` 클래스 이름 유지.
- E2E 셀렉터 유지(`e2e/core-flow.spec.ts`):
  - 에디터: 보이는 각 노드 요소에 `.node-row[data-node-id]` + `c-*` 색 클래스, 제목 `.node-title`, 포커스 받는 키 입력 영역 `role="tree"`, 편집 입력 `aria-label="노드 제목"`, `aria-label="개요 텍스트"` textarea, 버튼 "선택 노드의 자식으로 추가".
  - 그 외: 모든 aria-label·버튼 문구·`data-*` 속성·링크 문구("편집" 등) 그대로.

## 4. 작업 분할

| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 |
|---|---|---|---|---|
| G 그래프 | G1–G4 | `src/features/editor/EditorPage.tsx`, `NodeRow.tsx`, `editor.css`(단 `.tree-list`·`.row-form` 규칙은 건드리지 않음), 신규 `src/features/editor/graph/**` (layout.ts, layout.check.ts, GraphView.tsx, graph.css 등) | core/**, index.css | Wave 0 |
| S 스타일 | S1 | `src/index.css`(토큰 이름·c-* 이름 유지), `src/App.tsx`(마크업·className만), `src/features/study/*.tsx`(className·감싸는 마크업만, 로직·문구·aria 변경 금지), `src/features/study/study.css`, `src/features/editor/TreeListPage.tsx`, 신규 `src/features/editor/treelist.css` | 에디터 파일 | Wave 0 |

- S 는 트리 목록 스타일을 `treelist.css` 로 옮겨 `TreeListPage` 에서 import 한다. `editor.css` 의 기존 `.tree-list`·`.row-form` 규칙은 머지 후 오케스트레이터가 지운다.
- `package.json` 의 `check` 에 `layout.check.ts` 추가는 머지 시 오케스트레이터가 한다.

## 5. 머지·검증
1. 머지 순서: S → G (`--no-ff`). 충돌 가능 지점 없음(파일 배타).
2. 머지 후: `npm run typecheck`, `lint`, `check`(+layout), `build`, `e2e`.
3. 오케스트레이터가 dev 서버(8001)에서 화면 확인(Playwright 스크린샷) — 그래프 겹침, 드래그 후 새로고침 유지.

## 6. 결과
(머지 후 기록)
