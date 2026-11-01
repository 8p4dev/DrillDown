# 에이전트 S — 전체 스타일 정리 (plan §1 S1)

## 접근 방식
- 순수 CSS(새 의존성 없음). 공통 규칙은 `src/index.css` 에 요소 셀렉터 + 소수 유틸 클래스(`.card`, `.primary`, `.danger`, `.link`, `.muted`)로 둔다. 화면별 규칙은 기존 `study.css`, 신규 `treelist.css`.
- 버튼: 맨 `button` = 보조(테두리, surface 배경). `.primary` = accent 채움, `.danger` = danger 색. `button.link` = 링크 모양.
  - 대안: 맨 `button` 을 accent 채움으로 → 에디터 툴바(G 소유, className 추가 불가)까지 전부 파란 버튼이 되어 시끄러움. 그래서 기본을 보조로 두고 주요 동작에만 `.primary` 를 붙인다.
- 상단 바: sticky, surface 배경 + 하단 테두리, 브랜드 굵게. 현재 화면 강조는 App.tsx 에서 route 로 `className="active"` (aria 속성은 추가하지 않음).
- c-* 색: 이름 유지. 배경은 옅게, 왼쪽 띠는 `box-shadow: inset` 대신 기존 `border-left` 유지(에디터 G 가 덮어씀). 톤만 정돈.
- 트리 목록: 카드 그리드(`.tree-cards`). 에디터 번들의 `editor.css` 에 남은 `.tree-list li {display:flex; border-bottom}` 규칙과 충돌을 피하려고 루트 클래스를 `.trees` 로 바꾼다(E2E 셀렉터는 `li[data-tree-id]`·문구 기반이라 영향 없음).
- 학습 화면: className·감싸는 요소만 추가.

## 수정/생성 파일
- src/index.css
- src/App.tsx
- src/features/study/study.css, Drill.tsx, QuizPage.tsx, ReviewPage.tsx, StudyPage.tsx (IdeaUnits.tsx 는 필요 시)
- src/features/editor/TreeListPage.tsx
- 신규 src/features/editor/treelist.css
- docs/plans/agent_S_style.md (이 문서)

## 단계
- [x] 1. index.css: 토큰 값 정돈, 본문·상단 바·버튼·입력·표·카드·상태 메시지·c-*
- [x] 2. App.tsx: 상단 바 마크업(브랜드/링크, active)
- [x] 3. treelist.css + TreeListPage 카드형 목록 (editor.css import 제거)
- [x] 4. study.css + study/*.tsx className
- [x] 5. build · lint 통과
- [x] 6. 라이트/다크 스크린샷(트리 목록·학습·퀴즈 결과·복습) 확인 후 수정
- [x] 7. 커밋

## 검증
- 1~4: `npm run build`(tsc 포함), `npm run lint`
- 6: `npx vite --port 81xx --strictPort` + Playwright(msedge) 스크립트로 colorScheme light/dark 스크린샷
- 문구·aria·data-* 무변경: `git diff` 로 해당 문자열 줄 변경 없음 확인

## 변경 사항
- 트리 목록: "학습 기록 내보내기(JSON)" 버튼을 목록 아래에서 제목 옆(헤더)으로 옮김. 문구·aria-label 동일.
- 상단 바에 "내 트리" 링크 추가(브랜드와 같은 주소). 현재 화면 강조용.
- 퀴즈 결과 표 마지막 칸을 flex 로 했더니 표 행 높이·테두리가 깨져서, 칸 안 요소에 여백만 주는 방식으로 바꿈.
- 다크 모드 primary 버튼: 밝은 accent 위 흰 글자는 대비가 낮아서 어두운 글자를 씀.

## 남은 문제
- `editor.css` 의 `.tree-list`·`.row-form` 규칙은 이제 아무 데서도 쓰지 않음 — plan §4 에 따라 머지 후 오케스트레이터가 지움.
- index.css 의 전역 `input:focus { outline: none; box-shadow }` 규칙은 에디터 입력에도 적용됨. G 가 필요하면 덮어씀.
