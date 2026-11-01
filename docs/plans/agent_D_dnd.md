# 에이전트 D plan — 드래그 앤 드롭 퀴즈 2종 (D1, D2)

근거: `docs/plans/orchestration_modes.md` §1 D1·D2, §2 D-a·D-b, §3 공유 계약, §4 소유권

## 접근 방식
- **순수 로직** `dnd/dnd.ts` (DOM·Dexie 없음 → `npx tsx dnd.check.ts` 로 검증)
  - `shuffle`(Fisher–Yates, rand 주입), `scopeOf`(범위 루트 + 자손, 루트 parentId=null), `leavesOf`.
  - D1 상태 `Place = Record<슬롯id, 카드id>` (슬롯 id = 정답 리프 id). `moveCard(place, card, to|'tray')` — 빈 슬롯이면 이동, 찬 슬롯이면 교환(트레이에서 왔으면 기존 카드는 트레이로).
  - D2 상태 `Links = Map<노드, 사용자가 붙인 부모>` (삽입 순서 = 형제 순서). `attach`(자기 자신·자기 자손 아래 금지, 대상은 루트 또는 배치된 노드), `detach`(자손 함께 트레이로), `placedTree`(layout 입력용 TreeNode[]).
  - 채점 `gradeDnd` / `gradeBlank`: (부모 키, 제목) 쌍의 **멀티셋 매칭** — 원본에서 기대 쌍을 모으고 배치된 카드마다 소비. 형제 순서 무관 + 같은 제목 교환 가능(D-b)을 한 규칙으로 처리하고, 같은 제목 카드 둘이 한 자리 몫을 이중으로 정답 처리하는 일도 없음. D1 부모 키 = 부모 id(뼈대에 자리가 보이므로), D2 부모 키 = 부모 제목. 미배치 = 오답.
- **드래그** `dnd/kit.tsx`: `useDragDrop(onDrop)` — 페이지 루트에 pointer 이벤트 위임, `[data-card]` 에서 pointerdown → `setPointerCapture`, 4px 이상 움직이면 드래그(고정 위치 고스트, 원본은 흐리게), pointerup 에서 `document.elementsFromPoint` 로 가장 가까운 `[data-drop]` 을 찾아 `onDrop(card, target)`. 마우스·터치 공통(`touch-action:none`). 드래그 중 놓일 곳 강조.
  - 접근성/대안 조작: 탭(클릭·Enter) 으로 카드 선택 → 대상 탭으로 놓기. 키보드로도 가능.
  - `TreeCanvas`: `layout()`(editor/graph, 읽기 전용) + 고정 크기 measure, 절대 배치 + SVG 곡선 간선. D1 뼈대·D2 캔버스·D2 원본 비교 모두 사용.
  - 대안 검토: HTML5 DnD API(터치 미지원) 기각, 라이브러리(새 의존성 금지) 기각, DOM 측정 크기(GraphView 방식)는 고정 폭 카드 + 2줄 말줄임으로 충분해 생략.
- **화면**: `<TreeHeader treeId active>` + 도구 슬롯에 범위 `<select aria-label="범위">`(자식 있는 노드, 깊이 들여쓰기) → `location.hash = href.dnd/blank(t, id)`. 상단 캔버스, 하단 트레이, 액션(채점·다시 하기·정답 보기/원본 비교). 채점 후 조작 잠금, `recordResult` + `logEvent('dnd_attempt_completed')`.

## 수정/생성 파일 (모두 소유 범위 안)
- `docs/plans/agent_D_dnd.md` (이 문서)
- `src/features/dnd/dnd.ts`, `src/features/dnd/dnd.check.ts`
- `src/features/dnd/kit.tsx`, `src/features/dnd/useDragDrop.ts`, `src/features/dnd/dnd.css`
- `src/features/dnd/DndPage.tsx`, `src/features/dnd/BlankDndPage.tsx`

## 작업 목록
- [x] plan 작성
- [x] `dnd.ts` 순수 함수 + `dnd.check.ts` (셔플 보존, moveCard 이동·교환·트레이, gradeDnd 순서무관·동명교환·이중정답 없음, attach 자손 금지·이동, detach 자손 동반, gradeBlank)
- [x] `kit.tsx` (useDragDrop, Ghost, TreeCanvas, ScopeSelect) + `dnd.css`
- [x] `DndPage.tsx` (D1)
- [x] `BlankDndPage.tsx` (D2)
- [x] 검증: check, build, lint
- [x] 스크린샷 확인 (D1 드래그·채점, D2 트리 만들기·채점·원본 비교, 다크 모드)
- [x] 커밋

## 검증 방법
- 로직: `npx tsx src/features/dnd/dnd.check.ts`
- 타입·빌드: `npm run build` · 린트: `npm run lint`
- 화면: `npx vite --port 81xx --strictPort` + Playwright(msedge) 스크립트로 트리 생성·개요 가져오기 → 각 모드에서 마우스 드래그 → 채점 → 스크린샷. 확인 후 서버 종료.

## 변경 사항
- 훅 `useDragDrop` 은 `kit.tsx` 대신 `useDragDrop.ts` 로 분리 — `react/only-export-components` 린트 경고(컴포넌트 파일에 훅 export) 회피.
- `dnd.check.ts` 는 `node:assert` 대신 자체 assert — 앱 tsconfig 에 node 타입이 없어 `tsc -b` 가 실패(layout.check.ts 와 같은 방식).
- 화면 폭: `main:has(.dnd) { max-width: 1400px }` — 넓은 트리 가로 스크롤 줄이기(에디터의 `main:has(> .editor)` 와 같은 방식). 채점 후 `disabled` 버튼 흐림 해제(결과 색 유지).
