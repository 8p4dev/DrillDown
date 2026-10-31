# 에이전트 C plan — SRS·색·이벤트 (R4, R6 events.ts)

근거: orchestration plan §2 R4·R6, §4.4 / 03 §3.1·§3.5 / 11 §4.2

## 접근 방식
- **ts-fsrs 6.0.0 `DefaultScheduler()`(FSRS-7, 기본 설정)** 를 모듈 최상위 `await` 로 1회 생성. 계약 함수(`applyGrade`, `retrievability`)가 동기이므로 비동기 팩토리를 모듈 로드 시 해소한다.
  - 대안: `defineScheduler(...).create()` 로 동기 생성 → 미들웨어(학습 단계·최대 간격 등)를 직접 조립해야 해서 기각. TLA 는 Vite 8 기본 빌드 타깃·tsx(ESM)에서 지원.
  - 실측: FSRS-7 기본값에서 새 카드 Hard ≈ 0.6일, Good ≈ 4.8일, 2회차 Hard 2.6일 / Good 20.7일 → 일 단위 간격, Hard < Good.
- 카드는 ts-fsrs 가 돌려준 객체(Date 필드 `dueAt`, `lastReviewAt`)를 그대로 `NodeSrs.card` 에 저장(IndexedDB 구조적 복제로 Date 유지). `due = +card.dueAt`.
- R = `scheduler.model.forgettingCurve(card, scheduler.chrono.difference(lastReviewAt, now))`. 미복습 카드는 0.
- 판정→Rating: exact|alias|fuzzy + 구조 ok(또는 null) = Good, + misplaced = Hard, self_accept = Hard, 나머지 Again.
- 색(노드 자신): 미학습 none · Again 계열 red · 자동 정답 R≥0.9 green / R≥0.8 lightgreen / 그 아래 none(바램) · self_accept·pendingRecheck·misplaced 는 최대 lightgreen(R≥0.8) 아니면 none · misplaced 면 `misplaced:true`.
- 부모 집계: 후위 순회. 자식이 하나라도 green 이 아니면(lightgreen/yellow/red/none) 부모 green → lightgreen 로 강등, 그 외 부모 자신 상태 유지(A5: red 는 전파하지 않음).
- 가지 완료: 노드+모든 자손 `autoCorrectDays.length ≥ 2`. 날짜 키는 로컬 YYYY-MM-DD.
- 재확인: self_accept → pendingRecheck=true, 자동 정답 → false 이고 이전이 true 면 `recheckResolved`. 그 외 판정은 이전 값 유지.
- 순수 함수와 DB 래퍼는 같은 `index.ts`(계약 경로) 안에서 분리. 자손 탐색은 repo.ts(A 소유, 미머지)에 의존하지 않도록 로컬 헬퍼로.
- 색 임계값은 `FADE = { green: 0.9, lightgreen: 0.8 }` 상수 하나 [가정: 임의값].

## 수정/생성 파일
- `docs/plans/agent_C_srs.md` (이 문서)
- `src/core/srs/index.ts`
- `src/core/srs/srs.check.ts`
- `src/core/events.ts`

## 작업 목록
- [x] ts-fsrs README·타입 확인, 간격 실측
- [x] plan 작성
- [x] `events.ts`: logEvent, exportEvents
- [x] `srs/index.ts` 순수 함수: gradeToRating, isAutoCorrect, applyGrade, retrievability, nodeColor, colorMap, colorClass, isBranchComplete
- [x] `srs/index.ts` DB 래퍼: recordGrade, getSrsMap, dueByTree
- [x] `srs.check.ts`: 등급 매핑, Hard<Good 간격, self_accept 후 green 금지, 재확인 해소, 서로 다른 날 2회 → 완료(같은 날 2회는 미완료), 부모 집계, 바램
- [x] 검증: `npx tsx src/core/srs/srs.check.ts`, `npm run build`, `npm run lint`
- [x] 커밋

## 검증 방법
- 순수 로직: `npx tsx src/core/srs/srs.check.ts` (assert, DB 미사용)
- 타입: `npm run build` (tsc -b 포함) · 린트: `npm run lint`
- DB 래퍼: 타입체크만 (E2E 는 오케스트레이터)

## 변경 사항
- **lightgreen 임계값 0.7 → 0.8**: FSRS-7 망각 곡선이 완만해서(첫 Good 후 R: 5일 0.90, 30일 0.81, 120일 0.73, 365일 0.67) 0.7 이면 바램이 ~250일 뒤에야 일어난다. 0.8 이면 ~35일.
- **srs.check.ts 는 `node:assert` 대신 파일 내 최소 assert 사용**: 앱 tsconfig(`types: ["vite/client"]`, 수정 금지)에 node 타입이 없어 `tsc -b` 가 실패하기 때문.
- 부모 집계에서 red 자식: A5(부모 자기 상태 유지)와 "자식이 모두 green 일 때만 green" 이 충돌하는 경우(부모 green + red 자식)는 보수적으로 부모를 lightgreen 으로 강등. 부모가 green 이 아니면 자기 상태 그대로(red 는 전파 안 함).
