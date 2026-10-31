# 오케스트레이션 plan — Drill Down 핵심 기능 (S 범위)

작성: 오케스트레이터 · 2026-10-31 · 저장소 `C:\drilldown\app` (main)
근거 문서(읽기 전용): `C:\drilldown\drilldown-biz\` — `brief/idea.md`, `brief/decisions.md`(결정 3·6~9), `reports/03_learning_science.md` §3, `reports/04_tech.md` §4·§5, `reports/09_synthesis.md` §5, `reports/11_cost_recovery.md` §4

## 0. 확정된 결정 (사용자 답변, 2026-10-31)
- 범위: **09 S 범위** — 아웃라이너 에디터, 개요 붙여넣기, 세로 드릴다운 학습, 인출 기반 색칠, FSRS 복습, 백지 퀴즈. **제외**: 2D 캔버스·자동 레이아웃·미니맵·서브트리 D&D·D&D 퀴즈·이미지·공유 링크·LLM(결정 9)·임베딩.
- 저장: **로컬 우선 PWA**. IndexedDB(Dexie)만, 서버·인증 없음. (Pi 서버 동기화는 이후)
- 워커 최대 4명. E2E = 핵심 학습 흐름 1개, 통합 후 오케스트레이터가 실행.

## 1. 기술 스택 (Wave 0 에서 오케스트레이터가 설치·커밋)
Vite 8 + React 19 + TypeScript 7, `dexie`(IndexedDB), `ts-fsrs`(FSRS-7, `DefaultScheduler`), `vite-plugin-pwa`, `oxlint`, `tsx`(자체 점검 스크립트), `@playwright/test`(E2E, 오케스트레이터 전용). 라우팅은 해시 라우터(`src/router.ts`), 상태관리 라이브러리 없음.
명령: `npm run build`(tsc -b + vite build) · `npm run lint` · `npm run typecheck` · `npm run check`(순수 로직 assert 점검) · `npm run e2e`.

## 2. 요구사항 구체화와 완료 기준

### R1. 트리 목록·아웃라이너 에디터 (근거: idea ①, 04 §1·§8 리스크 1, 09 §5)
- 트리 목록: 생성(제목 입력 → 루트 노드 = 제목), 이름 변경, 삭제(노드·srs 함께), 각 트리에 "편집 / 학습 / 백지 퀴즈" 링크.
- 아웃라이너: 세로 들여쓰기 목록. **탐색 모드**와 **편집 모드**.
  - 탐색: ↑↓ 이동(접힌 하위 건너뜀), ← 부모로 / → 첫 자식으로, `Space`·`F2` 편집, `Enter` 아래에 형제 생성+편집, `Tab` 자식 생성+편집, `Shift+Tab` 내어쓰기, `Alt+↑/↓` 형제 순서 이동, `H` 접기/펴기, `Delete` 서브트리 삭제(확인), `Ctrl+X`/`Ctrl+V` 서브트리 잘라내기·붙여넣기(선택 노드의 자식으로), `Ctrl+Z`/`Ctrl+Shift+Z` 실행취소·다시실행(트리 단위 스냅샷, 메모리 50단계).
  - 편집: `Enter` 확정+형제 생성, `Tab` 확정+들여쓰기(직전 형제의 자식), `Esc` 확정+탐색 복귀. **한글 IME 조합 중(`isComposing` 또는 keyCode 229)에는 Enter/Tab을 처리하지 않는다** — 글자 중복·유실 0.
  - 노드 상세: 메모(note)·허용 표현(aliases, 쉼표 구분) 편집 패널.
  - 각 노드 행에 학습 상태 색 클래스(`c-*`)를 표시 — `core/srs` 의 `colorMap` 사용 (Wave 2 통합 시 연결. Wave 1 에서는 `c-none`).
- **완료 기준**: 마우스 없이 3단계 트리(루트+자식 3+손자 각 2) 작성 가능, 한글 입력 "노동법"을 Enter로 확정 시 정확히 "노동법" 저장, 새로고침 후 유지, 잘라내기·붙여넣기·실행취소 동작, 순환 붙여넣기(자기 자손 아래) 거부.

### R2. 개요 붙여넣기 가져오기 / 내보내기 (근거: decisions 3, 04 §1)
- 들여쓰기 텍스트(탭 또는 스페이스 2·4칸 혼용 허용, 줄머리 `-`, `*`, `•`, `1.`, `1)`, `가.`, `(1)`, `①` 등 번호 제거)를 트리로 변환. 첫 줄 = 루트 또는 지정 노드의 자식으로 삽입 선택.
- 내보내기: 트리를 2칸 들여쓰기 텍스트로 복사(백업용).
- **완료 기준**: `npm run check` 의 outline 점검 통과(혼합 들여쓰기·번호 제거·빈 줄 무시·왕복 parse(serialize(x)) 동일).

### R3. LLM 없는 백지 퀴즈 채점 엔진 (근거: 11 §4.1, 04 §5)
5단계: ① 정규화 일치 ② 허용 표현 ③ 자모 퍼지(3구간) ④ 구조 비교(1:1 할당 + 노드 재현율·간선 정확도) ⑤ 애매 노드의 의미 단위(idea unit) 분해 — 자기채점 UI 입력 제공.
- **완료 기준**: `npm run check` 의 grading 점검 통과 — 최소 케이스: 공백·기호·번호·조사 차이 → exact, 별칭 → alias, 한 글자 오타 → fuzzy, 무관 단어 → reject, 다른 부모 밑 정답 → misplaced, 누락 → missing, 사용자 노드 순서와 무관한 최적 할당.

### R4. FSRS 복습·인출 기반 색칠 (근거: 03 §3.1·§3.5, 11 §4.2)
- 판정 → FSRS Rating: exact/alias/fuzzy + 구조 ok = Good, self_accept = Hard, 텍스트 정답 + misplaced = Hard, self_partial/self_reject/auto_reject = Again.
- 색: 자동 정답이고 예상 기억률 R ≥ 0.9 → green(R 이 떨어지면 lightgreen → none 으로 바램), self_accept·pendingRecheck → 최대 lightgreen(초록 금지), misplaced → `c-misplaced` 테두리, Again → red, 미학습 → none. 부모: **자식이 모두 green 일 때만 green**, 자식에 lightgreen/yellow 가 하나라도 있으면 lightgreen, red 자식이 있으면 부모는 자기 상태 유지(가정 A5).
- 가지 완료: 노드 자신과 모든 자손이 `autoCorrectDays` 2개 이상(서로 다른 날).
- 재확인: self_accept 후 `pendingRecheck=true`. 다음 판정이 자동 정답이면 false + `self_graded_node_rechecked` 이벤트.
- 복습 큐: `due <= now` 인 노드를 트리별로 묶어 반환.
- **완료 기준**: `npm run check` 의 srs 점검 통과(등급 매핑, Hard 가 Good 보다 짧은 간격, self_accept 후 green 금지, 서로 다른 날 2회 자동 정답 → 완료, 부모 집계 규칙).

### R5. 학습 화면: 세로 드릴다운 / 백지 퀴즈 / 오늘의 복습 (근거: idea ②③, 03 §3.1·3.3, 09 §5)
- 드릴다운: 루트만 보임 → 펼치기 전에 **하위 항목을 먼저 입력**(줄바꿈 구분, "모름" 허용) → 공개 시 하위 노드가 순차 애니메이션으로 열리고, 입력과 자동 대조(R3 엔진을 깊이 1 서브트리에 적용) → 애매 항목은 자기채점 → 판정 기록(R4) → 각 자식으로 계속 드릴다운. 상단에 루트→현재 경로 **브레드크럼**(미니맵 대체). 공개 전 입력 없이 "그냥 보기"도 가능하지만 판정·기록하지 않음.
- 백지 퀴즈: 범위(트리 전체 또는 `?root=` 서브트리) 선택 → 루트 제목만 보임 → 텍스트 영역에 들여쓰기 목차를 입력(R2 파서 재사용) → 제출 → R3 채점 → 결과 화면: 노드별 판정(원본과 나란히), 애매 노드는 의미 단위 체크박스로 자기채점, 자동 판정 뒤집기(override, `blank_grade_overridden`), 자기 맞음 표현을 허용 표현에 추가하는 버튼, 요약 "자동 확인 N / 자기 판정 M / 재현율 / 구조 정확도" → 확정 시 R4 기록 + `blank_attempts` 저장 + 이벤트 3종.
- 오늘의 복습: 기한 도래 노드 수를 트리별로 표시, "복습 시작"은 해당 노드의 부모 단위로 드릴다운 입력 화면을 순서대로 띄움.
- 편집 화면 각 노드 행 색칠(R1의 `c-*`)을 `colorMap` 결과로 연결.
- **완료 기준**: E2E(§6) 통과, 자기채점 노드가 green 으로 칠해지지 않음, 결과 요약 수치가 채점 결과와 일치.

### R6. 계측 이벤트 (근거: 04 §5 ③, 11 §4.3)
`logEvent()` 로 IndexedDB `events` 에 저장. 이벤트: `blank_node_graded`(attemptId, origNodeId, gradeSource, similarity, msToDecide), `blank_grade_overridden`(attemptId, origNodeId, from, to), `blank_attempt_completed`(attemptId, treeId, nodeCount, selfGradedCount, autoGradedCount, overriddenCount), `self_graded_node_rechecked`(origNodeId, nextGradeSource), `drilldown_retrieval_submitted`(nodeId, childCount, recalled), `tree_created`, `outline_imported`(nodeCount). 트리 목록 화면에 "학습 기록 내보내기(JSON)" 버튼.
- **완료 기준**: E2E 흐름 후 events 테이블에 위 타입이 기록됨(E2E 에서 확인).

## 3. 가정 및 미결 사항
| # | 가정 | 근거 / 바꿀 때 |
|---|---|---|
| A1 | 퍼지 임계값 accept ≥ 0.85, reject < 0.5 (자모 단위 정규화 편집거리 기반 유사도) | 11 §4.1 "임계값은 가정". `THRESHOLDS` 상수 하나로 조정 |
| A2 | 조사 정리는 끝의 `의, 에 대한, 에 관한, 은, 는, 이, 가, 을, 를` 만 제거 | 11 §4.1 [가정] |
| A3 | SRS 단위는 노드(04 §4). 03 §3.2 의 "부모→자식 묶음" 스케줄링·FIRe 할인은 이후 | MVP 단순화 |
| A4 | 사용자별 과신 보정(격차 15%p → yellow), 허용 표현 후보 3인 승인은 **제외** — 로컬 단일 사용자 앱이라 집계 불가. 대신 사용자가 직접 허용 표현 추가 | 11 §4.2. 서버 동기화 후 추가 |
| A5 | red 자식이 있어도 부모 색은 부모 자신의 상태 | 03·11 에 규칙 없음 |
| A6 | 세션 끝 "예상 점수 vs 실제 점수"(03 §3.1)는 **제외** | 이후 |
| A7 | 시드 트리 40개(콘텐츠)는 개발 범위 밖. 개요 붙여넣기로 적재 | 09 §5 |
| A8 | 드릴다운 "공개 전 입력"은 텍스트 입력만(음성·개수 맞히기 제외) | 03 §3.1 중 1안 |
- 미결: 없음(사용자 확인 완료).

## 4. 공유 계약 (Wave 0 에서 커밋, 변경은 오케스트레이터만)

### 4.1 공용 타입·DB — `src/core/types.ts`, `src/core/db.ts` (오케스트레이터 소유, 커밋됨)
`Tree`, `TreeNode{id,treeId,parentId,order,title,note?,aliases,collapsed?,updatedAt}`, `GradeSource`, `Structure`, `NodeSrs`, `EventType`, `AppEvent`, `BlankAttempt`. Dexie 테이블 `trees, nodes(treeId,parentId), srs(nodeId; treeId,due), events, attempts`. `newId()`.
라우터 `src/router.ts`: `#/`, `#/tree/:id`, `#/tree/:id/study`, `#/tree/:id/quiz?root=`, `#/review`, `href.*`. 앱 셸 `src/App.tsx`, 색 클래스 `src/index.css`(`c-green|c-lightgreen|c-yellow|c-red|c-none` + `c-misplaced`).

### 4.2 트리 저장소·개요 — `src/core/repo.ts`, `src/core/outline.ts` (에이전트 A 소유)
```ts
// repo.ts
export function createTree(title: string): Promise<Tree>          // 루트 노드도 생성
export function renameTree(treeId: ID, title: string): Promise<void> // 루트 title 동기화
export function deleteTree(treeId: ID): Promise<void>            // nodes·srs·attempts 함께
export function listTrees(): Promise<Tree[]>                     // updatedAt desc
export function getTreeNodes(treeId: ID): Promise<TreeNode[]>
export function getRoot(nodes: TreeNode[]): TreeNode
export function childrenOf(nodes: TreeNode[], parentId: ID): TreeNode[] // order 오름차순
export function descendantsOf(nodes: TreeNode[], rootId: ID): TreeNode[] // rootId 제외, 전위 순회
export function putNodes(nodes: TreeNode[]): Promise<void>       // upsert + tree.updatedAt 갱신
export function deleteNodes(ids: ID[]): Promise<void>
export function addAlias(nodeId: ID, alias: string): Promise<void>
// outline.ts
export interface OutlineItem { text: string; children: OutlineItem[] }
export function parseOutline(text: string): OutlineItem[]        // 최상위 항목들
export function serializeOutline(items: OutlineItem[]): string   // 2칸 들여쓰기
export function outlineToNodes(items: OutlineItem[], treeId: ID, parentId: ID | null, startOrder?: number): TreeNode[]
export function nodesToOutline(nodes: TreeNode[], rootId: ID, includeRoot?: boolean): OutlineItem[]
```

### 4.3 채점 엔진 — `src/core/grading/index.ts` (에이전트 B 소유, 순수 함수, DB 접근 금지)
```ts
export const THRESHOLDS: { accept: number; reject: number }      // 0.85 / 0.5
export function normalize(s: string): string
export function similarity(a: string, b: string): number          // 0..1, 자모 단위
export function splitIdeaUnits(title: string): string[]           // 2~4개 핵심어 (짧으면 [title])
export interface UserNode { tempId: string; parentTempId: string | null; text: string }
export type AutoClass = 'exact' | 'alias' | 'fuzzy' | 'ambiguous' | 'reject' | 'missing'
export interface NodeMatch {
  origNodeId: ID
  userTempId: string | null
  userText: string | null
  similarity: number
  autoClass: AutoClass
  structure: Structure          // 매칭됐고 사용자 부모가 원본 부모(또는 루트)에 매칭되면 'ok', 아니면 'misplaced'; 미매칭 null
  ideaUnits: string[]           // autoClass==='ambiguous' 일 때 체크박스 항목
}
export interface GradeResult { matches: NodeMatch[]; extraUserNodes: UserNode[]; nodeRecall: number; edgeAccuracy: number }
/** original = rootId 의 자손(루트 제외). user 의 parentTempId=null 은 루트의 자식을 뜻함 */
export function gradeBlank(original: TreeNode[], rootId: ID, user: UserNode[]): GradeResult
/** UI 가 자기채점 결과를 최종 GradeSource 로 변환 */
export function resolveGradeSource(m: NodeMatch, checkedUnits?: number): GradeSource
// exact→'exact', alias→'alias', fuzzy→'fuzzy', reject|missing→'auto_reject',
// ambiguous: checked===ideaUnits.length→'self_accept', 0<checked→'self_partial', 0→'self_reject'
```

### 4.4 SRS·색·이벤트 — `src/core/srs/index.ts`, `src/core/events.ts` (에이전트 C 소유)
```ts
// srs/index.ts — 순수 함수 + DB 래퍼 분리
export function gradeToRating(src: GradeSource, structure: Structure): Rating
export function isAutoCorrect(src: GradeSource, structure: Structure): boolean // exact|alias|fuzzy && structure!=='misplaced'
export function applyGrade(prev: NodeSrs | undefined, nodeId: ID, treeId: ID, src: GradeSource, structure: Structure, now: Date): { next: NodeSrs; recheckResolved: boolean }
export function retrievability(s: NodeSrs, now: Date): number
export type NodeColor = 'green' | 'lightgreen' | 'yellow' | 'red' | 'none'
export interface ColorInfo { color: NodeColor; misplaced: boolean }
export function nodeColor(s: NodeSrs | undefined, now: Date): ColorInfo
export function colorMap(nodes: TreeNode[], srs: Map<ID, NodeSrs>, now: Date): Map<ID, ColorInfo> // 부모 집계 포함
export function colorClass(c: ColorInfo): string                   // 'c-green c-misplaced' 등
export function isBranchComplete(nodes: TreeNode[], srs: Map<ID, NodeSrs>, rootId: ID): boolean
// DB 래퍼
export function recordGrade(nodeId: ID, treeId: ID, src: GradeSource, structure: Structure, now?: Date): Promise<NodeSrs> // recheck 해소 시 self_graded_node_rechecked 기록
export function getSrsMap(treeId: ID): Promise<Map<ID, NodeSrs>>
export function dueByTree(now?: Date): Promise<Map<ID, NodeSrs[]>>
// events.ts
export function logEvent(type: EventType, props: Record<string, unknown>, treeId?: ID): Promise<void>
export function exportEvents(): Promise<string>                   // JSON 문자열
```

## 5. 작업 분할

| 에이전트 | 담당 요구사항 | 수정 소유 파일 | 읽기만 하는 파일 | 선행 의존성 |
|---|---|---|---|---|
| **A 에디터** (Wave 1) | R1, R2 (+R6 의 `tree_created`·`outline_imported`·내보내기 버튼은 Wave 2 D 가 연결) | `src/core/repo.ts`, `src/core/outline.ts`, `src/core/outline.check.ts`, `src/features/editor/**`, `docs/plans/agent_A_editor.md` | `src/core/types.ts`, `src/core/db.ts`, `src/router.ts`, `src/index.css`, 근거 문서 | Wave 0 |
| **B 채점** (Wave 1) | R3 | `src/core/grading/**`(`index.ts`, `jamo.ts` 등, `grading.check.ts`), `docs/plans/agent_B_grading.md` | `src/core/types.ts`, 근거 문서 | Wave 0 |
| **C SRS** (Wave 1) | R4, R6(`events.ts`) | `src/core/srs/**`(`index.ts`, `srs.check.ts`), `src/core/events.ts`, `docs/plans/agent_C_srs.md` | `src/core/types.ts`, `src/core/db.ts`, 근거 문서 | Wave 0 |
| **D 학습 UI** (Wave 2) | R5, R6 화면 연결, 에디터 색칠 연결 | `src/features/study/**`, `src/features/editor/NodeRow*` 또는 A 가 지정한 색칠 연결 지점(아래), `src/features/editor/TreeListPage.tsx` 의 내보내기 버튼 1곳, `docs/plans/agent_D_study.md` | `src/core/**` 전부 | Wave 1 전체 머지 |

- 에디터 색칠 연결 지점: A 는 노드 행 컴포넌트가 `colorClassOf?: (nodeId) => string` prop 을 받도록 만들어 두고(기본 `c-none`), D 는 `EditorPage` 에서 `getSrsMap`+`colorMap` 으로 이 prop 을 채운다. 이 1개 파일(`EditorPage.tsx`)과 `TreeListPage.tsx` 의 버튼 추가에 한해 Wave 2 에서 소유권이 A → D 로 넘어간다(A 는 Wave 1 종료 후 관여하지 않음).
- `package.json`, `vite.config.ts`, `playwright.config.ts`, `e2e/**`, `src/App.tsx`, `src/router.ts`, `src/core/types.ts`, `src/core/db.ts`, `src/index.css` = 오케스트레이터 소유. 새 의존성이 필요하면 멈추고 보고.
- `npm run check` = `tsx src/core/grading/grading.check.ts && tsx src/core/srs/srs.check.ts` — A 는 `tsx src/core/outline.check.ts` 를 직접 실행해 확인(통합 시 오케스트레이터가 스크립트에 추가).

## 6. 머지 순서와 통합 검증
1. Wave 1 머지: **B → C → A** (순수 모듈 먼저, 파일 겹침 없음). 머지마다 `npm run build && npm run lint`.
2. Wave 2: D 를 머지된 main 에서 시작 → 머지.
3. 통합 검증: `npm run typecheck && npm run lint && npm run build && npm run check` + `tsx src/core/outline.check.ts`, `npm run preview` 기동 확인.
4. **E2E (오케스트레이터, Playwright 1개 흐름, `e2e/core-flow.spec.ts`)**: 트리 생성 "노동법" → 개요 붙여넣기(루트 아래 3자식·각 2손자) → 에디터에서 키보드로 형제 1개 추가(한글) → 새로고침 후 유지 확인 → 드릴다운: 루트 하위 항목 입력(2개 정확, 1개 오타) 후 공개 → 판정 표시 → 백지 퀴즈: 정확·오타·위치 오류·누락이 섞인 목차 제출 → 결과에서 애매 노드 자기채점 → 확정 → 에디터 색: 자동 정답 노드 `c-green`, 자기채점 노드 `c-green` 아님, 위치 오류 노드 `c-misplaced` → 오늘의 복습 화면에 해당 트리 표시 → IndexedDB events 에 `blank_attempt_completed` 존재.

## 7. 하위 에이전트 규칙 (각 지시에 전문 포함)
1. 코드 수정 전 plan md문서를 작성한다.
   - 접근 방식: 사용할 기술과 패턴, 검토한 대안과 트레이드오프
   - 수정/생성 파일 목록: 정확한 경로. 소유 범위 밖 파일이 필요하면 작업 전에 보고한다.
   - 단계별 작업 목록: 체크박스([ ]). 각 항목은 한 번에 구현하고 확인할 수 있는 크기로 쪼갠다.
   - 검증 방법: 각 단계를 무엇으로 확인할지(빌드, 타입체크, 직접 실행 결과 확인 등. pytest 제외)
2. 항목을 완료할 때마다 즉시 [x]로 갱신한다. 이 파일이 진행 상황의 기준이며, 컨텍스트가 압축되면 이 파일을 다시 읽고 이어서 진행한다.
3. 계획과 다르게 구현해야 하면 plan에 "변경 사항" 절을 추가해 이유와 함께 기록한 뒤 진행한다.
4. 소유 범위 밖 파일 수정이나 공유 계약 변경이 필요하면 임의로 하지 말고 멈추고 오케스트레이터에게 보고한다.
5. 완료 조건: 모든 체크박스 [x], 빌드·린트·타입체크 통과, 의미 단위로 커밋, 마지막에 변경 파일 목록과 미해결 이슈를 요약해 보고한다.
- 하위 에이전트는 E2E 를 실행하지 않는다(병렬 워크트리 간 포트·DB 충돌 방지).

## 8. 결과 기록
(통합 후 오케스트레이터가 작성)
