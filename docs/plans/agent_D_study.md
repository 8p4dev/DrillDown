# 에이전트 D plan — 학습 UI (R5, R6 화면 연결, 에디터 색칠)

근거: orchestration plan §2 R5·R6, §4.2~4.4(그대로 사용, 변경 없음), §5.1

## 접근 방식
- React 컴포넌트 + 계약 함수 직접 호출. 상태관리·새 의존성 없음. 애니메이션은 CSS `@keyframes` + `--i` 지연(`prefers-reduced-motion` 시 끔).
- **판정 규칙은 순수 모듈 `study/grade.ts` 하나**에 모은다(드릴다운·퀴즈 공용): `finalSource(m, checked, overridden)`, `summarize(...)`, `linesToUserNodes`, `outlineToUserNodes`, 라벨. `study.check.ts` 로 assert 점검.
  - 뒤집기: 자동 정답(exact/alias/fuzzy) → `self_reject`, `reject` → `self_accept`. `missing` 은 쓴 답이 없어 뒤집기 불가, `ambiguous` 는 체크박스가 곧 자기채점이라 뒤집기 없음. → 자기 판정은 항상 self_* 라서 C 의 규칙상 green 이 될 수 없다.
  - 요약: 자동 확인 N = 뒤집지 않은 자동 판정 노드 수, 자기 판정 M = 애매 + 뒤집은 노드 수(N+M=전체), 재현율·구조 정확도 = `GradeResult.nodeRecall/edgeAccuracy` 그대로. BlankAttempt: autoGradedCount=N, selfGradedCount=애매 수, overriddenCount=뒤집은 수.
- 드릴다운 `Drill` 컴포넌트(StudyPage·ReviewPage 공용): 입력 → 공개(gradeBlank(깊이1 자식, node.id, 줄 단위 입력; "모름"·빈 줄 제외)) → 애매 항목 체크 → "판정 기록"(recordGrade + `drilldown_retrieval_submitted{nodeId, childCount, recalled}`) → 자식으로 계속. "그냥 보기"는 공개만, 기록 없음.
  - 라우터에 노드 파라미터가 없으므로(router.ts 수정 금지) 현재 노드는 StudyPage 로컬 상태 + 브레드크럼.
- 백지 퀴즈: 범위 `<select>` → `location.hash = href.quiz(treeId, id)`. 입력은 `parseOutline`; 첫 줄 하나가 범위 루트 제목과 같으면 벗겨 낸다. 확정 시 노드별 recordGrade + `blank_node_graded` + (뒤집은 노드) `blank_grade_overridden` + attempts 저장 + `blank_attempt_completed`. msToDecide = 결과 표시 후 해당 노드 마지막 조작까지(자동 판정은 0).
- 오늘의 복습: `dueByTree()` → 트리별 개수. 시작 = 기한 노드의 부모(루트면 자신)를 트리 전위 순서로 중복 제거 → `Drill` 을 차례로.
- 에디터: `getSrsMap` → `colorMap` → `colorClass` 로 `colorClassOf` 채움(로드 시 1회). 가져오기 시 `outline_imported{nodeCount}`. 트리 목록: 생성 시 `tree_created`, "학습 기록 내보내기(JSON)" = `exportEvents()` Blob 다운로드.
- 대안 검토: 드릴다운 노드를 해시 쿼리로 두는 안 → router.ts 소유권 밖이라 기각. 퀴즈 결과를 사용자 개요와 원본 2열 트리로 그리는 안 → 표 한 줄에 원본|내 답|판정을 나란히가 더 단순하고 비교가 쉬움.

## 수정/생성 파일
- `docs/plans/agent_D_study.md` (이 문서)
- `src/features/study/grade.ts`, `src/features/study/study.check.ts`, `src/features/study/study.css`
- `src/features/study/Drill.tsx`, `StudyPage.tsx`, `QuizPage.tsx`, `ReviewPage.tsx`
- `src/features/editor/EditorPage.tsx`, `src/features/editor/TreeListPage.tsx`

## 작업 목록
- [x] plan 작성
- [x] `grade.ts` + `study.check.ts` (finalSource·뒤집기·green 금지·요약·입력 변환)
- [x] `Drill.tsx` + `StudyPage.tsx`(브레드크럼) + `study.css`(순차 공개 애니메이션)
- [x] `QuizPage.tsx` (범위·입력·결과·자기채점·뒤집기·허용표현·요약·확정·이벤트)
- [x] `ReviewPage.tsx`
- [x] `EditorPage.tsx` 색칠 + outline_imported, `TreeListPage.tsx` tree_created + 내보내기
- [x] 검증: `npx tsx src/features/study/study.check.ts`, `npm run build`, `npm run lint`, preview 1회 수동 확인
- [x] 커밋, E2E 셀렉터 절 작성

## 검증 방법
- 순수 로직: `npx tsx src/features/study/study.check.ts`
- 타입·빌드: `npm run build` · 린트: `npm run lint`
- 화면: `npm run preview` 1회 띄워 흐름 수동 확인(짧게, 끝나면 종료)

## 변경 사항
- `IdeaUnits.tsx` 를 따로 뺐다(드릴다운·퀴즈 공용 체크박스). 그룹 라벨은 체크박스 접두어와 겹치지 않게 "자기채점".
- 오늘의 복습은 `dueByTree(오늘 23:59:59)` 를 쓴다. 방금 틀린(Again) 노드는 기한이 몇 분 뒤라 `now` 기준이면 퀴즈 직후 목록에 안 뜬다(E2E §6 마지막 단계).
- `EditorPage` 의 `colorClassOf` prop 은 지우고 내부에서 계산한다(App.tsx 가 넘기지 않음). 색은 로드할 때 한 번 계산한다.
- preview 확인은 Playwright 브라우저가 설치돼 있지 않아 시스템 Edge(`channel: 'msedge'`)와 1회용 스크립트(커밋 안 함, 포트 4791)로 했다.

## 확인 결과 (preview 1회)
트리 생성 → 개요 가져오기(3자식×2손자) → 드릴다운(근로계약·해고 정확, "임굼" → **ambiguous**) → 판정 기록 → 브레드크럼 "노동법 › 근로계약" → 퀴즈(정확·위치 오류·누락·애매·뒤집기) → 요약 "자동 확인 7 / 자기 판정 2 / 재현율 89% / 구조 정확도 88%" → 에디터 색: 자동 정답 c-green, 자기채점 c-lightgreen, 위치 오류 c-lightgreen c-misplaced, 누락·뒤집어서 틀림 c-red → 복습에 트리 표시 → events 에 6종(tree_created, outline_imported, drilldown_retrieval_submitted, blank_node_graded, blank_grade_overridden, blank_attempt_completed).
- 참고(B 영역): 두 글자 단어 한 글자 오타("임금"→"임굼")는 자모 유사도 0.83 이라 fuzzy(≥0.85)가 아니라 ambiguous 로 나온다. E2E 의 "1개 오타" 는 세 글자 이상 단어를 쓰거나, 애매 판정도 허용해야 한다.

## E2E 셀렉터
| 화면 | 셀렉터 | 비고 |
|---|---|---|
| 트리 목록 | `getByLabel('학습 기록 내보내기(JSON)')` | exportEvents 결과를 JSON 파일로 다운로드 |
| 드릴다운 `#/tree/:id/study` | `getByLabel('브레드크럼')` | 루트 → 현재 경로, 조상은 버튼 |
| | `getByLabel('하위 항목 입력')` | 한 줄에 하나, "모름"·빈 줄 무시 |
| | `getByRole('button', { name: '공개' })` / `{ name: '그냥 보기' }` | 그냥 보기 = 기록 안 함 |
| | `.drill-child[data-node-id][data-grade]` | data-grade = 현재 최종 GradeSource (exact/alias/fuzzy/self_*/auto_reject) |
| | `getByLabel('의미 단위 <단위>')` | 애매 항목 체크박스 (그룹 `getByRole('group', { name: '자기채점' })`) |
| | `getByRole('button', { name: '판정 기록' })` → `getByRole('status')` "판정을 기록했습니다." | |
| | `getByLabel('<자식 제목> 드릴다운')` | 기록·보기 뒤 손자가 있는 자식으로 들어가기 |
| 백지 퀴즈 `#/tree/:id/quiz?root=` | `getByLabel('범위')` | `<select>`, 바꾸면 해시 이동 |
| | `getByLabel('백지 목차 입력')` + `getByRole('button', { name: '제출' })` | 들여쓰기 목차. 첫 줄이 범위 제목이면 무시됨 |
| | `getByLabel('채점 요약')` | 본문 "자동 확인 N / 자기 판정 M / 재현율 x% / 구조 정확도 y%", `data-auto`·`data-self` |
| | `tr[data-orig-id][data-grade]` (표 `getByLabel('채점 결과')`) | 위치 오류는 행에 "(위치 오류)" |
| | `getByLabel('의미 단위 <단위>')` | 애매 노드 자기채점 |
| | `getByLabel('판정 뒤집기: <원본 제목>')` | 체크박스. 애매·누락 노드에는 없음 |
| | `getByLabel('허용 표현에 추가: <원본 제목>')` | self_accept 이고 답이 제목과 다를 때만 |
| | `getByRole('button', { name: '확정' })` → `getByRole('status')` "기록했습니다." | |
| 오늘의 복습 `#/review` | `getByLabel('복습 대상 트리')` 안의 `li[data-tree-id][data-due-count]` | |
| | `getByLabel('복습 시작: <트리 제목>')` → 드릴다운 화면, `다음 복습` / `복습 마치기` 버튼 | |
| 에디터 | `.node-row[data-node-id]` 클래스 `c-green`/`c-lightgreen`/`c-red`/`c-none` + `c-misplaced` | 로드 시 1회 계산 (새로고침·재진입 시 갱신) |
