# agent UE — 에디터 UX 다듬기 (orchestration_ux_polish.md §2 U1)

## 접근 방식
- **상태 메시지**: `msg` state·`.status` 박스 삭제 → 모든 `setMsg(x)` 를 `toast(x)` 로. 비우기(`setMsg('')`)는 제거.
- **삭제**: `confirm()` 제거, 즉시 commit 후 `toast('"X" 삭제', {label:'실행 취소', run})`. run 은 기존 undo 스택을 쓰되,
  스택 맨 위가 삭제 직전 스냅샷일 때만 되돌린다(이후 다른 변경이 있으면 엉뚱한 단계를 되돌리지 않도록 안내 토스트). 되돌린 뒤 아웃라이너로 포커스.
- **확대 도구**: [− (배율 버튼) +] + 아이콘 버튼 `화면 맞춤`(⤢) · `자동 정렬`(옮긴 노드 있을 때만 렌더) · `?`(단축키). 배율 `<output aria-label="배율">` 을 버튼 안에 넣어 클릭 = 100%.
  버튼에는 aria-label 을 주지 않는다(getByLabel('배율') 이 두 개로 잡히지 않게).
- **단축키 팝오버**: 네이티브 `popover` 속성(+`popoverTarget`) — 라이브러리·포커스 관리 코드 불필요, Esc·바깥 클릭 닫힘 기본 제공. `?` 키는 `togglePopover()`.
  목록은 `<dl>` 에 `<kbd>` + 2~3단어.
- **개요 details**: 로드 시 노드가 루트 1개뿐이면 open. `open` state + `onToggle` 로 사용자 토글 유지.
- **그래프 모션** (GraphView):
  - `.node-row` 에 `left/top/box-shadow/background-color/border-color/transform/width` 트랜지션.
  - 측정 문제: 처음 렌더는 FALLBACK 크기로 배치 → 측정 후 재배치되므로, 그대로 두면 새 카드가 엉뚱한 곳에서 미끄러져 온다.
    → GraphView 가 `known`(정착한 id 집합) state 를 두고, 아직 정착하지 않은 카드는 `still`(트랜지션 끔). 측정이 더 바뀌지 않는 패스에서 known 갱신 → 위치 변화 없는 렌더에서 still 해제.
  - 드래그 중인 카드와 그 하위도 `still`, 끄는 카드 자체는 `lifted`(--shadow-lift, scale 1.02). renderNode 3번째 인자로 `{ still, lifted }` 전달.
  - 엣지: SVG path `d` CSS 트랜지션(같은 시간·이징 → 카드와 동기). still 카드에 닿은 엣지는 트랜지션 끔. (Safari 는 d 트랜지션 미지원 → 즉시 이동, 수용)
  - 새 카드: `rise` 애니메이션(마운트 시 1회, transform/opacity 만 → offset 측정 무관).
- **너비 스냅**: width 트랜지션은 offsetWidth/Height 측정을 중간값으로 만든다 → GraphView 에 `ResizeObserver` 추가, 크기 변화 프레임마다 다시 재서 배치(트랜지션 끝나면 최종값으로 수렴). 리사이즈 드래그 중(`.resizing`)엔 width 트랜지션 끔.
  - 대안 검토: 측정 때 transition 을 잠깐 끄기 → 애니메이션 자체가 사라짐. transitionend 에서 재측정 → reduced-motion 계약(종료 이벤트 의존 금지) 위반. scaleX → 글자 왜곡.
- **선택 링·heat**: box-shadow / background-color / border-color 트랜지션(색은 --heat 로 계산되므로 @property 불필요).
- **루트 +내용 / 배지 겹침**: 화면 확인 후 결정(아래 변경 사항에 기록).

## 수정 파일
- src/features/editor/EditorPage.tsx
- src/features/editor/NodeRow.tsx
- src/features/editor/graph/GraphView.tsx
- src/features/editor/editor.css
- (NoteEditor.tsx 는 수정 불필요 예상 — placeholder 는 EditorPage 에서 넘김)

## 단계
- [x] 1. 전 스크린샷
- [x] 2. msg → toast, .status 제거
- [x] 3. Delete 즉시 + 실행 취소 토스트
- [x] 4. 확대 도구 정리 (배율 버튼, 화면 맞춤·자동 정렬 아이콘, 사이드 '자동 정렬' 버튼 제거)
- [x] 5. 패널: placeholder "내용", 개요 details 조건부 open, 단축키 문단 → ? 팝오버
- [x] 6. GraphView: still/lifted, known 집합, ResizeObserver, 엣지 d 트랜지션
- [x] 7. CSS: 트랜지션·rise·lift·선택 링·heat·너비 스냅
- [x] 8. 루트 +내용·배지 겹침 해소
- [x] 9. build / lint / check 통과, 후 스크린샷 + 트랜지션 동작 확인(중간 프레임 computed left, d)
- [x] 10. 커밋

## 검증
- 각 단계: `npm run build`(tsc), `npm run lint`.
- 화면: vite 8137 + Playwright(msedge) 스크립트로 전/후 스크린샷, 삭제→토스트→실행 취소, ? 팝오버, 중간 프레임 left 값이 시작~끝 사이인지, 너비 스냅 후 data-width·카드 크기 수렴.

## 변경 사항
- 루트 `+ 내용`·배지 겹침: 배지가 있는 카드에서는 `+ 내용` 을 오른쪽 아래 모서리 밖으로(`translate(45%, 50%)`) 비켜 세움 (`:has(> .badge)`).
- 탐색 키 Escape 가 preventDefault 되어 팝오버 기본 Esc 닫힘이 막힘 → Escape 분기에서 `hidePopover()` 명시 호출.
- `.still`/`.resizing` 은 transition-property 만 줄이므로 남은 속성의 시간이 순서대로 다시 매겨진다(예: box-shadow 가 120→200ms). 체감 차이 미미해 수용.
- NoteEditor.tsx 는 수정 불필요(placeholder 는 EditorPage 에서 넘김).

## 결과
- build·lint(0)·check 통과. 8173 에서 확인: 삭제 시 형제 left 440→268(중간)→236, 엣지 d 보간, 실행 취소 → 복원+아웃라이너 포커스,
  ? 팝오버 열림/Esc 닫힘, 드래그 lifted + 하위 still, 자동 정렬 아이콘 표시/클릭 후 사라짐, 너비 스냅 270(중간)→260, 형제 간격 24 수렴, 배율 클릭 120%→100%, 다크 모드.
