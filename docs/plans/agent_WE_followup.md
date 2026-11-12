# 워커 WE — 편집기 후속: 편집 중 자동 맞춤 보류(F1) · 모바일 개요 버튼과 토스트 겹침(F2)

오케스트레이션: `docs/plans/orchestration_editor_share_followup.md` §1.1. base `main` `ce4d5d6`(브랜치 `aa96323`). 포트 vite 5362 / 서버 4362. DATA_DIR `.research-data/WE2`.

## 접근 방식

- **F1 편집 중 보류**: `EditorPage.onSettled` 는 `settled`·`restorePending` 처리(첫 진입 복원)까지는 지금처럼 하고, 그 다음 "편집 중"(`editRef.current !== null || noteEditId !== null || liveBase.current`)이면 `fitLater.current = true` 로 적고 돌아간다(배율·스크롤 불변). 편집이 끝나면 보류된 맞춤을 1회:
  - 카드 제목·카드 내용: `useEffect([editId, noteEditId])` — 둘 다 null 이고 `fitLater` 면 훅의 `fit(selRef.current)` 호출. `useEffect`(커밋 뒤) 라 `fit` 안의 `flushSync` 가 허용되고, 그 시점의 실제 `.graph` 크기(`offsetWidth/Height`)로 맞추므로 입력 중 카드가 커진 만큼도 반영된다(onSettled 가 넘긴 옛 w·h 를 저장해 두는 것보다 정확하고 ref 하나가 준다).
  - 패널 실시간 편집: `endLive()` 끝에 같은 조건(카드 편집도 아닐 때)으로 `fit`. 패널 편집 중 집합이 바뀌는 경우는 원격 동기화(dd:remote)뿐이지만 조건은 과제대로 둔다.
  - `centerAfter`(검색·실행 취소) 는 편집 중이면 애초에 생기지 않고(편집을 먼저 끝낸다) 보류 뒤 `fit(sel)` 이 선택을 가운데에 두므로 따로 다루지 않는다. 검색창(`searching`)은 "편집 중"에 넣지 않는다(A3).
  - 대안: onSettled 의 w·h 를 ref 에 적어 두고 같은 식으로 배율 계산 — 편집 종료 시점엔 크기가 달라져 있을 수 있어 버림. `fit` 은 C2 계약의 기존 함수라 새 코드가 거의 없다.
- **F2 토스트 겹침**: (b) ≤760px 에서 `.side` 에 아래 여백. 이유: CSS 한 줄이고 1440px 은 전혀 안 바뀐다. (a) 는 버튼을 패널 안(경로 줄 아래)으로 옮겨야 해서 DetailPanel 구조·CSS 를 손대고, 그래도 패널 내용 칸이 토스트 밑에 깔리는 건 같다. 값: 토스트 띠 = 아래 1.25rem + 토스트 높이(≈3rem) ≈ 4.25rem + safe-b. `main` 의 아래 패딩(2rem + safe-b)이 이미 있으므로 `.side { padding-bottom: 3rem }` 이면 버튼 아래가 5rem + safe-b → 띠 위. `--tap` 은 fine 포인터에서 `auto` 라 `calc(var(--tap) …)` 은 무효가 되므로 rem 상수로 쓴다. Playwright 좌표로 확정.

## 수정 파일 (모두 소유 범위 안)

- `src/features/editor/EditorPage.tsx` — `fitLater` ref, `onSettled` 보류, `useEffect([editId, noteEditId])`, `endLive` 끝 맞춤
- `src/features/editor/editor.css` — ≤760px `.side` padding-bottom
- `docs/plans/agent_WE_followup.md` — 이 문서

GraphView 는 바꾸지 않는다(onSettled 호출 조건 그대로). `src/index.css`·`e2e/**` 손대지 않음. 계약 C2·C4·C6 불변.

## 단계

- [x] 0. plan 작성, `npm ci`
- [x] 1. F1 EditorPage: `fitLater`, onSettled 보류, 편집 종료 이펙트, endLive
- [x] 2. F2 editor.css ≤760px `.side` 아래 여백
- [x] 3. typecheck · lint(0) · check · build
- [x] 4. 서버(4362, AUTH_FAKE=1, DATA_DIR=.research-data/WE2) + 스크래치 Playwright(msedge, 1280 + 390 터치): Enter 3회 연속 추가 중 배율·scrollTop·scrollLeft 불변 → Esc 뒤 맞춤 1회(배율 ≤100, 전체 보임) / 접기·펼치기 자동 맞춤 유지 / extras 흐름(83% 에서 가지 접기 → 배율 변화·≤100) / 390 에서 삭제 토스트 중 `.io-open` bbox 와 `.toasts` bbox 비겹침 / 1440 레이아웃 변화 없음. 끝나면 PID 종료
- [x] 5. 커밋, worker_done

## 검증 방법

- 1~2: `npm run typecheck`, `npm run lint`, `npm run check`, `npm run build`.
- 4: 빌드를 서버로 띄우고 scratchpad Playwright 스크립트로 수치 확인. 기존 E2E 셀렉터(C4) 변경 없음.

## 변경 사항 (계획과 다른 점)

- 계획대로. F2 값은 `3rem`(측정: 390 터치에서 .side 패딩 45px → 버튼 아래 769px, 토스트 위 782px, 13px 여유).

## 결과

- 게이트: typecheck · lint(경고 0) · check · build 통과(precache 640.22 KiB 는 WH F3 담당).
- 스크래치 Playwright(msedge, 빌드를 4362 서버로, 1280×720 + 390×844 터치): 32/32 통과.
  - F1 여유 있는 트리(100%): 카드 dblclick → Enter 3회 연속 추가 동안 배율 100%·scrollTop 0·scrollLeft 0 그대로, 카드 +1·+2·+3. Esc(빈 카드) → 삭제 + 맞춤 1회(전체 보임).
  - F1 꽉 찬 트리(가져오기 뒤 43% 맞춤): Enter 3회 동안 배율 43%·scrollTop 0 불변. scrollLeft 는 0→61→150→238 로 움직이는데 이것은 NodeRow 의 기존 "선택 카드를 nearest 로 보이게" 스크롤(새 형제가 캔버스 오른쪽 밖에 생기므로 입력칸을 보이게 당긴다)이지 맞춤이 아니다 — 입력칸이 캔버스 오른쪽 가장자리에 딱 붙어 보임(right 0~1px). Esc 뒤 맞춤 1회 43%→33%, 전체 보임. 이어 접기 33→36, 펼치기 36→33(편집 중 아닐 때 자동 맞춤 그대로).
  - extras E2E 흐름: 100 → 120 → 83 → 새로고침 83% 복원 → 가지 접기 → 100%(≤100, 83 아님). 패널 제목 입력 뒤 blur(endLive) 오류 없음.
  - F2 390: 노드 삭제 → 되돌리기 토스트 중 페이지 끝까지 스크롤: `.io-open` 725~769px, `.toasts` 782~825px → 비겹침. 글자 버튼 탭 → 시트 열림. 1440: `.side` padding-bottom 0px(변화 없음).
- E2E 영향: 셀렉터(C4)·클래스(C6)·useZoom 시그니처(C2) 변경 없음. `e2e/extras.spec.ts` 의 자동 맞춤 흐름은 편집 중이 아닐 때라 그대로.
- 남은 위험: 꽉 찬 트리에서 편집 중 새 형제가 캔버스 밖에 생기면 nearest 스크롤로 입력칸만 가장자리에 보인다(맞춤은 Esc 뒤). 편집 중 원격 동기화로 집합이 바뀐 경우의 보류 맞춤은 코드 경로(`endLive`·이펙트)만 있고 실측하지 않았다.
