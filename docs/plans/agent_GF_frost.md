# 에이전트 GF plan — 시안 C 서리 (`data-look='frost'`)

상위 plan: `orchestration_liquid_glass.md` §1 가드레일, §2 C 서리, §3 공유 계약, §6 점검 도구.

## 접근 방식

**논지: 유리의 맑기 = 기억의 선명도.** 흔한 "반투명 + 흐림"과 다르게 보이도록 아래 네 가지로 재질을 구분한다.

1. **맑기를 실제로 보이게 한다.** 플래시 화면 배경에만 정지된 마름모 창살을 깐다. 카드의 불투명도가 숙련도별로 달라 맑은 유리(`green`, `red`)로는 창살이 또렷이 비치고 서리 낀 유리(`none`)로는 비치지 않는다. `backdrop-filter` 없이 알파만 쓴다.
2. **서리는 가장자리부터 낀다.** 창문 성에처럼 `lightgreen`은 모서리에만, `none`은 전면에 낀다. 맑은 유리에는 경계가 또렷한 빛줄기(하드 스톱 그라데이션)를 넣고, 바랜 유리에서는 빛줄기를 흐리게, 서리에서는 없앤다. 질감은 정지 SVG 노이즈(데이터 URI)다.
3. **납선(lead).** 스테인드글라스의 어두운 납 테두리를 카드 테두리와 미니맵에 쓴다. 미니맵은 라이트 모드에서도 어두운 납 패널 위의 색유리 조각으로 그려, 트리 전체가 창 한 장으로 보이게 한다.
4. **답 공개 = 서리 닦기.** `.flash-kid::after`의 서리 덮개가 마스크로 왼쪽부터 한 번 닦인다. 기본 상태가 `opacity: 0`이라 애니메이션이 끝나지 않아도 내용이 보인다. reduced-motion에서는 `animation: none`이다(전역 규칙만 두면 delay 동안 덮개가 남는다).

화면별 재질 언어 (숙련도는 플래시 화면에만, G8·G9):
- 플래시: 위 전부. 비색상 단서는 띠 모양(`green` 실선, `lightgreen`·`yellow` 점선, `red` 굵은 빗금, `none` 없음)과 서리 양, 미니맵의 테두리·모서리 모양이다.
- 에디터: 중립 판유리. `--heat`만 붉은 색유리(혼합 비율 강화 + `data-miss`가 0이 아닌 카드에 빛줄기). 빛줄기를 조건부로 거는 이유는 300장 카드 페인트 비용이다.
- 퀴즈: 차분한 무지 배경(창살 없음). **빈칸 = 서리 낀 칸, 카드 = 맑은 유리 조각.** 채점 결과만 초록·빨강 색유리다. 놓는 순간 서리 칸이 맑은 조각으로 바뀌는 언어를 공유한다.
- 목록: 아바타를 작은 색유리 타일로, 로고를 납선 4분할 유리로 한다.

유리 사용 범위: 실제로 뒤로 콘텐츠가 지나가는 표면만 `backdrop-filter`(`.topnav` `.zoom-tools` `.keys` `.toast` `.tree-menu-list` `.flash-nav` `.dnd-dock` 모바일/고정, `.dnd.locked .dnd-bar` 모바일, `.dnd-ghost`). `.mode-tabs`와 데스크톱 미니맵은 뒤로 지나가는 것이 없어 흐림 없이 같은 모양만 준다(비용 절약, 정지 배경에서는 결과가 같다).

토큰 스위치: `--frost-blur`, `--frost-glass`(유리 채움 비율), `--frost-a`(카드 알파 보정), 노이즈 토큰을 `prefers-reduced-transparency`·`prefers-contrast: more`·`forced-colors`에서 한 번에 끈다.

검토한 대안:
- 카드마다 `backdrop-filter`: 콘텐츠 카드 금지(G2)라 탈락.
- SVG `<pattern>`으로 미니맵 질감: 마크업 수정이 필요하고 외부 paint server는 Chromium이 지원하지 않아 탈락. 테두리·`rx`로 대신한다.
- `--tone`을 그라데이션으로: 색 전환이 끊겨 탈락. `background-color`(전환 가능) + `background-image`(무늬)로 분리한다.
- 상단 바를 띄우기: 렌즈 시안의 언어이고 `9.25rem` 재계산이 필요해 하지 않는다.

## 수정/생성 파일
- `src/looks/frost.css`
- `docs/plans/agent_GF_frost.md`

그 외는 건드리지 않는다.

## 단계별 작업
- [x] S1 문서·CSS·마크업·점검 도구 읽기, `npm ci`
- [x] S2 이 plan 작성
- [x] S3 토큰(라이트·다크)·배경·버튼·입력·표·카드
- [x] S4 조작 표면: `.topnav` `.look-picker` `.mode-tabs` `.zoom-tools` `.keys` `.toast` `.tree-menu-list` `.flash-nav` `.dnd-dock` `.dnd-bar`
- [x] S5 플래시: 재질 4+1종, 미니맵 스테인드글라스, 서리 닦기, 요약, 복습
- [x] S6 에디터(`--heat` 포함), `.lifted`, `.badge`, `.detail`, `.toolbar`
- [x] S7 목록, 퀴즈(`.dnd-*`, `[data-result]`, 고스트)
- [x] S8 접근성 블록(투명도·대비·강제 색상·reduced-motion)
- [x] S9a 점검 도구 4조합 위반 0건
- [ ] S9b `perf` ≥ 50 — 미충족. 서리 20~45, 같은 시간대 기존 21~47 (변경 사항 참고)
- [x] S10 스크린샷 직접 확인(G7~G9, `dnd-drag` 포함), `--heat` 카드·서리 닦기 중간 프레임은 별도 스크립트로 확인
- [x] S11 `npm run typecheck && lint && check && build`, 선택자 스코프 점검(모든 선택자가 `:root[data-look='frost']`로 시작)
- [ ] S12 커밋, 서버 종료, worker_done 보고

## 검증 방법
- G1~G4·G6: `BASE=http://localhost:8013 LOOK=frost OUT=%TEMP%/frost-shots npx playwright test -c tools/look/pw.config.ts look.spec.ts -g <조합>`, `perf`.
- G7~G9: Read 도구로 PNG를 직접 연다.
- 도구 범위 밖(`--heat`, 닦기 중간 프레임, `prefers-contrast`): 스크래치 폴더의 일회용 Playwright 스크립트로 확인한다. 저장소에 넣지 않는다.
- 스코프: 규칙 선택자를 grep으로 훑어 `:root[data-look='frost']` 없는 줄이 없는지, `@keyframes`가 `frost-` 접두사인지 확인한다.
- 빌드: `npm run typecheck && npm run lint && npm run check && npm run build`.

## 변경 사항
- 퀴즈 카드·고스트·채점 결과의 빛줄기를 위쪽 광택(`--frost-gloss`)으로 바꿨다. 작은 조각의 또렷한 사선이 다크에서 글자 앞 `/`처럼 읽혔다.
- 에디터 오답 카드의 빛줄기는 또렷한 것 대신 부드러운 것(`--frost-streak-soft`)을 쓴다. 같은 이유다.
- 빈칸의 성에 얼룩(`--frost-rime`)을 고운 입자로 바꿨다. 작은 칸에서 흐린 글자처럼 보여 정답 힌트로 오해할 수 있었다. 서리 칸 표현은 그만큼 약해졌다.
- 1단 배치(≤ 860px)의 `.keys` 시트는 유리 도구를 덮으므로 불투명으로 했다(G7).
- 유리 표면에 `transition-property: none`을 추가했다. 전역 reduced-motion 규칙이 `backdrop-filter`를 1ms 전환시켜 설정 변경 직후 옛 값이 측정됐다.
- S9 `perf` ≥ 50은 충족을 확인하지 못했다. 머신 부하로 기존 디자인도 21~44에 머문다. 번갈아 잰 5쌍의 중앙값은 기존 29, 서리 32로 서리가 느려지게 하는 징후는 없다. 통합 때 부하 없는 상태로 재측정이 필요하다.
