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

## E. 글꼴 메트릭 실측 (3차, RV M12 — `fontmetrics.py`, fontTools 4.68, 2026-11-08)

파일: Pretendard-Regular.ttf(v1.3.9 `dist/public/static/alternative`), SUIT-Regular.ttf(sun-typeface/SUIT HEAD `fonts/static/ttf`), `C:\Windows\Fonts\malgun.ttf`(Malgun Gothic, 이 PC), NotoSansKR-Regular.otf(notofonts/noto-cjk `Sans/SubsetOTF/KR`). **Apple SD Gothic Neo 는 macOS 번들이라 이 PC 에서 잴 수 없었다(미측정).** 모든 값은 em 비율(= 단위/unitsPerEm). "실측 x" 는 글리프 `x` 의 yMax, 한글 높이는 `한` 의 bounds. 숫자 등폭 = 0~9 advance 가 모두 같은가. tnum/pnum = GSUB FeatureList 에 태그가 있는가.

| 폰트 | upm | x-height/em (OS/2 sxHeight · 실측 x) | cap/em | 한글 자폭/em (가·한·뷁) | 한글 글리프 높이/em(한) | 숫자 폭/em (0·1·7) | 숫자 등폭 | tnum/pnum | 한글 음절 수 | 라틴 a 폭/em |
|---|---|---|---|---|---|---|---|---|---|---|
| Pretendard-Regular.ttf | 2048 | 0.530 · 0.530 | 0.707 | 0.864/0.864/0.864 | 0.849 | 0.596/0.438/0.552 | 아니오(9종) | tnum/pnum | 11,172 | 0.535 |
| SUIT-Regular.ttf | 1000 | 0.461 · 0.461 | 0.722 | 0.874/0.874/0.874 | 0.854 | 0.622/0.373/0.552 | 아니오(8종) | tnum/pnum | 11,172 | 0.575 |
| malgun.ttf (Windows 시스템) | 2048 | 0.513 · 0.513 | 0.718 | 1.000/1.000/1.000 | 0.925 | 0.551/0.551/0.551 | 예 | —/— | 11,172 | 0.520 |
| NotoSansKR-Regular.otf (Android 시스템 계열) | 1000 | 0.543 · 0.543 | 0.733 | 0.920/0.920/0.920 | 0.884 | 0.555/0.555/0.555 | 예 | —/— | 11,172 | 0.563 |

읽는 법: 한글 자폭이 작을수록 같은 카드 폭에 더 많은 글자가 들어간다(Pretendard 0.864 vs Malgun 1.000 → 15px 에서 글자당 2.0px, 20자 제목에서 41px 차이). 숫자는 Malgun·Noto 가 기본 등폭, Pretendard·SUIT 는 기본 비례폭이지만 `tnum` 으로 등폭 전환 가능(0.552/em 로 통일됨 — `7` 의 폭이 tnum 폭).

## F. 서브셋 파일의 실제 글리프 수 (`fontcount.py`)

| 파일 | 바이트 | cmap 문자 수 | 한글 음절 수 | 가변 |
|---|---|---|---|---|
| SUIT-Regular.woff2 (공식 배포) | 167,672 | 2,933 | **2,668** | 정적 |
| SUIT-Variable.woff2 (공식 배포) | 624,536 | 2,933 | 2,668 | fvar |
| Pretendard-Regular.subset.woff2 (공식 배포) | 267,096 | 3,728 | **2,780** | 정적 |
| Pretendard-SemiBold.subset.woff2 (공식 배포) | 268,752 | 3,728 | 2,780 | 정적 |
| PretendardVariable.woff2 (완전본) | 2,057,688 | 14,336 | 11,172 | fvar |

→ §A 의 "SUIT 글리프 수 [가정]" 해소: SUIT 웹폰트는 2,668자 서브셋이다. Pretendard 서브셋은 KS X 1001 2,350 + 430자 = 2,780자.

## G. 직접 만든 가변 서브셋 (`fontsubset.py`, pyftsubset + woff2)

공식 서브셋 cmap(3,728자)을 유니코드 목록으로 써서 PretendardVariable.woff2 를 잘라 봤다(힌팅 제거, kern/liga/calt/tnum/pnum/lnum/ccmp/locl 유지).

| 산출 파일 | 바이트 | wght 축 | 문자 수 |
|---|---|---|---|
| PretendardVariable.subset-full.woff2 | **601,876** | 45–920 전체 | 3,728 |
| (400–700 축 제한) | 실패 — instancer 가 폰트 내부의 깨진 글리프 참조(`uni2004`)에서 KeyError | | |

→ 가변 서브셋 1개(602 KB)가 정적 2개(Regular+SemiBold ≈ 536 KB)보다 크다. **정적 서브셋 2개가 최소다.**
