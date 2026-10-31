# 에이전트 B — 채점 엔진 (R3) plan

근거: orchestration plan §2 R3·§3 A1·A2·§4.3, `reports/11_cost_recovery.md` §4.1, `reports/04_tech.md` §5.
범위: `src/core/grading/**` 순수 함수(DB·React 없음). 공유 계약 §4.3 시그니처 그대로.

## 접근 방식
- **① 정규화** `normalize`: NFC + 소문자 → 줄머리 번호/글머리(`-`,`*`,`•`,`1.`,`1)`,`가.`,`(1)`,`①`…) 제거 → `\p{L}\p{N}` 외 문자(공백·기호·괄호) 전부 제거 → 끝 조사 1회 제거(A2: `에대한|에관한|의|은|는|이|가|을|를`, 남는 길이 ≥ 2일 때만 — "국가"→"국" 같은 오삭제 방지).
- **② 허용 표현**: `normalize(alias) === normalize(user)` 이면 alias. 빈 정규화 문자열은 일치로 보지 않음.
- **③ 자모 퍼지** `similarity`: 한글 음절을 초·중·종성 코드로 분해(유니코드 산술, 의존성 없음) → 레벤슈타인 거리 → `1 - d / max(len)`. 원본 title·aliases 중 최댓값. 3구간: `≥ accept(0.85)` fuzzy, `< reject(0.5)` reject, 사이 ambiguous (`THRESHOLDS` 상수).
  - 대안: 문자 n-gram(Dice). 짧은 쟁점어(2~6자)에서는 bigram 수가 적어 한 글자 오타에 점수가 급락 → 자모 편집거리만 채택. n-gram 결합은 실측 후.
  - `similarity` 는 입력을 정규화하지 않는다(조사 제거가 멱등이 아니므로). `gradeBlank` 가 정규화한 문자열을 넘긴다.
- **④ 구조 비교**: 원본 n × 사용자 m 가중치 행렬 → **헝가리안(O(N³), 정사각 패딩)** 으로 최대 가중 1:1 할당. 가중치 = 점수(reject 미만이면 `점수×1e-3` — 남는 노드끼리 가장 비슷한 것만 짝짓는 동점 해소용).
  - **2패스**: 1패스 할당 결과로 "사용자 부모의 짝 = 원본 부모"인 쌍에 +0.01 보너스 후 재할당. 법 목차의 "요건/효과"처럼 같은 제목이 여러 부모 밑에 반복될 때 위치 오류 오판을 막는다.
  - 대안: 탐욕 할당(입력 순서 의존 → 완료 기준 위반), Zhang-Shasha 트리 편집거리(04 §5: 피드백 해석이 어려움) → 기각.
  - structure: 매칭(exact/alias/fuzzy/ambiguous)이고 사용자 부모가 null↔원본 부모=rootId, 또는 사용자 부모의 짝(매칭된 경우만) = 원본 부모 → `ok`, 아니면 `misplaced`. reject·missing → `null`.
  - `nodeRecall` = 매칭(reject·missing 제외) 원본 수 / 원본 수. `edgeAccuracy` = ok 수 / 매칭 수(매칭 0이면 0). 원본 0개면 둘 다 0.
  - reject = 할당은 됐지만 유사도 < 0.5 (UI 가 "이렇게 썼음" 표시 가능하도록 userText 유지). missing = 할당된 사용자 노드 없음. `extraUserNodes` = 할당 안 된 사용자 노드.
- **⑤ 의미 단위** `splitIdeaUnits`: 공백·`·/,()[]` 와 단어 `및|와|과|또는|등` 으로 분리, 토큰별 끝 조사 제거, 빈 토큰 제거. 2개 미만이면 `[title]`, 4개 초과면 앞에서부터 4묶음으로 합침. 띄어쓰기 없는 복합명사 분해(형태소 분석)는 의존성 금지로 제외.
- `resolveGradeSource`: §4.3 주석 그대로. ambiguous 에 `checkedUnits` 미지정 = 0 = self_reject.
- 점검 파일은 `node:assert` 대신 자체 `check()` (앱 tsconfig 에 node 타입 없음, tsc -b 가 src 전체를 검사).

## 수정/생성 파일
- `docs/plans/agent_B_grading.md` (이 파일)
- `src/core/grading/jamo.ts` — 자모 분해 + 레벤슈타인
- `src/core/grading/hungarian.ts` — 최대 가중 할당
- `src/core/grading/index.ts` — 공유 계약 §4.3
- `src/core/grading/grading.check.ts` — 자체 점검
- 소유 범위 밖 파일: 없음.

## 단계별 작업
- [x] plan 작성
- [ ] `jamo.ts`: `toJamo`, `levenshtein` 
- [ ] `hungarian.ts`: `assignMax(weights[][])` → 행별 열 인덱스(-1 = 미할당)
- [ ] `index.ts`: THRESHOLDS, normalize, similarity, splitIdeaUnits
- [ ] `index.ts`: gradeBlank(2패스 할당·구조·재현율·간선 정확도), resolveGradeSource
- [ ] `grading.check.ts`: R3 최소 케이스(공백·기호·번호·조사 → exact, 별칭 → alias, 한 글자 오타 → fuzzy, 무관 → reject, 다른 부모 → misplaced, 누락 → missing, 순서 무관 최적 할당) + 반복 제목 구조, resolveGradeSource, splitIdeaUnits
- [ ] 검증: `npx tsx src/core/grading/grading.check.ts`, `npm run build`, `npm run lint`
- [ ] 커밋

## 검증 방법
- 각 모듈: `npm run typecheck`.
- 동작: `npx tsx src/core/grading/grading.check.ts` (실패 시 예외 → 비정상 종료, 성공 시 `grading check OK`).
- 최종: `npm run build`, `npm run lint`.
