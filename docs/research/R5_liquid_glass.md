# R5 — Liquid Glass를 학습 앱에 녹이는 법

조사: 오케스트레이터, 2026-11-05. 태그: `[출처]` 직접 확인 / `[2차]` 요약본만 확인 / `[실측]` 이 저장소에서 측정 / `[추론]` 위 자료에서 끌어낸 판단.

## 1단계. Liquid Glass는 무엇인가

- 흐린 유리(frosted glass)와의 차이는 **렌즈 효과**다. 이전 재질이 빛을 흩뿌렸다면 이 재질은 "dynamically bends, shapes, and concentrates light"한다. [출처: Meet Liquid Glass, https://developer.apple.com/videos/play/wwdc2025/219/]
- **역할은 재질이 아니라 레이어다.** 탭 바·사이드바 같은 조작 요소가 콘텐츠 위에 뜨는 "distinct functional layer"이며, 콘텐츠는 그 아래로 스크롤되어 비쳐 보인다. [출처: HIG Materials, https://developer.apple.com/design/human-interface-guidelines/materials]
- HIG의 규칙 5개:
  1. **콘텐츠 레이어에 쓰지 않는다.** 예외는 슬라이더·토글처럼 조작하는 순간에만 유리가 되는 요소다.
  2. 드물게 쓴다. 가장 중요한 조작 요소로 제한한다.
  3. 콘텐츠 레이어의 구분은 **표준 재질**(ultra-thin~thick)로 한다.
  4. 글자가 많은 표면(팝오버·사이드바)은 regular를 쓴다. clear는 사진·영상 위에만 쓰고 필요하면 35% 어둡게 깐다.
  5. 굵은 재질은 대비에, 얇은 재질은 맥락 유지에 유리하다.
- 그 밖의 규칙 [출처: Meet Liquid Glass]:
  - **유리 위에 유리를 쌓지 않는다.**
  - 틴트는 주요 행동에만 쓴다. "When every element is tinted, nothing stands out." 색을 넣고 싶으면 콘텐츠 레이어에 넣는다.
  - 스크롤 가장자리 효과로 콘텐츠를 유리 아래에서 녹여 글자를 보호한다.
  - 큰 요소일수록 그림자와 렌즈가 강해진다.
  - 접근성: 투명도 줄이기는 더 뿌옇게, 대비 높이기는 흑백 + 테두리, 동작 줄이기는 탄성 제거.

## 2단계. 무엇이 잘못되었나

- NN/g의 지적 [출처: Liquid Glass Is Cracked, https://www.nngroup.com/articles/liquid-glass/]:
  - "Text on top of text creates an illegible mess."
  - 떠 있는 컨트롤이 콘텐츠와 시선을 다툰다.
  - 표적이 작아지고 조작 요소가 사라졌다 나타난다.
  - "Motion for motion's sake is not usability."
- Apple도 베타 3에서 투명도를 줄였고 26.1에 'Tinted' 설정을 추가했다. [2차: 9to5Mac, Gulf News 보도]
- → 이 앱의 조건: 글자 위에 글자가 겹치지 않아야 하고, 조작 요소 위치는 고정이며, 표적 44px을 유지하고, 의미 없는 움직임을 넣지 않는다. [추론]

## 3단계. 학습이라는 조건

| 근거 | 내용 | 이 앱에 주는 제약 |
|---|---|---|
| 유혹적 세부(seductive details) 메타분석 | 58개 연구 68개 효과에서 소~중간 크기의 부정적 효과(g = −0.33). 초보자에게 더 크고, 짧은 학습에서 더 크다. [2차: Sundararajan & Adesope 2020, Educ Psychol Rev 32, doi:10.1007/s10648-020-09522-4 — 원문 미확인, 수치는 ACU 요약] | **이 연구의 대상은 '관련 없는 내용'이지 재질이 아니다.** 유리에 그대로 적용되는 증거는 아니며 유추다. 회상 화면의 장식을 줄이는 방향으로만 쓴다. [추론] |
| 인출 연습(R1 조사, 03 보고서) | 앱의 핵심 행동은 머릿속에서 꺼내기다. | 회상 중 시야에 정답 단서나 움직임을 두지 않는다. 숙련도 색도 퀴즈 카드에는 입히지 않는다. |
| 사용자 결정(orchestration_modes §0) | 에디터 색은 오답 농도(붉은색)만, 숙련도 색은 플래시카드 화면에서만. | **시안도 이 결정을 따른다.** 시안 C는 에디터에 숙련도를 표시하지 않는다. |
| 결정 3(biz decisions) | "실제 인출 성공 시에만 초록, 시간이 지나면 바래기" | 유리의 맑기는 '바램'을 표현하기에 맞는 재료다(시안 C). [추론] |

## 4단계. 이 앱의 화면을 레이어로 나누기

| 레이어 | 재질 | 요소 |
|---|---|---|
| **조작** (유리 허용) | `backdrop-filter` + 림 + 스페큘러 | `.topnav` `.mode-tabs` `.zoom-tools` `.flash-nav`(모바일) `.dnd-dock`(모바일) `.minimap` `.keys` `.toast` `.tree-menu-list` |
| **순간** (조작하는 동안만 유리) | HIG 예외 | `.dnd-ghost`: **끄는 카드 너머로 빈칸이 보인다.** 유리가 실제로 기능을 하는 유일한 지점이다. `.node-row.lifted`도 후보. |
| **콘텐츠** (유리 금지, 표준 재질) | 불투명 또는 투명도 흉내(`backdrop-filter` 없음) | `.node-row` `.detail` `.flash-concept` `.flash-kid` `.dnd-node/-slot/-card` `.tree-cards li` `.card` `table` |
| **배경** | 그라데이션 등 정지 화면 | `body` `.outline` `.dnd-canvas` |

## 5단계. 웹 기술의 제약

- `backdrop-filter: blur()`는 주요 브라우저에서 사용할 수 있다(iOS Safari는 `-webkit-` 접두사도 함께 쓴다). `backdrop-filter: url(#svg)` 굴절은 **Chromium에서만** 그려진다. Safari는 `@supports`를 통과하고도 아무것도 그리지 않아 기능 질의로 가를 수 없다. [2차: dev.to 등 구현 글] → UA 신호(`navigator.userAgentData`)로 가른다.
- 시험 결과(Edge) [실측]:
  - `feTurbulence` 방식은 유리 전체가 일렁여 **뒤의 선과 글자가 흔들린다. 학습 앱에 쓸 수 없다.**
  - `feImage` 가장자리 맵 + `feDisplacementMap`은 가운데는 그대로 두고 가장자리만 굽힌다. 필터 영역을 objectBoundingBox로 잡으면 요소 크기에 맞게 늘어난다.
  - → `#lg-lens`로 `index.html`에 넣었다.
- `feDisplacementMap`은 큰 면적에서 CPU 부담이 크다. [2차] → 작은 조작 요소에만, 포인터가 정밀한 기기에서만 쓴다.
- `backdrop-filter`가 걸린 요소는 자손의 backdrop root가 되므로 안쪽 유리는 바깥을 보지 못한다. 유리 위 유리 금지 규칙과 결과가 같다.
- 300노드 트리의 카드마다 `backdrop-filter`를 걸면 합성 비용이 커진다. → 콘텐츠 카드에는 금지하고, 그래프 위 유리는 화면당 8개 이하로 제한한다. [추론, 이번 `perf` 측정으로 확인]
- `prefers-reduced-transparency`는 Chromium 118~119 이상에서 지원하고 Safari·Firefox 상태는 확인하지 못했다. [출처: https://developer.chrome.com/blog/css-prefers-reduced-transparency , https://web-platform-dx.github.io/web-features-explorer/features/prefers-reduced-transparency] → 이 설정을 감지하지 못해도 **기본 상태에서 대비 기준을 통과해야 한다.**
- 정지 이미지로 넣은 SVG 노이즈 텍스처는 `backdrop-filter` 없이 서리 질감을 낸다(비용은 이미지 한 장). [추론]

## 6단계. 세 가지 방향

세 시안은 **유리의 범위**와 **유리가 담는 의미**가 서로 다르다.

| | A 렌즈 | B 깊이 | C 서리 |
|---|---|---|---|
| 한 줄 | 내용은 종이, 조작만 유리 | 드릴다운 = 유리판을 한 장씩 통과 | 유리의 맑기 = 기억의 선명도 |
| 유리가 담는 의미 | 조작과 내용의 구분 | 트리 안의 위치 | 복습 상태 |
| 유리 범위 | 최소 (HIG 정석) | 넓음 (콘텐츠도 표준 재질로 반투명) | 중간 (플래시카드 화면의 콘텐츠에 상태별 재질) |
| 가설 | 회상을 가장 덜 방해한다 | 위치 감각이 생기고 가장 몰입된다 | 어느 가지가 바랬는지 바로 보여 복습 동기가 생긴다 |
| 위험 | 평범해 보일 수 있다 | 배경 때문에 글자 대비가 나빠질 수 있다 | 색 + 질감 때문에 화면이 복잡해질 수 있고, 플래시카드 밖에서는 차이가 작다 |
