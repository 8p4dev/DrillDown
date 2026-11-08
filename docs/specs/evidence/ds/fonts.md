# 폰트 측정표 (2026-11-08)

방법: 공식 배포본(GitHub 릴리스 태그를 가리키는 jsDelivr `gh/` 경로) 또는 Google Fonts CSS API 에서 **직접 내려받아** 바이트를 쟀다(`curl -sL -o` 후 `ls -l`, `file` 로 WOFF2 확인). 다이나믹 서브셋은 CSS 의 `@font-face` 를 전부 파싱해 청크 URL 을 모두 받아 합산하고, "한 화면" 추정은 샘플 텍스트(목록 화면 + 에디터 카드 20개 분량의 노동법 목차 + 앱 UI 라벨, 고유 197자)의 코드포인트가 `unicode-range` 에 걸리는 청크만 세었다. 스크립트: 세션 scratch `fontchunks.mjs`(의존성 0, 커밋하지 않음 — 핵심 로직은 아래에 요약). 폰트 파일은 scratch 에만 두고 커밋하지 않았다.

```js
// fontchunks.mjs 핵심: @font-face 블록 → {url, weight, unicode-range[]}; fetch 로 byteLength; 샘플 문자가 range 에 들어가는 face 만 합산
for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) { /* url, font-weight, unicode-range 파싱 */ }
const hit = (f) => chars.some((c) => f.rs.some(([lo, hi]) => c >= lo && c <= hi))
```

## A. 완전본·정적 서브셋 (파일 1~2개)

| 폰트 | 파일 | 바이트 | 비고 |
|---|---|---|---|
| Pretendard 1.3.9 | `variable/woff2/PretendardVariable.woff2` | 2,057,688 | 가변, 전체 한글 11,172자 |
| Pretendard 1.3.9 | `static/woff2/Pretendard-Regular.woff2` | 765,892 | 정적 |
| Pretendard 1.3.9 | `static/woff2/Pretendard-Bold.woff2` | 791,156 | 정적 |
| Pretendard 1.3.9 | `static/woff2-subset/Pretendard-Regular.subset.woff2` | 267,096 | **KS X 1001 2,350자 서브셋** |
| Pretendard 1.3.9 | `static/woff2-subset/Pretendard-Bold.subset.woff2` | 270,784 | 서브셋. Regular+Bold = **537,880** |
| Pretendard Std 1.3.9 | `pretendard-std/…/PretendardStdVariable.woff2` | 291,680 | **라틴 전용**(README "라틴 환경에서 … 적은 용량") — 한글 없음, 후보 아님 |
| SUIT 2.x | `fonts/variable/woff2/SUIT-Variable.woff2` | 624,536 | 가변 |
| SUIT 2.x | `fonts/static/woff2/SUIT-Regular.woff2` | 167,672 | 정적 |
| SUIT 2.x | `fonts/static/woff2/SUIT-Bold.woff2` | 171,380 | Regular+Bold = **339,052**. 글리프 수는 공식 문서에서 확인 못 함 — 크기로 보아 KS X 1001 급 서브셋 [가정] |
| Wanted Sans 1.0.3 | `variable/complete/woff2/WantedSansVariable.woff2` | 1,289,292 | 가변 완전본 |
| Wanted Sans Std 1.0.3 | `wanted-sans-std/…/WantedSansStdVariable.woff2` | 82,648 | **라틴 전용**(README "라틴 전용 Wanted Sans") — 후보 아님 |
| IBM Plex Sans KR | (GitHub 릴리스 zip 수십 MB — 받지 않음) | — | 아래 B 의 Google 청크로 측정 |
| Noto Sans KR | (notofonts/noto-cjk 릴리스 OTF 수십 MB — 받지 않음) | — | 아래 B 의 Google 청크로 측정 |

## B. 다이나믹 서브셋 (청크 분할)

| 폰트 | weight | 청크 수 | 전체 바이트 | 한 화면 청크 | 한 화면 바이트 | 샘플 |
|---|---|---|---|---|---|---|
| Noto Sans KR (Google, 가변 400..700) | 400 700 | 124 | 3,426 KB | 11 | **183 KB** | 197자 |
| Noto Sans KR (Google, 정적 400) | 400 | 124 | 1,824 KB | 11 | 100 KB | 197자 |
| IBM Plex Sans KR (Google, 400) | 400 | 94 | 1,098 KB | 11 | 151 KB | 197자 |
| IBM Plex Sans KR (Google, 700) | 700 | 94 | 1,105 KB | 11 | 164 KB | 197자 |
| Pretendard Variable 다이나믹 서브셋 (jsDelivr v1.3.9) | 45–920 | 92 | 2,888 KB | 10 | **254 KB** | 197자 |
| Wanted Sans Variable split (jsDelivr v1.0.3) | 400–1000 | 92 | 2,228 KB | 11 | **292 KB** | 197자 |

정적 폰트는 제목(600~750)에 Bold 가 따로 필요하므로 한 화면 = Regular + Bold 청크: Noto 정적 ≈ 100 + ~100 = 200 KB, Plex ≈ 151 + 164 = **315 KB**.

Google Fonts CSS 요청 UA: Chrome 130 데스크톱(woff2 분할본). Noto Sans KR 의 Google 배포본은 CJK 공통 분할이라 한 청크가 커서(평균 ~15–28 KB) "한 화면"이 가장 작은 183 KB 가 나왔다. Pretendard·Wanted 는 분할 수가 적고(92) 한 청크가 커서 한 화면 바이트가 더 크다.

## C. 비교 기준선

| 항목 | 바이트 |
|---|---|
| 현재 첫 화면 전송(gzip, bundle.md) | ≈ 108 KB |
| 시스템 스택 | **0** |
| 최소 웹폰트 한 화면(Noto 가변, 11 청크, 11 요청) | 183 KB (≈ 첫 화면의 1.7배) |
| 최소 "파일 2개" 서브셋(SUIT Regular+Bold) | 339 KB |
| Pretendard 서브셋 Regular+Bold | 538 KB |

## D. 라이선스 원문 (확인일 2026-11-08)

| 폰트 | 라이선스 | 원문 위치 | 확인한 문장 |
|---|---|---|---|
| Pretendard | SIL OFL 1.1 | https://github.com/orioncactus/pretendard/blob/main/LICENSE | "Copyright (c) 2021, Kil Hyung-jin … with Reserved Font Name 'Pretendard'. … licensed under the SIL Open Font License, Version 1.1" |
| SUIT | SIL OFL 1.1 | https://github.com/sun-typeface/SUIT/blob/main/LICENSE | "Copyright (c) 2022, SUNN (http://sun.fo/suit), with Reserved Font Name SUIT. This Font Software is licensed under the SIL Open Font License, Version 1.1." |
| Wanted Sans | SIL OFL 1.1 | https://github.com/wanteddev/wanted-sans/blob/v1.0.3/OFL.txt | "Copyright 2024 The Wanted Sans Project Authors … licensed under the SIL Open Font License, Version 1.1" (README: "글꼴 단독 판매 및 글꼴 라이선스 변경을 제외한 모든 상업적 행위 및 수정, 재배포가 가능") |
| IBM Plex Sans KR | SIL OFL 1.1 | https://github.com/IBM/plex/blob/master/LICENSE.txt | "Copyright © 2017 IBM Corp. with Reserved Font Name 'Plex' … SIL Open Font License, Version 1.1" |
| Noto Sans KR (Noto Sans CJK) | SIL OFL 1.1 | https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE | "This Font Software is licensed under the SIL Open Font License, Version 1.1." |
| 시스템 폰트(Malgun Gothic·Apple SD Gothic Neo·Noto Sans CJK on Android) | OS 번들 | — | 앱이 배포하지 않으므로 라이선스 의무 없음 |

OFL 1.1 공통: 상업 사용·임베딩·수정·재배포 허용, 폰트 **단독 판매 금지**, 수정본은 Reserved Font Name 사용 금지(서브셋 생성 시 family 이름을 바꿔야 하는지는 OFL FAQ 상 "Reserved Font Name 을 쓰려면 원본 그대로"가 원칙 — 공식 배포 서브셋 파일을 그대로 쓰면 문제 없음) [출처: https://scripts.sil.org/OFL].
