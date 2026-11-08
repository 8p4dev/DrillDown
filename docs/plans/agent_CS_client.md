# 에이전트 CS — 클라이언트 동기화·공유 실연결 (S5)

작성 2026-11-08. 시작 커밋 8947541. 포트 Vite 5182 / 서버 3022. 계약: `orchestration_server.md` §3.4·§3.5, 04 §3.1~§3.10.

## 접근 방식

- **db.ts**: 04 §3.1 Dexie v2 그대로. `OutboxRow`·`MetaRow` 타입도 여기. 쓰기 훅 헬퍼 `track(rows)` 를 여기 둔다 — 호출자 트랜잭션 안에서 `meta.userId` 를 읽고, 없으면 아무것도 안 함(원칙 2), 있으면 `[kind+id]` 로 기존 행 seq 를 찾아 `outbox.bulkPut`(복합 유니크라 엔티티당 1행). 끝에 `kick()`(엔진이 등록한 디바운스 push, 미로드면 no-op). repo·srs 가 같은 헬퍼를 쓰므로 훅 로직 1곳.
  - 대안: 각 쓰기 함수가 직접 outbox 를 쓰기 → 같은 코드 8벌. 기각.
- **sync.ts(첫 화면 청크)**: 상태 스토어(`useSyncState`/`SyncState`), `retrySync`, `onLogin`·`applyMerge`·`onLogout`·`flush`·`MergePlan` — 엔진은 `onLogin` 안에서 `import('./sync/engine')`. 비로그인은 엔진 미로드.
- **sync/engine.ts**: push(디바운스 2초·online·visible·시작, 500행/≈1MB 청크, tree→node→srs→attempt, 현재 값 읽어 보냄, 보낸 뒤 `at` 이 바뀐 행은 남김), superseded(로컬 put + 토스트 + 내 버전 유지), id_taken(M5 재발급), pull(커서·more 반복·톰스톤·LWW·srs autoCorrectDays 합집합·고아→루트·410 스냅샷+M4), 60초 폴링, 상태 전이, `dd:remote` 이벤트, 병합 M1~M3.
- **repo.ts**: 쓰기 함수에 `track`, `bump`·`mockIssueSlug` 제거, `setVisibility`/`reissueSlug` → `flush()` 후 서버 API, 응답으로 `db.trees.update`(outbox 없음).
- **share/**: mock → `api()`. 오류 화면 3종, 갤러리 페이지네이션, 시트 오류·숨김 배너.

## 수정/생성 파일

`src/core/db.ts`, `src/core/repo.ts`, `src/core/sync.ts`, `src/core/sync/engine.ts`(신규), `src/core/srs/index.ts`(recordGrade 1곳), `src/core/mock/sync.ts`·`shared.ts`(삭제), `src/features/share/{SharedPage,GalleryPage,ShareSheet,SyncStatus}.tsx`, 이 파일.
소유 밖 필요(요청): EditorPage 의 `dd:remote` 구독 1줄(LM), `SharedTree` 응답 모양 확인(api.ts·SS).

## 단계

- [x] 1 db.ts v2 + OutboxRow/MetaRow + track/kick
- [x] 2 repo.ts 훅(쓰기 훅 표) + setVisibility/reissueSlug API화, bump/mock 제거
- [x] 3 srs/index.ts recordGrade 트랜잭션 + track
- [x] 4 sync.ts 공개 API(작게) + 동적 import
- [x] 5 engine push/superseded/id_taken
- [x] 6 engine pull/톰스톤/고아/410
- [x] 7 engine 병합 onLogin/applyMerge/onLogout, 트리거·폴링·상태
- [x] 8 share 화면 실연결, mock 디렉터리 삭제(CA 머지 후 디렉터리 전체 없음)
- [x] 8b QA 추가(오케스트레이터 msg): #7 시트 닫기 아이콘 x 44px, #9 탭 밑줄 제거, #10 '읽기 전용' .badge, #20 예외(작업 없음), #23 갤러리 카드 밑줄 제거, share.css → share-list.css 분리
- [x] 9 typecheck·lint·check·build
- [x] 10 임시 Playwright(가짜 /api) ①~⑦ + v1 데이터 보존 + gzip 측정
- [x] 11 커밋·보고

## 검증 방법

각 단계 `npm run typecheck`. 8 뒤 `grep -rn "fetch(" src` → api.ts 만. 10: dev 5182 에 scratch Playwright(msedge), `page.route('/api/**')` 메모리 가짜 서버. gzip: `dist` 에서 목록 화면이 로드하는 JS·CSS gzip 합.

## 변경 사항

- **push 뒤 cursor 를 올리지 않는다**(sequences S1 의 `meta.cursor = seq` 와 다름). push 응답 seq 는 사용자 현재 seq 라 다른 기기 행을 건너뛸 수 있다(SS 확인). 다음 pull 이 내 행을 되받지만 `updatedAt` 같으면 건너뛴다(메아리 무시).
- **M4 는 기본값 '올리기' 자동 + 토스트**(오케스트레이터 확정): 410 뒤 스냅샷에서 서버에 없는 로컬 트리 → outbox → push, "이 기기에만 있던 트리 n개를 계정에 올렸습니다".
- **이미 병합된 기기**(`meta.userId == userId`)의 `onLogin` 은 `{local:0, server:0, otherAccount:null}` 을 돌려 대화가 다시 뜨지 않게 하고 엔진만 시작.
- **`restoreTree` 가 `updatedAt=now`** 로 올린다: 이미 올라간 트리 톰스톤보다 나중 쓰기여야 서버 LWW 를 이긴다. 되돌린 카드가 목록 맨 위로 온다(정렬 기준 updatedAt).
- **outbox `at` 단조 증가**(같은 ms 두 쓰기 구분) — "보낸 뒤 다시 바뀐 행" 판정용.
- **쓰기 훅은 `db.track()` 1곳**: repo·srs·엔진이 같은 헬퍼를 쓴다. `track` 은 호출자 트랜잭션 안에서 `meta.userId` 를 읽는다(비로그인 0행).
- **공유 시트 hidden 배너**는 기존 `.share-notice` 모양 재사용(CSS 추가 없음). 신고는 SA `POST /api/t/:slug/report` 를 SharedPage 가 직접 호출.
- **CSS 분리**: 목록이 받는 규칙(동기화 상태·공개 배지·공유 시트·xfade)을 `share-list.css` 로. `ShareSheet` 가 TreeListPage 에 정적 import 라 시트 규칙도 함께 옮겼다.

## 검증 결과

- typecheck·lint(경고 0)·check(account·sync·server ok)·build 통과. `src/core/mock/` 없음, `fetch(` 는 `src/core/api.ts` 만.
- 임시 Playwright(msedge, Vite :5182, `page.route('/api/**')` 메모리 가짜 서버) **14/14 PASS**:
  ⓪ v1(IDB ver 10) 데이터 → v2 열기 후 트리 1개 유지, 테이블 7개 · ⑦ 비로그인 쓰기 2회 outbox 0행, engine 요청 0, /api/sync 0회 · ⑤ M1 로컬 2개 → `onLogin` `{local:2,server:0}` → engine 청크 로드 → `applyMerge('upload')` 트리 2·노드 2 업로드, outbox 0, pull since=0 · ① 쓰기 → outbox 2행 → 2,044ms 뒤 push → 0행, 표시 동기화 중→저장됨 · ② superseded → 로컬 SERVER-WIN + 토스트 "다른 기기 변경 반영됨 1건" → [내 버전 유지] → 서버에 내 제목 · ③ id_taken → 새 트리 id(노드 treeId 매핑) 재전송, 옛 id 서버에 없음 · ④ setOffline → "2건 대기" → online → 저장됨 · 503 Retry-After 1 → 오프라인 → 자동 재시도 → 저장됨 · 403 tree_limit → 오류 → 탭 "트리가 너무 많습니다(200개)" · pull: 고아 → 루트, 트리 톰스톤 → 로컬 삭제, `dd:remote` 발행 · 410 → since=0 스냅샷 + M4 올리기 · M3 otherAccount=u1 → wipe_other → meta.userId=u2 · ⑥ /t/ 404·410·403 한 줄 화면.
- QA DOM(390 coarse): 배지 "읽기 전용", 탭 text-decoration none, 시트 닫기 44×44 aria "닫기", 갤러리 카드 링크 밑줄 없음, "더 보기" 표시.
- **첫 화면 gzip(목록, QA §5 방식: rIC 차단·1.5초·level 9·폰트 제외) = 130,517 B — 목표 120 KB 초과(FAIL)**. 내 몫은 줄었다: mock 공유 데이터 −2,980, share CSS 1,648→540, sync.ts 544, engine 은 첫 화면에 없음. 큰 것은 `index-*.js` 69,252(앱 셸, CA·SA 머지 후 증가)·`db-*.js` 31,257(Dexie). 남은 초과 ≈ 10.5 KB 는 셸 측정(`--sourcemap`)이 필요 — 오케스트레이터 판단.
- precache 587.24 KiB(68개) ≤ 600.

## 미해결

- `tree_limit` 때 "가장 오래된 것부터 n개 못 올림" 문구 대신 사유 1줄만.
- id_taken 으로 트리 id 가 바뀌면 그 트리를 열어 둔 에디터 URL(#/tree/<옛 id>)은 빈 화면 — C17 드묾.
- `dd:remote` 구독(EditorPage·TreeListPage)은 오케스트레이터가 머지 후 추가.

## 후속 (task_33d70d8a3008) — 거부 행 격리

- [x] push 400 `invalid`: `field`(예 `nodes[3].title`)를 보낸 순서 표(`pos`)로 outbox 행에 역추적 → 그 행만 outbox 에서 뺌(로컬 데이터 유지), 나머지 계속 push
- [x] field 없음·`payload_too_large`·413: 배치를 반으로 나눠 재귀 push, 1행이 되면 격리
- [x] 상태: 격리 행이 있으면 error `저장 못 한 항목 n개 — <사유>`(제목이 너무 깁니다 / 메모가 너무 깁니다 / 별칭이 너무 많거나 깁니다 / 서버 메시지). 같은 엔티티가 다시 바뀌면 `track` 이 새 행을 넣어 재시도, 통과하면 목록에서 빠지고 저장됨
- [x] 검증(임시 Playwright, 가짜 /api): 노드 8개 중 긴 제목(field)·NOFIELD(field 없음)·BIG(payload_too_large) 3개 → 정상 5행 서버 도착, outbox 0, 로컬 9행 유지, "저장 못 한 항목 3개 — …", 요청 10회 / 3개를 고치면 9행 모두 서버·저장됨 / 긴 제목 단독 → "저장 못 한 항목 1개 — 제목이 너무 깁니다"
- 한계: 격리 목록은 메모리라 새로고침하면 오류 표시가 사라진다(데이터는 로컬에 남고, 고치면 다시 올라간다). 트리 5,000노드 초과는 노드마다 격리돼 요청이 늘 수 있다(분할은 log n 회/행).
