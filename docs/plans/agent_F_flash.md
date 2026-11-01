# 에이전트 F — 플래시카드·미니맵·오늘의 복습 (plan §1 F1, F2)

## 접근 방식
- React 함수 컴포넌트 + 기존 core API(`getTreeNodes`, `childrenOf`, `getSrsMap`, `colorMap/colorClass`, `recordResult`, `logEvent`, `dueByTree`)만 사용. 새 의존성 없음.
- 순수 로직(다음 개념 찾기, 복습 큐, 미니맵 배치용 노드 정리, 메모 평문화)은 `flash.ts` 로 분리하고 `flash.check.ts`(assert) 로 점검.
- 카드 UI는 `FlashCard.tsx` 하나로 만들어 FlashPage·ReviewPage 가 공유. 평가 결과(NodeSrs)는 부모가 srs 맵에 반영 → colorMap 재계산으로 색 즉시 반영.
- 펼침 애니메이션: CSS keyframes + `--i` 지연(순차 등장), `prefers-reduced-motion` 에서 끔. JS 애니메이션 라이브러리 검토했으나 의존성 금지·불필요.
- 미니맵: `editor/graph/layout.ts` 의 `layout` 을 고정 크기 measure 로 호출(접힘·offset 무시) → SVG rect/path. viewBox 로 축소. 대안(캔버스)은 접근성·클릭 처리가 번거로워 제외.
- 상태 색은 index.css 의 `.c-*` 클래스를 쓰되 flash.css 에서 카드 모양에 맞게 범위 한정 덮어쓰기.
- "다음": 전체 트리 전위 순서에서 현재 다음의 "자식 있는 노드" 중 시작 개념 서브트리 안의 것. 없으면 요약.
- 노트는 평문(`==p:..==` 마커만 제거, 줄바꿈 유지).

## 수정/생성 파일
- `src/features/flash/FlashPage.tsx` (스텁 교체)
- `src/features/flash/ReviewPage.tsx` (스텁 교체)
- 신규 `src/features/flash/FlashCard.tsx`, `Minimap.tsx`, `flash.ts`, `flash.check.ts`, `flash.css`
- 이 문서 `docs/plans/agent_F_flash.md`

## 단계
- [x] plan 작성
- [x] flash.ts 순수 로직 + flash.check.ts (`npx tsx`)
- [x] FlashCard.tsx (펼침·알음/모름·색·더 들어가기)
- [x] Minimap.tsx (layout 재사용, 강조, 클릭 이동)
- [x] FlashPage.tsx (TreeHeader, 다음/요약, 미니맵)
- [x] ReviewPage.tsx (목록 유지 + 카드 복습 세션)
- [x] flash.css (토큰, 다크 모드, reduced-motion)
- [x] build·lint 통과
- [x] vite + Playwright 스크린샷 확인 (라이트/다크, 흐름)
- [x] 커밋, worker_done

## 검증
- 순수 로직: `npx tsx src/features/flash/flash.check.ts`
- 타입·빌드: `npm run build`, `npm run lint`
- 화면: `npx vite --port 81xx --strictPort` + Playwright(msedge) 스크립트로 흐름(탭→펼침→알음2/모름1→색→다음→미니맵 강조 이동, 새로고침 후 색 유지)과 스크린샷

## 변경 사항
- 색 계산 기준 시각을 렌더 중 `new Date()` 대신 srs 상태와 함께 저장(`{ map, at }`) — oxlint react(purity) 경고 해소, EditorPage 와 같은 패턴.

## 결과
- 흐름 확인(라이트·다크): 루트 → Space → 하위 3개 → 알음2/모름1 → data-color lightgreen/green/red → 다음 개념(세포막) 미니맵 aria-current 이동 → 미니맵 '핵' 클릭 이동 → 새로고침 후 색 유지 → 요약 → 복습 목록·복습 시작 카드.
