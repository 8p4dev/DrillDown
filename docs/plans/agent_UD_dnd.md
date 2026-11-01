# 에이전트 UD plan — 빈칸 퀴즈·백지 퀴즈 UX (orchestration_ux_polish.md §2 U3)

## 접근 방식
- **CSS 우선, 상태 클래스만 JS 로**. 새 의존성·새 파일 없음. index.css 토큰/keyframes(`rise pop shake pulse-ring`) 사용만.
- **집기 강조**: `holding = drag?.id ?? sel`. 놓을 수 있는 곳에만 `.target` 클래스(점선 accent outline).
  `pulse-ring` 은 `.dnd-pos:has(> .target)` / `.dnd-tray.target` 래퍼에 건다 — 카드 자체에 animation 을 바꿔 걸면
  클래스가 빠질 때 착지 `pop` 이 다시 재생되므로 래퍼로 분리.
  - 빈칸 퀴즈: 빈칸 전부, 다른 카드가 놓인 칸(교환), 들고 있는 카드가 배치된 상태면 트레이.
  - 백지 퀴즈: 루트, 캔버스 카드 중 자기·자기 자손 제외(`isUnder`), 배치된 카드면 트레이.
- **착지·복귀**: 마운트 시 animation. `.dnd-slot > .dnd-card`, `.dnd-pos > .dnd-card` = `pop`; `.dnd-tray > .dnd-card` = `rise`
  (트레이는 key 유지라 남은 카드는 재생 안 됨).
- **채점 stagger**: TreeCanvas 가 `.dnd-pos` 에 `--i`(y→x 순위)를, 트레이 카드는 `--i = 캔버스 수 + 순번`.
  `[data-result]` 의 색 transition-delay·animation-delay = `min(--i × 35ms, 600ms)`. 오답 `shake`, 정답 `pop`.
  점수 `pop`, 만점은 `.perfect` 칩 + `pulse-ring`. 로직은 animationend 에 의존하지 않음.
- **진행 표시**: 얇은 막대(width transition) + `3/6`. 다 놓으면 [채점] `.ready` → `pulse-ring` 1회.
- 검토한 대안: 네이티브 `<progress>` — 차오름 transition·스타일이 브라우저마다 달라 기각. FLIP 이동 애니메이션 — 간선과 어긋나 기각(YAGNI).
- 잡음 제거: `.dnd-hint`, "여기에 놓기", "모든 카드를 놓았어요…", 로컬 `--ok` 재정의·로컬 reduced-motion 규칙(전역 규칙이 담당).

## 수정 파일 (모두 소유 범위)
- `src/features/dnd/kit.tsx`, `DndPage.tsx`, `BlankDndPage.tsx`, `dnd.css`
- `docs/plans/agent_UD_dnd.md`

## 작업 목록
- [x] 전 스크린샷
- [x] 안내문·"여기에 놓기"·트레이 완료 문구 삭제, 화면 D&D 표기 점검
- [x] 집기 강조(.target + pulse-ring), 드래그 중 grabbing 커서, 트레이 카드 호버 들림
- [x] 착지 pop · 트레이 복귀 rise
- [x] 채점 stagger · 오답 shake · 점수 pop · 만점 pulse-ring
- [x] 진행 막대 + `n/m`, [채점] ready pulse-ring
- [x] 범위 select 높이 툴바 맞춤
- [x] build · lint · check 통과
- [x] 후 스크린샷(라이트·다크, 집기·채점) 확인
- [x] 커밋

## 검증
- `npm run build`(tsc 포함), `npm run lint`, `npm run check`.
- vite(8137) + Playwright(msedge) 스크립트로 전/후 스크린샷: 초기, 카드 탭 선택 중, 드래그 중, 채점 후, 백지 퀴즈 동일, 다크 모드.
- E2E 계약 셀렉터(§3.3 퀴즈) 유지 확인: `[data-drop="tray"]`, `[data-card]`, `<부모> 아래 빈칸`, `.dnd-canvas button.dnd-node.root`, 버튼 `채점`, `p[role=status][data-correct][data-total]`, `원본 트리`.

## 변경 사항
- 전역 `[role='status']` 초록 박스 스타일 때문에 오답이 있어도 점수가 초록 박스로 보였다 → `.dnd-score` 는 박스를 지운 평문,
  만점(`.perfect`)만 초록 칩 + `pulse-ring`. (셀렉터 `p[role=status][data-correct][data-total]` 유지)
- 결과 색 transition-delay 는 `.dnd.locked [data-result]` 에만 둔다 — 카드 공통 transition 에 넣으면 드래그 중 `.over` 강조까지 늦어짐.
- 포트 8137 은 다른 worktree 가 쓰고 있어 8173 에서 확인.
