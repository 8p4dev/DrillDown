# 에이전트 LS — 학습 화면(플래시·복습·빈칸·백지) 재스킨 + `source` 주입 (orchestration_ui_first.md §1 U8)

작성 2026-11-08. 시작 커밋 15b037c. dev 포트 8023.

## 접근 방식
- **데이터 소스**: 새 훅 `useStudySource(source, treeId)`(`src/features/flash/study.ts`) = `source ?? dexieSource(treeId)` 를 `useMemo` 로 고정. `ephemeral` 이면 `record` 를 감싸 첫 호출 때 `toast('체험 중 — 기록은 저장되지 않아요')` 1회(04 §3.10). 세 페이지(Flash·Dnd·BlankDnd)가 이 훅 하나를 쓰고, `FlashCard` 는 `record(nodeId, ok)` 콜백을 prop 으로 받는다(`recordResult` 직접 호출 제거). `ReviewPage` 는 Dexie 직접(계약 §3.5) — `FlashCard` 에 `recordResult` 를 감싼 콜백을 넘긴다. `logEvent` 는 그대로(이벤트 로그 동일).
  - 대안: `source.ts` 에 훅을 두기 — 읽기 전용이라 불가. 세 페이지에 각각 ref 플래그 — 중복 3곳이라 기각.
- **1회성 힌트**: DS 의 `hint(id, text)` 는 아직 `Toast.tsx` 에 없다(스텁 없음). 직접 import 하면 typecheck 가 깨지므로 `import * as Toast` 뒤 선택적 호출(`(Toast as unknown as { hint?: … }).hint?.()`)로 둔다 — DS 머지 뒤 바로 동작, 머지 전에는 아무 일도 없음. coarse 포인터일 때만.
- **CSS**: `flash.css`·`dnd.css` 를 토큰 4색 규칙으로 다시 쓴다. `--accent`→`--text`, `--accent-soft`→`color-mix(--text 8%)`, 그림자 전부 삭제(떠 있는 것은 1px `--border-strong` + outline), 반경 999→0/2, `--ease-spring`→`--ease-out`, `pulse-ring`→primary 버튼 `outline 2px --text`, `backdrop-filter` 삭제, `yellow`·`#8fd66a`·`--tilt` 삭제. 애니메이션은 transform·opacity 만(미니맵 `height` 전환도 뺀다).
- **4단계 마크**(01 §3.1.2): 색이 아닌 필수 단서. `FlashCard` 에 `<Mark color>`(✓✓ `check` 2개 겹침 / ✓ / 없음 / ✕ `x`) 요소를 개념·하위 카드 우상단에 둔다. 띠는 `::before` 의 `border-top: 4px var(--band-style) var(--band)` 로 solid/dashed 를 변수로 가른다.
- **집계 ✓N ✕M**: 보이는 글자는 아이콘+숫자, 읽기용 글자 "알음 N · 모름 M" 은 시각적으로 숨긴 `.sr` 스팬으로 둔다 → `aria-label="평가 집계"` 유지 + E2E `toHaveText('알음 1 · 모름 1')` 가 그대로 통과(계약 §3.7 "텍스트 접근 이름 유지" 를 aria-label 이 아니라 숨긴 텍스트로 만족 — 아래 변경 사항).
- **D&D 결과 마크**: `kit.tsx` 에 `ResultMark({ ok })` — 카드·빈 슬롯 안 우상단 `check`/`x`, opacity 0→1(#10). 점수 만점은 `--ok` 테두리 카드 + ✓ 마크, 글자 "완벽해요" 삭제(`p[role=status][data-total]` 유지).
- 의존성 추가 없음. 아이콘은 `src/ui/icons.ts`(`I.check` `I.layers` `I.pencil`)·`icons.all.ts`(`chevronDown x arrowRight cornerDownRight rotateCcw listChecks checkCheck eye eyeOff crosshair`) + `src/ui/Icon`.

## 수정/생성 파일
- `src/features/flash/study.ts` (신규: `useStudySource`, `coarseHint`)
- `src/features/flash/flash.css` `FlashCard.tsx` `FlashPage.tsx` `Minimap.tsx` `ReviewPage.tsx`
- `src/features/dnd/dnd.css` `DndPage.tsx` `BlankDndPage.tsx` `kit.tsx` `useDragDrop.ts`
- `docs/specs/evidence/ui/ls/*.jpg` (≤8장, 각 ≤150KB)
- 이 문서
- 소유 밖 변경 없음(`Toast.tsx` 의 `hint` 는 위 선택적 호출로 우회).

## 단계
- [x] 0 plan 작성
- [x] 1 `study.ts` + 세 페이지 `useStudySource` 적용, `FlashCard` `record` prop, `ReviewPage` 콜백 — `getTreeNodes(`·`getSrsMap(`·`recordResult(` 는 ReviewPage 만 남음
- [x] 2 `flash.css` 재작성(토큰·띠 dashed·마크·결과 버튼 scaleX·`.flash-nav` surface + `bottom: var(--kb)` + 가로 모드·미니맵 4단계·복습 막대)
- [x] 3 `FlashCard.tsx`: 마크 요소, 알음/모름 아이콘+글자, 결과 버튼 아이콘, 더 들어가기 아이콘+숫자, 하위 N개 → 숫자+chevron(숨긴 글자), `title`→`data-tip`
- [x] 4 `FlashPage.tsx`: 집계 ✓N ✕M(+숨긴 글자), 다음/요약 아이콘(aria 유지), 요약 버튼 아이콘, 빈 트리 한 줄 + `[편집 ›]`, allRated → `.ready`, 힌트
- [x] 5 `Minimap.tsx`: rect rx 0, chevron 아이콘
- [x] 6 `ReviewPage.tsx`: 진행 막대, 행 버튼 규격(`layers` + 글자), 빈 상태 `check` + 한 줄 + `[내 트리 ›]`, 다음 복습 아이콘
- [x] 7 `dnd.css` 재작성(select 네이티브·그림자→outline·슬롯 dashed·결과 ✓/✕·놓기 scale·dock svh·트레이 12px·`.dnd.locked .dnd-bar` `bottom: var(--kb)`·가로 모드·원본 트리 rise)
- [x] 8 `kit.tsx`: ScopeSelect crosshair, `ResultMark`, `ScoreLine` 숫자+✓, Ghost `--tilt` 제거; `useDragDrop.ts` tilt 계산 제거
- [x] 9 `DndPage.tsx`·`BlankDndPage.tsx`: 버튼 아이콘(채점·정답/내 답 보기·다시 하기), 결과 마크, 빈 범위 한 줄, 원본 트리 패널 클래스, 힌트
- [x] 10 `npm run typecheck && npm run lint && npm run check && npm run build` 통과, grep 완료 기준 0건
- [x] 11 임시 Playwright(8023, msedge): 플래시 평가·빈칸 채점·백지 채점·복습, 메모리 source 로 Dexie `srs` 행 수 변화 0 확인, 스크린샷 → `docs/specs/evidence/ui/ls/`
- [x] 12 커밋 (311273c flash · 27921c0 dnd · d13948a docs)

## 검증 방법
- 단계 1: typecheck + `grep -rn "getTreeNodes(\|getSrsMap(\|recordResult(" src/features/flash src/features/dnd` → ReviewPage 만.
- 단계 2~9: typecheck·lint 후 dev 서버 화면 확인(스크린샷).
- 단계 10: 네 명령 모두 종료 코드 0, lint 경고 0; `grep -rn "var(--accent\|--shadow\|#8fd66a\|#74bd52\|yellow\|--tilt\|ease-spring\|pulse-ring\|backdrop-filter" src/features/flash src/features/dnd` 0건.
- 단계 11: 스크립트가 트리 1개를 개요 붙여넣기로 만들고 플래시에서 알음 2·모름 1 → `li[data-node-id][data-color]`·마크 존재, 빈칸에서 카드 2개 놓고 채점 → `[data-result]` ✓/✕, 백지 채점; 메모리 source 검사는 `FlashPage` 를 직접 띄울 라우트가 없어 **단위 수준**으로: dev 서버에서 `source` prop 을 넘기는 별도 진입점이 없으므로 `dexieSource` 가 아닌 메모리 객체를 `useStudySource` 가 그대로 쓰는지 코드로 보장 + IndexedDB `srs` 행 수를 체험 토스트 경로에서 세지 못하면 plan 에 기록.

## 변경 사항 (plan 과 다르게 한 것)
- 집계 "알음 N 모름 M" 은 `aria-label` 이 아니라 시각적으로 숨긴 텍스트(`.sr`)로 유지했다. 이유: E2E 가 `toHaveText('알음 1 · 모름 1')` 로 **텍스트**를 검사하므로 aria-label 만으로는 깨진다. 접근 이름(`평가 집계`)·읽기 텍스트 모두 보존.
- ~~`hint()` 는 직접 import 대신 선택적 호출~~ → DS 머지(main 09b4cbc) 뒤 `import { hint } from '../Toast'` 직접 호출로 교체, 화면 아이콘(`layers`/`squareDashed`) 전달. 숨긴 글자는 DS `.sr-only` 로 교체(지역 `.sr` 삭제).
- `ScoreLine` 글자 "정답" 도 함께 지우고 `aria-label="정답 n / m"` 로 옮겼다(01 §3.5 인벤토리 "숫자 + ✓ 마크, 글자 삭제").
- 미니맵 접기/펼치기의 `transition: height` 는 뺐다(transform·opacity 규칙). `interpolate-size` 도 함께 제거.
- `source` 를 메모리 구현으로 넘긴 렌더의 IndexedDB 검사: 앱 라우트로는 메모리 소스를 넘길 입구가 없어(SH 의 SharedPage 가 아직 스텁) Playwright 로 직접 재현하지 못했다. 대신 `useStudySource` 가 `source` 가 있으면 Dexie 를 전혀 import 경로에 두지 않음을 코드로 보장하고, Dexie 경로(소스 없음)에서 평가 → `srs` 행 수 증가를 스크립트로 확인했다(아래 결과).

## 결과 (2026-11-08)
- `npm run typecheck && npm run lint && npm run check && npm run build` 전부 통과(lint 경고 0, precache 46개 504.50 KiB).
- 완료 기준 grep: `src/features/flash`·`dnd` 에서 `var(--accent`·`--shadow`·`#8fd66a`·`#74bd52`·`yellow`·`--tilt`·`ease-spring`·`pulse-ring`·`backdrop-filter` 0건. `getTreeNodes(`·`getSrsMap(`·`recordResult(` 는 `ReviewPage.tsx` 3곳만.
- 임시 Playwright(dev 8023, Edge, reducedMotion) 결과: 시드 10노드 → 플래시 알음 2·모름 1 → `data-color` lightgreen(자식 미학습 부모 집계)/red, 마크 ✓/✕ 존재, lightgreen 띠 `dashed`, `다음 개념 →` aria·미니맵 `aria-current`·`.ready` 확인, Dexie `srs` 행 0 → 3; 요약 → 처음부터 다시 → 집계 0. 빈칸: 범위 select + crosshair, 카드 2개 놓고 채점 → `data-total=6`, 정답 `.dnd-mark` ✓·오답 ✕, 오답 `animation-name: shake`, 정답 보기·다시 하기 글자 유지. 백지: 채점 → `data-total=9`, 원본 트리 패널(`.dnd-original`). 복습: 대상 트리 1개, 링크 `layers` 아이콘, 세션 진행 막대. 빈 범위 안내 16자. 로드된 스타일시트의 `.flash/.dnd/.mm-node` 규칙에서 `--accent`·`box-shadow` 0건.
- 집계 `textContent` 는 `"알음 2 ·  모름 1"`(공백 2개) — ✕ 아이콘 SVG 의 자식 사이 공백이 텍스트에 섞인다. Playwright `toHaveText` 는 공백을 정규화하므로 E2E 영향 없음. 아이콘 테이블(DS 소유)이 공백 없이 재생성되면 사라진다.
- 스크린샷 8장(`docs/specs/evidence/ui/ls/`, 각 ≤63KB): `flash-390-light` `flash-1440-dark` `dnd-390-dark` `dnd-1440-light` `blank-1440-light` `blank-390-dark` `review-390-light` `review-1440-dark`. 나머지 조합(라이트/다크 × 390/1440, 요약·복습 세션·빈 범위)은 scratch 에서 눈으로 확인.
- 관찰: 채점 뒤 테마를 바꾸면 `.dnd.locked [data-result]` 의 색 전환(기존 stagger `--d` 지연)이 카드마다 순차로 걸려 ≤600ms 동안 새 테마 글자 + 옛 테마 배경이 보인다(DS #2 "테마 전환 때 색 전환 없음"). 기존 동작이며 테마 토글은 DS 소유라 그대로 둠 — QA 가 문제 삼으면 `:root[data-theme] .dnd.locked [data-result] { transition: none }` 류로 처리 가능.

## DS·LM 머지 후속 (2026-11-08, main 09b4cbc 머지)
- `git merge main` 충돌 없음. `study.ts` 가 `hint(id, text, icon)` 을 직접 import, `.sr` → DS `.sr-only`, DS 버튼이 `inline-flex` 라 지역 버튼 flex 규칙 삭제. typecheck·lint·check·build 통과(precache 45개 519.97 KiB).
- 임시 Playwright 재실행: 기존 검사 전부 통과 + 터치 컨텍스트(`isMobile`·`hasTouch`)에서 플래시 "카드 탭 = 펼치기"·빈칸 "카드 탭 → 빈칸 탭" 힌트가 첫 진입 때 1회, 새로고침 뒤 없음 확인. 스크린샷 8장을 DS 머지 뒤 모양으로 갱신.
- 주의(스크립트에서 본 것): 힌트는 동시 1개 큐라 에디터 힌트(LM)를 [확인] 하지 않고 플래시로 오면 플래시 힌트가 그 뒤에 대기한다 — 02 §3.5 규칙대로의 동작.

## QA 결함 수정 (2026-11-08, `06_ui_qa.md` main e5e9456 머지 후)
| # | 수정 | 재확인(임시 Playwright) |
|---|---|---|
| 1 | `.minimap svg` → `.minimap > svg`(접힘·펼침 규칙 포함) — 토글 `Icon` 이 더는 폭 100% 가 아님 | 390: 토글 svg 16×16, 접힌 미니맵 66px |
| 4 | 원인은 `.dnd-card span { -webkit-box; overflow: hidden }` 이 `.dnd-mark` 스팬에도 걸려 0×0 으로 접힌 것(기준 요소는 이미 `position: relative`). 제목 스팬만 `> span:first-child` 로 좁히고 `.dnd-mark` 에 16px 크기·`svg { display: block }` | 1440: 정답 카드 ✓·오답 카드 ✕·빈 슬롯 ✕ 모두 16×16, 기준 요소 rect 안쪽, 색 ok/danger; 백지 캔버스 카드 ✓ 동일 |
| 11 | `@media (prefers-reduced-motion: reduce) { [data-result] { --d: 0s } }` | reduce 컨텍스트: 채점 80ms 뒤 마크 8개 전부 `animation-delay 0s`·opacity 1, shake delay 0s |
| 19 | `.flash-dive::after { inset: -10px -8px }` | 표적 66×45 |
| 21 | `FlashCard`·빈칸·백지 `Quiz` 가 `record` 콜백 대신 `source: StudySource` 를 받고 `source.ephemeral` 이면 `logEvent` 생략. `ReviewPage` 는 `dexieSource(treeId)` 를 넘김 | `/t/3fK9pQ2xT7m?m=flash` 평가 2회 + `?m=dnd` 채점 → Dexie `events` 0→0, `srs` 0→0, 체험 토스트 1회, 메모리 색 반영 |
- typecheck(server 포함)·lint·check·build 통과(precache 60개 570.86 KiB). 스크린샷 8장 갱신.
- 관찰: 터치 컨텍스트에서 AA 의 상단 바 힌트(`hint:login`)가 큐 앞에 떠 있으면 플래시 힌트(`hint:flash` 저장됨)는 [확인] 뒤에 나온다 — 동시 1개 규칙대로, 결함 아님.

## 다른 워커에게 / 미해결
- DS: 아이콘 문자열의 자식 사이 공백(위) 제거를 권함(집계 textContent 공백 2개).
- SH: `SharedPage` 의 ephemeral 소스에서 첫 `record` 때 토스트 1회(마운트당), `logEvent` 는 이제 생략된다(QA #21).
- ~~메모리 소스 렌더의 IndexedDB 무변경 검사~~ → QA #21 수정 때 `/t/<slug>` 에서 `events`·`srs` 불변 확인(위 표).
