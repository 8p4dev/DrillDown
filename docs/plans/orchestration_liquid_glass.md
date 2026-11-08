# 오케스트레이션 plan — Liquid Glass 디자인 교체 (시안 3종)

요구사항(사용자 원문): "ui liquid glass 디자인으로 교체. liquid glass 디자인을 어떻게 하면 학습 앱에 녹여낼 수 있을지 깊게, 단계적으로 연구 후 구현해. 3개의 시안을 만들어서 보여줘"
연구 결과: `docs/research/R5_liquid_glass.md`. 작성: 2026-11-05, 오케스트레이터.

## 1. 요구사항 구체화와 완료 기준

| # | 요구사항 | 완료 기준 |
|---|---|---|
| L1 | 단계적 연구 | R5 문서에 원칙·실패 사례·학습 조건·화면별 레이어·웹 제약·세 방향이 근거 태그와 함께 있다 (완료) |
| L2 | 시안 3개 구현 | 실제 앱의 6개 화면(목록·에디터·플래시·복습·빈칸·백지)이 상단 선택기와 `?look=`로 3개 시안 모두에서 동작한다. 라이트·다크, 1440×900·390×844 |
| L3 | 시안 보여주기 | 사용자가 ① 8001 dev 서버의 선택기로 직접 써 보고 ② 같은 화면을 시안별로 나란히 비교하는 페이지를 받는다 |
| L4 | 교체 | **사용자가 시안을 고른 뒤** 그 시안을 기본값으로 만들고 선택기와 나머지 시안을 삭제한다. 고르기 전까지 기본값은 기존 디자인이다 |

### 가드레일: 모든 시안의 공통 완료 기준

`tools/look/look.spec.ts`가 측정한다(§6). 스크린샷과 함께 2개 모드 × 2개 폭 × 13개 화면 상태를 돈다.

| # | 기준 | 근거 |
|---|---|---|
| G1 | 뷰포트 안 글자의 실제 배경 픽셀 대비가 4.5:1(큰 글자 3:1) 이상. 위반 0건 | NN/g 가독성 비판. 기존 디자인은 라이트에서 위반이 있다(muted 4.38, 활성 메뉴 3.94). 시안은 토큰 값을 조정해 이보다 엄격하게 통과한다 |
| G2 | `backdrop-filter` 요소가 화면당 8개 이하, 콘텐츠 카드에는 0개 | HIG "sparingly", 300노드 성능 |
| G3 | 정지 상태에서 무한 애니메이션 0개(로딩 스피너 제외) | "Motion for motion's sake", 회상 방해 |
| G4 | `prefers-reduced-transparency: reduce`에서 유리 0개, G1 통과 | HIG 접근성 설정 |
| G5 | E2E 기존 13개가 시안마다 통과(§7) | 기능 유지 |
| G6 | 301노드 트리 스크롤 fps(CPU 6배 감속)가 기존보다 나빠지지 않음(§8 변경 참고, 처음 기준은 50 이상) | 성능 |

사람이 스크린샷으로 확인하는 기준:
- G7 **유리 위 유리 금지**, **글자 위 글자 금지**(콘텐츠가 유리 아래로 지나갈 때 글자를 읽을 수 있을 것)
- G8 **숙련도 색 구분 유지**: 초록·연두·빨강·없음이 플래시 카드와 미니맵에서 구분되고, 색 말고 다른 단서(띠·질감 등)도 있다. 퀴즈 카드(`.dnd-*`)에는 숙련도를 입히지 않는다(정답 단서)
- G9 **사용자 결정 유지**: 에디터 카드는 오답 농도(`--heat`, 붉은색)만 표시한다(orchestration_modes §0). 터치 표적은 44px을 유지하고, 조작 요소가 상태에 따라 사라지거나 위치를 바꾸지 않는다

## 2. 세 시안의 정의

세부 디자인은 각 에이전트가 정하되 아래 논지는 지킨다. 세 시안이 서로 비슷해지면 시안을 세 개 만드는 의미가 없다.

### A 렌즈 `lens` — 내용은 종이, 조작만 유리 (HIG 정석)
- 콘텐츠 면은 전부 불투명하다. 배경은 따뜻한 중립색 종이. 유리는 §3.3의 조작 표면에만 쓴다.
- 상단 바와 모드 탭은 떠 있는 캡슐로 하고, 활성 탭은 물방울처럼 맺힌 렌즈로 표현한다. Chromium + 정밀 포인터에서만 `#lg-lens` 굴절을 쓴다.
- 에디터 캔버스는 넓게 쓰고 그 위에 유리 도구가 뜬다. 모바일 하단 바와 시트도 유리다.
- **끄는 카드(`.dnd-ghost`)만 맑은 유리**다. 카드 너머로 빈칸이 보인다.
- 틴트는 주요 행동(`button.primary`)에만 쓴다.

### B 깊이 `depth` — 드릴다운 = 유리판을 한 장씩 통과
- 정지된 배경 그라데이션 위에 콘텐츠를 **표준 재질**(굵은 반투명, `backdrop-filter` 없음)로 올린다. 세 시안 중 가장 몰입적이다.
- `--depth`가 의미를 갖는다: 깊이 들어갈수록 배경과 카드 색조가 깊어진다. 플래시 개념 카드 뒤에는 지나온 깊이만큼 유리판이 겹쳐 보인다. 에디터 카드도 깊이에 따라 색조가 변한다.
- 조작 표면은 진짜 유리. 굴절은 선택 사항.
- 퀴즈 화면은 배경을 차분하게 낮춘다(회상 중 시선 분산 방지).

### C 서리 `frost` — 유리의 맑기 = 기억의 선명도
- 플래시 화면의 `data-color`가 재질을 결정한다: `green`은 맑고 채도 높은 색유리, `lightgreen`은 옅은 서리가 낀 유리, `none`은 불투명에 가까운 서리, `red`는 붉은 색유리. 트리·미니맵이 "기억의 스테인드글라스"로 보인다. 질감은 정지 SVG 노이즈로 낸다.
- **답 공개 = 서리 닦기**: 하위 카드가 펼쳐질 때 흐림에서 맑음으로 한 번 전환된다(reduced-motion에서는 없음).
- 에디터·목록·퀴즈에서는 숙련도를 표시하지 않고 색유리 언어만 공유한다(G8·G9). 에디터의 `--heat`는 붉은 색유리로 표현할 수 있다.
- 글자 뒤의 서리·색은 대비를 해치지 않게 깐다(G1).

## 3. 공유 계약

### 3.1 시안 전환
- `:root[data-look='lens'|'depth'|'frost']`. 없으면 기존 디자인. 값은 `?look=`, localStorage `look`, 상단 `select.look-picker`(`src/looks/look.ts`)로 정한다.
- **시안 CSS의 모든 규칙은 자기 `:root[data-look='…']` 선택자 아래에 둔다.** `@keyframes`는 시안 접두사(`lens-`, `depth-`, `frost-`)를 쓴다. 기존 디자인(`data-look` 없음)을 건드리면 안 된다.
- `:root[data-refract]`: Chromium일 때만 붙는다. `backdrop-filter: url(#lg-lens) blur(…)`는 반드시 `:root[data-look='…'][data-refract]` 아래, `@media (hover: hover) and (pointer: fine)` 안에 쓴다. 기본 규칙은 `blur()`이고 `-webkit-backdrop-filter`도 함께 쓴다.

### 3.2 토큰과 데이터 훅 (읽기 전용 계약)
- 토큰 이름은 `src/index.css`와 같다. 시안은 자기 스코프에서 값을 덮어쓸 수 있다(라이트 + `@media (prefers-color-scheme: dark)` 둘 다).
- 데이터 훅:
  - `.node-row`의 `--depth`(0부터)와 `--heat`
  - `.flash`의 `--depth`(현재 개념 깊이)
  - `.flash-concept`·`.flash-kid`·`.mm-node`의 `data-color`
  - `.flash-kid`의 `data-rated`
  - `[data-result]`
- 브레이크포인트: 모바일 ≤ 760px, 에디터 1단 ≤ 860px. 호버는 `@media (hover: hover)` 안에 둔다.

### 3.3 표면 목록 (시안마다 빠짐없이 처리)
- 조작: `.topnav` `.look-picker` `.mode-tabs` `.zoom-tools` `.keys` `.toast` `.tree-menu-list` `.minimap` `.flash-nav`(모바일) `.dnd-dock`(모바일) `.dnd-bar`
- 순간: `.dnd-ghost` `.node-row.lifted`
- 콘텐츠: `.node-row`(`.root` `.selected` `.cut`) `.badge` `.detail` `.toolbar` `.flash-concept` `.flash-kid` `.flash-rate` `.flash-summary` `.dnd-node` `.dnd-slot` `.dnd-card` `.dnd-tray` `.tree-cards li` `.tree-modes` `.tree-avatar` `.trees-form` `.trees-empty` `.review-list li` `.card` `table` `button` `input/textarea/select`
- 배경: `body` `.outline` `.dnd-canvas`

### 3.4 깨지기 쉬운 곳
- 기존 규칙 중 값이 맞물린 것:
  - `.dnd-canvas` padding 4px(kit.tsx `CANVAS_PAD`와 같아야 한다)
  - `.canvas`·`.side` 높이의 `9.25rem`(상단 바를 띄우면 시안에서 다시 계산한다)
  - `--nav-h`(`.flash-aside`, 토스트, `scroll-margin-top`)
  - `--flash-bar-h: 60px`
- 전역 reduced-motion 규칙과 `.graph-*`의 `transition-property: none`을 되살리지 않는다(배율 측정이 깨진다).
- `backdrop-filter` 요소는 자손의 backdrop root가 된다. 유리 안의 유리는 배경을 보지 못한다.
- 배경은 `body::before`(`position: fixed; z-index: -1`) 정지 그라데이션으로 하고 `background-attachment: fixed`는 쓰지 않는다(iOS). 다크 모드 값도 정한다.
- `@media (prefers-reduced-transparency: reduce)`, `(prefers-contrast: more)`, `(forced-colors: active)`에서 유리를 끄고 불투명하게 처리한다.
- E2E 계약 셀렉터는 `orchestration_visual_polish.md` §3.3이다. CSS만 바꾸므로 깨지지 않지만 `display: none`으로 요소를 숨기면 안 된다.

### 3.5 코드 규칙
- **TS/TSX·기존 CSS·의존성은 수정하지 않는다.** 시안은 자기 CSS 파일 하나로 끝낸다. 마크업이나 훅이 더 필요하면 멈추고 보고한다.
- 색은 토큰 또는 토큰 혼합으로 쓴다. 시안 고유 색은 자기 스코프의 지역 토큰으로 정의한다.
- 애니메이션 종료에 기능을 의존시키지 않는다.

## 4. 가정 및 미결

- A1 프롬프트의 `{{N}}`이 채워져 있지 않아 **에이전트 3명**으로 정했다. 시안 하나가 파일 하나이므로 그 이상 쪼개면 조율 비용만 늘어난다.
- A2 프롬프트의 E2E 범위 자리표시자는 예시 문구("사용자에게 직접 보이는 핵심 흐름")를 따른다. 기존 13개를 기존 디자인 + 시안 3개 = 4회 돌린다. 새 E2E는 추가하지 않는다(시각 변경이고 가드레일 도구가 맡는다).
- A3 "시안"은 정지 목업이 아니라 **실제 앱에서 동작하는 테마**로 해석했다. 재질은 스크린샷보다 써 봐야 판단할 수 있기 때문이다.
- A4 시안 CSS는 main에 머지한다. 기본값은 기존 디자인이라 사용자 선택 전에도 main이 망가지지 않는다. L4는 사용자 선택 후 오케스트레이터가 처리한다.
- A5 실기기(iOS·Android)는 검증하지 않는다. `backdrop-filter`의 모바일 실제 체감은 사용자 확인이 필요하다. iOS의 투명도 줄이기 설정은 웹에서 감지하지 못할 수 있다(R5 5단계).
- A6 Safari·Firefox는 굴절 없이 blur로 대체된다. 자동 측정은 Edge에서만 한다.
- 미결: 어느 시안으로 교체할지(사용자 결정).

## 5. 작업 분할

| 에이전트 | 담당 요구사항 | 수정 소유 파일 | 읽기만 하는 파일 | 선행 의존성 |
|---|---|---|---|---|
| (오케스트레이터) | L1, 공통 기반, L3, L4 | `src/looks/look.ts`, `src/App.tsx`, `src/index.css`, `index.html`, `src/features/editor/NodeRow.tsx`, `src/features/flash/FlashPage.tsx`, `playwright.config.ts`, `tools/look/**`, 이 문서, R5 | — | — |
| GL | 시안 A 렌즈 | `src/looks/lens.css`, `docs/plans/agent_GL_lens.md` | `src/**`, `docs/**`, `tools/look/**` | 0차 커밋 |
| GD | 시안 B 깊이 | `src/looks/depth.css`, `docs/plans/agent_GD_depth.md` | 같음 | 0차 커밋 |
| GF | 시안 C 서리 | `src/looks/frost.css`, `docs/plans/agent_GF_frost.md` | 같음 | 0차 커밋 |

웨이브: 0차 = 오케스트레이터 공통 기반(커밋) → 1차 = GL·GD·GF 병렬(파일 겹침 없음) → 2차 = 통합·비교 페이지 → **사용자 선택** → 3차 = 교체(오케스트레이터).

## 6. 점검 도구 (E2E 아님, 하위 에이전트도 사용)

워크트리마다 자기 포트의 dev 서버를 쓰고 Playwright 컨텍스트마다 IndexedDB가 분리되므로 충돌이 없다. 포트: GL 8011, GD 8012, GF 8013.

```
npm run dev -- --port 8011 --strictPort      # 백그라운드로
BASE=http://localhost:8011 LOOK=lens OUT=<스크래치 폴더> npx playwright test -c tools/look/pw.config.ts look.spec.ts -g "light desktop"
```
- `-g`: `light desktop`·`light mobile`·`dark desktop`·`dark mobile`·`perf`. 없으면 전부(약 1분).
- 결과: `OUT/*.png`(화면별)과 `OUT/*.report.json`(위반 목록). 위반이 있으면 테스트가 실패한다.
- 기존 디자인의 기준선(라이트)은 위반이 있고 다크는 대비 위반 0건, perf는 fps 56이다.

## 7. 머지 순서와 통합 검증

1. 머지 순서: GL → GD → GF (완료 순서로 바꿔도 된다. 파일이 겹치지 않는다)
2. 머지마다 `npm run typecheck && npm run lint && npm run check && npm run build`
3. 전체 머지 후:
   - 도구를 시안별로 전체 실행(G1~G4, G6)
   - E2E 1회씩: `LOOK= / lens / depth / frost npm run e2e`(G5). 13개 × 4회. **오케스트레이터만 실행**
   - 스크린샷 직접 확인(G7~G9)
4. 시안 비교 페이지 게시, 8001 안내, 추천과 함께 사용자에게 보고 → 선택 대기
5. 선택 후 §8에 기록하고 교체(기본값 지정, 선택기·`LOOK` 설정·나머지 CSS·`tools/look` 삭제, `theme-color` 정렬), 전체 재검증.

## 8. 결과

상태: **시안 3개 완료, 사용자 선택 대기.** L1~L3 완료, L4(교체) 미완료.

- 머지: 0차(087f9d3) → GL(5a85b12) → GD(a0ec401) → GF(959701a). 파일이 겹치지 않아 충돌 0건. 머지마다 typecheck·lint·check·build 통과.
- 검증 (Edge, 부하 없는 상태):

| 기준 | 기존 | A 렌즈 | B 깊이 | C 서리 |
|---|---|---|---|---|
| G1 대비 위반 | 94건(라이트만, 최저 3.82) | 0 | 0 | 0 |
| G2 유리 수 | 통과 | 통과 | 통과 | 통과 |
| G3 무한 애니메이션 | 0 | 0 | 0 | 0 |
| G4 투명도 줄이기 | 미통과(52건, 설정을 따르지 않음) | 통과 | 통과 | 통과 |
| G5 E2E | 13/13 | 13/13 | 13/13 | 13/13 |
| G6 fps 중앙값 | 42 (30~64, 8회) | 47 (35~50, 3회) | 84 (82~90, 3회) | 44.5 (19~60, 8회) |

- 스크린샷 직접 확인(G7~G9): 오케스트레이터는 주요 화면(에디터·플래시·끌기·모바일 퀴즈)을 표본으로 봤다. 전체 화면 확인은 각 담당 에이전트가 했다.
- 계획 대비 변경:
  - G6의 절대 기준(fps 50)을 "기존과 비교해 나빠지지 않음"으로 바꿨다. 0차에 잰 기존값 56이 재현되지 않고(30~64), 편차가 커서 A·C가 기존과 다르다고 말할 수 없다.
  - 점검 도구 오탐 3건을 고쳤다: 측정 중 사라지는 토스트, 아이콘이 섞인 글자 범위, 스크롤러에 잘린 작은 조각. 모바일에서 카드 가운데를 탭해 가지가 접히던 시나리오도 고쳤다.
  - C 담당이 전역 reduced-motion 때문에 `backdrop-filter`가 1ms 전환되어 측정에 잡힌다는 점을 찾아 유리 표면의 `transition-property`를 제한했다(A도 같음).
- 미확인: 실기기(iOS·Android), Safari·Firefox, 애니메이션 체감(스크린샷은 reduced-motion). 끄는 카드 너머 빈칸 비침은 정지 화면에서 약하게 보인다.
- 시안별 약점: 각 `agent_G*_*.md`와 비교 페이지에 기록했다.
- 범위 밖으로 발견한 기존 버그(고치지 않음):
  - `scopeOf`가 `collapsed`를 지우지 않아 빈칸 퀴즈에서 접힌 가지의 빈칸이 그려지지 않는다(백지 퀴즈의 `placedTree`는 지움).
  - 모바일 축소 배율에서 `.badge::after` 터치 영역이 카드 중앙까지 덮어 탭이 접기로 처리될 수 있다.


## 9. 폐기 (2026-11-08)

사용자 지시("리퀴드 디자인은 전부 폐기")로 시안 3개·선택기·점검 도구·SVG 필터·`--depth` 훅을 모두 삭제했다. 후속: `orchestration_redesign.md`. 연구 문서 R5는 기록으로 남긴다.
