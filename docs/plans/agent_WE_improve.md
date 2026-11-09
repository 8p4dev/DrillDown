# agent WE — 편집기·트리 목록 개선 (orchestration_improve.md §1.2)

포트 5361/4361. 이 파일이 진행 상황의 기준이다.

## 접근 방식
- 표의 "고침" 범위까지만. 새 의존성·새 파일 없음. 순수 로직은 기존 `*.check.ts` 에 단언.
- **E1** `restore()` 가 되돌릴 스냅샷에서 바뀐 노드만 `updatedAt: now` 로 새 객체를 만들어 persist. 스냅샷 자체는 건드리지 않는다(undoIf 의 동일성 비교 유지).
- **E2·E16** `onRemote` 에서 undo/redo 비움 + `getSrsMap` 다시 읽음.
- **E3** repo.ts 모듈 Map `heldSrs`(nodeId→NodeSrs). `deleteNodes` 가 지우기 전 보관, `putNodes` 가 들어온 id 중 보관분을 `updatedAt: now` 로 bulkPut + track(srs put). 순수 부분을 `takeHeldSrs()` 로 빼서 repo.check 단언. 대안(DB 에 '지운 srs' 테이블): db.ts 는 읽기 전용이고 세션 안 되돌리기면 메모리로 충분.
- **E4** NoteEditor `emit` 에서 `CAP.note` 초과면 토스트 + 직전 값으로 다시 그림(커서 끝). 가져오기·루트 메모 합치기는 `.slice(0, CAP.note)`.
- **E6** `orderAfter` 가 `[ns, order]` 를 돌려줌: 중간값이 이웃 사이에 엄밀히 안 들어가면 형제를 `renumber()` 로 0..n 재번호하고 `i + 0.5`. `moveSibling` 동률이면 교환 순서로 재번호.
- **E7·E12** `visibleRows`·`cloneBranch`·`nodesToOutline` 은 `childIndex` 1회. outline.ts 는 repo 대신 path 에서 가져온다(db 의존 제거).
- **E8** 끌기 임계는 화면 px(`clientX/Y` 차)로 비교.
- **E13** search.ts: 제목 일치 먼저, 그다음 내용·별칭. Ctrl/⌘+K 도 검색.
- **E14** 고정 한국어 프롬프트 상수 + 버튼(`.io-actions`).
- **E19** `isComposing` 을 `edit.ts` 로 옮겨 EditorPage·NoteEditor·TreeListPage 가 공유.
- **E21** Ctrl+V 는 cutId 있을 때만 가로챔. 캔버스 `onPaste`(target === currentTarget 일 때만) 가 `importOutline(false, text)`.
- **F11** `purgeDeletedTrees` 에서 `events.where('ts').below(now-180일).delete()`(ts 인덱스 있음).

## 수정 파일
- `src/features/editor/EditorPage.tsx`, `edit.ts`, `search.ts`, `TreeListPage.tsx`
- `src/features/editor/content/NoteEditor.tsx`, `graph/GraphView.tsx`
- `src/core/repo.ts`, `repo.check.ts`, `outline.ts`, `outline.check.ts`
- `docs/plans/agent_WE_improve.md`

## 작업 목록
- [x] 1. `npm ci`, plan 문서
- [x] 2. repo.ts: E3 srs 보관·복원(+check), E15 addAlias 삭제, F11 events 정리
- [x] 3. outline.ts: E12 childIndex, E4 slice(+check)
- [x] 4. edit.ts isComposing(E19) · search.ts 내용·별칭(E13) · GraphView 임계(E8) · NoteEditor 5,000자(E4) · TreeListPage maxLength(E5)·isComposing(E19)
- [x] 5. EditorPage: E1 E2 E16(restore·onRemote), E6(orderAfter·moveSibling), E7(visibleRows), E10 E11 E13 E14 E15 E17 E18 E19 E21, 루트 메모 slice(E4)
- [x] 6. typecheck · lint · check · build
- [x] 7. 스크래치 Playwright(msedge, 5361)로 E1/E3/E21/E4 흐름 확인
- [x] 8. 커밋, worker_done

## 검증 방법
- 2·3: `npm run check`(outline.check·repo.check 단언).
- 4·5: `npm run typecheck`, `npm run lint`(경고 0), `npm run build`.
- 7: 스크래치 스크립트 — 노드 삭제→Ctrl+Z 뒤 `updatedAt` 증가·srs 복원, 캔버스 Ctrl+V 로 개요 추가, 내용 5,001자 입력 시 토스트.

## 변경 사항
- E1: `restore()` 의 `Date.now()` 는 oxlint `react(purity)` 때문에 map 콜백 안에서 호출(기존 `jump`·`autoArrange` 와 같은 방식).
- E3: `takeHeldSrs()` 는 트랜잭션 안에서 꺼낸다(실패해도 보관분이 사라지지 않게).
- E11: 개요 복사를 `copyOutline(rootId)` 하나로 모아 전체 내보내기·패널 '이 가지 내보내기' 둘 다 "여러 줄 내용 N개 제외" 를 알린다.
- E13: 검색 placeholder '제목 검색' → '제목 · 내용 · 별칭 검색', 빈 결과 문구 '찾는 노드가 없습니다'(E2E 가 쓰지 않는 문구).
- E18: 버튼에만 aria-label. 안쪽 `<output aria-label="배율">` 는 E2E(extras·ux) 가 쓰므로 유지.

## 결과
- typecheck·lint(경고 0)·check·build 통과. precache 70개 631.35 KiB(≤640), EditorPage gzip 17.29 KB.
- 스크래치 Playwright(msedge, 5361): 캔버스 Ctrl+V 로 2노드 추가(E21), Backspace 삭제(E10), srs 심은 노드 삭제→Ctrl+Z 뒤 srs miss=3 복원·updatedAt 갱신(E3), 되살린 노드 updatedAt 증가(E1), ':: 메모' 내용으로 Ctrl+K 검색(E13), 5,001자 붙여넣기 → 토스트·내용 되돌림·DB 미저장(E4), 배율 aria-label(E18), AI 프롬프트 복사(E14).
- 미검증(코드만): E6 재번호(부동소수 한계 재현 어려움), E8 확대 상태 끌기 임계, F11(180일 지난 events 없음), E16.
