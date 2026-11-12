# 오케스트레이션: 편집기·공개 트리 개편 후속 — 남은 위험 4건 (2026-11-12)

요구: "남은 위험 동일한 방식으로 해결해" — `orchestration_editor_share.md` §8 의 남은 위험 ①~④ 를 같은 절차(plan → 워커 → 머지 → 검증 → 푸시)로 해소한다.
기준 커밋: `main` `ce4d5d6` (선행 작업 없음 — 공유 계약 변경 없음). 경로는 `C:\drilldown\app\` 기준.

## 1. 요구사항별 구체화와 완료 기준

완료 기준 공통: typecheck·lint(경고 0)·check·build 통과, E2E 셀렉터(앞 plan 계약 C4) 유지, 머지 후 `npm run e2e` 통과(오케스트레이터).

### 1.1 WE 편집기
| id | 위험 | 구체화 | 완료 기준 |
|---|---|---|---|
| F1 | ① 카드 제목을 입력하는 중(Enter 로 형제를 추가하면 보이는 집합이 바뀜)에도 자동 맞춤이 돌아 배율·스크롤이 튄다 | `EditorPage.onSettled`: 편집 중(`editRef.current !== null` 또는 `noteEditId !== null` 또는 패널 실시간 편집 `liveBase.current`)이면 맞춤을 **보류**(`fitLater` ref = true)하고 아무것도 하지 않는다. 편집이 끝나면(`stopEdit`·내용 편집 blur·`endLive` 뒤, 즉 `editId`·`noteEditId` 가 모두 null 이 된 다음 렌더) 보류된 맞춤을 1회 실행(`fitZoom()`). 첫 진입 복원(`restorePending`)과 `centerAfter` 는 지금처럼. | 카드에서 Enter 로 형제를 연달아 3개 추가하는 동안 '배율' 값과 `scrollTop` 이 변하지 않는다. Esc 로 편집을 끝내면 맞춤이 1회 돈다(전체가 보임). 접기·펼치기 등 편집 중이 아닌 때의 자동 맞춤은 그대로. extras E2E(83%→접기→배율 변화) 그대로 통과 |
| F2 | ② 모바일(≤760px)에서 패널 아래 '개요 붙여넣기 · 내보내기' 글자 버튼이 하단 토스트(되돌리기 10초) 자리와 겹친다 | 가장 단순한 쪽으로: 글자 버튼을 패널 **위쪽**(경로 줄 바로 아래, 제목 입력 위)으로 옮기거나, ≤760px 에서 `.side` 에 토스트 높이만큼 아래 여백(`padding-bottom: calc(var(--tap) + 1.5rem + var(--safe-b))` 수준)을 준다. 둘 중 하나만. 아이콘 버튼 '개요 붙여넣기 열기' 는 그대로 | 390px 에서 노드를 삭제해 되돌리기 토스트가 떠 있는 동안 글자 버튼의 bounding box 가 `.toasts` 와 겹치지 않는다(스크래치 Playwright 로 좌표 비교). 1440px 레이아웃은 변화 없거나 자연스러움 |

### 1.2 WY 서버
| id | 위험 | 구체화 | 완료 기준 |
|---|---|---|---|
| F4 | ④ 별점을 줄 때마다 공개 트리 목록 캐시를 전부 비운다 | `share.ts` `rateTree`: 트리가 `visibility === 'public'` 일 때만 `clearGalleryCache()`. unlisted 트리는 목록에 없으므로 비울 이유가 없다. `sync.check.ts` 에 단언: unlisted 트리 평가 뒤 캐시가 남아 있다(같은 `now` 로 `gallery()` 재조회 시 같은 객체/값), public 트리 평가 뒤는 비워진다 | 단언 통과. 기존 별점 단언 전부 그대로 |

### 1.3 WH 셸·빌드
| id | 위험 | 구체화 | 완료 기준 |
|---|---|---|---|
| F3 | ③ 빌드 precache 가 예산 상한 640 KiB 에 닿았다(지금 640.00) | 네트워크 없이는 쓸 수 없는 화면은 precache 에서 뺀다: `vite.config.ts` `workbox.globIgnores` 에 `**/SharedPage-*.js`, `**/GalleryPage-*.js`, `**/share-*.css` 추가(공유 보기 `/t/<slug>` 는 서버가 서빙하고 `navigateFallbackDenylist` 에 이미 있음; 공개 트리 목록은 `/api/gallery` 없이는 빈 화면). 그 밖의 청크는 건드리지 않는다. `vite.config.ts` 의 주석(01 §3.8 줄)에 이유 한 줄. `docs/CODEBASE.md` §11 또는 §13 에 "precache 밖: 관리자·공유 보기·공개 트리 목록·폰트" 한 줄 갱신(해당 문장이 있으면 고치고 없으면 §13 배포 절에 추가) | `npm run build` 의 precache 가 **≤ 615 KiB**. 오프라인 상태에서 내 트리·편집·학습 화면은 열리고(`npm run e2e` 의 PWA 흐름이 있으면 그대로), 공유 보기·공개 트리 목록은 온라인에서만 열린다(원래 그렇다) |

## 2. 가정과 미결
- A1 F2 는 WE 가 두 방법 중 더 단순한 쪽을 고른다(plan 에 기록).
- A2 F3 로 precache 밖에 두는 청크는 온라인 전용 화면뿐이다. 오프라인 첫 진입 때 그 화면을 열면 lazy 청크 404 → 앱의 ErrorBoundary('새로 고침')가 받는다. 기존 관리자 청크와 같은 동작.
- A3 F1 의 "편집 중"에 검색창(`searching`)은 포함하지 않는다(검색은 집합을 바꾸지 않고, 검색으로 이동은 `centerAfter` 가 처리).
- 미결 없음.

## 3. 작업 분할 (배타 소유)
| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 |
|---|---|---|---|---|
| WE 편집기 | F1·F2 | `src/features/editor/EditorPage.tsx`, `editor.css`, `src/features/editor/graph/**` | 나머지 | 없음 |
| WY 서버 | F4 | `server/**` | `src/core/api.ts` | 없음 |
| WH 빌드 | F3 | `vite.config.ts`, `docs/CODEBASE.md` §11·§13 | 나머지 | 없음 |
| 오케스트레이터 | 머지, E2E, 이 문서 §6, 푸시 | `docs/plans/**`, `e2e/**` | | |

한 웨이브(3개 병렬), 파일 겹침 없음. 각 에이전트 plan: `docs/plans/agent_WE_followup.md`, `agent_WY_followup.md`, `agent_WH_followup.md`.

## 4. 공유 계약
앞 plan(`orchestration_editor_share.md` §4) 의 C1~C8 그대로. 이번에 바뀌는 계약 없음. 특히 C4 셀렉터와 C6 클래스 이름 유지.

## 5. 공통 규칙 (워커 spec 에 포함)
앞 plan §5 와 같다. 포트: WE 5362/4362, WY 5364/4364, WH 5361/4361. `npm run e2e` 금지. 커밋 트레일러 `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## 6. 머지 순서와 통합 검증
1. WY → 2. WH → 3. WE. 각 머지 뒤 typecheck·lint·check·build. 마지막에 `npm run e2e` 1회 + 스크래치 Playwright: Enter 연속 추가 중 배율·스크롤 불변 → Esc 뒤 맞춤(F1), 390 토스트와 버튼 좌표(F2), precache 수치(F3), unlisted 평가 뒤 캐시 유지(F4 는 check 단언). 끝나면 `main` 을 `origin`(github.com/8p4dev/DrillDown) 에 푸시하고 프리뷰 서버(5173, `.preview-data`) 를 새 빌드로 재기동.

## 7. 진행 기록
- 2026-11-12 plan 커밋 `aa96323`. Run `run_7cbe4c3df568`(앞 Run 이어서). 디스패치(새 워크트리, base main, claude): WY `ctx_7a98a3a0a619` agent-WY-followup · WH `ctx_00826f12eea6` agent-WH-followup · WE `ctx_6db7112a8240` agent-WE-followup.
- 프리뷰 서버(5173, `.preview-data`) 를 `ce4d5d6` 빌드로 재기동(같은 Orca 터미널). 후속 머지 뒤 한 번 더 재기동 예정.
- 머지: WY `399c8ab` → `d285c40`, WH `881ed72` → `ce219d8`, WE `a67a03c` → `6d10600`. 각각 typecheck·lint 0·check·build 통과. 최종 precache 68 entries 611.58 KiB(640 → 611).
- `npm run e2e` 22/22 통과(28.4s).
- 통합 확인(스크래치 Playwright msedge, 서버 4365): F1 Enter 3회 연속 추가 중 배율·scrollTop 불변(30%), Esc 뒤 맞춤(테스트 트리가 배율 하한 30% 라 값 변화 없음 — WE 실측 43→33% 로 확인됨) / F2 390 삭제 토스트 중 개요 버튼 725~769px vs 토스트 782~825px 비겹침 / F3 공개 트리 목록 청크가 온라인에서 정상 로드, `dist/sw.js` 에 SharedPage·GalleryPage 0건 / F4 는 sync.check 단언.
- 계획 대비 변경: WH 가 `**/share-*.css` 대신 `**/share-????????.css`(해시 8자) 로 좁힘 — 오프라인 화면이 쓰는 `share-list-*.css` 를 precache 에 남기기 위해. WE 는 F2 를 (b) `.side` 아래 여백 3rem 으로.

## 8. 결과 요약
- 완료: 남은 위험 ①~④ 전부 해소. 미완료 없음.
- 남은 것(기능 아님): 꽉 찬 트리에서 편집 중 새 카드가 캔버스 밖에 생기면 카드의 기존 '보이게 스크롤'만 돈다(맞춤은 Esc 뒤). 오프라인 첫 진입에서 공유 보기·공개 트리 목록을 열면 ErrorBoundary '새로 고침'(관리자 화면과 같음). precache 여유 28 KiB.
