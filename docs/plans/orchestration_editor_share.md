# 오케스트레이션: 편집기 조작·공개 트리 개편 (2026-11-11)

요구(사용자 원문 11줄): 오늘의 복습 삭제 · 자동 정렬/세로 보기 아이콘 중복 · 방향별 노드 위치 유지 · 마우스 휠 확대 · 화면 맞춤 버튼 삭제 · 개요 붙여넣기 팝업 · 공개 트리 보기 탭 그래프화 · 보이는 노드 규모가 바뀔 때 자동 맞춤 · 상단 바 공개 트리 링크 · '갤러리' → '공개 트리' · 공개 트리 카드 요소(제목·노드 수·유저·별점·미리보기·날짜·복제 수).

사용자 결정(2026-11-11 질문 4건):
- 별점 = 공유 보기에서 로그인 사용자가 1~5점, 1인 1표(수정 가능), 본인 트리 불가. 서버 테이블·API 신설.
- 마우스 휠 = 확대·축소. **휠 스크롤은 없앤다**(이동은 빈 곳 드래그·핀치·터치만).
- 오늘의 복습 = 화면·상단 링크·배지·트리 카드 '복습 n' 모두 삭제. 학습 기록(FSRS)·카드 색·오답 표시는 유지.
- 공개 트리 보기 탭 = 카드 그래프. 카드를 선택하면 '여기부터 학습' 버튼.

기준 커밋: 선행 작업 커밋(아래 §0) 뒤의 `main`. 경로는 `C:\drilldown\app\` 기준.

## 0. 오케스트레이터 선행 작업 (분배 전 커밋, 완료)

| 파일 | 내용 |
|---|---|
| `src/core/types.ts` | `TreeNode.offset` 을 `{ x, y, vx?, vy? }` 로 (계약 C1) |
| `server/sync/map.ts` | `parseNode` 가 `offset.vx·vy`(선택, 숫자) 를 받는다. `nodeOut` 은 JSON 그대로 |
| `src/core/api.ts` | `Rating` 타입, `SharedTree.rating`, `GalleryItem.ratingAvg·ratingCount` (계약 C3) |
| `server/sync/share.ts` | 위 두 필드의 **자리표시자**(`rating: {avg:null,count:0,mine:null,canRate:false}`, `ratingAvg:null, ratingCount:0`). WY 가 실제 집계로 교체 |
| `src/ui/icons.all.ts` | `star`, `sparkles` 추가 (Lucide) |
| `src/features/editor/graph/useZoom.ts` | EditorPage 의 확대·축소(zoomTo·zoomBy·fit·centerOn·휠)를 훅으로 추출 (계약 C2). EditorPage 는 훅을 쓰도록 교체, 동작 동일 |

typecheck·lint(경고 0)·check 통과 확인.

## 1. 요구사항별 구체화와 완료 기준

완료 기준 공통: typecheck·lint(경고 0)·check·build 통과, 기존 E2E 셀렉터(계약 C4) 유지, 머지 후 `npm run e2e` 통과(오케스트레이터).

### 1.1 WH 셸 — 복습 삭제·상단 바·명칭
| id | 요구 | 구체화 | 완료 기준 |
|---|---|---|---|
| R1 | 오늘의 복습 삭제 | `ReviewPage.tsx` 삭제. `router.ts` 의 `review` 라우트·`href.review` 삭제(`#/review` 는 기본 분기로 `#/` 가 됨). `App.tsx` 의 lazy·TITLES·상단 링크·배지·`countDue`·`dd:due`/`dd:remote` 재집계 삭제. `flash.css` 의 "오늘의 복습" 절 삭제. `flash.ts` 의 복습 전용 함수(`parentQueue`, `byOverdue`) 삭제(`requeueMissed`·`missedConcepts` 등 플래시가 쓰는 것은 유지). `core/srs/index.ts` 의 `dueByTree`·`notifyDue`(`dd:due`) 삭제(계약 C7). `core/repo.ts` `TreeMeta.due`·`listTreeMeta(dueBy)` 인자 삭제(정렬용 `usedAt`·`studiedAt` 은 유지), `repo.check.ts` 단언 갱신. `TreeListPage.tsx` 트리 카드의 "복습 n" 삭제 | `rg "review\|dd:due\|dueByTree\|parentQueue\|byOverdue" src` 결과 0. 상단 바에 '오늘의 복습' 없음. `#/review` 진입 시 내 트리. 플래시·빈칸·백지 채점 뒤 카드 색·오답 배지 그대로 |
| R9 | 상단 바에 공개 트리 링크 | `App.tsx` 상단 바: `내 트리` 오른쪽에 `<a href={href.gallery()} aria-current=...>` 긴 라벨 '공개 트리', 짧은 라벨(≤760px) '공개'. **항상 표시**(공유 보기의 비로그인·로컬 0개 조건은 '내 트리'에만 적용). `TreeListPage.tsx` 의 `<p className="trees-gallery">` 와 `treelist.css` 의 `.trees-gallery` 삭제 | 모든 화면에서 상단 바에 '공개 트리' 링크, `#/gallery` 에서 `aria-current="page"`. 내 트리 화면에 '공개 트리 둘러보기' 문단 없음 |
| R10a | 명칭 통일(셸) | `App.tsx` `TITLES.gallery = '공개 트리'` | 탭 제목 '공개 트리 — Drill Down' |

### 1.2 WE 편집기 — 아이콘·방향별 위치·휠·맞춤·팝업·자동 맞춤
| id | 요구 | 구체화 | 완료 기준 |
|---|---|---|---|
| R2 | 아이콘 중복 | 자동 정렬 버튼 아이콘을 `sparkles`(icons.all) 로. 세로 보기 토글은 그대로(`listTree`/`network`) | 세로 보기 상태에서 두 버튼 아이콘이 다르다 |
| R3 | 방향별 위치 유지 | 계약 C1. `layout.ts` `dir==='right'` 는 `offset.vx·vy` 만 쓴다(기존 x·y 축 교환 제거). `GraphView.tsx` 드래그는 현재 `dir` 의 키(x·y 또는 vx·vy)에만 더한다. `autoArrange` 는 **현재 방향의 키만** 지우고, 두 방향 모두 비면 `offset` 을 `undefined` 로. 자동 정렬 버튼 표시 조건 = 현재 방향에 값이 있는 노드가 있음. `layout.check.ts` 에 단언 추가(right 가 vx·vy 를 쓰고 x·y 를 무시) | 가로에서 끈 뒤 세로로 바꾸면 세로는 자동 배치, 다시 가로로 오면 끈 위치 그대로. 반대도 같음. 새로고침·동기화 후 유지 |
| R4 | 휠 확대 | `useZoom.ts` 휠 리스너: 수정자 없이도 확대·축소(커서 기준), `preventDefault` 로 휠 스크롤 없음. Ctrl/⌘+휠·핀치는 그대로. 훅 시그니처는 바꾸지 않는다(계약 C2) | 캔버스 위에서 휠만 굴리면 배율이 바뀌고 스크롤되지 않는다 |
| R5 | 화면 맞춤 버튼 삭제 | `zoom-tools` 의 '화면 맞춤' 버튼과 `maximize` import 삭제. `fitZoom` 은 내부용으로 유지 | 버튼 없음 |
| R6 | 개요 붙여넣기 팝업 | 오른쪽 패널의 `<details className="io">` 를 `ui/Sheet`(`label="개요 붙여넣기 · 내보내기"`) 로. 여는 곳: 패널의 '개요 붙여넣기 열기' 버튼(기존 aria-label 유지) + 패널 아래 글자 버튼 '개요 붙여넣기 · 내보내기' + **루트만 있는 트리 진입 시 자동 1회**(기존 `ioOpen` 과 같음 — E2E 흐름 유지). 시트 안: 설명 한 줄, `textarea[aria-label="개요 텍스트"]`, 버튼 '선택 노드의 자식으로 추가'·'첫 줄을 루트로'(조건 동일)·'개요 내보내기'·'AI 프롬프트 복사', 내보낸 개요 영역, 닫기 버튼(`sheet-head .sheet-x`, 다른 시트와 같은 모양). 가져오기 성공 시 시트를 닫고 토스트. Esc·바깥 클릭 닫힘. `editor.css` 의 `.io*` 규칙을 시트용으로 옮기고 모바일(≤760) 은 textarea 3줄 | 패널에 textarea 가 상시 노출되지 않는다. E2E `getByLabel('개요 텍스트').fill` → '선택 노드의 자식으로 추가' 흐름(새 트리 진입 직후)이 그대로 동작 |
| R8 | 규모 바뀔 때 자동 맞춤 | `onSettled`(GraphView 가 **보이는 카드 집합이 바뀐 뒤** 실측 배치를 마칠 때만 부른다)마다: 저장된 스크롤 복원 대기(`restorePending`, 첫 진입) 중이면 복원만, 아니면 `fitZoom()`(전체가 보이는 배율 ≤100%, 하한 `clampZoom` 0.3, 선택 노드 가운데). `centerAfter`(검색·실행 취소로 새로 그려진 카드) 는 맞춤 뒤 그 카드를 가운데로. `fitPending`·"넘칠 때만" 분기 삭제(항상 맞춤). 적용되는 경우: 접기·펼치기·보기 깊이·이 가지만 보기·전체 보기·가져오기·추가·삭제·실행 취소·방향 전환·`dd:remote`. 적용되지 않는 경우(집합 불변): 제목·내용 입력, 드래그, 너비 변경, 선택 이동 | 가지를 접으면 남은 카드가 화면에 맞게 커지고, 펼치면 맞게 작아진다. 이 가지만 보기 진입·해제 때도 맞춤. 입력 중에는 배율이 흔들리지 않는다(단, Enter 로 카드를 추가하면 집합이 바뀌므로 맞춤됨 — 위험 §6) |

### 1.3 WS 공개 트리 클라이언트 — 보기 탭 그래프·명칭·카드 요소·별점 UI
| id | 요구 | 구체화 | 완료 기준 |
|---|---|---|---|
| R7 | 보기 탭을 편집 탭처럼 | `SharedPage.tsx` `mode==='view'`: `Branch`(목록·`<details>`)·'모두 펼치기/접기' 삭제. 대신 `GraphView` + 읽기 전용 카드 컴포넌트(`features/share/ShareCard.tsx` 신설: `.node-row` 구조 — `.node-title`, `.node-note`(format `toHtml(parse())`), 접기 `.badge`(숨은 수), `role="treeitem"`·`aria-selected`·`aria-expanded`·`data-node-id`; 너비 손잡이·`+ 내용`·편집 툴팁 없음). 접기는 로컬 `Set<ID>`(저장 안 함), 선택은 로컬 상태(클릭). `useZoom`(계약 C2) 으로 버튼·휠·핀치·자동 맞춤(`onSettled` 마다 `fit(선택)`). `zoom-tools`: 축소·배율·확대·세로 보기 토글(`aria-label="세로 보기"`, `dd:editor-dir` 를 **읽기만**). 선택된 카드가 자식 있는 비루트 노드면 헤더 도구 줄(`.share-tools` 왼쪽)에 '여기부터 학습' 버튼 → `navigateShared(slug,'flash',id)`. 캔버스 높이는 `share.css` 에서(`calc(100dvh - …)`, 모바일 하단 복제 바 고려). 스타일은 `../editor/editor.css` 를 import 해 `.outline .graph .node-row .zoom-tools` 재사용, 차이는 `share.css` 에 덮어쓴다(계약 C6). `.share-tree*`·`.share-fold`·`.share-from` CSS 삭제 | 보기 탭에 편집 탭과 같은 카드 그래프(선·배지·확대·이동·세로 보기). 카드 클릭 → 선택 표시 + '여기부터 학습' → 플래시 탭이 그 가지 범위로 열림. 390px 에서 핀치·패닝 동작 |
| R10b | 명칭 통일(공유) | `GalleryPage.tsx` h1·오류 문구·빈 문구 '공개 트리…', `ShareSheet.tsx` '공개 트리 목록에 표시됩니다', `AdminPage.tsx` '공유 보기·공개 트리에서 보이지 않습니다'. 파일명·라우트 `gallery`·URL `#/gallery`·CSS 클래스는 그대로(계약 C5) | `rg 갤러리 src` 결과 0 |
| R11 | 공개 트리 카드 요소 | `GalleryPage.tsx` 카드(`li.card`): ① 제목(링크 `/t/<slug>`), ② 유저(`ui/Avatar` 이니셜 + 닉네임), ③ 별점(`star` 아이콘 + `ratingAvg.toFixed(1)` + `(ratingCount)`, 없으면 muted '평가 없음'), ④ 노드 n, ⑤ 복제 n, ⑥ 날짜(`updatedAt`, `ko-KR` medium), ⑦ `<button aria-label="미리보기">` → `Sheet`(label '미리보기'): 제목·유저·별점 한 줄 + `<pre>` 개요 텍스트 + '공유 보기 열기' 링크. 개요는 열 때 `GET /api/t/<slug>` 1회 → `serializeOutline(nodesToOutline(nodes, root.id, false))` 의 앞 60줄(초과 시 '… 외 n줄'). 로딩·실패 문구. 카드 전체 링크(`.tree-open` 식 stretched link)와 미리보기 버튼이 겹치지 않게 z-index. 정렬 2개·검색·더 보기는 유지. 레이아웃: 390/768/1440 에서 깨지지 않음, 호버는 테두리 | 카드에 7요소가 모두 보인다. 미리보기 시트가 텍스트 개요를 보여 준다 |
| R11b | 별점 UI | `SharedPage.tsx` 헤더(`.share-owner` 줄 오른쪽 또는 아래): ★ `avg`(`count`) 표시. `rating.canRate` 면 별 버튼 5개(`aria-label="별점 n점"`, `aria-pressed = mine===n`) → `PUT /api/t/<slug>/rating {stars}` → 응답으로 헤더 갱신, 토스트 '별점 n점'. 비로그인(`canRate=false && !me`)이면 별 버튼 클릭 시 토스트 '로그인하면 별점을 남길 수 있습니다' + [로그인](`href.login(현재 URL)`). 본인 트리(로그인·canRate=false)는 버튼 비활성·툴팁 '내 트리는 평가할 수 없습니다'. 실패는 `ApiError.message` 토스트 | 별점 주기·수정이 되고 새로고침 후 유지. 공개 트리 목록 카드에 반영(60초 캐시) |

### 1.4 WY 서버 — 별점 API
| id | 구체화 | 완료 기준 |
|---|---|---|
| Y1 | `server/migrations/003_ratings.sql`: `CREATE TABLE ratings(user_id TEXT NOT NULL REFERENCES users(id), tree_id TEXT NOT NULL REFERENCES trees(id) ON DELETE CASCADE, stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5), updated_at INTEGER NOT NULL, PRIMARY KEY(user_id, tree_id)) WITHOUT ROWID; CREATE INDEX ratings_tree ON ratings(tree_id);` | 서버 기동 시 적용 |
| Y2 | `share.ts`: `ratingOf(db, treeId, viewer?)` → `Rating`(avg 소수 1자리 반올림·count·mine·canRate = viewer && viewer.id !== owner_id). `sharedTree(db, t, viewer?)` 가 `rating` 을 채움(자리표시자 교체). `gallery()` 쿼리에 `LEFT JOIN (SELECT tree_id, AVG(stars) avg, COUNT(*) cnt FROM ratings GROUP BY tree_id) r ON r.tree_id = t.id` → `ratingAvg`(소수 1자리, null)·`ratingCount`. `rateTree(db, userId, t: ShareRow, stars)` upsert + `clearGalleryCache()` → `Rating` | `sync.check.ts`: 평가 → avg/count/mine, 수정 → count 유지, 본인 → 403, 갤러리 항목 ratingAvg 반영 |
| Y3 | `server/sync/index.ts`: `GET /api/t/:slug` 가 `sharedTree(db, t, c.get('user'))`. `PUT /api/t/:slug/rating` — 로그인 필수(401, 기존 `requireUser` 방식), `hit(c, \`rate:${userId}\`, 30, MIN)`, 본문 `{stars}` 정수 1..5 아니면 400 `bad_request`, slug 판정은 `lookupShare` 와 같은 404/410/403, 본인 트리 403 `own_tree`. 응답 `Rating`. 라우트 등록 순서는 기존 `/api/t/:slug*` 묶음 안 | `app.request` 단언: 401·400·403·200 |
| Y4 | `server/sync/owner.ts` `purgeUser` 에 `DELETE FROM ratings WHERE user_id = ?` | sync.check 단언 |
| Y5 | `docs/CODEBASE.md` §9 API 표에 `PUT /api/t/:slug/rating` 한 줄, §4 데이터 모델에 ratings 한 줄 | 문서 갱신 |

## 2. 가정과 미결

가정(합리적 기본값으로 진행):
- A1 공개 트리 URL(`#/gallery`)·라우트 이름·파일명·CSS 클래스는 바꾸지 않는다. 화면 글자만 '공개 트리'.
- A2 개요 팝업은 루트만 있는 새 트리에 진입하면 자동으로 한 번 열린다(기존 '빈 트리면 펼친 채 시작' 과 같은 의도, E2E 흐름 유지). 그 외엔 버튼으로 연다.
- A3 방향별 위치는 노드 `offset` JSON 한 열에 두 방향을 넣는다(마이그레이션 없음). 자동 정렬은 현재 방향만 초기화한다.
- A4 자동 맞춤 하한은 기존 배율 하한(30%)과 같다. 5,000 노드를 모두 펼치면 30% 까지 줄어든다(보기 깊이로 줄이면 됨).
- A5 별점 삭제(평가 취소) API 는 만들지 않는다. 수정만 가능.
- A6 미리보기 텍스트는 내용(note) 없이 제목 개요만, 앞 60줄.
- A7 상단 바 '공개 트리' 는 로그인·트리 수와 무관하게 항상 보인다.
- A8 공개 트리 보기 탭의 세로 보기 선호(`dd:editor-dir`)는 편집기 값을 읽기만 하고 저장하지 않는다.
- A9 하위 에이전트는 Orca `claude` 에이전트, 각자 새 워크트리.

미결: 없음(질문 4건은 사용자가 답함).

## 3. 작업 분할 (배타 소유)

| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 |
|---|---|---|---|---|
| WH 셸 | §1.1 R1·R9·R10a | `src/App.tsx`, `src/router.ts`, `src/index.css`, `src/features/flash/ReviewPage.tsx`(삭제)·`flash.css`·`flash.ts`·`flash.check.ts`, `src/features/editor/TreeListPage.tsx`·`treelist.css`, `src/core/repo.ts`·`repo.check.ts`, `src/core/srs/index.ts`·`srs.check.ts` | 나머지 | §0 |
| WE 편집기 | §1.2 R2~R6·R8 | `src/features/editor/EditorPage.tsx`·`editor.css`·`NodeRow.tsx`, `src/features/editor/graph/**`(`useZoom.ts` 내부 포함, 시그니처는 C2), `src/features/TreeHeader.tsx`·`tree-header.css` | `core/types.ts`, `ui/Sheet.tsx`, `ui/icons*.ts`, `core/outline.ts` | §0 |
| WS 공개 트리 | §1.3 R7·R10b·R11·R11b | `src/features/share/**`(신규 `ShareCard.tsx` 포함), `src/features/admin/AdminPage.tsx`(문구 1줄) | `features/editor/editor.css`·`graph/**`, `core/api.ts`, `core/outline.ts`, `ui/**` | §0 |
| WY 서버 | §1.4 Y1~Y5 | `server/**`(`server/sync/map.ts` 포함), `docs/CODEBASE.md` §4·§9 | `src/core/api.ts`, `src/core/types.ts` | §0 |
| 오케스트레이터 | §0, 머지, `e2e/**` 갱신, E2E 1회, `docs/CODEBASE.md` 나머지 절, 이 문서 §7 | `src/core/types.ts`·`api.ts`, `src/ui/icons.all.ts`, `e2e/**`, `docs/plans/**` | | |

한 웨이브(4개 병렬). 파일 겹침 없음. 각 에이전트 plan: `docs/plans/agent_<ID>_<이름>.md` (`agent_WH_shell.md`, `agent_WE_editor.md`, `agent_WS_share.md`, `agent_WY_rating.md`).

## 4. 공유 계약 (구현 전 확정, 변경은 오케스트레이터만)

- **C1 `TreeNode.offset`** = `{ x: number; y: number; vx?: number; vy?: number }`. `x·y` = 가로 보기(`dir 'down'`) 화면축 px, `vx·vy` = 세로 보기(`dir 'right'`) 화면축 px. 둘 다 자손에 누적. 서버는 JSON 그대로 저장·검증(`map.ts`, 완료). `{x:0,y:0}` 처럼 모두 0이면 `offset` 자체를 빼도 된다.
- **C2 `useZoom`** (`src/features/editor/graph/useZoom.ts`, 완료):
  `useZoom(box: RefObject<HTMLElement|null>, initial = 1, active = true) → { zoom, zoomRef, setZoom, zoomTo(next, cx?, cy?), zoomBy(f), fit(centerId?), centerOn(id) }` 와 `clampZoom`. `box` = 스크롤러, 그 안에 `.graph`(scale 대상)와 `[data-node-id]` 카드. WE 는 내부(휠 동작)를 바꿀 수 있지만 **시그니처·반환 모양은 유지**. WS 는 호출만.
- **C3 별점 API** (`src/core/api.ts` 타입 완료):
  - `Rating = { avg: number|null; count: number; mine: number|null; canRate: boolean }`
  - `GET /api/t/:slug` → `SharedTree.rating: Rating` (`mine`·`canRate` 는 로그인 사용자 기준, 비로그인 `mine:null, canRate:false`)
  - `PUT /api/t/:slug/rating` 본문 `{ stars: 1|2|3|4|5 }` → 200 `Rating`. 401 비로그인 · 400 `bad_request` · 403 `own_tree`(본인) · 404/410/403 은 `GET /api/t/:slug` 와 같음 · 429 리밋(30/분/사용자)
  - `GET /api/gallery` 항목에 `ratingAvg: number|null`(소수 1자리), `ratingCount: number`
- **C4 E2E 셀렉터 유지**: '새 트리 제목', '개요 텍스트', '선택 노드의 자식으로 추가', 링크 '편집'·'플래시카드', `li[data-tree-id]`, `.node-row[data-node-id]`, `.node-title`, '노드 제목', '패널 제목', '패널 내용', '+ 내용', `.w-handle`, `data-width`, output '배율', 버튼 '확대'·'축소', `aria-label="세로 보기"`, `button[data-concept-id]`, '하위 개념', '알음'·'모름'. **삭제되는 것**: 버튼 '화면 맞춤'(오케스트레이터가 `e2e/extras.spec.ts` 수정), `#/review`(`e2e/regress.spec.ts` 수정). **새로 생기는 것**(WS): 버튼 '미리보기', 버튼 `별점 n점`, 버튼 '여기부터 학습', 공유 보기 그래프 카드 `.node-row[data-node-id]`.
- **C5 명칭·주소**: 라우트 이름 `gallery`, URL `#/gallery`, `href.gallery()`, 파일 `GalleryPage.tsx`, CSS `.gallery*` 는 그대로. 화면 글자는 모두 '공개 트리'. `TITLES.gallery` 는 WH.
- **C6 공유 보기의 편집기 재사용**: WS 는 `../editor/editor.css`, `../editor/graph/GraphView`, `../editor/graph/useZoom`, `../editor/graph/layout`(`Dir`) 를 import 한다. WE 는 `GraphView` props·`layout` export·클래스 `.canvas .outline .graph .graph-pan .graph-zoom .dir-right .node-row .node-title .node-note .badge .folded .root .selected .zoom-tools .zoom-group .zoom-step .zoom-reset` 이름을 바꾸지 않는다. WS 는 `editor/**` 를 수정하지 않는다(차이는 `share.css` 로 덮어쓴다).
- **C7 `dd:due`**: 리스너는 App 뿐이었다(grep 확인). WH 가 발신(`srs/index.ts`)과 수신(App) 을 함께 지운다. 다른 에이전트는 `dd:due` 를 새로 쓰지 않는다.
- **C8 아이콘**: `icons.all.ts` 에 `star`·`sparkles` 가 있다(완료). 에이전트는 `icons*.ts` 를 수정하지 않는다. 더 필요한 아이콘은 자기 파일 안 상수(`EditorPage.tsx` 의 `ICON` 처럼).

## 5. 공통 규칙 (워커 spec 에 포함)
1. 자기 소유 파일만 수정. 다른 파일이 필요하면 `ask` 후 대기. 계약 C1~C8 준수.
2. 새 워크트리에서 먼저 `npm ci`. 지정 포트만 사용(WH 5361/4361, WE 5362/4362, WS 5363/4363, WY 5364/4364 — 앞 = vite dev, 뒤 = `PORT` 서버). 띄운 프로세스는 PID 로만 종료. 5173·3000·4173 은 쓰지 않는다. **메모리가 부족한 PC 다**: 개발 서버·브라우저는 확인할 때만 띄우고 바로 끈다.
3. `npm run e2e` 금지(머지 후 오케스트레이터 1회). 필요하면 스크래치 Playwright(`channel:'msedge'`, `.research-data/<ID>/` 아래 DATA_DIR) 로 확인하고 끝나면 끈다.
4. 완료 전 `npm run typecheck`·`npm run lint`(경고 0)·`npm run check`·`npm run build` 통과. 순수 로직은 기존 `*.check.ts` 에 단언 추가. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
5. 과설계 금지: §1 의 "구체화" 범위까지만. 새 의존성 금지. 더 필요해 보이면 하지 말고 `worker_done` 에 제안.
6. `worker_done`: 커밋 해시, 항목별 확인 방법·결과, E2E 영향(셀렉터·흐름), 남은 위험.

## 6. 머지 순서와 통합 검증
1. WY(서버, 겹침 없음) → 2. WH(셸·라우터) → 3. WE(편집기) → 4. WS(공유 보기 — 최종 WE 그래프 코드 위에서 확인).
- 각 머지 뒤 typecheck·lint·check·build.
- 오케스트레이터 E2E 갱신: `extras.spec.ts` '화면 맞춤' 단계 삭제(자동 맞춤으로 대체 확인: 가지 접기 후 배율 ≤100 이고 변화 있음), `regress.spec.ts` S1 의 `#/review` 이동 삭제.
- `npm run e2e` 1회.
- 추가 확인(스크래치 Playwright, 1440·390): 휠만으로 배율 변화·스크롤 없음(R4) / 가로에서 끌고 세로 전환 → 세로는 자동 배치, 복귀 시 유지(R3) / 개요 시트 열기·가져오기·닫힘(R6) / 접기·펼치기 때 배율 변화(R8) / 공개 트리 보기 탭 그래프 + 여기부터 학습(R7) / 카드 7요소 + 미리보기 시트(R11) / 별점 주기·수정·본인 403(R11b·Y3) / 상단 바 '공개 트리'·'오늘의 복습' 부재(R1·R9).
- 알려진 위험: R8 은 Enter 로 카드를 추가하는 순간에도 맞춤이 돌아 입력 중 배율이 바뀔 수 있다(사용자 요구대로 "규모가 바뀔 때마다"). 거슬리면 "편집 중엔 보류" 를 후속으로.
- 결과는 §7, `docs/CODEBASE.md` 갱신(§5 라우팅 표, §6.2 확대·개요, §6.5 삭제, §6.9, §9, §14).

## 7. 진행 기록
- 2026-11-11 선행 커밋 `5222a15`. Run `run_7cbe4c3df568`. 디스패치(새 워크트리, base main, 에이전트 claude): WY `ctx_d438370f3e0d` agent-WY-rating · WH `ctx_2ff20815ced1` agent-WH-shell · WE `ctx_e55355c66eb9` agent-WE-editor · WS `ctx_13f859ec9a57` agent-WS-share.
- 머지: WY `4edb186` → `8ddcbf1`, WH `d780e6b` → `6a6c049` (WH 가 WY 와 거의 동시에 끝나 WE·WS 를 기다리지 않고 먼저 머지 — 파일 겹침 없음). 둘 다 typecheck·lint 0·check·build(precache 628.54 KiB) 통과. `e2e/regress.spec.ts` S1 의 `#/review` 이동 삭제.
- WH 계획 대비 변경: App 의 `dd:remote` 리스너는 공유 보기 '내 트리' 숨김 조건(`countTrees`) 재집계용으로 남김.
- 머지: WE `1f2f883` → `1866bb4`. typecheck·lint 0·check·build(628.98 KiB) 통과. `e2e/extras.spec.ts` 의 '화면 맞춤' 단계를 자동 맞춤 확인(83% 에서 가지 접기 → 배율 변화·≤100%)으로 교체.
- 머지: WS `f29a547` → `073b26b`. typecheck·lint 0·check·build(precache 640.00 KiB, 예산 상한과 같음) 통과. `rg 갤러리 src` 결과 0(treelist.css 주석 제외).
- `npm run e2e` 1회: **22/22 통과**(27.5s).
- 통합 확인(스크래치 Playwright msedge, 실제 서버 4365, 1440·390): R1 상단 바 복습 없음·`#/review`→내 트리 / R9 '공개 트리' 링크·aria-current / R10 h1·공유 시트 문구 / R2·R3 가로 드래그→세로(자동 정렬 버튼 없음)→가로 복귀 위치 유지(179px) / R4 휠만으로 100→91% / R5 화면 맞춤 버튼 없음 / R6 새 트리 시트 자동 열림·가져오기 뒤 닫힘 / R8 접기 뒤 배율 ≤100 / R7 보기 탭 카드 6·선 5, zoom-tools, 선택→'여기부터 학습'→`?m=flash&root=`, 390 캔버스·복제 바 안 겹침·수평 스크롤 없음 / R11 카드 7요소·미리보기 시트(제목은 머리, 본문은 하위 개요)·Esc / R11b·Y3 별점 4→응답 {avg 4,count 1,mine 4}, 새로고침 유지, 재평가 5→count 1, 본인 403, 비로그인 → 로그인 안내 토스트. 모두 통과.
- `docs/CODEBASE.md` 갱신(기준일, 화면 표, 라우팅 표, 상단 바, 편집기 구성·확대·자동 맞춤·개요 시트, §6.5 삭제 기록, §6.9 공유 보기·공개 트리 목록, §14, 용어집, '갤러리' 전부 치환).

## 8. 결과 요약
- 완료: R1~R11 전부(11개 요구), 서버 별점 API Y1~Y5. 미완료 없음.
- 계획 대비 변경: 머지 순서 WY → WH → WE → WS 유지하되 WY·WH 는 WE·WS 를 기다리지 않고 먼저 머지(파일 겹침 없음). WH 는 App 의 `dd:remote` 리스너를 남김(공유 보기 '내 트리' 숨김 조건용). WS 는 `onSettled` 안 `queueMicrotask(fit)` 로 레이아웃 이펙트의 flushSync 제약을 피함.
- 남은 위험(후속 후보 → 2026-11-12 `orchestration_editor_share_followup.md` 에서 ①~④ 전부 해소): ① R8 — Enter 로 카드를 추가하는 순간에도 맞춤이 돌아 입력 중 배율이 바뀔 수 있음(사용자 요구대로). ② 모바일에서 패널 아래 '개요 붙여넣기 · 내보내기' 글자 버튼이 하단 되돌리기 토스트(10초)와 같은 자리. ③ 별점을 줄 때마다 공개 트리 목록 캐시를 전부 비움(비용은 작음). ④ 빌드 precache 가 예산 상한(640 KiB)에 닿음 — 다음 기능 추가 때 청크 분리 필요.
- 워크트리·브랜치 `agent-WY-rating`·`agent-WH-shell`·`agent-WE-editor`·`agent-WS-share` 는 머지된 채 남아 있다(이전 오케스트레이션과 같음).
