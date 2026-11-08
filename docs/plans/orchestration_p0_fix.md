# 오케스트레이션 — P0 8개 수정 (2026-11-09)

근거: `docs/research/many_trees/SUMMARY.md` §4 P0, 상세 수정안 `E2_verification.md`(D1·D2·손실류 표)·`E1_evaluation.md` §4.
사용자 결정(권장안 채택): Q5 탐색 모드 Tab=자식 추가 **제거**(편집 중 Tab=들여쓰기 유지), Q6 트리 삭제는 **로컬도 7일 보존 후 하드 삭제**, Q7 트리 200개 한도 **유지**.

## 1. P0 목록과 담당
| # | U | 문제 | 담당 |
|---|---|---|---|
| 1 | U01/D1 | 새 기기 첫 pull 페이지 경계 고아 → 루트로 재push(구조 영구 손상) | PA |
| 2 | U02/D2 | tree_limit 403 이 outbox 전체 정지 | PA(엔진·서버) + PB(200개 UI 차단) |
| 3 | U07 | 서버 거부 행 격리 목록이 새로고침에 사라짐 · 5,000노드/200자 초과 | PA(영속) + PC(사전 차단) |
| 4 | U03 | 휴지통 항상 빔·연속 삭제 되돌리기 무효 | PB(보존·타이머) + PA(pull 톰스톤 소프트) |
| 5 | U04 | 내보내기에 트리 없음 | PB |
| 6 | U49 | 탐색 모드 Tab 키 트랩 | PC |
| 7 | U35 | 빈 채점 = 전부 '모름' 기록 | PC |
| 8 | E2신규 | 공유 보기 빈칸·백지 범위 선택 → 빈 화면 | PC |

## 2. 파일 소유 (배타)
- **PA 동기화**: `src/core/sync/**`, `src/core/sync.ts`, `server/sync/push.ts`·`pull.ts`·`sync.check.ts`, 신규 `e2e/sync-robust.spec.ts`(작성만, 실행 금지)
- **PB 목록·휴지통·백업**: `src/core/repo.ts`, `src/features/editor/TreeListPage.tsx`·`treelist.css`, `src/features/account/**`, `src/features/share/SharedPage.tsx`
- **PC 편집기·학습**: `src/features/editor/**`(TreeListPage·treelist.css 제외), `src/core/outline.ts`·`outline.check.ts`, `src/features/dnd/**`
- **오케스트레이터**: `src/core/types.ts`, `server/sync/map.ts`, 기존 `e2e/*.spec.ts`, `docs/specs/**`, `docs/plans/**`, `package.json`, 설정 파일

## 3. 계약
- **C1 한도 상수**: `import { CAP } from 'src/core/types'` — `CAP = { title: 200, note: 5000, nodesPerTree: 5000, treesPerUser: 200 }`. 서버 `LIMITS` 도 이 값을 쓴다(기반 커밋).
- **C2 트리 삭제 수명(Q6)**: `markTreeDeleted` = 로컬 `deletedAt` 설정 + outbox tree del(현행). **로컬 하드 삭제는 `deletedAt < now − 7일` 일 때만**(`purgeDeletedTrees` 가 판단, 10초 타이머 없음). 원격 톰스톤(pull 의 tree.deletedAt)도 하드 삭제하지 않고 `db.trees.put`(deletedAt 포함) — 노드는 그대로 둔다(PA). 휴지통 = 로컬 `deletedAt` 있는 트리(현행 AccountPage 방식) → 다른 기기 삭제도 보인다. `listTrees` 는 계속 deletedAt 제외.
- **C3 격리 영속**: 엔진의 서버 거부 행 목록은 `db.meta` key `'rejected'` 에 `{kind,id,treeId,reason}[]` 로 저장 — `SyncStatus` 표시가 새로고침 뒤에도 남는다(PA 내부, 표시 UI 는 기존 `useSyncState`).
- **C4 tree_limit 보류(D2)**: 403 tree_limit 은 격리가 아니라 **보류** — 해당 트리의 모든 outbox 행을 남겨 두고 나머지만 계속 보냄. 트리 삭제·로그인 시 보류 해제 재시도. 서버는 같은 배치의 트리 삭제를 한도 계산보다 먼저 반영.
- **C5 사전 차단 문구**: 트리 200개(로그인 시) "트리는 200개까지 저장할 수 있습니다", 노드 5,000개 "트리 하나에 노드는 5,000개까지입니다", 제목 200자 초과는 **200자에서 자르고 나머지는 메모(note) 앞에 붙임** + 토스트 "긴 제목 n개를 잘라 메모로 옮겼습니다".

## 4. 공통 규칙 (워커 spec 에 포함)
1. 자기 소유 파일만 수정. 다른 파일이 필요하면 `ask`. 계약 C1~C5 를 바꾸지 말 것(문제 있으면 `ask`).
2. 새 워크트리에서 먼저 `npm ci`. dev 포트는 spec 에 지정된 것만. 띄운 프로세스는 PID 로만 종료(광역 kill 금지). 5173 은 사용자 프리뷰.
3. `npm run e2e`(전체 E2E) 실행 금지 — 오케스트레이터가 머지 후 1회. 임시 Playwright 스크립트(스크래치, `channel:'msedge'`)로 자기 변경 확인은 허용·권장. 서버가 필요하면 `PORT=<포트> HOST=127.0.0.1 AUTH_FAKE=1 DATA_DIR=.p0-data/<ID> PUBLIC_ORIGIN=http://127.0.0.1:<포트> node server/index.ts`(dist 필요 시 자기 워크트리에서 `npm run build`).
4. 완료 전 `npm run typecheck`·`npm run lint`·`npm run check`·`npm run build` 통과, 커밋(메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`). 기존 동작을 바꿨다면 영향받는 기존 E2E 셀렉터·단언을 `worker_done` 에 적는다(오케스트레이터가 고침).
5. `worker_done`: 커밋 해시, 고친 P0 번호별 확인 방법과 수치, 남은 위험. 막히면 `ask` 후 턴 종료.

## 5. 진행 기록
