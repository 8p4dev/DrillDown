# 에이전트 UL — 트리 목록 UX (plan orchestration_ux_polish.md §2 U4)

## 접근 방식
- 카드 전체 클릭 = stretched link: `<a class="tree-open" aria-label="편집">` 를 카드(`position:relative`)에 `inset:0` 으로 깔고,
  제목·⋯ 메뉴·모드 링크·입력은 `position:relative; z-index:1` 로 위에 둔다. 중첩 `<a>` 없음. E2E 계약 `getByRole('link',{name:'편집'})` 유지.
- 제목 단일 클릭도 편집으로 가야 하고 더블클릭은 이름 변경 → 제목 onClick 에서 `detail===1` 이면 250ms 뒤 이동, onDoubleClick 이 타이머 취소 후 인라인 입력.
  (대안: 제목 pointer-events:none → 더블클릭 불가로 탈락. 카드 전체 onClick → 링크/키보드 접근성 나빠 탈락.)
- ⋯ 메뉴: 네이티브 `<details>`. 바깥 클릭 시 닫기는 document pointerdown 1개. (popover API 는 위치 지정이 번거로워 탈락)
- 인라인 이름 변경: `<input aria-label="트리 이름">`, Enter 확정(IME 조합 중 무시)·Esc 취소·blur 확정. 삭제는 `confirm` 유지.
- 새 카드: 생성 id 를 state 로 기억 → `.is-new` 클래스(`rise` + `pulse-ring` 1회). 로직은 animationend 에 의존하지 않음.
- 내보내기: 아이콘 버튼 `⤓`, title/aria-label `학습 기록 내보내기`.
- 빈 상태: 점선 박스 한 줄 + 로드 후 비어 있으면 입력칸 focus.
- 모드 링크: 아이콘(유니코드, aria-hidden) + 이름 한 줄 세그먼트, `white-space:nowrap`.

## 수정 파일
- `src/features/editor/TreeListPage.tsx`, `src/features/editor/treelist.css` (범위 밖 수정 없음)

## 단계
- [x] plan 작성
- [x] 전 스크린샷
- [x] TreeListPage: stretched link·제목 클릭/더블클릭·인라인 이름 변경
- [x] ⋯ 메뉴(이름 변경/삭제) + 바깥 클릭 닫기
- [x] 새 카드 강조, 내보내기 아이콘, 빈 상태 focus, 버튼 문구 "만들기"
- [x] treelist.css 정리(호버 들림, 세그먼트, 메뉴, 다크 모드 토큰)
- [x] build / lint / check
- [x] 후 스크린샷(목록·메뉴 열림·인라인 입력·빈 상태) + 동작 확인 스크립트
- [x] 커밋

## 검증
- `npm run build`, `npm run lint`(경고 0), `npm run check`
- vite(포트 81xx) + Playwright(msedge): 카드 빈 곳 클릭 → 편집 이동, 제목 더블클릭 → `트리 이름` 입력 → Enter 저장/새로고침 유지, Esc 취소, ⋯ → 삭제 confirm, 모드 링크 한 줄

## 변경 사항
- stretched link 를 `inset:0` 링크 자체로 두면 링크 중심이 제목에 가려져 E2E `getByRole('link',{name:'편집'}).click()` 이 실패(Playwright: 다른 요소가 포인터를 가로챔).
  → 링크 본체를 제목과 모드 줄 사이 빈칸(flex:1)으로 두고 `::after` 로 카드 전체를 덮는다. 링크 중심은 항상 비어 있는 영역.
- ⋯ 메뉴가 모드 줄 아래로 깔려 `.tree-top` 을 z-index 2 로 올림.
