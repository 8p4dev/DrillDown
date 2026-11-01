# 에이전트 UF — 플래시카드·오늘의 복습 UX (orchestration_ux_polish.md §2 U2)

## 접근 방식
- CSS 우선. index.css 모션 토큰(`--t-*`, `--ease-*`)과 공용 keyframes(`rise pop shake pulse-ring`)만 사용, 새 keyframes 는 기존 `flash-in`(stagger) 유지 외 추가 없음. 새 의존성 없음.
- **펼침 높이 모션**: `.flash-kids-wrap { display:grid; grid-template-rows:1fr }` + `@starting-style { grid-template-rows:0fr; opacity:0 }` 로 마운트 시 0→auto 높이 트랜지션.
  - 대안: 항상 마운트 + `hidden`/0fr 토글(닫힘 모션도 가능)은 닫힌 상태에서도 DOM 에 li 가 있어 E2E(`toHaveCount(0)`)와 접근성 트리 처리가 까다로움. JS 높이 측정은 코드 증가. → 열림만 모션, 닫힘은 즉시(짧고 의미 있는 쪽만).
  - 안쪽 overflow:hidden 이 그림자·shake 를 자르지 않도록 padding/음수 margin 으로 여유.
- **재마운트로 1회 애니메이션**: 집계 숫자·결과칩은 값이 바뀔 때 `key` 로 재마운트 → `pop` 재생. animationend 에 의존하는 로직 없음(reduced-motion 1ms 안전).
- **모름 shake**: FlashCard 에 `shook` 상태(방금 모름 평가한 id). 다시 평가로 지우면 해제 → 다음 모름에서 다시 재생.
- **다음 개념 pulse**: FlashCard 가 `onAllRated(bool)` 대신 FlashPage 가 tally 로 `kids.every(k => tally.has(k.id))` 계산 → 클래스 부여 시 `pulse-ring` 1회.
- **키보드**: FlashCard 의 window keydown(펼친 상태, 입력칸·수정키 제외). `1/2`=첫 미평가 하위 알음/모름, `→`=onNext, `Enter`=onNext(포커스가 body 또는 개념 카드일 때만 — 다른 버튼의 Enter 는 네이티브 동작 유지). 단축키는 title 에만.
- 리뷰 진행 막대: 네이티브 `<progress>` 는 값 트랜지션 불가 → `div[role=progressbar]` + 내부 막대 width 트랜지션.

## 수정 파일
- `src/features/flash/FlashCard.tsx`, `FlashPage.tsx`, `Minimap.tsx`, `ReviewPage.tsx`, `flash.css`
- 이 문서

## 단계
- [x] plan 작성
- [x] 1 펼침: wrap + @starting-style 높이/투명도, `하위 N개` + 회전 셰브론, 문구 삭제, 더 들어가기 → `↳ N` (title)
- [x] 2 평가: 결과칩 pop, 상태색 트랜지션, 모름 shake, 헤더 집계 숫자 pop
- [x] 3 다음 개념 pulse-ring
- [x] 4 키보드 1/2/→/Enter + title 툴팁
- [x] 5 루트 breadcrumb 숨김, 미니맵 캡션 삭제, 요약 숫자 pop, flash.css 지역 토큰 정리(하드코딩 색 → 토큰)
- [x] 6 복습 진행 막대 트랜지션, 카드 rise
- [x] 검증: build·lint·check, 전/후 스크린샷

## 검증 방법
- `npm run build`(tsc), `npm run lint`(경고 0), `npm run check`
- vite 8137 + Playwright(msedge) 스크립트: 루트 진입(breadcrumb 없음), 펼침, 키 1/2, 집계 텍스트 `알음 N · 모름 M`, → 로 다음 개념, 복습 화면. 전/후 스크린샷 비교.

## 변경 사항
- 닫힘은 모션 없이 즉시 언마운트(위 접근 방식대로). E2E 의 `toHaveCount(0)` 계약을 지키기 위함.
- 키보드 `→/Enter` 는 오늘의 복습에도 연결(다음 복습). 마지막 카드에서는 비활성.
- 다음 개념 pulse 는 tally 기준이라, 새로고침 후 이미 다 평가된 개념에 들어오면 한 번 더 울린다(의도된 단순화).
