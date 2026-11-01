# 에이전트 E — 노드 카드(제목·내용)·우측 패널 (plan §1 E1, E2)

## 접근 방식
- 내용(note) 모델: `Line { bullet, segs: { text, c?: 'p'|'y'|'b' }[] }`. 순수 함수(`content/format.ts`): parse / serialize / highlight / toggleBullet / autoBullet / toHtml(이스케이프 포함).
  표시·편집 모두 같은 `toHtml` 결과를 쓴다(표시는 dangerouslySetInnerHTML — 텍스트는 &<> 이스케이프).
- 편집기: `contentEditable` 비제어 컴포넌트(`content/NoteEditor.tsx`). React 는 자식을 렌더하지 않고 innerHTML 을 직접 관리.
  입력 → DOM 을 모델로 읽어(`content/dom.ts` fromDom) 저장. 구조가 정규형과 다를 때만(불릿 자동 변환·브라우저가 만든 span 등) 다시 그리고 커서 복원.
  IME 조합 중에는 DOM 재렌더·저장·단축키 모두 생략, compositionend 에서 한 번 동기화.
  - 대안 textarea: 형광펜이 `==y:..==` 원문으로 보여 탈락. execCommand 서식: 저장 형식과 어긋난 span 을 만들어 탈락.
- 실시간 반영: 패널·카드 편집은 매 입력 `commit(…, undoable=false)` → 카드/패널 즉시 반영. 편집 시작 시점 스냅샷을 편집 종료 때 실행취소 스택에 1개 push(편집 1회 = 실행취소 1단계).
- 너비: 단계 px 1=180 / 2=260 / 3=360. 카드 좌·우 `.w-handle` 포인터 드래그로 미리보기(라이브 폭, 그래프 즉시 재배치) → 놓을 때 가장 가까운 단계로 스냅·commit. 패널에도 1·2·3 버튼(키보드 접근·E2E 용).
- 오답 농도: `missHeat(srs.get(id))` → `--heat` CSS 변수, `color-mix` 로 배경·테두리를 `--danger` 쪽으로. c-* 학습 색 제거.
- layout.ts 시그니처 유지(변경 없음).

## 수정/생성 파일
- 생성: `src/features/editor/content/format.ts`, `content/dom.ts`, `content/NoteEditor.tsx`, `content/content.check.ts`
- 수정: `src/features/editor/EditorPage.tsx`, `NodeRow.tsx`, `editor.css`, `graph/GraphView.tsx`
- 범위 밖 파일 수정 없음.

## 단계
- [x] format.ts + content.check.ts (왕복·형광펜·불릿 검증, `npx tsx`)
- [x] dom.ts + NoteEditor.tsx (IME 가드, Shift+H, 불릿 자동, 빈 불릿 Enter/Backspace 해제, 붙여넣기 평문)
- [x] NodeRow: 제목/내용 2단, 내용 더블클릭 인라인 편집, 너비 핸들, data-width/data-miss, c-* 제거
- [x] GraphView: 핸들·편집기에서 드래그 시작 안 함, 밑판 rect 제거
- [x] EditorPage: 패널(제목·내용·툴바·너비·자동 정렬·개요 접이식), 허용 표현 제거, 실시간 반영 + 실행취소 1단계, missHeat
- [x] editor.css 스타일(다크 모드 토큰)
- [x] build / lint / check, 브라우저 스크린샷 확인
- [x] 커밋

## 검증
- `npx tsx src/features/editor/content/content.check.ts`, `npx tsx src/features/editor/graph/layout.check.ts`
- `npm run build`, `npm run lint`
- vite(8100~8199) + Playwright(msedge) 스크립트: 개요 붙여넣기 → 내용 입력(불릿 2 + 형광펜 1) → 카드 높이·겹침, 핸들 드래그 → data-width, 새로고침 유지, Ctrl+Z, miss 주입 후 붉은색, 스크린샷.

## 변경 사항
- 패널 편집 영역 aria-label 은 `패널 제목`·`패널 내용`(카드 인라인은 `노드 제목`·`노드 내용`). 같은 라벨이 두 곳에 있으면 Playwright getByLabel 이 부분 일치로 둘 다 잡아 기존 E2E 가 깨지기 때문.
- GraphView: 포인터 캡처를 "실제로 끌기 시작할 때"로 미룸. 미리 캡처하면 내용 영역 더블클릭의 대상이 카드로 바뀌어 인라인 내용 편집이 열리지 않았다.
- 개요 붙여넣기 접이식(`<details>`)은 기본 펼침: 기존 E2E 가 바로 '개요 텍스트'를 채우기 때문.
- 카드 제목 인라인 편집은 기존처럼 Enter/Esc 확정 시 저장(빈 제목 삭제 규칙 유지). 패널 제목·내용, 카드 내용은 입력 즉시 반영.

## 결과
- content.check / layout.check / build / lint 통과. Playwright(msedge) 확인: 불릿 2 + 형광펜 1 카드 높이 반영·겹침 0, 핸들 드래그 → data-width=3(360px)·새로고침 유지, 인라인 내용 편집 → Ctrl+Z 1회 원복, miss 2 노드 배경이 miss 0 보다 붉음(라이트·다크).
