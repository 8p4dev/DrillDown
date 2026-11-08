# 오케스트레이션 — P1 (2026-11-09)

근거: `docs/research/many_trees/SUMMARY.md` §3·§4 P1, 상세 `E1_evaluation.md` §2(테마 T1~T3)·§3(재평가)·§4 P1 표, `E2_verification.md`(부분 판정: 빈칸·백지 범위 선택은 이미 있음 — 기본값·눈에 띔이 문제, fuzz 효과 작음).
사용자 결정(권장안): Q1 갤러리 **운영(켬)** → 진입 링크·제목 검색·갱신일 포함. Q2 원본 갱신 알림 **안 함**. Q3 공유 보기 학습 기록 **D19 유지**(새로고침 시 사라짐 — 토스트 [복제하면 기록이 남습니다]만). Q4 중간 노드 평가 **유지**. Q8 하루 상한 **보류**(fuzz + 연체순만). Q9 사본 표식 **없음**. Q10 하단 시트 **보류**. `/api/sync` 리밋 60 → **300/분**.

## 1. 기반(오케스트레이터, 이 커밋)
- `src/core/path.ts` — `ancestorsOf(byId, id)`(루트→노드, 순환 안전), `withParent(byId, n)`('방법 — TCP SYN Flooding')
- `src/ui/NodePath.tsx` — 경로 표시 공용 컴포넌트 `<NodePath path onPick? skipRoot? label? className?/>`, 스타일 `.node-path`(index.css)
- `href.edit(treeId, rootId?)` · App 이 `EditorPage` 에 `rootId` 전달(`key={treeId}` — rootId 변경은 리마운트 안 함)
- U52 라우트별 `document.title`(App)

## 2. 분할 (배타 소유)
| ID | 범위 | 소유 파일 | 포트(Vite/서버) |
|---|---|---|---|
| WE1 | 에디터 조망·탐색: U14 포커스(T1)·U17 보기 깊이(T3)·U18 보기 상태 저장·U16 검색·U15 경로/맞춤·U19 Home/End·U50 SR·U51 폰 경로 한 줄·U20 카드 2줄 말줄임 | `src/features/editor/**`(TreeListPage.tsx·treelist.css 제외), `src/features/TreeHeader.tsx`·`tree-header.css`·`viewport.ts` | 5341/4341 |
| WE2 | 에디터 편집 조작(**WE1 머지 후 시작**): U23 coarse 구조 바·U09 undo 라벨/위치·U11 붙여넣기 토스트·'첫 줄을 루트로' 조건 | WE1 과 같은 파일(순차) | 5342/4342 |
| WL | 트리 목록: U42 검색·U44 카드 메타+aria-label·U43 최근 사용 정렬·U02 190개부터 "n/200"·U20 목록 말줄임·갤러리 진입 링크(Q1)·U05 `storage.persist()` | `src/features/editor/TreeListPage.tsx`·`treelist.css`, `src/core/repo.ts` | 5343/4343 |
| WY | 동기화 마무리·백업 가져오기: U08(429 Retry-After·리밋 300/분·'저장됨' 조건·outbox 1회 읽기)·U04 가져오기 | `src/core/sync/**`·`sync.ts`, `server/sync/index.ts`·`pull.ts`·`push.ts`, `src/features/account/**`, 신규 `src/core/backup.ts` | 5344/4344 |
| WS | 학습: U32 복습 경로·U34 연체순/'항목'·U33 fuzz·U31 범위 라벨·U36 백지 채점 키=조상 경로·U30 기본 범위/플래시 범위·n/m·U39 미니맵·Q3 토스트 | `src/features/flash/**`, `src/features/dnd/**`, `src/core/srs/index.ts` | 5345/4345 |
| WG | 공유·갤러리: U55 공유 보기 `<details>`·'여기부터 학습'·U57 중복 복제 확인·U58 갤러리 `?q=` 검색·갱신일·U61 '더 보기' 중복 | `src/features/share/**`, `server/sync/share.ts`·`sync.check.ts` | 5346/4346 |
| 오케스트레이터 | 기반·통합 | `src/App.tsx`, `src/router.ts`, `src/core/types.ts`·`db.ts`·`path.ts`·`outline.ts`, `src/ui/**`, `src/index.css`, `e2e/**`, `docs/**`, 설정 | — |

## 3. 계약
- **C1 경로**: 경로가 필요하면 `ancestorsOf` + `<NodePath>` 를 쓴다(복제 구현 금지). 바꿔야 하면 `ask`.
- **C2 범위 URL(T1)**: 서브트리 범위는 어디서나 `?root=<nodeId>`. 에디터 모드 탭(TreeHeader)은 현재 rootId 를 플래시·빈칸·백지로 넘기고, 학습 화면에서 '편집으로'도 rootId 유지. 포커스 루트에서는 삭제·내어쓰기(Shift+Tab)·형제 추가 금지, 붙여넣기·추가는 포커스 안에서만.
- **C3 보기 깊이(T3)**: `viewDepth` 는 에디터 로컬 상태(트리별 localStorage), `collapsed` 필드·outbox·undo 와 무관.
- **C4 E2E 셀렉터**: 기존 E2E 가 쓰는 라벨(`'새 트리 제목'`, `'개요 텍스트'`, `'선택 노드의 자식으로 추가'`, 카드 `li[data-tree-id]`·링크 이름 '편집'·'플래시카드' 를 **포함**하는 이름, `'더 보기'`, `.node-row[data-node-id]`, `.node-title`, `[data-drop="tray"]`, `[data-card]`, `.sync-status[data-kind]`)은 유지하거나 포함 관계로만 바꾼다. 바꿨다면 worker_done 에 적는다.

## 4. 공통 규칙 (워커 spec 에 포함)
1. 자기 소유 파일만 수정. 다른 파일이 필요하면 `ask`. 계약 C1~C4 준수.
2. 새 워크트리에서 먼저 `npm ci`. 지정 포트만. 띄운 프로세스는 PID 로만 종료(광역 kill 금지). 5173 은 사용자 프리뷰.
3. `npm run e2e` 금지(머지 후 오케스트레이터 1회). 임시 Playwright(스크래치, `channel:'msedge'`) 확인 권장. 서버: `PORT=<포트> HOST=127.0.0.1 AUTH_FAKE=1 DATA_DIR=.p1-data/<ID> PUBLIC_ORIGIN=http://127.0.0.1:<포트> node server/index.ts`(dist 는 자기 워크트리에서 `npm run build`). 예시 트리 `docs/research/many_trees/sample_tree_outline.txt`(222노드) 로 확인.
4. 완료 전 `npm run typecheck`·`npm run lint`·`npm run check`·`npm run build` 통과, 커밋(끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). 순수 로직(정렬·검색·키 계산)은 기존 `*.check.ts` 에 단언 1개 이상.
5. 과설계 금지: 각 항목은 E1 §4 P1 표의 '할 일' 범위까지. 더 필요해 보이면 하지 말고 worker_done 에 제안.
6. `worker_done`: 커밋 해시, 항목별 확인 방법·수치, 기존 E2E 영향, 남은 위험. 막히면 `ask` 후 턴 종료.

## 5. 진행 기록
- 2026-11-09 기반 c8fe7de → WE1·WL·WY·WS·WG 디스패치(새 워크트리 agent-W*-p1). WE2 는 WE1 머지 후
- WL 완료 c177653(검색·메타·정렬·n/200·말줄임·갤러리 링크·persist). 후속 요청: listTrees 정렬을 listTreeMeta 로 이동(호출처 비용)
- WL 후속 d8ba196: listTrees 가볍게 복귀, 정렬은 listTreeMeta
- WG 질문: /api/gallery 라우트에 q 전달 1줄(server/sync/index.ts, WY 소유) → 통합 때 오케스트레이터가 적용
- WG 완료 eda9fd9: 공유 보기 details(폰 기본 917px, R7 11,003px), 여기부터 학습, 중복 복제 시트, 갤러리 q 검색·갱신일, 더 보기 중복·연타. 남김: index.ts q 1줄(통합), 실패한 더 보기 페이지 건너뜀(기존 버그)
- WS 완료 a51e41d: 복습 경로·연체순·fuzz(하루 최대 221→60)·범위 라벨·백지 키 사용자 트리 기준·범위 화면(빈칸 리프>30·백지>40)·플래시 n/m·미니맵 숨김. 남김: 미니맵 숨김 시 aside 빈칸, 공유 토스트 미확인
- WY 완료 51fee11: 3만 행 첫 업로드 36초·오류 0(R5 245초+·빨간 80초), 끊긴 pull 뒤 '저장됨' 안 뜸, 백업 가져오기(srs 포함·충돌 시 새 id). 남김: backup.check 연결(오케스트레이터), me.ts 429 토스트, applyRemote outbox 페이지별 읽기
- 통합 1차: WL·WG·WS·WY 머지 충돌 0, gallery q 1줄·/api/sync 429 토스트 제외·check 연결, 게이트·E2E 20/20
- WE1 완료 46b2718: 포커스(TCP SYN 11카드·63% 맞춤), 깊이 3(13카드 46%), 검색 '대책' 5건 경로, 복원, Home/End, SR. 머지·게이트·E2E 20/20. → WE2 디스패치
