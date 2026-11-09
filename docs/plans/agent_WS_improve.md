# 에이전트 WS — 학습·복습 개선 (orchestration_improve.md §1.3)

## 접근 방식
- 모든 변경은 소유 파일(`features/flash/**`, `features/dnd/**`, `core/srs/**`, `core/source.ts`, `share/SharedPage.tsx`·`share.css`) 안에서. 새 의존성 없음. 배지 갱신은 계약 C3 이벤트(`dd:due`)만 쏜다.
- **S2 다시 평가**: `recordGrade`/`recordResult` 에 선택 인자 `base?: NodeSrs | null`(평가 전 기록, null = 없었음)을 추가(C5: 기존 호출 형태 유지). 있으면 `db.srs.get` 대신 base 를 기준으로 다시 계산해 덮어쓴다. `StudySource.record(nodeId, ok, base?)` 도 같은 꼴. FlashCard 는 새 prop `srs`(부모의 Map)에서 첫 평가 때의 기록을 ref 에 담아 두고, 다시 평가 때 넘긴다. 메모리 소스도 같은 규칙.
  - 대안: record 가 이전 값을 돌려주기 → 반환형 변경이라 C5 위반. 기각.
  - 한계: 새로고침으로 복원된 평가(initialRated)를 다시 평가하면 기준이 없어 보통 기록(2회)이 된다. 세션 안만 고친다.
- **S3**: FlashCard.rate·Dnd/Blank.grade 를 try/catch. 실패 → `toast('저장하지 못했어요')`, 화면 상태 되돌림(rated 이전 값 복원 / score=null).
- **S4·S5·S9**: `Progress.sub?: true` 면 readProgress 의 개념 집합 크기 검사 생략(부분 큐: 모름만·약점만). `go(id)` 는 큐에 없으면 `pos+1` 에 끼워 넣고(기본 구간이면 base+1) 이동. `weakQueue(nodes, srs, scope)` 순수 함수: 범위 개념 중 자식 miss 합 > 0, 합 내림차순(동률은 전위).
- **S7**: `recordGrade`/`recordResults` 트랜잭션에 `db.nodes` 포함, 노드 없으면 건너뜀(`null` 반환 / 배치는 그 항목만 제외). `StudySource.record` 반환형 `Promise<NodeSrs | null>`. ReviewPage 는 세션 밖에서 `dd:remote` 에 목록 다시 읽기, FlashPage 는 `dd:remote`(detail.treeIds 에 내 트리) 때 `src.srs()` 다시 읽기(Dexie 소스일 때만).
- **S8·S10·S19 복습**: Session 에 `order`(섞기 전 순서)·`rest`(남은 개념)·`shuffled`·`done` 추가. `parentQueue` 를 20개씩 자른다. 마지막 카드에서 [더 하기 N개]·[요약]. 요약은 FlashCard.tsx 의 작은 `Summary` 컴포넌트(`.flash-summary` 마크업)를 FlashPage 와 공유. [섞기] 는 플래시와 같은 aria-pressed 토글(현재 묶음을 섞고 처음부터, missed 유지).
- **S11**: 카드 `aria-pressed={sel===id}`, 채운 칸 `role="group"`, useDragDrop 에 sel 있을 때 window keydown Esc → 해제.
- **S13·S14·S17**: 분모 `ext.length`; 기록 성공 뒤 `dispatchEvent(new Event('dd:due'))`(srs/index.ts 안, 한 곳); 모바일 `.flash-dive{min-height:44px}`.
- **S16**: `nextConcept`·`isBranchComplete` 삭제, `applyGrade` 는 NodeSrs 만 반환(recheckResolved·logEvent 분기 삭제). 저장 필드(`pendingRecheck`)·`GradeSource` 는 유지. `EventType 'self_graded_node_rechecked'`(types.ts, 오케스트레이터 소유)는 남긴다 → worker_done 에 적는다.
- **S18**: `recordResults(treeId, ids, oks)` 한 트랜잭션. `StudySource.recordResults(ids, oks): Promise<void>` 필수 필드(Dexie·메모리·ephemeral 래퍼 모두 구현).
- **S19 플래시**: 범위 개념이 없으면(루트만 / 리프 범위) 카드 대신 빈 상태(`.empty` + 편집 링크, 공유 보기는 링크 없음). 헤더(범위 선택)는 유지.
- **H5·H8**: 링크 복사 try/catch → '복사하지 못했습니다'. 메뉴 `role`·`aria-haspopup` 제거(aria-expanded·'더 보기' 유지), 바깥 pointerdown 효과에 Esc keydown 추가.

## 수정 파일
- `src/core/srs/index.ts`, `src/core/srs/srs.check.ts`
- `src/core/source.ts`
- `src/features/flash/flash.ts`, `flash.check.ts`, `FlashCard.tsx`, `FlashPage.tsx`, `ReviewPage.tsx`, `study.ts`, `flash.css`
- `src/features/dnd/DndPage.tsx`, `BlankDndPage.tsx`, `useDragDrop.ts`
- `src/features/share/SharedPage.tsx`
- 이 문서

## 단계
- [x] 1 srs: S16 삭제(applyGrade → NodeSrs), S7a 노드 확인, S2 base 인자, S18 `recordResults`, S14 `dd:due`. srs.check 정리 + S2 단언
- [x] 2 source.ts: `record(…, base?)`·`recordResults`, 반환형. study.ts ephemeral 래퍼. SharedPage 메모리 소스
- [x] 3 flash.ts: `nextConcept` 삭제, `Progress.sub`, `weakQueue`. flash.check 단언(S4·S9)
- [x] 4 FlashCard: `srs` prop + base ref(S2), try/catch 되돌림(S3), `Summary` 컴포넌트(S8)
- [x] 5 FlashPage: S4 sub, S5 go 끼워 넣기, S7b dd:remote, S9 약점만 버튼(헤더·요약), S13 분모, S19 빈 상태, Summary 사용
- [x] 6 ReviewPage: S7b dd:remote, S8 요약, S10 20개+더 하기, S19 섞기
- [x] 7 dnd: S3 try/catch, S11 aria-pressed·role=group·Esc, S18 recordResults
- [x] 8 SharedPage H5·H8, flash.css S17
- [x] 9 typecheck·lint·check·build, 스크래치 Playwright(msedge, 5362)로 플래시 다시 평가·복습 요약·빈칸 채점 확인
- [x] 10 커밋, worker_done

## 검증 방법
- `npm run typecheck`, `npm run lint`(경고 0), `npm run check`(srs.check: 다시 평가 = 처음 모름과 같은 card.reps·miss; flash.check: sub 저장본 허용, weakQueue 순서·대상 없음), `npm run build`(예산 유지).
- 스크래치 Playwright: 플래시에서 알음→다시 평가→모름 뒤 IndexedDB srs 행의 `card.reps === 1`; 복습 마지막 카드 → 요약 .flash-summary 표시; 빈칸 채점 뒤 srs 행 수 = 리프 수; `dd:due` 이벤트 발생.

## 변경 사항
- 플래시 `restart`(섞기·모름만·약점만·처음부터)가 같은 자리(0:루트)로 다시 열리면 FlashCard 가 같은 key 라 펼침·평가 상태가 남는 기존 결함을 확인 → 세션 세대 번호 `gen` 을 key 에 넣어 새로 마운트. 계획에 없던 수정.
- 복습 '그만하기' 는 평가가 하나라도 있으면 요약으로, 없으면 바로 목록으로. 마지막 카드에서는 '요약'.
- 커밋 트레일러는 실제 모델(Claude Fable 5.1) 이름을 썼다(plan §5 의 'Opus 5.5' 는 사실과 달라서).

## 결과 (2026-11-10)
- 게이트: typecheck 0 오류, oxlint 0 경고, `npm run check` 전부 ok(srs.check 에 S2 단언, flash.check 에 S4·S9 단언 추가), build ok(precache 70개 633.31 KiB ≤ 640).
- 스크래치 Playwright(msedge, vite 5362, 끝나고 PID 종료) 19개 확인 전부 통과: S2(알음→다시 평가→모름 = srs 행 1개, card.reps 1, miss 1), S14(dd:due 쓰기마다 1회, 배치 1회), S13(분모 1/4), S9(모름 뒤 '약점만' 보임, 큐 1/1), S5(부분 큐에서 더 깊이 → 2/2 로 끼워 넣기), S4(새로고침 뒤 부분 큐 유지), S11(aria-pressed, Esc 해제, 채운 칸 role=group), S18(빈칸 채점 → 리프 6개 한 번에 기록), S19(복습 섞기 버튼, 루트만 트리 빈 상태 + 편집 링크), S10(4개 → 더 하기 숨김), S8(복습 요약·복습 마치기).
- `c-misplaced`(index.css:206, WH 소유): 생산처는 `core/srs/index.ts colorClass` 뿐이고 `lastStructure='misplaced'` 를 만드는 코드는 없다(recordResult 는 'ok'|null). 서버·과거 행에서만 나올 수 있는 클래스 — 삭제해도 되지만 WH 판단.
- 감사 근거 줄 번호는 1a0519d 이전 기준이라 몇 줄씩 어긋났을 뿐 내용은 전부 맞았다. S16 의 `EventType 'self_graded_node_rechecked'`(types.ts, 오케스트레이터 소유)는 남겨 두었다(이제 쓰는 곳 없음).
- E2E 영향: C4 셀렉터 변경 없음. '더 보기' 버튼 이름·aria-expanded 유지(role=menu 만 제거). 플래시 '요약' 버튼·'알음'/'모름' 버튼·'평가 집계' 그대로. 복습 화면 버튼은 '복습 마치기' → 카드 화면에서는 '요약'/'그만하기', 요약 화면에 '복습 마치기'(E2E 미사용).
- 남은 위험: 새로고침으로 복원된 평가(initialRated)를 다시 평가하면 기준이 없어 보통 기록(2회)이 된다. ScopeSelect 는 개념이 없는 트리에서 '—' 로 표시된다(기존 동작).
