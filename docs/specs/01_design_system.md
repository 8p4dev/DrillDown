# 01 디자인 시스템 — 색·형태·폰트·테마 전환·아이콘·마이크로 인터랙션·클라이언트 리소스

작성: 에이전트 DS, 2026-11-08. 상위: `docs/plans/orchestration_redesign.md` §1 R1·R2·R3(언어)·R4·R5(클라이언트)·R7. 증거: `evidence/ds/` (`contrast.mjs`·`contrast.md` 대비·색각 계산, `fonts.md` 폰트 바이트, `icons.md` 아이콘 바이트, `bundle.md` 번들 기준선, `mock.html` 목업과 `mock-light.png`·`mock-dark.png`).
근거 태그: **[결정]** 이 문서가 정함 / **[제안]** 오케스트레이터 확인 필요 / **[가정]** 확인 안 됨 / **[출처 n]** §7 / **[코드]** 현재 코드 사실 / **[측정]** 이 세션에서 직접 잰 값(evidence 참조).

## 1. 목적과 범위

이 문서는 앱 전체가 공유하는 시각 언어를 정한다: 색 토큰(R1), 형태와 상태(R2), 아이콘·최소 텍스트·마이크로 인터랙션의 "언어"(R3 — 배치는 LM), 라이트/다크 전환(R4), 클라이언트 리소스 예산과 폰트(R5·R7). [결정]
레이아웃·키보드(LM), 로그인·관리자 화면 구조(AA), 저장·동기화 모델(SH)은 다루지 않고 §3.9 "타 문서 의존" 표로만 경계를 적는다. [결정]
산출물은 설계 문서이며 `src/**` 는 바꾸지 않았다(plan A1). [코드]

## 2. 결정 요약표

| 항목 | 결정 | 대안 | 근거 | 공수 |
|---|---|---|---|---|
| 팔레트 | 무채색 8단계 + 초록 1 + 빨강 1. 파랑 `--accent` **폐기**, 강조색 = 전경색(라이트 검정/다크 흰색). `--warn` 폐기 | 파랑을 채도만 낮춰 유지 / 초록을 강조색으로 겸용 | R1 원문 "파랑 accent 제거"; 초록을 강조색으로 쓰면 "정답"과 "선택"이 섞인다 | S |
| 대비 | 모든 글자/바탕 쌍 ≥ 4.5:1, 비텍스트 ≥ 3:1. **위반 0건** [측정] | 큰 글자만 3:1 허용 | 이전 디자인 라이트 94건 위반 재발 금지(지시) | — |
| 숙련도 4단계 | 초록(실선 띠 + ✓✓) · 연두(점선 띠 + ✓, 초록 45% 틴트) · 없음 · 빨강(실선 띠 + ✕). **마크는 필수** | 색만 / 채움 패턴 | 다크 deuteranopia 에서 초록↔빨강 ΔE 8 [측정 contrast.md] | S |
| 에디터 heat | 배경 `danger × heat × 30%`, 테두리 `danger × heat × 100%` + 오답 수 배지 `✕n` | 현행 24%/75% 색만 | 배지가 색 아닌 단서; 본문 대비 heat 1 에서 11.5:1 [측정] | S |
| 형태 | `--radius-sm 0 / --radius 2px / --radius-lg 2px`, 그림자 토큰 3개 **삭제**, 위계는 1px 선 + 면 3단계 | 4px 반경 / 그림자 1단계 유지 | R2 "최소 필렛", 그림자는 합성 비용과 다크 모드 가시성 문제 | M |
| 폰트 | **시스템 스택 유지**(0 B). 웹폰트는 한 화면 최소 183 KB(Noto 가변 11청크) = 현재 첫 화면 gzip 108 KB 의 1.7배 [측정 fonts.md] | Pretendard 서브셋 538 KB / SUIT 339 KB | R5 리소스 최소, 오프라인 PWA 캐시 부담 | — |
| 아이콘 | Lucide(ISC) 52개를 path 문자열로 인라인, 16/20px, stroke 2/1.75. ≈ 18.3 KB 비압축 [측정 icons.md] | Tabler(MIT) / Phosphor(MIT) / 자체 제작 | 단일 규격(24 격자·round)이 기존 `tree-modes` SVG 와 가장 가깝고 의존성 0 | S |
| 최소 텍스트 | 아이콘 전용 15곳, 아이콘+짧은 글자 24곳, 글자 유지 31곳(§3.5 인벤토리). 모든 아이콘 전용 컨트롤은 `aria-label` + 툴팁 | 전부 아이콘화 | 파괴적·평가 동작(삭제·알음·모름·채점)은 오독 비용이 커 글자 유지 | M |
| 인터랙션 | 상태 변화 알림 17종만(§3.6). `transform`/`opacity` 전용, 무한 애니메이션은 로딩 2종만, `--ease-spring`·`pulse-ring`·고스트 기울기 **삭제** | 현행 유지 | R3 "장식 금지", R5_liquid_glass 2·3단계(주의 분산) [출처 1] | M |
| 테마 | 3상태 `auto/light/dark`, `:root[data-theme]`, localStorage `theme`, head 인라인 부팅 스크립트, `color-scheme`·단일 `<meta theme-color>` 동기화 | 2상태 토글 | R4 원문 "시스템 자동 + 수동" | S |
| 리소스 | 첫 화면 gzip ≤ 115 KB(현 108 + 아이콘 6), CSS 합계 ≤ 44 KB(현 49.6), 폰트 0, precache ≤ 500 KiB(현 489.88), 의존성 추가 0 | — | bundle.md 기준선 [측정] | — |
| 형광펜 | 분홍·노랑·하늘 → **초록 바탕·빨강 바탕·밑줄** | 색 유지 | A6 "초록·빨강 외 유채색 금지" | S + 데이터 이전 |

## 3. 상세 설계

### 3.1 팔레트 [R1]

토큰 이름은 공유 계약(`orchestration_visual_polish.md` §3.1)을 유지하고 값만 바꾼다. [결정] 아래 hex 는 `evidence/ds/contrast.mjs` 의 원본 값과 같다. [측정]

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--bg` | `#f4f4f4` | `#121212` | 페이지 바탕 |
| `--surface` | `#ffffff` | `#1b1b1b` | 카드·입력·버튼 면 |
| `--surface-2` | `#f7f7f7` | `#161616` | 한 단계 들어간 면(툴바·트레이·비활성 입력) |
| `--border` | `#cfcfcf` | `#333333` | 장식 선(카드 가장자리·구분선). 1.4.11 비대상 |
| `--border-strong` | `#8a8a8a` | `#7a7a7a` | 조작 요소 테두리(버튼·입력·슬롯). 3:1 이상 [측정 3.45 / 4.01] |
| `--text` | `#111111` | `#ededed` | 본문·**강조색**(선택·포커스·primary·활성 탭·링크) |
| `--text-2` | `#3d3d3d` | `#c4c4c4` | 카드 내용 등 보조 본문 |
| `--muted` | `#5f5f5f` | `#a0a0a0` | 라벨·비활성·플레이스홀더. 흰 바탕 6.39:1, 페이지 바탕 5.80:1 [측정] |
| `--ok` | `#1a7f37` | `#3fb950` | 정답·숙련·성공·"알음"·저장됨 |
| `--danger` | `#d1242f` | `#f85149` | 오답·위험·삭제·"모름"·실패 |
| `--on-fill` (신규) | `#ffffff` | `#121212` | 초록/빨강 **채움 위 글자**. 다크는 밝은 초록 위에 흰 글자가 2.5:1 이라 검정으로 반전 [측정] |
| `--accent` | **폐기** → 이행기에는 `var(--text)` 별칭 | | §3.1.1 |
| `--accent-soft` | **폐기** → `color-mix(in srgb, var(--text) 8%, transparent)` 로 치환(호버 면) | | |
| `--warn` | **폐기** | | 노랑은 A6 위반. 쓰는 곳 `.c-yellow`·`.mm-node[data-color=yellow]` 는 `NodeColor` 가 실제로 내지 않는 값 [코드 `src/core/srs/index.ts:76` — green/lightgreen/none 만 반환] |
| `--shadow`·`--shadow-lift`·`--shadow-pop` | **폐기** | | §3.3 |
| `--radius-sm`·`--radius`·`--radius-lg` | `0`·`2px`·`2px` | | §3.3 |
| `--fs-*`·`--nav-h`·`--tap`·`--safe-b`·`--t-*`·`--ease-out`·`--ease-press` | 유지 | | `--ease-spring` 폐기(§3.6) |

회색 단계는 R·G·B 가 같은 순수 무채색이다(현행 `#f4f5f7` 류의 푸른 기 제거). [결정]
다크 본문은 `#ffffff` 대신 `#ededed` 로 두어 어두운 바탕에서의 번짐(halation)을 줄인다 — 수치 근거는 없고 일반 관행이다. [가정]

#### 3.1.1 강조색 = 전경색 [결정]

| 쓰임 | 현행(파랑) [코드] | 새 규칙 |
|---|---|---|
| 링크 | `a { color: var(--accent) }` index.css:44 | `color: var(--text); text-decoration: underline; text-underline-offset: .15em`. 색이 아니라 밑줄이 링크임을 알린다 |
| 포커스 링 | `outline: 2px solid var(--accent)` index.css:47 | `outline: 2px solid var(--text); outline-offset: 2px`. 오프셋 때문에 링은 요소 밖 바탕 위에 그려져 초록/빨강 채움 위에서도 대비 14~19:1 [측정] |
| 선택 상태(노드·카드) | `box-shadow: 0 0 0 2px var(--accent)…` editor.css:76, dnd.css:56 | `outline: 2px solid var(--text); outline-offset: 2px` (포커스와 같은 모양 — 선택과 포커스가 겹치는 트리 UI 에서는 같은 뜻) |
| primary 버튼 | `background: var(--accent); color: #fff` index.css:93 | `background: var(--text); color: var(--bg)` (반전). 호버 `--text-2` |
| 활성 탭 | `color: var(--accent)` tree-header.css:14, index.css:61 | 모드 탭: 반전 채움. 상단 바: 글자 `--text` + 2px 밑줄 |
| 입력 포커스 | `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft)` index.css:109 | `border-color: var(--text); box-shadow: inset 0 0 0 1px var(--text)` (2px 두께 효과) |
| 선택 영역 `::selection` | accent 26% | `background: var(--text); color: var(--bg)` |
| 체크박스 `accent-color` | accent | `var(--text)` |
| 루트 노드 강조 | accent 9% 틴트 editor.css:71 | 테두리 2px `--text`, 틴트 없음 |
| 브랜드 마크 | 파랑→보라 그라데이션 + 점 3개 index.css:64-72 | 14px 검정 사각형(`currentColor`) |

#### 3.1.2 숙련도 4단계 (플래시 화면 전용 — `orchestration_modes.md` §0 유지 [출처 2])

| `data-color` | 띠(카드 상단 4px) | 카드 틴트 | 테두리 | 마크(우상단, 색 아닌 단서) | 미니맵 |
|---|---|---|---|---|---|
| `green` | `--ok` 실선 | ok 8% | `--ok` 1px | ✓✓ (`check` 2개 겹침) | 채움 `--ok` |
| `lightgreen` | `color-mix(--ok 45%, --surface)` **점선**(dashed) | ok 6% | `--border-strong` | ✓ 1개 | 채움 ok 45% + 점선 외곽 |
| `none` | `--border` | 없음 | `--border` | 없음 | `--surface-2` + 외곽 |
| `red` | `--danger` 실선 | danger 8% | `--danger` 1px | ✕ (`x`) | 채움 `--danger` |

연두는 "초록의 연한 단계"로 같은 색상(hue)을 쓴다 — 두 유채색 안에서 4단계를 내기 위해 명도와 **패턴**으로 가른다. [결정]
적록 색각 시뮬레이션(Machado 2009 행렬 [출처 3], `contrast.md` 마지막 절)에서 라이트 초록↔빨강 ΔE 19/18, **다크 deuteranopia 초록↔빨강 ΔE 8** 로 사실상 같은 색이다. 따라서 마크 ✓✓/✓/—/✕ 는 장식이 아니라 필수 단서다. [측정][결정]
`c-misplaced`(현행 주황 `#f2994a` 외곽선 index.css:133)는 `--danger` 2px **점선** 외곽선으로 바꾼다. [결정]

#### 3.1.3 에디터 heat (0~1 연속) [결정]

`--heat` 훅은 유지한다(§3.2 계약). 배경 `color-mix(in srgb, var(--danger) calc(var(--heat) * 30%), var(--surface))`, 테두리 `color-mix(in srgb, var(--danger) calc(var(--heat) * 100%), var(--border-strong))`. heat .5·1 에서 본문 대비 14.85·11.50(라이트), 12.32·9.73(다크) [측정]. 색 아닌 단서는 카드 우하단 `✕n` 배지(`data-miss` 가 1 이상이면 항상 표시 — heat 가 0 보다 크면 miss 도 0 보다 크므로 단서가 빠지는 구간이 없다 [코드 `missHeat`]). 목업 §5 에 0/.5/1 세 단계를 그렸다.

#### 3.1.4 형광펜 [제안]

`mark.hl-p`(분홍) `mark.hl-y`(노랑) `mark.hl-b`(하늘) editor.css:106-108 은 A6 위반이다. `hl-g`(초록 28% 바탕) `hl-r`(빨강 24% 바탕) `hl-u`(2px 밑줄) 로 바꾼다. 세 가지 모두 본문 대비 ≥ 11:1 [측정 — heat 1 바탕과 같은 수준]. 저장된 노트 문자열에 클래스가 들어 있으면 이행 매핑(p→r, y→g, b→u)이 필요하다 — 저장 형식은 `src/features/editor/content/` 소유라 §6 질문으로 남긴다.

### 3.2 대비 [R1·검증]

`contrast.mjs` 가 토큰에서 글자/바탕 쌍 34개×2테마, 비텍스트 8개×2테마, 전수 행렬 5×3×2 를 계산한다. **FAIL 0건**, 최저값은 연두 틴트 위 초록 글자 4.57(라이트), 빨강 틴트 위 빨강 글자 4.72(다크). [측정] 전체 표는 `evidence/ds/contrast.md`. 틴트는 처음 12% 로 잡았다가 초록 글자/초록 틴트 4.33 으로 떨어져 8% 로 낮췄다(스크립트 1차 실행 결과). [측정]
규칙: 유채색 글자(`--ok`·`--danger`)는 `--surface`·`--bg`·자기 색 8% 틴트 위에만 쓴다. 채움 위 글자는 `--on-fill`. 새 쌍이 생기면 `contrast.mjs` 에 행을 추가해 돌린다. [결정]

### 3.3 형태 [R2]

- 반경: `--radius-sm 0`(배지·아바타·칩), `--radius 2px`(버튼·입력·탭·메뉴·토스트), `--radius-lg 2px`(카드·노드·슬롯). 원형·캡슐(`border-radius: 999px / 50%`) 사용처 12곳을 전부 사각형으로(§5(b)). [결정]
- 그림자 → 선: `box-shadow` 토큰 3개를 삭제하고, (1) 정지 요소의 가장자리는 `1px solid var(--border)`, (2) 조작 요소는 `1px solid var(--border-strong)`, (3) 떠 있는 요소(메뉴·토스트·고스트·집은 카드)는 `1px solid var(--border-strong)` + 바탕과 다른 면(`--surface` 위 `--text` 토스트, `--bg` 위 `--surface` 메뉴)으로 구분한다. 포커스·선택·놓기 대상은 2px `outline`. `backdrop-filter` 는 전부 삭제한다. [결정]
- 면 위계는 `--bg` < `--surface-2` < `--surface` 세 단계로만 낸다. [결정]

컴포넌트 상태표 (호버는 `@media (hover: hover)` 안에서만, 터치는 `--tap 44px` 유지 [코드 index.css:30]):

| 컴포넌트 | 기본 | 호버 | 눌림 | 포커스(visible) | 비활성 | 선택/활성 |
|---|---|---|---|---|---|---|
| 버튼(기본) | surface 면, border-strong 1px, 2px | surface-2 면, 테두리 text | `scale(.97)` 60ms, 면 border | outline 2px text, offset 2 | 글자 muted, 테두리 border | — |
| 버튼 primary | text 면, bg 글자 | text-2 면 | scale(.97) | 동일 | muted 면, bg 글자 | — |
| 버튼 danger / ok | surface 면, 글자·테두리 danger/ok | 채움 danger/ok, 글자 on-fill | scale(.97) | 동일 | 글자 muted | — |
| 버튼 ghost(아이콘) | 테두리 없음 | surface-2 면 + border | scale(.97) | 동일 | muted | `aria-pressed` 는 반전 |
| 버튼 link | 밑줄 글자 | 밑줄 2px | — | outline | muted | — |
| 입력 | surface, border-strong | 테두리 text | — | 테두리 text + inset 1px | surface-2 면, muted 글자 | — |
| 카드(목록) | surface, border | 테두리 text | `scale(.985)` | 내부 링크 outline(offset −2) | — | — |
| 탭(모드) | surface, muted 글자, 칸 사이 1px | surface-2 | — | outline | — | text 면 + bg 글자(반전) |
| 탭(상단 바 링크) | muted 글자 | text 글자 | — | outline | — | text 글자 + 2px 밑줄 |
| 배지 | surface, border-strong, muted 글자, 반경 0 | — | scale(.92) | outline | — | 접힘: text 면 반전 / 오답: danger 글자·테두리 |
| 토스트 | text 면, surface 글자, 2px | — | — | 버튼 outline(surface 색) | — | — |
| 메뉴 | surface, border-strong, 항목 테두리 없음 | 항목 surface-2 | — | 항목 outline(offset −2) | muted | — |
| 에디터 노드 카드 | surface, border-strong 1px, heat 틴트 | — | 집음: `scale(1.03)` + outline | outline(=선택) | 잘라냄: opacity .45 + dashed | outline 2px text |
| 루트 노드 | 테두리 2px text | — | 동일 | 동일 | — | 동일 |
| 플래시 개념 카드 | surface, border-strong | 테두리 text | scale(.985) | outline | — | 펼침: chevron 180° |
| 플래시 하위 카드 | §3.1.2 띠·틴트·마크 | — | — | 버튼 outline | 평가 후 버튼 1개만 남음 | 결과 known: ok 채움 / unknown: danger 테두리 + 8% 틴트 |
| D&D 카드 | surface, border-strong | 테두리 text, `translateY(-1px)` | 집음: opacity .3; 고스트 `scale(1.02)` + outline text | outline | 잠금: cursor default | 선택: outline 2px |
| D&D 슬롯 | surface-2, 1.5px **dashed** border-strong | — | — | — | — | 놓기 가능: 유지 / 포인터 위: 실선 text + outline / 정답: ok 실선 + ✓ / 오답: danger **dashed** + ✕ |
| 미니맵 노드 | §3.1.2 | 외곽 text 2px | — | 외곽 text 2px | opacity .55(범위 밖) | 현재: 외곽 text 3px |
| 아바타 | 2.25rem 정사각, surface-2, border-strong, 이니셜 text | — | — | — | — | 이미지: `object-fit: cover`, 반경 0 |
| 테마 토글 | 3칸 세그먼트, border-strong | surface-2 | — | outline | — | 선택 칸 반전 |

### 3.4 폰트 [R7·R5]

후보와 라이선스(원문 URL 은 `fonts.md` §D, 확인일 2026-11-08) [출처 4~9]:

| 후보 | 라이선스(원문 확인) | 상업 사용 | 한 화면 바이트 [측정] | 파일 2개(Regular+Bold) [측정] | 가독성 관찰 | 다크 보정 |
|---|---|---|---|---|---|---|
| 시스템 스택(현행) [코드 index.css:34] | OS 번들 | 가능 | **0** | 0 | Windows Malgun Gothic(힌팅 좋음, 라틴·숫자 폭 불균일), macOS/iOS Apple SD Gothic Neo(균형), Android Noto Sans CJK(넓은 자폭) [가정] | 안티앨리어싱만 |
| Pretendard 1.3.9 | OFL 1.1 ("Reserved Font Name 'Pretendard'") | 가능(단독 판매 금지) | 254 KB(가변 다이나믹 10청크) | 538 KB(KS X 1001 서브셋) | Inter 계열 라틴·본고딕 계열 한글, 높은 x-height, 9 굵기, `tnum` 지원 [가정] | 400→450 가변 |
| IBM Plex Sans KR | OFL 1.1 ("Reserved Font Name 'Plex'") | 가능 | 315 KB(400+700, 22청크) | — | 휴머니스트 라틴, 한글 자폭 넓어 좁은 카드에서 줄바꿈 증가 [가정] | 정적이라 불가 |
| Noto Sans KR | OFL 1.1 | 가능 | **183 KB**(가변 11청크) / 정적 ≈ 200 KB | — | 가장 넓은 글리프 커버리지, 자폭 넓음, 행간 큼 [가정] | 가변 |
| SUIT 2 | OFL 1.1 ("Reserved Font Name SUIT") | 가능 | — (다이나믹 배포 없음) | 339 KB | UI 본문용, 본고딕 기반 한글, 좁은 라틴 [가정] | 가변 624 KB |
| Wanted Sans 1.0.3 | OFL 1.1 (`OFL.txt`) | 가능 | 292 KB(가변 11청크) | 완전본 1,289 KB | 기하학적 라틴, 7 굵기, 문맥 대체 [가정] | 가변 |
| Pretendard Std · Wanted Sans Std | OFL 1.1 | — | 292 KB · 83 KB | — | **라틴 전용**(README 확인) — 한글 후보 아님 | — |

결론 [결정]: **시스템 스택을 유지한다.** 가장 싼 웹폰트(Noto 가변 다이나믹)도 한 화면에 183 KB·11 요청이며, 현재 첫 화면 전송 108 KB(gzip) 보다 크다. 오프라인 PWA 로 쓰려면 다이나믹 청크 124개(3.4 MB)를 precache 하거나 런타임 캐시에 의존해야 하는데, 어느 쪽도 R5 와 맞지 않는다. [측정 fonts.md §B·§C]
스택은 현행을 유지하되 순서를 `system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Segoe UI', sans-serif` 로(BlinkMacSystemFont 는 system-ui 가 대신함) 정리한다. [제안]
숫자: 시스템 한글 폰트는 `tabular-nums` 를 지원하지 않을 수 있다(Malgun Gothic 비례 숫자) [가정]. 카운터(`n / m`, 배율 `100%`, 집계)는 `min-width: Nch` 로 폭을 고정해 흔들림을 막는다. [결정]
다크 보정: 굵기를 바꾸지 않는다(가변 폰트가 없으므로 불가능하고, 정적 폰트에서 600→700 은 과하다). `-webkit-font-smoothing: antialiased` 와 `#ededed` 본문으로 번짐을 줄이는 선에서 끝낸다. [결정]
나중에 웹폰트를 넣기로 한다면 조건은 세 가지다 [제안]: (1) 자체 호스팅(Google CDN 은 오프라인 불가·개인정보), (2) KS X 1001 서브셋 정적 2개(SUIT 339 KB 또는 Pretendard 538 KB) 를 `<link rel=preload as=font crossorigin>` + `font-display: optional`(첫 방문은 시스템 폰트, 재방문부터 웹폰트 — 레이아웃 이동 0), (3) Workbox precache 가 아니라 `CacheFirst` 런타임 캐시(폰트 갱신 때 precache 전체 무효화 방지).

### 3.5 아이콘과 최소 텍스트 [R3]

아이콘 규격 [결정]: Lucide 1.70.0(ISC [출처 10]) 의 path 를 `src/ui/icons.tsx` 한 파일에 문자열로 둔다(`icons.md` 코드). 16px(인라인·탭·배지, stroke 2) / 20px(상단 바·툴바·아이콘 전용 버튼, stroke 1.75). `currentColor`. 장식 SVG(목록 빈 상태 그림 TreeListPage.tsx:79)는 유지하되 `--accent` 를 `--text` 로. 52개 ≈ 18.3 KB 비압축, 의존성 0. [측정 icons.md]
아이콘 전용 컨트롤 규칙 [결정]: `aria-label` 필수 + 호버/포커스 툴팁(`data-tip` → CSS `::after`, 목업 §2) + 터치는 `contextmenu`/길게 누르기 400ms 로 같은 툴팁 표시(`-webkit-touch-callout: none` 은 `.dnd` 에만 [코드 dnd.css:1]). 목업 자동 검사: 컨트롤 41개 중 아이콘 전용 7개, `aria-label` 누락 **0건**. [측정 — Playwright `labels.mjs`, §5(c)]

텍스트 인벤토리 (현재 UI 문자열 전수 [코드 grep] → 처리). 처리 기준: 되돌릴 수 없거나 판단이 걸린 동작은 글자 유지, 반복 조작은 아이콘, 모드·행선지는 아이콘+짧은 글자.

| 화면 | 현재 라벨 | 처리 | 아이콘 | 이유 |
|---|---|---|---|---|
| 상단 | Drill Down | 글자 유지 + ■ 마크 | — | 브랜드. ≤420px 는 마크만 [코드 index.css:75 유지] |
| 상단 | 내 트리 / 오늘의 복습 | 아이콘+글자, ≤420px 아이콘만 | list-tree / calendar-check | 행선지 2개 |
| 상단(신규) | 테마 | 아이콘 전용 3칸 | sun-moon / sun / moon | §3.7 |
| 상단(신규) | 로그인 / 계정 | 아이콘 전용 / 아바타 | log-in / 아바타 | AA |
| 목록 | 내 트리 (h1) | 유지 | — | 제목 |
| 목록 | 학습 기록 내보내기 | 아이콘 전용(현행 ⤓ → Lucide) | download | 드묾 |
| 목록 | 새 트리 제목 (예: 노동법) | 유지(placeholder) | — | 입력 안내 |
| 목록 | 만들기 | 아이콘+글자 | plus | primary 1개, 글자가 폼 제출을 분명히 함 |
| 목록 | 불러오는 중… | **삭제** → 로더 | loader(점 3개) | 150ms 지연 후 표시 [코드 App.tsx Suspense] |
| 목록 | 더 보기 (⋯) | 아이콘 전용 | ellipsis | |
| 목록 메뉴 | 이름 변경 / 삭제 | 아이콘+글자 | pencil / trash-2 | 메뉴 항목은 글자가 원칙; 삭제는 파괴적 |
| 목록 메뉴(신규) | 공유 | 아이콘+글자 | link | SH |
| 목록 | 편집 (stretched link aria) | aria 유지 | — | 보이지 않는 라벨 |
| 목록 | 플래시카드 / 빈칸 퀴즈 / 백지 퀴즈 | 아이콘+**짧은 글자** 플래시 / 빈칸 / 백지 | layers / square-dashed / file | 3개 모드를 아이콘만으로 외우게 하지 않는다 |
| 목록 | confirm "…삭제할까요? 학습 기록도…" | 글자 유지 | — | 파괴적 확인 |
| 목록(신규) | 비공개 / 링크 / 공개 배지 | 아이콘+글자 | lock / link / globe | SH 공개 범위 |
| 헤더 | 편집 / 플래시카드 / 빈칸 퀴즈 / 백지 퀴즈 (탭) | 아이콘+짧은 글자(편집·플래시·빈칸·백지) | pencil / layers / square-dashed / file | 모바일 4칸 균등 [코드 tree-header.css:23] |
| 에디터 | 축소 − / 확대 + / 배율 NN% / 화면 맞춤 ⤢ / 자동 정렬 ⊞ / 단축키 ? | 아이콘 전용(유니코드 → Lucide), 배율은 숫자 유지 | zoom-out / zoom-in / maximize / network / keyboard | aria 이미 있음 [코드 EditorPage.tsx:530-540] |
| 에디터 | 접기 / 펼치기 (하위 N개) 배지 | 숫자 + chevron | chevron-down/up | 숫자가 정보 |
| 에디터 | + 내용 | 아이콘 전용 | plus | aria `내용 추가` |
| 에디터 패널 | 불릿 / 형광펜 분홍·노랑·하늘 / 형광펜 지우기 | 아이콘 전용(CSS 글리프 → Lucide) | list / highlighter(초록·빨강 채움) / 밑줄 글자 U / eraser | §3.1.4 |
| 에디터 패널 | 너비 1·2·3단계 | 숫자 글자 유지 | — | 숫자가 뜻 |
| 에디터 패널 | 제목 / 내용 placeholder | 유지 | — | |
| 에디터 | 개요 붙여넣기 · 내보내기 (summary) | 아이콘+글자 | clipboard-paste | 접이식 제목 |
| 에디터 | 선택 노드의 자식으로 추가 / 첫 줄을 루트로 / 개요 내보내기 | 글자 유지 | — | 세 동작을 아이콘으로 구분할 수 없음 |
| 에디터 | 단축키 표 15행 | 글자 유지 | — | 설명 |
| 에디터 토스트 12종 | "저장 실패: …" 등 [코드 EditorPage.tsx:206-459] | 글자 유지, 문장은 ≤ 20자로 다듬음(예: "루트는 지울 수 없습니다 (트리 목록에서…)" → "루트는 지울 수 없음") | — | 알림은 글자 |
| 에디터 | 실행 취소 (토스트 버튼) | 아이콘+글자 | undo-2 | 되돌리기 기회 |
| 에디터 | 트리를 찾을 수 없습니다. 목록으로 | 유지 | — | 오류 |
| 플래시 | 하위 N개 ▾ / 하위 개념 없음 | 숫자 + chevron / 글자 유지 | chevron-down | |
| 플래시 | **알음 / 모름** | **글자 유지** + 아이콘 | check / x | 자기평가 버튼은 오독 비용이 큼; 색각 단서도 겸함 |
| 플래시 | ✓ 알음 — 다시 평가 / ✕ 모름 | 아이콘+글자 | check / x | |
| 플래시 | 더 들어가기: 하위 N개 | 아이콘 + 숫자 | corner-down-right | |
| 플래시 | 다음 개념 → / 요약 보기 / 요약 | 아이콘+글자 "다음" / "요약" | arrow-right / list-checks | primary 행동 |
| 플래시 | 처음부터 다시 / 편집으로 | 아이콘+글자 / 링크 글자 | rotate-ccw / pencil | |
| 플래시 | 알음 N · 모름 M (집계) | **아이콘+숫자** ✓N ✕M | check / x | 글자 2개 제거 |
| 플래시 | 수고했어요 / 모름으로 표시한 개념 / 트리가 비어 있습니다 / 개념을 찾을 수 없습니다 | 글자 유지 | — | 요약·빈 상태 |
| 플래시 | 미니맵 접기/펼치기 | 아이콘 전용(현행 유지) | chevron-down/up | aria 있음 |
| 복습 | 오늘의 복습 / 복습할 항목이 없습니다 / 오늘 복습할 항목이 없습니다 | 글자 유지 | — | |
| 복습 | 플래시카드 (링크) / 복습 시작 | 아이콘+글자 / 글자 유지(primary) | layers / — | |
| 복습 | 다음 복습 → / 복습 마치기 / 그만하기 / n / m | 아이콘+글자 "다음" / 글자 / 글자 / 숫자 | arrow-right | |
| 빈칸·백지 | 범위 (select) | 아이콘 + select | crosshair | 라벨 글자 제거, aria 유지 |
| 빈칸·백지 | **채점** | 글자 유지(primary) + 아이콘 | check-check | 되돌릴 수 없는 제출 |
| 빈칸·백지 | 정답 보기 / 내 답 보기 | 아이콘+글자 | eye / eye-off | |
| 빈칸·백지 | 다시 하기 | 아이콘+글자 | rotate-ccw | |
| 빈칸·백지 | n / m — 완벽해요! | 숫자 + ✓ 마크, 글자 **삭제** | check | 목업 §8 |
| 빈칸·백지 | 이 범위에는 … 없어요. 범위를 바꿔 보세요. | 글자 유지(≤ 20자로) | — | 빈 상태 |
| 백지 | 내 트리 / 원본 트리 (h2) | 글자 유지 | — | 비교 제목 |
| 로그인(신규) | Google 로 계속 / Kakao 로 계속 | **글자 유지** + 제공자 로고 | 제공자 로고(각사 가이드) | 제공자 브랜드 규정은 색 예외 — AA 와 합의 필요(§3.9) |
| 계정(신규) | 닉네임 / 프로필 이미지 변경 / 연결 계정 / 데이터 내보내기 / 로그아웃 / 탈퇴 | 입력 / 아이콘+글자 / 글자 / 아이콘+글자 / 아이콘+글자 / **글자 유지(danger)** | — / image / — / download / log-out / user-x | 탈퇴는 파괴적 |
| 관리자(신규) | 검색 / 정지 / 삭제 / 숨김 / 공지 / 디스크 / 백업 / 사용자 수 | 아이콘+입력 / 아이콘+글자 / 아이콘+글자 / 아이콘+글자 / 아이콘+글자 / 아이콘+숫자 / 아이콘+날짜 / 숫자 | search / ban / trash-2 / eye-off / megaphone / hard-drive / database | 표 헤더는 글자 |
| 공유 보기(신규) | 내 트리로 복제 / 링크 복사 / 공개 범위 | 아이콘+글자 / 아이콘 전용 / 아이콘+글자 | copy / link / lock·link·globe | 복제는 데이터 생성이라 글자 |
| 공통(신규) | 저장 상태 로컬 / 저장 중 / 저장됨 / 동기화 실패 | 8px 사각 점 + 짧은 글자(목업 §3) | — | SH 상태 이름은 SH 가 정함 |

집계: 아이콘 전용 15, 아이콘+글자 24, 글자 유지 31(토스트 12종 포함). 필요한 아이콘 52개(목록은 `icons.md`). [결정]

### 3.6 마이크로 인터랙션 카탈로그 [R3]

원칙 [결정]: 상태 변화를 알리는 것만. `transform`·`opacity` 만 애니메이션한다(배경·테두리 **색** 전환은 `--t-med` 트랜지션 허용 — 애니메이션이 아니라 상태 색의 보간). 무한 반복은 로딩 2종만. `--ease-spring`(오버슈트)·`pulse-ring`(box-shadow 애니메이션)·`spring-in`·고스트 기울기 `--tilt` 는 삭제. `prefers-reduced-motion` 은 전역 1ms 규칙 유지 [코드 index.css:146-149] + 항목별 대체를 적는다. haptic 은 `src/features/feel.ts` 의 `tap/success/warn` 만 쓴다 [코드].

| # | 항목 | 트리거 | 시각 변화 | 지속·이징 | reduced-motion | haptic |
|---|---|---|---|---|---|---|
| 1 | 버튼 눌림 | `:active` | `scale(.97)`(터치 .95) → 복귀 | 60ms `--ease-press` / 복귀 `--t-fast` | 면 색만 변경 | tap(터치만, 호출처 유지) |
| 2 | 테마 토글 | 클릭 | 선택 칸 즉시 반전, 페이지 색 **전환 없음**(요소마다 타이밍이 달라 얼룩) | 0 | 동일 | tap |
| 3 | 플래시 펼침 | 개념 카드 클릭 | `grid-template-rows 0fr→1fr` + opacity, chevron 180°, 하위 카드 `translateY(-8px)→0`+opacity 순차 70ms(최대 6개=420ms) | `--t-slow` `--ease-out` / `--t-med` | 순차·이동 없음, opacity 만 1ms | — |
| 4 | 알음 평가 | 버튼 클릭 | 결과 버튼 ok 채움(가상요소 `scaleX 0→1`), ✓ 마크 `scale 0→1`, 띠·틴트 색 전환 | `--t-med` `--ease-out` | 즉시 채움 | success [코드 FlashCard.tsx:46] |
| 5 | 모름 평가 | 버튼 클릭 | 결과 버튼 danger 테두리 + 8% 틴트, ✕ `scale 0→1`, 띠 danger | `--t-med` | 즉시 | warn |
| 6 | 더 들어가기 / 다음 개념 | 클릭 | 새 개념 카드 `translateY(6px)→0`+opacity (`rise`) | `--t-med` `--ease-out` | opacity 만 | — |
| 7 | D&D 집기 | pointerdown+이동 | 원 카드 opacity .3, 고스트 `scale(1.02)` + outline text, 놓을 수 있는 슬롯 dashed → 그대로(정적) | `--t-fast` | 동일(이동은 포인터 추적) | tap [코드 useDragDrop.ts:67] |
| 8 | D&D 대상 위 | 포인터 진입 | 슬롯 실선 text + outline 2px, `scale(1.04)` | `--t-fast` | scale 없음 | tap [코드 useDragDrop.ts:98] |
| 9 | D&D 놓기 | pointerup | 카드 `scale(.96)→1` | `--t-fast` `--ease-out` | 없음 | — |
| 10 | 채점 정답/오답 | 채점 클릭 | 정답: ok 테두리 + ✓ opacity 0→1; 오답: danger dashed + ✕ + `shake`(translateX ±4px). 좌상단부터 35ms 순차, 최대 600ms [코드 dnd.css:78] | `--t-med` / `--t-slow` | 순차·shake 없음, 색·마크 즉시 | success(만점) / warn [코드 DndPage.tsx:50] |
| 11 | 백지 채점 결과 | 채점 클릭 | #10 + 원본 트리 패널 `rise` | `--t-med` | opacity 만 | 동일 |
| 12 | 점수 표시 | 채점 후 | 숫자 `scale(.92)→1`, 만점은 ok 테두리 카드 + ✓ | `--t-med` | 즉시 | — |
| 13 | 실행 취소 토스트 | 삭제 등 | 진입 `translateY(8px)→0`+opacity, 퇴장 opacity | `--t-med` `--ease-out` / `--t-fast` | opacity 만 | warn(삭제 시점, 기존) |
| 14 | 트리 생성 | 만들기 제출 | 새 카드 `rise` + 2px outline text 가 `--t-slow` 동안 opacity 1→0(가상요소) | `--t-med` + `--t-slow` | 즉시 표시 | success [코드 TreeListPage.tsx:44] |
| 15 | 노드 카드 생성 | Enter/Tab | `scale(.96)→1`+opacity, 부모 쪽 origin | `--t-med` `--ease-out` | opacity 만 | — |
| 16 | 노드 접기/펼치기 | H / 배지 | chevron 180°, 사라지는 카드 opacity 0 | `--t-med` | 즉시 | — |
| 17 | 저장/동기화 상태(SH 경계) | 상태 변화 | 8px 사각 점 색: 로컬 border-strong / 저장 중 점 opacity 깜빡임 `steps(2)` 1s 무한(로딩 예외) / 저장됨 ok 후 2s 뒤 muted 로 opacity 전환 / 실패 danger 고정 + 글자 | `--t-slow` | 깜빡임 없음(글자 "저장 중") | — |
| 18 | 로그인 성공 | 콜백 | 상단 바 아바타 `rise`, 토스트 1개 "로그인됨" | `--t-med` | opacity | — |
| 19 | 공유 링크 복사 | 클릭 | 아이콘 link→check 교차 페이드, 1.5s 후 복귀 + 토스트 | `--t-fast` | 즉시 교체 | tap |
| 20 | 화면 전환 | hashchange | View Transition 교차 페이드 + `translateY(4px)` [코드 index.css:142-145 유지] | 90/160ms | 꺼짐 [코드 router.ts] | — |
| 21 | 라우트 로딩 | Suspense 150ms 후 | 사각 점 3개 opacity `steps(2)` 순차 무한(로딩 예외; 현행 원형 spinner 삭제) | 900ms | 정적 점 3개 | — |

예외 [결정]: 에디터 노드 재배치는 `left/top/width` 트랜지션(레이아웃 속성)을 유지한다 [코드 editor.css:66]. `transform` 으로 바꾸면 GraphView 의 측정·스크롤 계산을 바꿔야 해 범위를 넘는다. 구현 때 `translate` 로 옮기는 것은 [제안] L.

### 3.7 테마 전환 [R4]

상태 기계 [결정]: 저장값 `theme ∈ {light, dark}` 또는 없음(=auto). 유효 테마 = `theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? dark : light)`.

```
auto ──[토글: light]──▶ light ──[토글: dark]──▶ dark ──[토글: auto]──▶ auto
 │ 시스템 변경(matchMedia change) → 유효 테마 재계산, DOM 갱신       │
 └────────────── light/dark 에서는 시스템 변경 무시 ──────────────────┘
```

동기화 대상 4개 [결정]: (1) `document.documentElement.dataset.theme = 'light'|'dark'`, auto 는 속성 **제거**; (2) CSS `color-scheme`: `:root{color-scheme:light}`, `:root[data-theme=dark], :root:not([data-theme=light]) @media dark {color-scheme:dark}` — 스크롤바·폼 기본색이 따라온다; (3) `<meta name="theme-color">` **한 개**(현행 media 두 개 [코드 index.html:7-8] 를 하나로) 의 `content` 를 유효 테마 bg(`#f4f4f4`/`#121212`) 로; (4) localStorage `theme` (auto 는 `removeItem`). manifest `theme_color`/`background_color` 는 `#f4f4f4` 로 고정(설치 스플래시용, 현행 `#3b6cf0`/`#f4f5f7` [코드 vite.config.ts]).

FOUC 없는 부팅 (index.html `<head>`, CSS 보다 앞, 인라인 ≈ 200 B) [결정]:

```js
(function(){try{var t=localStorage.getItem('theme');
if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;
var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;
document.querySelector('meta[name=theme-color]').content=d?'#121212':'#f4f4f4'}catch(e){}})()
```

CSP 가 생기면 이 인라인 스크립트에 nonce 또는 해시가 필요하다(AA 서버 헤더 — §3.9). [제안]
런타임 [결정]: `useTheme()` 훅 1개(`src/ui/theme.ts`, ≈ 1 KB)가 `useSyncExternalStore` 로 저장값을 구독하고, `matchMedia.addEventListener('change')` 로 auto 상태의 시스템 변경을 따른다. 저장 이벤트(`storage`)도 구독해 다른 탭과 맞춘다.
토글 컨트롤 모양 [결정]: 3칸 세그먼트(auto `sun-moon` / light `sun` / dark `moon`), 32×36px 칸, 선택 칸 반전, `role=group aria-label="테마"`, 각 칸 `aria-pressed` + 툴팁 "자동/라이트/다크". 위치는 LM(§3.9). 목업 상단 바에 동작하는 구현이 있다.
E2E 로 확인할 항목 [제안]: (1) 저장값 없음 + `colorScheme: dark` 에뮬레이션 → `html` 에 `data-theme` 없음, 계산된 `--bg` 가 `#121212`; (2) dark 칸 클릭 → `data-theme=dark`, localStorage `theme=dark`, meta content `#121212`; (3) 새로고침 후 첫 페인트 전 스크린샷(`page.goto` 직후 `html[data-theme]`) 이 dark — 부팅 스크립트 검증; (4) auto 칸 → 속성 제거·키 삭제; (5) auto 상태에서 `page.emulateMedia({colorScheme:'light'})` → `--bg` `#f4f4f4`; (6) light 고정 상태에서 같은 에뮬레이션 변경 → 변화 없음; (7) `aria-pressed` 가 정확히 한 칸만 true; (8) 다크에서 `contrast.md` 의 본문/muted 쌍을 `getComputedStyle` 로 다시 계산해 4.5 이상.

### 3.8 클라이언트 리소스 예산 [R5]

기준선 [측정 bundle.md]: JS 27개 450,448 B, CSS 4개 49,623 B, precache **36 entries 489.88 KiB**(0차 지시값 489.86 과 0.02 차이는 해시 파일명), 첫 화면(목록) 전송 ≈ 108 KB gzip / 339 KB 비압축, 웹폰트 0, 이미지 0.

| 예산 | 현재 | 목표 | 근거 |
|---|---|---|---|
| 첫 화면 전송(gzip) | ≈ 108 KB | **≤ 115 KB** | 아이콘 +≈6 KB gzip, 테마 코드 +≈1 KB, CSS −≈2 KB |
| CSS 합계(비압축) | 49,623 B | **≤ 44 KB** | 삭제 항목(아래) ≈ 6 KB |
| 폰트 | 0 | **0** | §3.4 |
| precache | 489.88 KiB | **≤ 500 KiB** | 신규 화면 4개(로그인·계정·관리자·공유 보기) lazy 청크 포함 — 각 ≤ 4 KB gzip 가정 [가정] |
| 의존성 | 4 (dexie·react·react-dom·ts-fsrs) | **+0** | 아이콘·테마·툴팁 모두 자체 코드 |

삭제(바이트는 해당 규칙 문자 수 기준 추정 [가정]): `.topnav` `backdrop-filter` 2줄·그라데이션 브랜드 마크 9줄(≈ 700 B) index.css:55-72; 그림자 토큰·사용처 31곳(≈ 1.2 KB); `pulse-ring`·`spring-in`·`spin` keyframes 와 사용처(≈ 600 B); `.zoom-tools`·`.flash-nav`·`.dnd-dock` 의 `backdrop-filter`(≈ 400 B); `.c-yellow`·`--warn`·`.mm-node[data-color=yellow]`(≈ 300 B); 아바타 5색조 `color-mix(in oklch…)`(≈ 500 B) treelist.css:43-47; `.dnd-scope select` 그라데이션 셰브론(≈ 350 B) dnd.css:10-13; 형광펜 3색 → 3규칙 교체(±0); 고스트 `--tilt`(≈ 100 B + JS 수십 B). 합계 ≈ 4~6 KB.
추가: 아이콘 path 테이블 ≈ 18.3 KB 비압축 / ≈ 6 KB gzip [측정·가정]; 부팅 스크립트 ≈ 200 B; `useTheme` + 토글 ≈ 1 KB; 툴팁 CSS ≈ 300 B.
런타임 CPU: `backdrop-filter` 0, 그림자 0, 무한 애니메이션은 로딩 중에만. 300노드 트리에서 카드마다 `box-shadow` 가 사라져 합성 레이어 비용이 준다(수치 측정은 구현 뒤 — [가정]).

### 3.9 타 문서 의존

| 경계 | 이 문서가 정함 | 상대 문서에 요청/의존 |
|---|---|---|
| LM `02_layout_mobile.md` | 토글 모양(3칸 세그먼트 32×36), 아이콘 크기 16/20, 하단 바는 `--surface` + 1px 상단 선(backdrop 없음) | 토글 **위치**(상단 바 오른쪽 제안), ≤420px 에서 아이콘 전용 전환 폭, 하단 바 높이·키보드 규칙 |
| AA `03_account_admin.md` | 아바타 정사각 2.25rem 반경 0, 로그인/계정/관리자 아이콘 세트(§3.5), 상태 색은 ok/danger 만 | Google·Kakao 버튼 브랜드 규정(제공자 색 사용이 불가피하면 **A6 예외**로 명시 요청), 서버 CSP 헤더에 부팅 스크립트 해시/nonce, 아바타 업로드 크기 |
| SH `04_tree_sharing_sync.md` | 저장 상태 4단계의 **표시 언어**(점+글자, §3.6 #17), 공개 범위 아이콘 lock/link/globe, 링크 복사 인터랙션 | 상태 이름·전이(로컬/저장 중/저장됨/실패)와 이벤트, 공개 범위 enum 이름, 복제 버튼 문구 |
| 에디터 content 모듈(기존 코드) | 형광펜 3종의 뜻 | 저장 포맷의 클래스 이름 이행(p→r, y→g, b→u) — §6 |

## 4. 화면별 적용

| 화면 | 적용 요점 |
|---|---|
| 목록 | 카드 `--surface` + 1px `--border`, 호버 테두리 `--text`; 아바타 정사각 이니셜 단색(5색조 삭제); 모드 3칸 아이콘+짧은 글자; 메뉴 아이콘+글자; 새 카드 rise + outline 페이드(#14); 공개 범위 배지(SH) |
| 에디터 | 캔버스 점 격자는 `--border-strong` 55% 유지(장식 아닌 좌표 단서) [코드 editor.css:18]; 노드 카드 heat 30%/100% + ✕n 배지; 루트 2px 테두리; 선택 outline; 확대 도구 알약 → 직사각 1px 테두리 그룹, 아이콘 Lucide; 패널 툴바 아이콘 교체·형광펜 초록/빨강/밑줄; 단축키 시트 반경 2px, 그림자 없음 |
| 플래시 | 개념 카드 그림자 없음; 하위 카드 띠·틴트·마크 4단계; 알음/모름 글자+아이콘; 집계 ✓N ✕M; 미니맵 노드 사각·4단계 채움·현재 위치 `--text` 3px 외곽; 하단 바 backdrop 삭제 |
| 복습 | 진행 막대 `--text` 채움(현행 accent, 999px → 0); 리스트 버튼 규격 통일 |
| 빈칸 | 범위 select 아이콘 + 네이티브 화살표(`appearance:auto`)로 그라데이션 셰브론 삭제; 슬롯 dashed; 결과 ✓/✕ + dashed; 점수 카드; 시트 그림자 → 1px 상단 선 |
| 백지 | 빈칸과 동일 + 원본 트리 rise |
| 로그인(신규) | 중앙 카드 1장, 제공자 버튼 2개(글자 유지), 그 외 장식 0; 테마 토글은 상단 바에 그대로 |
| 계정(신규) | 아바타 정사각 + `image` 아이콘 변경 버튼, 닉네임 입력, 연결 계정 표, 내보내기/로그아웃 아이콘+글자, 탈퇴 danger 글자 + confirm 글자 |
| 관리자(신규) | 표(`table` 토큰: 반경 0, 그림자 없음 — index.css:117 수정), 상태는 ok/danger 점, 공지 1줄 입력, 디스크·백업 숫자 + 아이콘 |
| 공유 보기(신규) | 상단 바에 "읽기 전용" 배지(글자) + 복제 primary(아이콘+글자) + 링크 복사 아이콘; 나머지는 플래시/퀴즈 화면 그대로 |

## 5. 검증

### (a) 요구사항 대조표

| 요구(plan §1 완료 기준) | 어디서 충족 | 증거 |
|---|---|---|
| R1 라이트·다크 토큰 전체 hex | §3.1 표 | `contrast.mjs` L·D 객체 |
| R1 모든 글자/바탕 쌍 대비 4.5(큰 글자 3) | §3.2 | `contrast.md` FAIL 0건 (글자 34쌍×2, 비텍스트 8×2, 전수 15×2) |
| R1 숙련도 색 아닌 두 번째 단서 | §3.1.2 마크·띠 패턴 | `contrast.md` 색각 절(다크 deuteranopia ΔE 8 → 마크 필수), `mock-*.png` §6 |
| R1 기존 토큰 대응표 | §3.1 표 마지막 열·§3.1.1 | — |
| R2 컴포넌트별 형태·상태 표 | §3.3 | `mock-*.png` §2·§3·§5~§8 |
| R3 텍스트 인벤토리 현재→변경 | §3.5 표(70행) | TSX grep [코드] |
| R3 아이콘 목록·개수·바이트 | §3.5, `icons.md` | 65개 측정, 52개 채택 18.3 KB |
| R3 인터랙션 카탈로그(트리거·변화·지속·이징·reduced) | §3.6 21항목 | — |
| R4 상태 기계·저장 키·부팅 순서·토글 모양·E2E 항목 | §3.7 | `mock.html` 동작 구현(`#theme`), 스크린샷 2장이 `--color-scheme` 에뮬레이션으로 auto→light/dark 전환을 보여 줌 |
| R5 번들 기준선·목표 | §3.8 | `bundle.md` |
| R5 폰트 후보별 실제 woff2 크기(서브셋 포함) | §3.4, `fonts.md` | 12개 파일 바이트 + 다이나믹 6종 청크 합산 |
| R5 제외한 의존성 | §3.8 "+0" | lucide-react·@fontsource 등 미채택 |
| R7 라이선스 출처 URL·크기·가독성·다크 가중치·결정·fallback·서브셋 방법 | §3.4 | `fonts.md` §D 원문 인용 |
| 목업 1개 ≤200 KB, 외부 요청 0, 스크린샷 2장 ≤150 KB | `evidence/ds/` | `mock.html` 31,539 B, `http` 문자열 0건, PNG 90,925 / 90,625 B [측정] |

### (b) 코드베이스 대조 (구현 때 바뀌어야 하는 곳, 파일·줄)

| 파일 | 줄 | 현재 [코드] | 변경 |
|---|---|---|---|
| `src/index.css` | 3-10 | 토큰 값(푸른 회색·accent·warn·radius 6/10/14·shadow 3) | §3.1 값, `--on-fill` 추가, accent·warn·shadow 삭제, radius 0/2/2 |
| | 19-27 | `@media dark :root` | `:root:not([data-theme=light])` 로 감싸고 `:root[data-theme=dark]` 블록 복제(변수 2벌) |
| | 35 | `color-scheme: light dark` | 테마별 `color-scheme` 단일값(§3.7) |
| | 44-48 | 링크 accent, 포커스 accent, selection | §3.1.1 |
| | 51-72 | topnav backdrop·브랜드 그라데이션·`radius 999` | surface + 1px 선, ■ 마크, 활성 밑줄 |
| | 81-100 | 버튼(radius 8, box-shadow, primary accent) | §3.3 상태표 |
| | 103-114 | 입력(radius 8, accent 포커스 링) | §3.3 |
| | 117 | table radius·shadow | 반경 0, 그림자 삭제 |
| | 123 | `.card` radius-lg·shadow | 그림자 삭제 |
| | 128-133 | `.c-*`(lightgreen 하드코딩 `#8fd66a`, yellow, misplaced 주황) | §3.1.2 (yellow 삭제, misplaced danger dashed) |
| | 136-149 | keyframes `pop`(오버슈트)·`pulse-ring`·`spring-in` | `pop` 은 .96→1 로, 나머지 삭제 |
| | 152-154 | `.route-loading` 원형 spinner | 사각 점 3개 |
| | 156-170 | 토스트 radius 12·shadow-pop·backdrop·accent 글자 | §3.3 |
| `src/features/editor/editor.css` | 10, 20, 47, 55, 71, 76, 79, 81, 93, 100, 121, 135, 139, 145, 170, 184, 186 | accent 17곳 | `--text` / 8% 틴트 |
| | 17, 64, 92, 129, 145, 165, 198, 206 | radius-lg·999·5px | 2px / 0 |
| | 33-38 | 확대 도구 알약 backdrop·shadow-lift | 1px 테두리 직사각 |
| | 62-63 | heat 24%/75% | 30%/100%, `--card-border` 기본 `--border-strong` |
| | 64, 78, 81, 165, 198 | shadow 5곳 | 삭제 |
| | 66-67, 70 | `--ease-spring`, `spring-in` | ease-out, scale .96 |
| | 104 | 불릿 `border-radius: 50%` | 사각 .3em |
| | 106-108 | 형광펜 분홍·노랑·하늘 | 초록·빨강·밑줄(§3.1.4) |
| | 179-181 | 툴바 CSS 글리프 | Lucide 아이콘(TSX) |
| `src/features/editor/treelist.css` | 7, 11, 19, 28, 43-47, 56-57, 75-77 | accent·5색조 아바타·hover shadow-lift+translateY | `--text`, 단색 아바타, 테두리 색만 |
| | 22 | `spring-in` + `pulse-ring` | rise + outline 페이드 |
| | 39, 52, 61 | radius 10/8/10 | 0 / 2 / 2 |
| `src/features/flash/flash.css` | 4-6 | `--ok-soft #8fd66a`·채움 어둡게 | `color-mix(--ok 45%)`, 채움 = `--ok` + `--on-fill` 글자 |
| | 19, 45, 70, 119, 127, 130-131, 142-143 | accent 9곳 | `--text` |
| | 23-27 | 띠 4px solid | lightgreen dashed, yellow 삭제, 마크 요소 추가(TSX) |
| | 34, 38, 63, 116 | shadow 4곳 | 삭제 |
| | 42, 112, 142 | `radius 999` | 0 / 2 |
| | 43-44, 92 | `--ease-spring` | ease-out |
| | 86-94 | `flash-fill`(background-size 애니메이션) | 가상요소 `scaleX` |
| | 99 | `pulse-ring` | 삭제(allRated 는 primary 버튼 테두리 2px 로) |
| | 121-128 | 미니맵 fill(muted 22%)·yellow·lit accent | §3.1.2 미니맵 열 |
| | 179 | `.flash-nav` backdrop | surface + 1px |
| `src/features/dnd/dnd.css` | 8-15 | select 999·그라데이션 셰브론·shadow | `appearance:auto`, 2px, 테두리 |
| | 21, 38, 43, 48, 51, 56, 72, 75, 119, 145, 168 | shadow 11곳 | 삭제 / outline |
| | 27, 39, 51, 56, 65-75, 100 | accent | `--text` |
| | 61-62, 67, 81, 95, 107 | `pop` spring·`pulse-ring` | §3.6 #9·#10 |
| | 114-121 | 고스트 `--tilt` 회전·shadow-pop | scale 1.02 + outline |
| | 105-108 | `.dnd-score.perfect` 999·pulse | 카드 + ✓ |
| `src/features/tree-header.css` | 3-14 | 캡슐 세그먼트·shadow·accent | 직사각 세그먼트, 선택 반전 |
| `index.html` | 7-8 | theme-color meta 2개(media) | 1개 + 부팅 스크립트(§3.7) |
| `vite.config.ts` | manifest | `theme_color #3b6cf0`, `background_color #f4f5f7` | `#f4f4f4` 둘 다 |
| `src/App.tsx` | 29-33 | 글자 링크 | 아이콘+글자, 테마 토글, 로그인 아이콘(AA) |
| `src/features/editor/EditorPage.tsx` | 529-540, 608-612, 649-660 | 유니코드 글리프 −/+/⤢/⊞/?, 툴바 글리프 | Lucide `Icon` |
| `src/features/editor/TreeListPage.tsx` | 11-13, 69, 73, 132-135 | 자체 SVG 3개·⤓·⋯ | Lucide 통일(기존 viewBox 16 SVG 교체) |
| `src/features/flash/FlashCard.tsx` | 94, 125-126, 136 | ▾ ✓ ✕ 글자 | SVG 아이콘, 마크 요소 |
| `src/features/flash/FlashPage.tsx` | 77, 111-114 | "알음 N · 모름 M", "다음 개념 →" | ✓N ✕M, 아이콘+"다음" |
| `src/features/dnd/kit.tsx` | 28-29, 116 | "범위" 글자, "— 완벽해요!" | crosshair 아이콘, ✓ 마크 |
| `src/features/dnd/useDragDrop.ts` | `--tilt` 계산 | 기울기 | 삭제(성능·장식) |
| `src/core/srs/index.ts` | 66 | `NodeColor` 에 `'yellow'` | 타입에서 제거 [제안 — core 소유자 확인] |
| 신규 | `src/ui/icons.tsx`, `src/ui/theme.ts`, `src/ui/Tooltip.css` | — | §3.5·§3.7 |

### (c) 직접 측정·계산 결과

| 측정 | 값 | 방법·파일 |
|---|---|---|
| 대비 위반 | **0건** (글자 68쌍, 비텍스트 16쌍, 전수 30칸) | `node contrast.mjs` → `contrast.md` |
| 최저 대비 | 4.57(라이트 초록 글자/연두 틴트), 4.72(다크 빨강 글자/빨강 틴트), 비텍스트 3.14(라이트 입력 테두리/bg) | 동상 |
| 1차 실패 | 5건(틴트 12% 에서 4.33·4.34·4.49, 포커스 링 모델링 오류 2) → 틴트 8%·링 오프셋 모델로 수정 | 동상 |
| 색각 ΔE (Machado 2009 심도 1.0) | 라이트 초록↔빨강 P 19 / D 18; **다크 초록↔빨강 P 32 / D 8**; 다크 연두↔빨강 P 11 | `contrast.md` 마지막 절 |
| 폰트 바이트 | 완전본·서브셋 12개 파일 + 다이나믹 6종(청크 92~188개 전부 fetch) | `fonts.md` §A·§B |
| 한 화면 폰트 | Noto 가변 183 KB / Pretendard 254 KB / Wanted 292 KB / Plex 315 KB (고유 197자 샘플) | `fonts.md` §B |
| 아이콘 | 65개 원문 28,356 B, path-only 22,889 B, 채택 52개 ≈ 18.3 KB | `icons.md` |
| 번들 기준선 | JS 450,448 B, CSS 49,623 B, precache 36/489.88 KiB, 첫 화면 ≈ 108 KB gzip | `bundle.md` |
| 목업 | `mock.html` 31,539 B, 외부 URL 0, 스크린샷 1200×900 full-page 90,925 / 90,625 B | Playwright(Chromium headless shell 1234, `colorScheme` 에뮬레이션) |
| 라벨 누락 | 컨트롤 41, 아이콘 전용 7, `aria-label` 누락 **0**, 툴팁 6 | Playwright `labels.mjs`(scratch) |
| 코드 무변경 | `npm run typecheck` 0, `npm run lint` 0, `npm run build` 0; `git status` 에 `src/**` 변경 없음 | §5(c) 실행 시점 2026-11-08 |

### (d) 스스로 찾은 약점과 보완

1. **다크 모드 적록 색각에서 초록↔빨강이 같은 색(ΔE 8)**. 보완: 마크 ✓✓/✓/✕ 와 띠 패턴을 필수로 두었다(§3.1.2). 남은 위험: 마크는 작다(16px). 구현 뒤 실제 스크린샷을 색각 변환해 재확인해야 한다. [측정]
2. **카드 가장자리가 약하다.** `--surface #fff` 와 `--bg #f4f4f4` 의 대비는 1.07:1, `--border` 는 1.5:1 이라 그림자를 없앤 뒤 카드 윤곽이 밝은 환경에서 흐릿할 수 있다. 조작 가능한 카드(목록·노드·D&D)는 `--border-strong`(3.45:1) 을 쓰도록 상태표에 넣었다. 정지 카드(`.card`)는 그대로다. [측정][제안]
3. **좌표 트랜지션 예외.** 에디터 재배치는 `left/top` 애니메이션이라 "transform/opacity 만" 규칙의 예외다(§3.6). `translate` 로 옮기는 일은 GraphView 측정 코드와 얽혀 L 공수. [코드]
4. **형광펜 색 변경은 저장 데이터에 닿는다.** 노트 문자열의 `hl-p/y/b` 클래스 이행이 필요하고 사용자가 의도한 "분홍·노랑·하늘" 구분이 "초록·빨강·밑줄"로 바뀐다. §6 질문. [가정 — 저장 포맷 미확인]
5. **시스템 폰트는 OS 마다 다르다.** Windows Malgun Gothic 은 비례 숫자라 `tabular-nums` 가 듣지 않을 수 있어 `min-width: Nch` 보완을 넣었지만, 글꼴 인상(자폭·굵기)이 OS 마다 달라 "가독성 좋은 폰트"를 앱이 보장하지는 못한다. 이것이 측정값(≥183 KB)과 맞바꾼 비용이다. [가정]
6. **폰트 측정의 한계.** Google Fonts 청크는 데스크톱 Chrome UA 로 받았고(모바일도 같은 woff2 분할), "한 화면" 샘플은 내가 지은 197자다. 실제 사용자 트리(법률 용어)는 더 많은 청크를 건드릴 가능성이 크다(= 웹폰트 비용이 더 커지는 방향이라 결론은 바뀌지 않는다). SUIT 글리프 수는 공식 문서에서 찾지 못했다. [측정][가정]
7. **목업은 정적이다.** 호버·눌림·포커스는 클래스로 흉내 냈고 실제 앱의 레이아웃(에디터 캔버스·하단 시트)은 LM 범위라 넣지 않았다. 스크린샷은 Windows 렌더링(Malgun Gothic)이며 macOS/Android 모양은 확인하지 못했다.
8. **`--accent` 별칭 이행.** `var(--accent)` 참조가 CSS 에 50곳 이상이라 한 번에 지우면 누락이 생긴다. 이행기에 `--accent: var(--text)` 별칭을 두고 파일별로 지운 뒤 별칭을 삭제하는 2단계가 안전하다. [제안]
9. **아이콘 gzip 추정은 미측정.** 18.3 KB 비압축은 측정값이지만 "≈ 6 KB gzip" 은 추정이다. 구현 뒤 `bundle.md` 를 갱신해야 한다. [가정]
10. **스크린샷 환경.** 프로젝트 Playwright 1.64.1 이 요구하는 Chromium 1248 이 없어 설치된 1234 로 찍었다(브라우저 추가 다운로드를 피하려고). 렌더링 차이는 없다고 본다. [가정]

## 6. 미결·사용자 질문

1. 형광펜을 분홍·노랑·하늘 → **초록 바탕·빨강 바탕·밑줄** 로 바꾸는 것(A6 적용)에 동의하는가? 기존 노트의 형광펜은 이행 매핑(분홍→빨강, 노랑→초록, 하늘→밑줄)으로 자동 변환된다.
2. 웹폰트 없이 **시스템 폰트**로 가는 결정(최소 웹폰트 비용 183 KB = 첫 화면의 1.7배)에 동의하는가? 동의하지 않으면 SUIT(339 KB, 파일 2개) 를 2순위로 제안한다.
3. 숙련도 "초록/연두" 두 단계를 유지할지, 색각 단순화를 위해 **초록 하나**(✓ 마크만)로 합칠지? 현행 SRS(`FADE` 임계) 는 두 단계를 낸다 [코드].
4. 파랑 `--accent` 완전 폐기 — 링크가 "밑줄 검정 글자"가 되는 것에 동의하는가?
5. 로그인 버튼의 Google·Kakao 브랜드 색(파랑·노랑)은 각사 규정상 피하기 어렵다. A6 예외로 허용할지(AA 와 공동 질문).
6. 테마 토글을 상단 바 오른쪽에 두는 것(LM 확정 사항)에 이견이 없는지.

## 7. 출처 (확인일 2026-11-08)

1. `docs/research/R5_liquid_glass.md` 2단계(NN/g "Motion for motion's sake is not usability", https://www.nngroup.com/articles/liquid-glass/)·3단계(유혹적 세부 메타분석 — 2차 요약) — 장식 금지 근거로 재사용.
2. `docs/plans/orchestration_modes.md` §0 — 에디터는 오답 붉은 농도만, 숙련도 색은 플래시만(사용자 결정 2026-11-01).
3. Machado, Oliveira & Fernandes, "A Physiologically-based Model for Simulation of Color Vision Deficiency", IEEE TVCG 2009. 심도 1.0 행렬 값은 저자 공개 표에서 가져옴(https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html). WCAG 2.2 1.4.3/1.4.11: https://www.w3.org/TR/WCAG22/
4. Pretendard LICENSE: https://github.com/orioncactus/pretendard/blob/main/LICENSE ; 배포 파일: https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/ ; Std README(라틴 전용): https://github.com/orioncactus/pretendard/blob/v1.3.9/packages/pretendard-std/README.md
5. SUIT LICENSE: https://github.com/sun-typeface/SUIT/blob/main/LICENSE ; README(OFL 문구): https://github.com/sun-typeface/SUIT/blob/main/README.md
6. Wanted Sans OFL.txt: https://github.com/wanteddev/wanted-sans/blob/v1.0.3/OFL.txt ; README 라이선스 절·Std README(라틴 전용): https://github.com/wanteddev/wanted-sans/tree/main/packages
7. IBM Plex LICENSE.txt: https://github.com/IBM/plex/blob/master/LICENSE.txt
8. Noto Sans CJK LICENSE: https://github.com/notofonts/noto-cjk/blob/main/Sans/LICENSE
9. Google Fonts CSS API(청크 측정): https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400..700&display=swap , `…family=IBM+Plex+Sans+KR:wght@400;700` ; SIL OFL FAQ: https://scripts.sil.org/OFL
10. Lucide LICENSE(ISC): https://github.com/lucide-icons/lucide/blob/main/LICENSE , 패키지 lucide-static 1.70.0: https://cdn.jsdelivr.net/npm/lucide-static@1.70.0/ ; Tabler MIT: https://github.com/tabler/tabler-icons/blob/main/LICENSE ; Phosphor MIT: https://github.com/phosphor-icons/core/blob/main/LICENSE
11. 사업 맥락: `../drilldown-biz/brief/decisions.md` 6~9(수익화 폐기, 자체 호스팅 Pi, LLM 채점 없음) — 클라이언트 바이트·CDN 비의존 근거.
