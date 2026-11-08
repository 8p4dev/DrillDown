# 대비 계산 결과 (contrast.mjs 출력, 2026-11-08)

기준: WCAG 2.2 1.4.3 — 글자 4.5:1(큰 글자 ≥ 18.66px 굵게 또는 24px: 3:1), 1.4.11 — 비텍스트(테두리·포커스 링·아이콘) 3:1. 장식 테두리(`--border`)는 1.4.11 대상이 아니라 참고값.

## light

파생색: 초록 틴트 #edf5ef, 연두 틴트 #f1f7f3, 빨강 틴트 #fbedee, heat .5 #f8dee0, heat 1 #f1bdc1

| 용도 | 글자 | 바탕 | 대비 | 판정(4.5) |
|---|---|---|---|---|
| 본문 | #111111 | #ffffff | 18.88 | PASS |
| 본문/페이지 바탕 | #111111 | #f4f4f4 | 17.17 | PASS |
| 본문/surface-2 | #111111 | #f7f7f7 | 17.63 | PASS |
| 보조(text-2) | #3d3d3d | #ffffff | 10.86 | PASS |
| 보조(text-2)/bg | #3d3d3d | #f4f4f4 | 9.88 | PASS |
| muted | #5f5f5f | #ffffff | 6.39 | PASS |
| muted/bg | #5f5f5f | #f4f4f4 | 5.81 | PASS |
| muted/surface-2 | #5f5f5f | #f7f7f7 | 5.96 | PASS |
| 초록 글자 | #1a7f37 | #ffffff | 5.08 | PASS |
| 초록 글자/bg | #1a7f37 | #f4f4f4 | 4.62 | PASS |
| 빨강 글자 | #d1242f | #ffffff | 5.24 | PASS |
| 빨강 글자/bg | #d1242f | #f4f4f4 | 4.77 | PASS |
| primary 버튼 글자(반전) | #f4f4f4 | #111111 | 17.17 | PASS |
| 초록 채움 위 글자 | #ffffff | #1a7f37 | 5.08 | PASS |
| 빨강 채움 위 글자 | #ffffff | #d1242f | 5.24 | PASS |
| 토스트 글자 | #ffffff | #111111 | 18.88 | PASS |
| 토스트 muted | #cfcfcf | #111111 | 12.12 | PASS |
| 본문/초록 8% 틴트(플래시 green) | #111111 | #edf5ef | 17.00 | PASS |
| muted/초록 틴트 | #5f5f5f | #edf5ef | 5.75 | PASS |
| 초록 글자/초록 틴트 | #1a7f37 | #edf5ef | 4.57 | PASS |
| 본문/연두 6% 틴트(lightgreen) | #111111 | #f1f7f3 | 17.39 | PASS |
| muted/연두 틴트 | #5f5f5f | #f1f7f3 | 5.88 | PASS |
| 본문/빨강 8% 틴트(플래시 red) | #111111 | #fbedee | 16.59 | PASS |
| muted/빨강 틴트 | #5f5f5f | #fbedee | 5.61 | PASS |
| 빨강 글자/빨강 틴트 | #d1242f | #fbedee | 4.61 | PASS |
| 본문/heat .5 카드 | #111111 | #f8dee0 | 14.85 | PASS |
| text-2/heat .5 카드 | #3d3d3d | #f8dee0 | 8.54 | PASS |
| 본문/heat 1 카드 | #111111 | #f1bdc1 | 11.50 | PASS |
| text-2/heat 1 카드 | #3d3d3d | #f1bdc1 | 6.62 | PASS |
| 배지 글자(muted)/surface | #5f5f5f | #ffffff | 6.39 | PASS |
| 탭 비활성(muted)/surface-2 | #5f5f5f | #f7f7f7 | 5.96 | PASS |
| 플레이스홀더(muted) | #5f5f5f | #ffffff | 6.39 | PASS |
| 비활성 버튼 글자(muted)/bg | #5f5f5f | #f4f4f4 | 5.81 | PASS |

비텍스트(3:1)

| 용도 | 전경 | 바탕 | 대비 | 판정(3.0) |
|---|---|---|---|---|
| 입력 테두리(border-strong)/surface | #8a8a8a | #ffffff | 3.45 | PASS |
| 입력 테두리/bg | #8a8a8a | #f4f4f4 | 3.14 | PASS |
| 포커스 링(text, offset 2px → 바탕 위에 그려짐)/surface | #111111 | #ffffff | 18.88 | PASS |
| 포커스 링/bg | #111111 | #f4f4f4 | 17.17 | PASS |
| 포커스 링/surface-2 | #111111 | #f7f7f7 | 17.63 | PASS |
| 초록 띠·테두리/surface | #1a7f37 | #ffffff | 5.08 | PASS |
| 빨강 띠·테두리/surface | #d1242f | #ffffff | 5.24 | PASS |
| 카드 테두리(border, 장식)/surface | #cfcfcf | #ffffff | 1.56 | 참고 |

## dark

파생색: 초록 틴트 #1e281f, 연두 틴트 #1d241e, 빨강 틴트 #2d1f1f, heat .5 #3c2322, heat 1 #5d2b29

| 용도 | 글자 | 바탕 | 대비 | 판정(4.5) |
|---|---|---|---|---|
| 본문 | #ededed | #1b1b1b | 14.71 | PASS |
| 본문/페이지 바탕 | #ededed | #121212 | 16.00 | PASS |
| 본문/surface-2 | #ededed | #161616 | 15.46 | PASS |
| 보조(text-2) | #c4c4c4 | #1b1b1b | 9.88 | PASS |
| 보조(text-2)/bg | #c4c4c4 | #121212 | 10.74 | PASS |
| muted | #a0a0a0 | #1b1b1b | 6.59 | PASS |
| muted/bg | #a0a0a0 | #121212 | 7.16 | PASS |
| muted/surface-2 | #a0a0a0 | #161616 | 6.92 | PASS |
| 초록 글자 | #3fb950 | #1b1b1b | 6.78 | PASS |
| 초록 글자/bg | #3fb950 | #121212 | 7.37 | PASS |
| 빨강 글자 | #f85149 | #1b1b1b | 5.14 | PASS |
| 빨강 글자/bg | #f85149 | #121212 | 5.59 | PASS |
| primary 버튼 글자(반전) | #121212 | #ededed | 16.00 | PASS |
| 초록 채움 위 글자 | #121212 | #3fb950 | 7.37 | PASS |
| 빨강 채움 위 글자 | #121212 | #f85149 | 5.59 | PASS |
| 토스트 글자 | #1b1b1b | #ededed | 14.71 | PASS |
| 토스트 muted | #333333 | #ededed | 10.79 | PASS |
| 본문/초록 8% 틴트(플래시 green) | #ededed | #1e281f | 13.01 | PASS |
| muted/초록 틴트 | #a0a0a0 | #1e281f | 5.83 | PASS |
| 초록 글자/초록 틴트 | #3fb950 | #1e281f | 6.00 | PASS |
| 본문/연두 6% 틴트(lightgreen) | #ededed | #1d241e | 13.55 | PASS |
| muted/연두 틴트 | #a0a0a0 | #1d241e | 6.07 | PASS |
| 본문/빨강 8% 틴트(플래시 red) | #ededed | #2d1f1f | 13.51 | PASS |
| muted/빨강 틴트 | #a0a0a0 | #2d1f1f | 6.05 | PASS |
| 빨강 글자/빨강 틴트 | #f85149 | #2d1f1f | 4.72 | PASS |
| 본문/heat .5 카드 | #ededed | #3c2322 | 12.32 | PASS |
| text-2/heat .5 카드 | #c4c4c4 | #3c2322 | 8.27 | PASS |
| 본문/heat 1 카드 | #ededed | #5d2b29 | 9.73 | PASS |
| text-2/heat 1 카드 | #c4c4c4 | #5d2b29 | 6.53 | PASS |
| 배지 글자(muted)/surface | #a0a0a0 | #1b1b1b | 6.59 | PASS |
| 탭 비활성(muted)/surface-2 | #a0a0a0 | #161616 | 6.92 | PASS |
| 플레이스홀더(muted) | #a0a0a0 | #1b1b1b | 6.59 | PASS |
| 비활성 버튼 글자(muted)/bg | #a0a0a0 | #121212 | 7.16 | PASS |

비텍스트(3:1)

| 용도 | 전경 | 바탕 | 대비 | 판정(3.0) |
|---|---|---|---|---|
| 입력 테두리(border-strong)/surface | #7a7a7a | #1b1b1b | 4.01 | PASS |
| 입력 테두리/bg | #7a7a7a | #121212 | 4.36 | PASS |
| 포커스 링(text, offset 2px → 바탕 위에 그려짐)/surface | #ededed | #1b1b1b | 14.71 | PASS |
| 포커스 링/bg | #ededed | #121212 | 16.00 | PASS |
| 포커스 링/surface-2 | #ededed | #161616 | 15.46 | PASS |
| 초록 띠·테두리/surface | #3fb950 | #1b1b1b | 6.78 | PASS |
| 빨강 띠·테두리/surface | #f85149 | #1b1b1b | 5.14 | PASS |
| 카드 테두리(border, 장식)/surface | #333333 | #1b1b1b | 1.36 | 참고 |

## light 전수 행렬 (전경 × 바탕)

| | bg #f4f4f4 | surface #ffffff | surface2 #f7f7f7 |
|---|---|---|---|
| text #111111 | 17.17 | 18.88 | 17.63 |
| text2 #3d3d3d | 9.88 | 10.86 | 10.14 |
| muted #5f5f5f | 5.81 | 6.39 | 5.96 |
| ok #1a7f37 | 4.62 | 5.08 | 4.74 |
| danger #d1242f | 4.77 | 5.24 | 4.90 |

## dark 전수 행렬 (전경 × 바탕)

| | bg #121212 | surface #1b1b1b | surface2 #161616 |
|---|---|---|---|
| text #ededed | 16.00 | 14.71 | 15.46 |
| text2 #c4c4c4 | 10.74 | 9.88 | 10.38 |
| muted #a0a0a0 | 7.16 | 6.59 | 6.92 |
| ok #3fb950 | 7.37 | 6.78 | 7.12 |
| danger #f85149 | 5.59 | 5.14 | 5.40 |

## 적록 색각 시뮬레이션 (숙련도 4단계 + heat)

방법: Machado et al. 2009 행렬(심도 1.0)을 선형 RGB 에 적용해 변환색을 얻고, 변환색 사이 CIE76 ΔE 를 계산. 경험적 기준 ΔE ≥ 20 이면 "나란히 두면 구분됨", 10 미만이면 "같은 색으로 보임". 구분이 ΔE 에만 의존하지 않도록 비색 단서(테두리 패턴·마크)를 함께 둔다.

### light

| 단계 | 원색 | protanopia | deuteranopia |
|---|---|---|---|
| green 띠 | #1a7f37 | #807330 | #756b3d |
| lightgreen 띠(ok 45%) | #98c5a5 | #c5bea3 | #bdb8a7 |
| red 띠 | #d1242f | #5d542d | #877928 |
| none(surface) | #ffffff | #ffffff | #ffffff |
| heat 1 테두리 | #d1242f | #5d542d | #877928 |
| heat .5 테두리 | #d07a7f | #8b887f | #a0997d |

| 쌍 | ΔE 원색 | ΔE protanopia | ΔE deuteranopia | 비색 단서 |
|---|---|---|---|---|
| green 띠 ↔ lightgreen 띠(ok 45%) | 42 | 37 | 35 | 실선 띠 vs 점선 띠(2px dashed) |
| green 띠 ↔ red 띠 | 109 | 19 | 18 | 실선 4px 띠+✓ vs 실선 4px 띠+✕ |
| green 띠 ↔ none(surface) | 76 | 64 | 61 | 띠 있음 vs 없음 |
| lightgreen 띠(ok 45%) ↔ red 띠 | 95 | 42 | 43 | 점선 띠 vs 실선 띠+✕ |
| lightgreen 띠(ok 45%) ↔ none(surface) | 34 | 27 | 27 |  |
| red 띠 ↔ none(surface) | 93 | 69 | 67 | 띠+✕ vs 없음 |

### dark

| 단계 | 원색 | protanopia | deuteranopia |
|---|---|---|---|
| green 띠 | #3fb950 | #bca946 | #ad9e58 |
| lightgreen 띠(ok 45%) | #2b6233 | #635a2f | #5c5536 |
| red 띠 | #f85149 | #807547 | #aa9a44 |
| none(surface) | #1b1b1b | #1b1b1b | #1b1b1b |
| heat 1 테두리 | #f85149 | #807547 | #aa9a44 |
| heat .5 테두리 | #96423e | #56513d | #6b633c |

| 쌍 | ΔE 원색 | ΔE protanopia | ΔE deuteranopia | 비색 단서 |
|---|---|---|---|---|
| green 띠 ↔ lightgreen 띠(ok 45%) | 45 | 41 | 35 | 실선 띠 vs 점선 띠(2px dashed) |
| green 띠 ↔ red 띠 | 119 | 32 | 8 | 실선 4px 띠+✓ vs 실선 4px 띠+✕ |
| green 띠 ↔ none(surface) | 90 | 79 | 67 | 띠 있음 vs 없음 |
| lightgreen 띠(ok 45%) ↔ red 띠 | 97 | 11 | 39 | 점선 띠 vs 실선 띠+✕ |
| lightgreen 띠(ok 45%) ↔ none(surface) | 45 | 39 | 33 |  |
| red 띠 ↔ none(surface) | 89 | 48 | 71 | 띠+✕ vs 없음 |


**합계: 글자·비텍스트 FAIL 0건**
