# 에이전트 QA — UI-First 통합 검수 (2차)

작성 2026-11-08. 상위 `orchestration_ui_first.md` §4 QA 행. 시작 커밋 1118774(1차 5명 머지, E2E 13/13). preview 포트 8026. 코드 수정 없음.

## 접근 방식

- `npm ci && npm run build && npm run preview -- --port 8026 --strictPort`(dist 그대로 — 예산 측정과 같은 산출물).
- Playwright 임시 스크립트 1개(scratch, 커밋 안 함, `@playwright/test` 의 `chromium` + `channel: 'msedge'`). 컨텍스트 4개(390×844 coarse `hasTouch`·`isMobile` / 1440×900 fine × light/dark). 각 컨텍스트에서 앱 안 동작으로 데이터를 만든다: 새 트리 → 에디터 개요 붙여넣기 → 플래시 평가 → 빈칸·백지 채점 → 복습 → mock 로그인 → 계정 → 관리자 데모 로그인 → 관리자 4탭 → `/t/3fK9pQ2xT7m` 4탭 → 갤러리.
- 화면마다 같은 함수 `audit(page, screen)` 로 자동 검사 (a)~(e) 를 수집해 JSON 으로 남긴다. (f)(g)(h) 와 `--kb` 주입 검사는 별도 단계.
  - (a) `button, a, [role=button], summary, input[type=checkbox]` 중 보이는 글자 없음 + 접근 이름(aria-label/aria-labelledby/title) 없음.
  - (b) 390 coarse 에서 보이는 상호작용 요소의 rect 가 44 미만(폭 또는 높이). 인라인 본문 링크는 별도 집계.
  - (c) `scrollWidth > innerWidth`.
  - (d) 보이는 요소의 `color`·`background-color`·`border-*-color` 계산값을 그 테마 토큰 값 + `color-mix` 로 만들 수 있는 값(투명도 포함)과 비교 — 무채색(R=G=B) 이거나 ok/danger 계열 색상(hue) 이면 통과, 그 밖은 위반(형광펜 `mark.hl-*`, `.oauth`/제공자 버튼 제외).
  - (e) `box-shadow != none`, `backdrop-filter != none`, 각 모서리 `border-radius > 2px`.
- 대안 검토: 스크린샷 비교 도구(pixelmatch) — 의존성 추가 금지·기준 이미지 없음 → 기각. axe-core — 의존성 추가 금지 → 직접 규칙 5개로 대체.
- 예산: `npm run build` 출력(precache·CSS) + `dist` 파일을 node `zlib.gzipSync` 로 압축 + 목록 진입 시 Playwright `response` 로 받은 JS/CSS/HTML 목록 대조.

## 수정/생성 파일

- `docs/plans/agent_QA_ui.md`(이 파일)
- `docs/specs/06_ui_qa.md`(신규, 산출물)
- `docs/specs/evidence/ui/qa/*.jpg`(≤48장, q60, ≤120KB)
- 그 밖 무변경(`src/**`·`e2e/**`·설정 금지)

## 단계

- [x] 1 `npm ci`, `npm run build` 출력 저장, preview 8026 기동
- [x] 2 캡처 스크립트: 4 컨텍스트 × 10 화면(관리자 4탭·공유 4탭 포함) 스크린샷 + audit JSON
- [x] 3 스크린샷 육안 확인(와이어 02 §3.1·상태표 01 §3.3·인벤토리 01 §3.5)
- [x] 4 `--kb: 336px` + `data-kb` 주입 검사(02 §3.3 끝 4건 + 시트·dnd-bar)
- [x] 5 (f) 다크 대비 (g) 공유 보기 `srs` 행 수 (h) 테마 순환·새로고침 FOUC
- [x] 6 예산 표(precache·CSS·첫 화면 gzip)
- [x] 7 워커 미결 항목 화면 영향 확인
- [x] 8 대표 스크린샷 선정(화면당 4장, ≤48) → `evidence/ui/qa/`
- [x] 9 `06_ui_qa.md` 작성
- [x] 10 `npm run typecheck && npm run lint && npm run build` 통과, `git status` 로 `src` 무변경 확인, 커밋, worker_done

## 검증 방법

| 단계 | 확인 |
|---|---|
| 1 | build 종료 코드 0, `curl localhost:8026` 200 |
| 2 | 스크립트 종료 코드 0, 스크린샷 수·audit JSON 항목 수 |
| 3·7 | 스크린샷을 Read 로 열어 눈으로 |
| 4·5 | 스크립트 수치(rect·계산 스타일·IndexedDB count) |
| 6 | build 로그 + gzip 합 |
| 8 | 파일 크기 ≤120KB, 개수 ≤48 |
| 10 | 세 명령 종료 코드 0, `git diff --stat main -- src e2e` 비어 있음 |

## 변경 사항

- `--kb` 주입 검사의 첫 측정은 주입 직후 동기 읽기라 `reducedMotion: reduce` 의 1ms 전환 시작값이 나왔다(전부 FAIL 로 보임). 400ms 대기 후 재측정(`kb.mjs`)으로 바꿨다.
- 1차 캡처에서 관리자 데모 로그인 뒤 병합 대화가 관리자 화면을 덮어, 대화를 닫는 단계를 넣어 4조합을 다시 찍었다(2회 실행, 커밋한 48장은 2회차).
- 테마 색 보간·공유 보기 `events`·툴팁·2단계 버튼·sticky·공유 아바타 크기는 보조 스크립트(`theme.mjs` `ev.mjs` `misc.mjs` `misc2.mjs`)로 따로 측정했다.

## 결과

`docs/specs/06_ui_qa.md`: 높음 1 · 중간 14 · 낮음 9. 스크린샷 48장 `docs/specs/evidence/ui/qa/`.
