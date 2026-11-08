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

- [ ] 1 db.ts v2 + OutboxRow/MetaRow + track/kick
- [ ] 2 repo.ts 훅(쓰기 훅 표) + setVisibility/reissueSlug API화, bump/mock 제거
- [ ] 3 srs/index.ts recordGrade 트랜잭션 + track
- [ ] 4 sync.ts 공개 API(작게) + 동적 import
- [ ] 5 engine push/superseded/id_taken
- [ ] 6 engine pull/톰스톤/고아/410
- [ ] 7 engine 병합 onLogin/applyMerge/onLogout, 트리거·폴링·상태
- [ ] 8 share 화면 실연결, mock 디렉터리 삭제(me·admin 은 CA 소유라 남으면 그대로)
- [ ] 9 typecheck·lint·check·build
- [ ] 10 임시 Playwright(가짜 /api) ①~⑦ + v1 데이터 보존 + gzip 측정
- [ ] 11 커밋·보고

## 검증 방법

각 단계 `npm run typecheck`. 8 뒤 `grep -rn "fetch(" src` → api.ts 만. 10: dev 5182 에 scratch Playwright(msedge), `page.route('/api/**')` 메모리 가짜 서버. gzip: `dist` 에서 목록 화면이 로드하는 JS·CSS gzip 합.

## 변경 사항

(진행 중 기록)

## 검증 결과

(진행 중 기록)
