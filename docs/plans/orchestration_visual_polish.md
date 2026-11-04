# 오케스트레이션 plan — 비주얼 다듬기 (깔끔 · 예쁨 · 빠름 · 손맛 · 모바일)

요구사항(사용자 원문): "기능은 그대로 두고, 화면을 더 깔끔하고 예쁘고 빠르고 손맛 있게 만든다. (모바일도 고려할 것)"
사용자는 야간 당직 중이라 질문 없이 끝까지 진행하라고 지시했다. 그래서 모호한 부분은 모두 §4의 **가정**으로 정하고 진행한다.
작업 시작: 2026-11-04 17:40. 이전 작업은 `orchestration_ux_polish.md`(모션 토큰·토스트·용어)이며 이번 작업은 그 위에서 진행한다.

## 1. 현재 상태 진단 (1440×900 · 390×844 스크린샷, 코드 리딩)

| # | 문제 | 화면 |
|---|---|---|
| P1 | 모바일에서 트리가 화면 밖으로 잘린다. 루트가 보이지 않고 가로 스크롤을 해야 한다(진입 시 맞춤이 없음) | 에디터, 빈칸·백지 퀴즈 |
| P2 | 데스크톱 에디터도 넓은 트리가 잘린 채로 시작한다(예: "임금" 카드) | 에디터 |
| P3 | 모바일 플래시카드에서 미니맵이 첫 화면의 약 40%를 차지한다 | 플래시카드 |
| P4 | 모바일에서 버튼·탭 높이가 약 30px로 터치 목표 44px에 못 미친다. 호버 효과가 터치 뒤 남는다(sticky hover). 탭 지연이 있고 하이라이트가 회색으로 깜빡인다 | 전체 |
| P5 | 폰트 `Pretendard`가 로드되지 않아 기본 폰트로 떨어진다. 글자 크기·굵기 위계가 화면마다 제각각이다 | 전체 |
| P6 | 전역 `[role=status]` 초록 박스가 의도치 않은 곳에 적용될 수 있다(이전 UD 이슈) | 전체 |
| P7 | 모바일 에디터에서 상단 도구(배율)가 별도 줄을 차지한다. 패널·개요 영역이 길게 이어진다 | 에디터 |
| P8 | 에디터가 렌더할 때마다 `childrenOf`/`descendantsOf`를 노드마다 호출해 O(n²)이다. 모든 화면이 한 번들에 들어 있어 첫 로드가 무겁다 | 성능 |
| P9 | 행동에 촉각·물리적 피드백이 없다(터치 기기 진동, 눌림, 착지 스프링). 플래시 하위 목록은 닫힐 때 즉시 사라진다 | 손맛 |
| P10 | 화면 전환이 뚝 끊긴다(라우트 전환에 연속성이 없음) | 전체 |

## 2. 요구사항 구체화와 완료 기준

### V0 공통 기반 (오케스트레이터 선행 작업 — 커밋 후 분배)
- [x] V0-1 `index.css` 토큰 정제. 기존 토큰 이름은 유지하고 값만 조정하며, 새 토큰을 추가한다(§3.1):
  - 중립색 팔레트, 그림자 3단계(`--shadow`, `--shadow-lift`, 새 `--shadow-pop`), `--radius-sm/--radius-lg`
  - 글자 크기 단계 `--fs-xs..--fs-2xl`, `--nav-h`, `--tap`(터치 목표), 안전 영역 `--safe-b`
- [x] V0-2 전역 터치 기본값:
  - `-webkit-tap-highlight-color: transparent`, 버튼·링크에 `touch-action: manipulation`(탭 지연 제거)
  - 호버 효과는 `@media (hover: hover)` 안에서만 적용한다.
  - `(pointer: coarse)`에서는 버튼 `min-height: var(--tap)`, 누름 축소를 조금 더 강하게(.96) 한다.
- [x] V0-3 전역 `[role=status]` 박스 스타일을 제거했다. 실제로 쓰는 곳은 퀴즈 점수 하나뿐이고 그것도 스스로 덮어쓰고 있어서 `.status-box`를 만들지 않았다(계획 대비 변경).
- [x] V0-4 폰트: 외부 폰트를 쓰지 않고 시스템 한글 폰트 스택을 정리한다(가정 A2). 숫자는 `tabular-nums`로 하고, 제목 자간을 조정한다.
- [x] V0-5 상단 바 모바일: 높이 `--nav-h`(52/48px), 안전 영역 좌우 패딩. 420px 이하에서는 브랜드 글자를 숨기고 로고만 남긴다.
- [x] V0-6 `TreeHeader` 모바일:
  - 760px 이하에서 제목(한 줄 말줄임)과 모드 탭(전체 폭, 가로 스크롤 가능, 4칸 균등)이 각각 한 줄을 차지한다. 도구는 탭 아래 오른쪽에 둔다.
  - 활성 탭 배경은 미끄러지는 인디케이터로 바꾸지 않는다. 배경 트랜지션만 둔다(가정 A6).
- [x] V0-7 `index.html`:
  - `viewport-fit=cover`, `theme-color`(라이트/다크), `apple-mobile-web-app-capable`, `format-detection`
  - PWA manifest의 `theme_color`를 accent에 맞춘다.
- [x] V0-8 `src/features/feel.ts` 신설: `haptic(kind)` 공용 API(§3.2). 진동은 `navigator.vibrate`가 있고 reduced-motion이 아닐 때만 쓴다.
- [x] V0-9 `App.tsx`:
  - 화면별 `React.lazy` 코드 분할 + `Suspense`(빈 fallback, 150ms 이후에만 스켈레톤 표시)
  - 첫 화면 뒤 유휴 시간에 다른 화면 청크를 미리 받는다(prefetch).
- [x] V0-10 라우트 전환 연속성: `router.ts`의 `useRoute`가 `document.startViewTransition`이 있으면 `flushSync`로 감싸 교차 페이드한다(120ms). reduced-motion에서는 끈다.
- [x] V0-11 토스트: 모바일 하단 안전 영역을 반영하고, 폭을 `min(92vw, 28rem)`으로 한다.

완료 기준: typecheck·lint·check·build 통과, 기존 E2E 12개 통과, 메인 번들(`index-*.js`)이 분할 전보다 작아진다(수치를 §7에 기록).

### V1 에디터 (agent VE)
1. **진입 맞춤(P1·P2)**:
   - 트리를 처음 불러오면 그래프가 캔버스보다 넓거나 높을 때 한 번 자동으로 화면에 맞춘다. 최소 배율 0.5, 최대 1이다.
   - 맞춘 뒤 루트가 가로 중앙에 보이게 스크롤한다. 이후 편집할 때는 자동 맞춤을 하지 않는다(카드가 튀지 않게).
   - 완료 기준: 390×844에서 9노드 예제 트리의 루트와 모든 1단계 카드가 화면 안에 보인다.
2. **떠 있는 확대 도구(P7)**:
   - `[− 배율 + | 맞춤 | 정렬 | ?]`를 캔버스 오른쪽 아래 안쪽의 떠 있는 알약(pill) 툴바로 옮긴다. 헤더에는 아무것도 넘기지 않는다.
   - 접근 이름(`축소`/`확대`/`화면 맞춤`/`자동 정렬`/`단축키`, output `배율`)은 유지한다.
3. **터치 제스처(손맛)**:
   - 캔버스에서 두 손가락 핀치 줌. 두 손가락 중심을 기준점으로 삼는다.
   - 빈 배경을 한 손가락으로 끌면 패닝한다(기존). 카드 드래그는 기존과 같다.
   - Ctrl+휠 줌은 커서 위치를 기준점으로 한다(현재는 좌상단 기준).
4. **모바일 레이아웃**:
   - 760px 이하에서 캔버스 높이는 `calc(100dvh - 헤더)`의 약 62%, 그 아래에 패널을 둔다.
   - 패널 툴바 버튼은 36px 이상, 개요 영역 버튼은 한 줄 가로 스크롤 대신 2열 그리드로 배치한다.
   - 단축키 팝오버는 모바일에서 화면 하단 시트 모양으로 띄운다.
5. **카드 비주얼**:
   - 카드: 라운드 `--radius-lg`, 미세한 그라데이션 없이 단색 + 1px 테두리 + 2단 그림자. 루트 카드는 accent 틴트 배경 + 굵은 제목.
   - 선택 카드: accent 링(2px) + 아주 옅은 accent 글로우.
   - 엣지: 두께 1.5, 루트에서 나가는 엣지는 accent 25%로 한다.
   - 캔버스 점 격자는 더 옅게 하고, 다크 모드 대비를 확인한다.
6. **손맛**:
   - 카드를 집으면 `--shadow-pop` + scale 1.03, 놓으면 스프링으로 착지(`--ease-spring` 160ms).
   - 노드 추가 시 새 카드가 `rise` 대신 scale .9 → 1 스프링으로 나타난다(부모 쪽에서 튀어나오는 느낌).
   - 삭제·잘라내기 같은 파괴적 행동에는 `haptic('warn')`, 카드 착지에는 `haptic('tap')`.
7. **성능(P8)**:
   - 렌더당 자식 맵·하위 수를 한 번만 계산한다(O(n)). `renderNode` 안에서 `childrenOf`/`descendantsOf`를 노드마다 부르지 않는다.
   - `GraphView`의 `layout`은 `shown`과 `sizes`가 같으면 다시 계산하지 않는다(useMemo).
   - 완료 기준: 300노드 트리에서 제목을 입력할 때 React 커밋 시간이 개선 전보다 줄어든다. 측정 방법과 전후 수치를 plan에 기록한다(`performance.now()` 로그로 측정하고, 측정 코드는 커밋하지 않는다).

### V2 플래시카드 · 오늘의 복습 (agent VF)
1. **모바일 미니맵(P3)**: 760px 이하에서 미니맵은 기본으로 접힌 얇은 띠(높이 ≤ 72px, 현재 위치 주변 강조)로 보인다. 띠를 탭하면 펼쳐진다. 데스크톱은 그대로 둔다. `figure[aria-label="미니맵"]`과 `g.mm-node` 계약은 유지한다.
2. **모바일 하단 행동 바**:
   - 760px 이하에서 `[다음 개념 →] [요약]` 막대를 화면 하단에 고정(sticky)하고 안전 영역을 반영한다.
   - 평가 버튼은 44px 이상, 하위 카드는 1열로 놓는다.
   - 개념 제목은 `clamp(1.5rem, 6vw, 2rem)`이다.
3. **손맛**:
   - [알음]은 버튼이 초록으로 채워지며 체크가 튀어나오고 `haptic('success')`.
   - [모름]은 기존 shake + `haptic('warn')`.
   - 개념 카드는 누르면 살짝 눌리고(scale .985), 펼칠 때 셰브론이 스프링으로 돈다.
4. **닫힘 애니메이션**: 하위 목록이 닫힐 때도 높이·투명도 트랜지션으로 접힌다(이전에 남은 한계). 닫히는 동안에는 `list 하위 개념`을 DOM에 유지하되, 닫힌 상태에서는 E2E가 기대하는 대로 사라져야 한다(애니메이션 완료에 의존하지 말 것: reduced-motion에서는 즉시 제거된다).
5. **비주얼**:
   - 개념 카드: 상단 상태색 띠를 3px 바에서 카드 상단 4px 둥근 띠로 바꾼다.
   - 카운트 칩·요약 화면 숫자의 위계를 정리한다.
   - 오늘의 복습 목록 행은 모바일에서 제목 / [플래시카드 · 복습 시작] 두 줄로 놓는다.
6. **성능**: `FlashPage`의 `byId`, `kids`, `path`를 `useMemo`로 감싼다. `FlashCard`의 window keydown 리스너는 렌더마다 다시 등록하지 않도록 ref로 바꾼다.

### V3 빈칸 퀴즈 · 백지 퀴즈 (agent VD)
1. **화면 맞춤 캔버스(P1)**:
   - `TreeCanvas`가 컨테이너 폭에 맞춰 그래프를 축소한다(`transform: scale`, 최소 .6). .6보다 더 줄여야 하면 가로 스크롤을 허용한다.
   - 축소된 상태에서도 드롭 판정(`elementsFromPoint`)과 탭 놓기가 동작한다.
   - 완료 기준: 390px 폭에서 예제 트리(9노드)의 빈칸이 모두 화면 안에 보인다.
2. **모바일 트레이**:
   - 760px 이하에서 트레이와 진행 막대·[채점]을 화면 하단에 고정(sticky)된 시트로 놓는다(최대 높이 38dvh, 내부 세로 스크롤, 안전 영역).
   - 카드는 2열 유동 폭, 높이 44px 이상이다.
3. **손맛**:
   - 카드를 집으면 `haptic('tap')`. 고스트는 포인터를 따라가며 기울기를 이동 속도에 따라 ±4°로 준다.
   - 드롭 대상 위에서는 대상이 살짝 커지고(scale 1.04) 자석처럼 강조된다.
   - 착지는 스프링 pop. 채점 시 만점이면 `haptic('success')`, 그 밖에는 `haptic('warn')`.
4. **비주얼**:
   - 카드·노드 모양을 에디터 카드(V1-5)와 같은 언어로 맞춘다(라운드, 테두리, 그림자 단계).
   - 빈칸은 옅은 점선 + 안쪽 그림자. 범위 select는 알약 모양 + 커스텀 셰브론이다.
5. **성능**: `TreeCanvas`의 layout은 nodes가 같으면 다시 계산하지 않는다(useMemo). 드래그 중 `setDrag`는 `requestAnimationFrame`으로 묶어 프레임당 한 번만 한다.

### V4 트리 목록 (agent VL)
1. **카드 비주얼**:
   - 카드 상단에 트리 이니셜 아바타(제목 첫 글자, 제목 해시로 accent 계열 색조 6종 중 선택) + 제목.
   - 모드 세그먼트는 아이콘을 인라인 SVG(같은 굵기의 선 아이콘 3종)로 바꾼다.
   - 호버 들림은 `hover:hover`에서만 적용한다.
2. **모바일**:
   - 1열, 모드 세그먼트 높이 44px, ⋯ 메뉴 목표 44px. 만들기 폼은 상단 sticky가 아니라 그대로 둔다.
   - 빈 상태는 점선 박스 + CSS로 그린 작은 트리 일러스트(인라인 SVG, 문구 1줄 유지).
3. **손맛**: 카드 누름(scale .985) + `haptic('tap')`(모바일 링크 이동 시), 새 트리 생성 시 `haptic('success')`.
4. **E2E 계약 유지**: `getByLabel('새 트리 제목')`, 카드 안 `link 편집`, 제목 더블클릭 인라인 이름 변경.

## 3. 공유 계약

### 3.1 디자인 토큰 (index.css — 오케스트레이터 소유, 에이전트는 사용만)
기존(이름 유지): `--bg --surface --border --text --muted --accent --accent-soft --danger --ok --warn --radius --shadow --shadow-lift --t-fast --t-med --t-slow --ease-out --ease-spring`
신규:
| 토큰 | 용도 |
|---|---|
| `--surface-2` | 패널 헤더·트레이 등 한 단계 들어간 면 |
| `--border-strong` | 강조 테두리(입력 호버 등) |
| `--text-2` | 본문 보조(--muted보다 진함) |
| `--radius-sm` (6px) · `--radius-lg` (14px) | 작은 칩 / 큰 카드 |
| `--shadow-pop` | 집어 든 카드·고스트(가장 높은 단계) |
| `--fs-xs .75 · --fs-sm .85 · --fs-md .95 · --fs-lg 1.1 · --fs-xl 1.4 · --fs-2xl 2rem` | 글자 크기 단계 |
| `--nav-h` | 상단 바 높이(52px, 모바일 48px) |
| `--tap` | 터치 목표 최소 높이(데스크톱 auto → coarse 44px) |
| `--safe-b` | `env(safe-area-inset-bottom, 0px)` |
| `--ease-press` | 누름 반응 `cubic-bezier(.3,.7,.4,1)` |

브레이크포인트 규약: **모바일 ≤ 760px** (`@media (max-width: 760px)`), 에디터만 2단→1단 전환을 기존 860px로 유지한다. 호버 효과는 반드시 `@media (hover: hover)` 안에 두고, 터치 크기는 `@media (pointer: coarse)`로 키운다.
keyframes(기존 유지): `rise pop shake pulse-ring`. 신규: `spring-in`(scale .9 → 1, 투명도 0 → 1).

### 3.2 촉각 API (src/features/feel.ts — 오케스트레이터 소유)
```ts
export type Haptic = 'tap' | 'success' | 'warn'
/** 진동 지원 + reduced-motion 아님일 때만. 패턴: tap=8ms, success=[10,40,14], warn=[24,30,24] */
export function haptic(kind?: Haptic): void
```

### 3.3 E2E 계약 셀렉터 (유지 필수 — 바꿔야 하면 멈추고 보고)
`orchestration_ux_polish.md` §3.3 전체를 그대로 유지한다. 요약하면 다음과 같다.
- 목록: `getByLabel('새 트리 제목')`(Enter로 생성), 카드 안 `link 편집`, `.tree-title` 더블클릭 → `getByLabel('트리 이름')`
- 에디터: `.node-row[data-node-id]`, `.node-title`, `role=tree`, `getByLabel('개요 텍스트')`, 버튼 `선택 노드의 자식으로 추가`, `노드 제목`, `패널 제목`, `패널 내용`/`노드 내용`, `형광펜 분홍`, `.w-handle.r`, `data-width`, `data-miss`, `.node-note .ln.b`, `mark.hl-p`, `+ 내용`, output `배율`(`NN%`), 버튼 `확대`·`화면 맞춤`·`축소`, 키 `Minus`
- 플래시: `button[data-concept-id]`(텍스트에 `하위 N개`), `.flash-concept-title`, list `하위 개념` > `li[data-node-id][data-color][data-rated]`, 버튼 `알음`/`모름`(exact), `다음 개념 →`, `요약`, `처음부터 다시`, `평가 집계`(`알음 N · 모름 M`), nav `현재 위치`, `figure[aria-label="미니맵"] g.mm-node[aria-current="location"][data-node-id]`
- 퀴즈: `[data-drop="tray"]`, `[data-card]`, `getByLabel('<부모> 아래 빈칸')`, `.dnd-canvas button.dnd-node.root`, `.dnd-canvas [data-card]`, 버튼 `채점`, `p[role="status"][data-correct][data-total]`, `getByLabel('원본 트리')`
- **주의**: E2E는 1280×720(Playwright 기본) + reduced-motion으로 돈다. 자동 맞춤(V1-1, V3-1)이 데스크톱 E2E의 좌표 기반 드래그(`.w-handle.r`, 노드 드래그)를 깨지 않게 한다. E2E의 9노드 트리는 1280 폭에 들어가므로 배율 1을 유지해야 한다(맞춤은 넘칠 때만).

### 3.4 코드 규칙
- 의존성 추가 금지(`package.json` 변경 금지). 애니메이션은 CSS 우선이고, JS는 포인터 추적·제스처에만 쓴다.
- 하드코딩 색 금지(토큰 사용). 다크 모드에서 대비를 확인한다.
- 애니메이션 완료(`animationend`/`transitionend`)에 기능이 의존하면 안 된다.

## 4. 가정 및 미결 (질문 없이 진행 — 사용자 지시)
- A1 에이전트는 최대 4개로 한다. 이전 오케스트레이션과 같은 파일 경계(editor / flash / dnd / treelist)로 나눈다.
- A2 웹폰트는 쓰지 않는다. 오프라인 PWA이고 자체 호스팅 Pi이며 "빠르게"가 요구사항이라 외부 CDN과 수백 KB 폰트를 피한다. 시스템 한글 폰트 스택(Apple SD Gothic Neo / Malgun Gothic / Noto Sans KR)을 정리해 쓴다.
- A3 "기능 그대로"란 기존 기능 제거·의미 변경 금지를 뜻한다. 핀치 줌·자동 맞춤·접히는 미니맵·하단 고정 바처럼 **기존 기능을 더 쓰기 좋게 하는 상호작용**은 허용한다. 새 학습 기능(스와이프 평가 등)은 추가하지 않는다.
- A4 E2E 범위는 기존 12개 + 이번 변경을 검증하는 모바일 스모크 1개(390×844: 목록 → 개요 가져오기 → 루트가 화면 안에 보임 → 플래시 평가 → 빈칸 퀴즈 탭 놓기·채점)로 한다. 통합 후 오케스트레이터만 실행한다.
- A5 진동은 Android Chrome에서만 동작한다(iOS Safari는 Vibration API 미지원). iOS에서는 시각 피드백만 남는다.
- A6 모드 탭 인디케이터를 미끄러지게 바꾸지 않는다(TreeHeader가 탭을 링크로 렌더하고 라우트마다 다시 마운트되므로 이득이 적다). View Transition으로 대신한다.
- 미결: 체감(속도·과함)은 사용자가 8001에서 확인한 뒤 조정한다. 실기기(iOS/Android) 테스트는 하지 않았다(에뮬레이션 뷰포트만).

## 5. 작업 분할

| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 |
|---|---|---|---|---|
| (오케스트레이터) | V0 | `src/index.css`, `src/App.tsx`, `src/router.ts`, `src/features/TreeHeader.tsx`, `src/features/tree-header.css`, `src/features/Toast.tsx`, `src/features/feel.ts`(신규), `index.html`, `vite.config.ts`, `e2e/**`, `playwright.config.ts` | — | — |
| VE | V1 에디터 | `src/features/editor/EditorPage.tsx`, `NodeRow.tsx`, `graph/GraphView.tsx`, `editor.css`, `content/NoteEditor.tsx` | `content/format.ts`, `content/dom.ts`, `graph/layout.ts`, `src/core/**`, V0 파일 | V0 |
| VF | V2 플래시·복습 | `src/features/flash/**` | `editor/content/format.ts`, `editor/graph/layout.ts`, `src/core/**`, V0 파일 | V0 |
| VD | V3 퀴즈 | `src/features/dnd/**` | `editor/graph/layout.ts`, `src/core/**`, V0 파일 | V0 |
| VL | V4 트리 목록 | `src/features/editor/TreeListPage.tsx`, `src/features/editor/treelist.css` | `src/core/**`, `router.ts`, V0 파일 | V0 |

공통 금지: V0 소유 파일, `src/core/**`, `src/features/editor/graph/layout.ts`(+check), `content/format.ts`·`dom.ts`(+check), `package.json`, `package-lock.json`, 다른 에이전트 소유 파일.
웨이브: 0차 = V0(오케스트레이터, 커밋) → 1차 = VE·VF·VD·VL 병렬(파일 겹침 없음).

## 6. 머지 순서와 통합 검증
1. 머지 순서: VL → VD → VF → VE (작은 것 먼저, 완료 순서대로 바꿔도 된다 — 파일 겹침이 없다)
2. 머지마다 `npm run typecheck && npm run lint && npm run check && npm run build`
3. E2E(오케스트레이터, 1회): 기존 12개 + `e2e/mobile.spec.ts` 스모크 1개
4. 8001 dev 서버에서 1440×900 / 390×844 전후 스크린샷을 비교한다(scratchpad, 커밋하지 않음).
5. 결과를 §7에 기록하고 사용자에게 요약 보고한다.

## 7. 결과
- V0: main 번들 `index-*.js` 408.11 kB(gzip 128.71) → 210.30 kB(gzip 66.29). 기존 E2E 12/12 통과.
(나머지는 통합 후 기록)
