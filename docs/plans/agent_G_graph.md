# 에이전트 G plan — 그래프 에디터 (G1–G4)

근거: `docs/plans/orchestration_graph_view.md` §1 G1–G4, §3 공유 계약, §4 소유권

## 접근 방식
- **레이아웃 = 순수 함수** `graph/layout.ts`: `layout(nodes, rootId, measure)` → `{ boxes: Map<id,{x,y,w,h,depth}>, edges, width, height }`.
  - 2패스 tidy tree: (1) 후위로 서브트리 폭 계산 — 자식 서브트리를 간격 `HGAP` 로 나란히 놓고, 부모 중심 = 첫·마지막 자식 중심의 가운데. 부모가 더 넓으면 범위를 넓혀 자식 묶음을 가운데로. (2) 전위로 절대 x 부여. 깊이별 행 높이 = 그 깊이 노드 최대 높이.
  - 접힌 노드의 하위는 제외. `TreeNode.offset` 은 경로상 누적 적용(서브트리 함께 이동) 후 최소 좌표가 여백 `MARGIN` 이 되도록 평행이동.
  - 형제 정렬은 `order` (core `childrenOf` 와 동일 규칙; repo.ts 는 Dexie 를 import 하므로 점검 스크립트 편의상 layout 안에서 직접 정렬).
- **크기 측정 = DOM 측정 주입**: 카드는 `width:max-content; min 64px; max 240px` 로 자연 크기 → `useLayoutEffect` 에서 `offsetWidth/Height` 를 읽어 바뀐 경우만 state 갱신(페인트 전 재배치, 깜빡임 없음). 줄바꿈·배지·편집 입력까지 실제 크기 그대로. 대안 canvas `measureText` 는 줄바꿈 높이를 따로 계산해야 해 기각. 점검 스크립트는 가짜 measure 사용.
  - 편집 입력은 CSS grid `::after{content:attr(data-value)}` 트릭으로 입력 텍스트만큼 카드가 늘어난다.
- **그래프 뷰** `graph/GraphView.tsx`: 절대 배치 캔버스 + SVG 곡선 간선(부모 하단 중앙 → 자식 상단 중앙, 3차 베지어). 카드 렌더는 `renderNode` 로 EditorPage 의 `NodeRow` 를 그대로 사용(편집·IME 로직 유지).
- **드래그**: 캔버스에 pointer 이벤트 위임(pointerdown 시 카드에 `setPointerCapture`). 4px 미만은 클릭(선택), 이상이면 로컬 state `drag{id,dx,dy}` 로 미리보기(드래그 노드의 offset 을 임시로 더한 노드 배열로 layout → 서브트리 함께 이동). pointerup 에서 `onMove(id, offset)` 1회 → EditorPage `commit` (실행취소 1단계). 재부모화 없음.
- **자동 정렬** 버튼: 모든 offset 제거 commit (실행취소 가능). offset 없으면 비활성.
- **키보드 G4**: ↑ 부모 / ↓ 첫 자식(접혀 있으면 펼침) / ←→ 이전·다음 형제 / Alt+←→ 형제 순서 이동. 나머지 그대로. 도움말 갱신.
- **화면**: `main:has(> .editor)` 폭 제한 해제, 그래프(점 격자 배경, 화면 높이만큼, overflow auto) + 오른쪽 사이드(상태·상세·개요 가져오기·도움말). 색은 index.css 토큰, 상태색은 기존 `c-*` 그대로(카드 왼쪽 띠 + 배경 틴트).
- 접기 배지: 접힌 카드 하단 중앙 "+N"(숨은 하위 수), 펼친 부모는 작은 "−". 클릭으로 토글(포커스를 뺏지 않도록 비포커스 span). 
- 검토한 대안: 줌/패닝(가정 B2 범위 밖), 레이아웃 라이브러리(dagre 등, 새 의존성 금지), Reingold–Tilford 압축(형제 서브트리 겹쳐 넣기 — 구현 복잡도 대비 이득 적어 단순 span 방식 채택; 넓은 트리는 가로 스크롤).

## 수정/생성 파일
- `docs/plans/agent_G_graph.md` (이 문서)
- `src/features/editor/graph/layout.ts`, `src/features/editor/graph/layout.check.ts`, `src/features/editor/graph/GraphView.tsx`
- `src/features/editor/EditorPage.tsx`, `src/features/editor/NodeRow.tsx`, `src/features/editor/editor.css` (`.tree-list`·`.row-form` 규칙 유지)

## 작업 목록
- [x] plan 작성
- [x] `layout.ts` + `layout.check.ts` (겹침 없음·부모 가운데·긴 제목 더 넓음·접힌 하위 제외·offset 서브트리 이동)
- [x] `GraphView.tsx` (측정·간선·드래그 미리보기·onMove)
- [x] `NodeRow.tsx` 카드화 (배지, 편집 입력 자동 폭, 스크롤 into view)
- [x] `EditorPage.tsx` 연결 (그래프·자동 정렬·G4 키·도움말·화면 배치)
- [x] `editor.css` 그래프 스타일 (토큰)
- [x] 검증: `npx tsx src/features/editor/graph/layout.check.ts`, `npm run build`, `npm run lint`
- [x] 스크린샷 확인 (3단계·긴 제목 겹침 없음, 드래그 후 새로고침 유지, 접기 배지)
- [x] 커밋

## 검증 방법
- 레이아웃: `npx tsx src/features/editor/graph/layout.check.ts`
- 타입·빌드: `npm run build` · 린트: `npm run lint`
- 화면: `npx vite --port 81xx --strictPort` 잠깐 띄우고 Playwright(msedge) 스크립트로 트리 생성·가져오기·드래그·새로고침·접기 → 스크린샷, 확인 후 서버 종료

## 변경 사항
- 카드 밑판을 SVG `rect`(fill `--surface`)로 깐다: 공유 `c-*` 상태색이 반투명 배경이라 캔버스 점 격자가 비쳐 보였음. `c-*` 값을 복제하지 않고 해결.
- 사이드 상태 메시지 색을 `--danger` → `--muted` (가져오기 성공 같은 안내도 같은 줄에 나와서).
- 점검 스크립트는 `node:assert` 대신 자체 assert (앱 tsconfig 에 node 타입이 없어 `tsc -b` 실패).

## 결과
- `layout.check.ts` ok, `npm run build`·`npm run lint` 통과(경고 0).
- 스크린샷(msedge, 1440×900): 3단계 + 줄바꿈되는 긴 제목 트리 DOM 겹침 0, 클릭 선택·Enter 형제 추가·한글 입력 OK, '해고' 드래그(+60,+80) 후 새로고침해도 캔버스 기준 (+60,+80) 유지, H 접기 → "+3" 배지·숨김, ↓/→/↑ G4 이동, 자동 정렬 → 원위치, Ctrl+Z → 드래그 위치 복원, 다크 모드·c-green/c-red/c-misplaced 확인.
