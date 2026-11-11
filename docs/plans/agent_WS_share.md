# WS 공개 트리 클라이언트 — 보기 탭 그래프 · 명칭 · 카드 요소 · 별점 UI (2026-11-11)

오케스트레이션 plan: `orchestration_editor_share.md` §1.3 (R7·R10b·R11·R11b). base = main `5222a15`. 포트 vite 5363 / 서버 4363.

## 접근 방식

- **R7 보기 탭 그래프**: 편집기 부품을 그대로 import (계약 C6). `GraphView` 에 `renderNode` 로 새 읽기 전용 카드 `ShareCard` 를 넣는다. `ShareCard` 는 `NodeRow` 의 DOM 구조(`.node-row[data-node-id]` · `.node-title` · `.node-note` · `.badge`) 만 복사하고 편집 관련(입력칸·너비 손잡이·`+ 내용`·오답 배지·툴팁) 은 뺀다. 너비 px 표는 NodeRow 의 `WIDTH_PX`/`WIDTH_PX_NARROW` 와 같은 값을 상수로 둔다(`editor/**` 수정 금지라 export 를 못 받는다). 접기 = `Set<ID>` 로컬 상태 → `open` 콜백, 선택 = 로컬 상태. 자식 유무·숨은 수는 EditorPage 의 `countTree` 와 같은 Map 계산(작은 함수 하나, `useMemo`). 확대·축소는 `useZoom(outlineRef)` (계약 C2) — 버튼·휠(훅 내부)·핀치(`onZoomAt={zoomTo}`)·`onSettled` 마다 `fit(선택 id)`. 세로 보기 토글은 `dd:editor-dir` 를 초기값으로 읽기만 한다(A8).
  - 캔버스 높이·`.zoom-tools button` 모양은 editor.css 가 `.editor` 아래로 묶어 두어서 `share.css` 에 `.shared .canvas`·`.shared .zoom-tools button` 으로 덮어쓴다. 모바일(≤760) 높이는 하단 복제 바(60px) 를 뺀다.
  - 검토한 대안: `NodeRow` 를 그대로 쓰고 콜백을 no-op 으로 → 손잡이·`+ 내용`·툴팁이 남아 "읽기 전용" 이 아니고 memo 비교자 때문에 props 도 다 채워야 한다. 기각.
- **R10b 명칭**: 글자만 바꾼다. 파일·라우트·클래스 유지(C5).
- **R11 카드 요소**: `li.card` 안에 제목 링크(stretched, `::after` 로 카드 전체 덮기) + 메타 줄들. 미리보기 버튼은 링크 밖 `position: relative; z-index: 1`. 미리보기 시트는 `GalleryPage` 안 로컬 상태(`preview: { item, text|null, fail }`) 하나 — 열 때 `GET /api/t/<slug>` 1회, `serializeOutline(nodesToOutline(nodes, root.id, false))` 앞 60줄.
- **R11b 별점**: `SharedPage` 헤더 `.share-owner` 바로 아래 `.share-rating` 줄. 상태는 `t.rating` 을 로컬 `rating` 상태로 복사해 PUT 응답으로 갱신. 버튼 5개는 항상 렌더(비로그인은 클릭 시 토스트+로그인 링크, 로그인 + canRate=false 는 disabled + 툴팁).

## 수정/생성 파일

- `src/features/share/SharedPage.tsx` — Branch 삭제, 그래프·별점·여기부터 학습
- `src/features/share/ShareCard.tsx` — 신규, 읽기 전용 카드
- `src/features/share/share.css` — editor.css import, `.share-tree*`·`.share-fold`·`.share-from` 삭제, 캔버스·zoom-tools·별점·카드 7요소·미리보기 시트 규칙
- `src/features/share/GalleryPage.tsx` — 명칭, 카드 7요소, 미리보기 시트
- `src/features/share/ShareSheet.tsx` — 문구 1줄
- `src/features/admin/AdminPage.tsx` — 문구 1줄
- `docs/plans/agent_WS_share.md` — 이 파일

소유 범위 밖: 없음. `GraphView` 새 prop 불필요(핀치·패닝·onSettled·dir·open 이미 있음).

## 단계별 작업

- [x] 1. `npm ci`, 베이스 typecheck·lint 통과 확인
- [x] 2. R10b 명칭 3곳 (`rg 갤러리 src` 0 — 주석 포함)
- [x] 3. `ShareCard.tsx` 신설
- [x] 4. `SharedPage.tsx` 보기 탭: GraphView + useZoom + zoom-tools + 접기/선택 + '여기부터 학습'
- [x] 5. `share.css`: editor.css import, 옛 목록 CSS 삭제, 캔버스 높이·zoom-tools 버튼·여기부터 학습 버튼
- [x] 6. R11b 별점 UI (SharedPage 헤더)
- [x] 7. R11 GalleryPage 카드 7요소 + 미리보기 시트 + CSS
- [x] 8. typecheck · lint(0) · check · build
- [x] 9. 서버(4363, AUTH_FAKE, DATA_DIR .research-data/WS) + 스크래치 Playwright(msedge) 1440·390 확인: 그래프·접기·세로 보기·여기부터 학습·카드 7요소·미리보기 시트·별점(route 로 가짜 응답)
- [x] 10. 커밋, worker_done (커밋 해시는 worker_done 보고에)

## 검증 방법

| 단계 | 확인 |
|---|---|
| 2 | `rg 갤러리 src` 결과 0 |
| 3–6 | typecheck·lint; Playwright: `/t/<slug>` 에서 `.node-row[data-node-id]` 수 = 노드 수, `.graph-edges path` 있음, 배지 클릭 → `.folded` + 카드 수 감소, 버튼 '확대'/'축소' → output '배율' 변화, `aria-label="세로 보기"` → `.graph.dir-right`, 카드 클릭 → `aria-selected` + '여기부터 학습' → URL `?m=flash&root=<id>`. 390px: 핀치는 GraphView 기존 로직(편집기와 같은 코드)이라 패닝만 touchscreen 으로 확인, 캔버스 bottom ≤ `.share-bar` top |
| 6 | `page.route('/api/t/<slug>')` 로 `rating` 을 꾸며 avg/count 표시, canRate=true 면 PUT route → 응답으로 `aria-pressed` 갱신 + 토스트; 비로그인 → 토스트 '로그인하면…' |
| 7 | `#/gallery` 카드에 제목·아바타·별점/'평가 없음'·노드·복제·time·'미리보기' 버튼. 미리보기 → dialog '미리보기' 안 `<pre>` 에 개요 |
| 8 | 네 명령 모두 종료 코드 0 |

## 변경 사항

- **접기 초기값**: 빈 Set 이 아니라 소유자가 접어 둔 노드(`collapsed`)로 시작한다. 편집 탭에서 보던 모양 그대로 보이게. 저장은 하지 않는다.
- **자동 맞춤 호출 시점**: `onSettled` 는 GraphView 의 레이아웃 이펙트 안에서 불리므로 `fit`(flushSync) 를 바로 부르면 React 경고 + 옛 rect 로 스크롤이 틀린다 → `queueMicrotask(() => fit(id))` (커밋 뒤·페인트 전). 방향 전환은 카드 집합이 같아 `onSettled` 가 안 오므로 같은 함수를 직접 부른다.
- **미리보기 내용 제외(A6)**: `nodesToOutline` 은 한 줄 note 를 `제목 :: 내용` 으로 싣는다 → `titlesOnly()` 로 note 를 벗긴 뒤 `serializeOutline`.
- **editor.css 충돌**: `.badge` 규칙(접기 배지, absolute·opacity 0)이 헤더 '읽기 전용' 배지를 숨겼다 → `share.css` `.share-head .share-title-row .badge` 로 index.css 값 복원. 그 밖의 editor.css 전역 선택자(`mark`·`.ln.b` 등)는 카드 내용용이라 충돌 없음.
- **zoom-tools 버튼 모양**: editor.css 가 `.editor .zoom-tools button` 으로 묶어 두어 `.shared .zoom-tools button` 으로 복사(coarse 44px, `.zoom-step` 숨김 포함). 캔버스 높이는 `.shared[data-mode='view']` 를 flex 세로 상자로 만들어 헤더를 뺀 나머지를 `.canvas` 가 쓴다(헤더가 접히는 폭마다 계산식이 달라지지 않게).
- **확인 중 발견(선행 동작, 미수정)**: Edge 모바일 에뮬레이션(390px, isMobile)에서 공유 보기 헤더가 있으면 레이아웃 뷰포트가 ~2% 커진다(innerWidth 398). 플래시 탭(`?m=flash`, 손대지 않은 화면)도 400 → 이 작업 이전부터의 동작. 어떤 요소도 390 을 넘지 않고(min-content 372) 가로 스크롤도 뷰포트 안이라 실기기 확인 항목으로 보고만 한다.

## 확인 결과 (2026-11-12, 스크래치 Playwright msedge, 서버 4363 AUTH_FAKE)

48/48 통과: 그래프(선 5·카드 6)·접기 배지(.folded·숨은 수·aria-expanded)·확대/축소 버튼·Ctrl+휠·세로 보기(.dir-right, dd:editor-dir 저장 안 함)·선택(aria-selected)·'여기부터 학습' → `?m=flash&root=<id>` 플래시 범위·비로그인 별점 토스트+로그인·본인 트리 disabled+툴팁·PUT {stars:4} → aria-pressed·평균 갱신·토스트·실패 메시지 토스트·목록 카드 7요소·미리보기 시트(개요 60줄·실패 문구·공유 보기 열기)·카드 전체 링크·390 캔버스가 복제 바와 안 겹침·핀치(56%→200%)·터치 패닝·별 44px·390/768 목록 넘침 없음. 콘솔 오류: 비로그인 /api/me 401 과 route 로 꾸민 403/404 뿐.
