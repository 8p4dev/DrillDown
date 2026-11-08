# 에이전트 LM plan — 레이아웃·반응형·모바일 키보드 (R6, R3 배치, R5 레이아웃)

작성 2026-11-08. 상위 plan: `docs/plans/orchestration_redesign.md` §1 R3·R5·R6, §3 공유 계약, §4 작업 규칙(포트 8022, `src/**`·`e2e/**` 수정 금지).

## 접근 방식

- 산출물은 코드가 아니라 설계 문서 `docs/specs/02_layout_mobile.md`(plan §3.1 절 순서). 모든 문장에 [결정]/[제안]/[가정]/[출처 n]/[코드] 태그.
- **측정 우선**: dev 서버(8022) + Playwright(chromium, 설치된 1.65) 임시 스크립트로 6개 기존 화면 × 3폭(390·768·1440) 스크린샷을 찍고, 키보드 열림은 뷰포트 높이 844→(844−키보드 높이)로 줄인 뒤 입력칸에 포커스한 상태로 찍어 가려지는 요소를 `getBoundingClientRect`로 계산한다. 시드는 `e2e/mobile.spec.ts`와 같은 개요 붙여넣기 흐름(UI 조작)으로 만든다.
- 키보드 높이 수치는 외부 출처(안드로이드 키보드 높이 통계·Chrome `interactive-widget` 문서)에서 가져오고 출처 URL·확인일을 적는다.
- 브라우저 전략은 Chrome Android(`interactive-widget`), iOS Safari(`visualViewport`, 레이아웃 뷰포트 불변), Samsung Internet, PWA standalone을 출처와 함께 표로 정리하고, 구현 계약은 `--kb` CSS 변수 + `useVisualViewport()` 훅의 이름·시그니처만 제안한다(구현 없음).
- 검토한 대안:
  - 키보드 대응을 `interactive-widget=resizes-content` 한 줄로 끝내기 → iOS Safari는 이 메타를 지원하지 않아 하단 고정 UI가 키보드 뒤로 숨는 문제가 남는다. JS 폴백(`visualViewport`)이 필요하다.
  - 하단 탭 바(모바일 내비게이션) 도입 → 현재 화면 수(6+4)와 "상단 바 + 트리 헤더 탭" 구조에서 탭 바는 키보드 열림 때 또 하나의 하단 고정 UI가 된다. 상단 유지를 추천하되 §3에서 근거를 적는다.
  - Playwright 대신 실기기 → 실기기가 없어 에뮬레이션(뷰포트 축소)으로 측정하고, 실기기 체크리스트를 §5에 남긴다.

## 수정/생성 파일

- `docs/plans/agent_LM_layout.md` (이 파일)
- `docs/specs/02_layout_mobile.md`
- `docs/specs/evidence/lm/README.md` (파일 목록·재현 방법)
- `docs/specs/evidence/lm/shots.mjs` (스크린샷·가려짐 측정 스크립트, Playwright 라이브러리 API, `e2e/` 밖)
- `docs/specs/evidence/lm/occlusion.md` 또는 `.json` (측정 결과 표)
- `docs/specs/evidence/lm/*.png|webp` (150KB 이하, 필요한 것만)
- 그 외 전부 읽기 전용. `node_modules` 설치(`npm ci`)는 커밋 대상 아님.

## 단계별 작업

- [x] 1. 코드·문서 읽기: `App.tsx` `index.css` `editor/*` `flash/*` `dnd/*` `TreeHeader` `e2e/mobile.spec.ts` 이전 plan 2개, R3·R4, biz 04_tech §3
- [x] 2. plan md 작성 (이 파일)
- [x] 3. 브라우저 전략 출처 수집 (Chrome `interactive-widget`, iOS Safari `visualViewport`/`dvh`, Samsung Internet, PWA standalone, 안드로이드 키보드 높이)
- [x] 4. `npm ci` → dev 서버 8022 기동 확인
- [x] 5. 측정 스크립트 작성·실행: 6화면 × 3폭 스크린샷 + 키보드 열림(높이 축소+포커스) 스크린샷 + 가려짐 측정 JSON
- [x] 6. 스크린샷 용량 확인(≤150KB) 및 `evidence/lm/`에 정리, README 작성
- [x] 7. 문서 §1~§4 작성 (결정표, 화면×폭 와이어, 입력칸 인벤토리, 브라우저 전략표, 최소 텍스트 배치, 터치·제스처, 성능)
- [x] 8. 문서 §5 검증 (요구 대조표, 코드 대조 파일·줄, 측정 결과, 약점), §6 질문, §7 출처
- [x] 9. `npm run typecheck && npm run lint && npm run build` (코드 무변경 확인)
- [x] 10. 커밋(의미 단위: plan → evidence → spec) 및 worker_done 보고

## 검증 방법

- 3: 각 주장 옆에 URL·확인일. 1차 출처(developer.chrome.com, webkit.org, MDN, Samsung 개발자 문서) 우선.
- 5: 스크립트가 출력한 JSON의 `hidden` 항목(입력칸 rect 하단 > 축소된 뷰포트 높이, 고정 UI rect와 입력칸 rect 교차)을 문서 표로 옮긴다. 수치는 스크립트 재실행으로 재현 가능해야 한다.
- 6: `ls -l`로 크기 확인.
- 9: 세 명령 종료 코드 0, `git status`에 `src/**` 변경 없음.

## 변경 사항

- 측정 스크립트는 scratchpad가 아니라 `docs/specs/evidence/lm/shots.mjs`에서 실행했다. 프로젝트 밖 경로에서는 `@playwright/test` 모듈 해석이 안 된다(node_modules 상위 탐색). 결과 이미지·JSON은 scratchpad에 쓰고 남길 것만 복사했다.
- 같은 해시로 재방문하면 Playwright `goto`가 문서를 다시 그리지 않아 이름 변경 모드가 남았다 → `open()`이 `about:blank`를 거친다.
- 카드 제목 편집 케이스는 더블클릭이 액션 가능성 검사(50% 배율 카드)에 걸려 타임아웃 → `.outline` 포커스 + `F2`(같은 `startEdit` 경로)로 바꿨다. `CASES=<이름>` 환경변수로 케이스 1개만 재실행할 수 있게 했다.
- 키보드 스크린샷은 모델 B 7장 전부 + 모델 A는 에디터 4장만 보관(목록·범위 select는 두 모델 차이가 없음). 총 29장, 최대 58KB.
- `npm ci`가 필요했다(워크트리에 node_modules 없음). 커밋 대상 아님.
- typecheck · lint · build 통과, `git status`에 `src/**` 변경 없음(2026-11-08).
