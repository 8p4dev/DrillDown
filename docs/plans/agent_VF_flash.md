# agent VF — 플래시카드 · 오늘의 복습 비주얼 다듬기

상위 plan: `orchestration_visual_polish.md` §2 V2 (1~6), §3 공유 계약. 포트 5182. 기능 변경 없음.

## 접근 방식

- **닫힘 애니메이션(V2-4)**: 목록은 처음 펼칠 때 마운트하고, 그 뒤로는 `.closed` 클래스로 CSS 전환만 한다. `display: none` + `transition: display allow-discrete`를 쓰므로 JS 타이머도, `transitionend`도 필요 없다.
  - reduced-motion: `transition: none`이라 닫는 즉시 `display: none`이 되어 접근성 트리에서 빠진다. `getByRole('list', { name: '하위 개념' })`이 매치되지 않는다.
  - 미지원 브라우저: 애니메이션 없이 바로 닫힌다. 기능은 같다.
  - 닫히는 중에는 `inert`로 포커스·클릭을 막는다.
  - 검토한 대안: `setTimeout` 언마운트. 지속시간이 CSS와 JS에 이중으로 생기고 reduced-motion 분기가 필요해서 버렸다.
- **접힌 미니맵(V2-1)**: `matchMedia` 없이 CSS만 쓴다. Minimap은 항상 `--mm-w/h/x/y`를 figure에 넣고, 760px 이하 접힌 상태에서만 CSS가 SVG를 실제 크기의 0.6배로 놓고 현재 노드를 띠 가운데로 옮긴다. 초점은 현재 노드와 자식 행의 가운데다.
  - 띠를 덮는 투명 토글 버튼이 탭을 받고, 데스크톱에서는 `display: none`이다. 그래서 데스크톱의 `g.mm-node`는 지금과 똑같이 보이고 클릭된다.
  - `g.mm-node`는 접혀도 DOM에 남는다(계약 유지).
  - 대안: 접힘 상태 viewBox 크롭. 뷰포트를 JS로 판별해야 해서 버렸다.
- **하단 바(V2-2)**: `position: fixed`. sticky는 부모(`.flash-stage`)가 짧으면 화면 하단에 붙지 않는다. 카드 아래 여백으로 내용 가림을 막는다.
- **토스트 겹침**: `index.css`는 V0 소유라 고치지 않는다. `flash.css`에서 `body:has(.flash-nav) .toasts`(모바일)만 바 위로 올린다.
- **상태 색**: `.c-*`는 `--tone/--edge/--band` 변수만 정하고, 카드가 변수를 읽는다. 전역 `button:hover` 배경이 상태 색을 덮던 문제와 `background: inherit` 땜질이 함께 사라진다.
- **keydown(V2-6)**: 리스너는 마운트 때 한 번 등록하고, 최신 핸들러는 ref로 읽는다. `useMemo`는 early return 앞으로 옮긴다(훅 순서).

## 수정 파일

`src/features/flash/FlashPage.tsx`, `FlashCard.tsx`, `Minimap.tsx`, `flash.css`, `docs/plans/agent_VF_flash.md`. 소유 범위 밖 파일은 없다.

## 단계

- [x] 1. V2-6 성능: `FlashPage` `byId/path/kids/next` useMemo, `FlashCard` keydown ref, kids useMemo
- [x] 2. V2-3·4 `FlashCard`: 마운트/닫힘 구조, `haptic`, 체크 span
- [x] 3. V2-1 `Minimap`: 초점 변수, 토글 버튼
- [x] 4. `flash.css` 정리: 상태 색 변수, 4px 띠, 칩·요약 위계, hover를 `@media (hover: hover)` 안으로
- [x] 5. `flash.css` 모바일: 접힌 미니맵, 하단 바, 1열, 44px, 복습 목록 두 줄, 토스트 여백
- [x] 6. 1440×900·390×844 스크린샷(라이트·다크) 확인
- [x] 7. 브라우저 스크립트로 계약 확인: 1280 + reduced-motion 닫힘 즉시 소멸, 미니맵 클릭, 토스트·바 겹침
- [x] 8. typecheck·lint·check·build 후 커밋

## 검증 방법

- 1~5: `npm run typecheck && npm run lint && npm run check && npm run build`
- 6~7: 워크트리 밖 임시 Playwright 스크립트(`channel: 'msedge'`, 포트 5182). E2E(`npm run e2e`)는 실행하지 않는다.

## 가정

- 평가 결과의 채움·체크 애니메이션은 목록을 다시 펼치거나 새로고침한 뒤에도 재생된다. 등장 연출로 보아 별도 상태를 두지 않는다. shake만 다시 펼칠 때 재생되면 혼란스러워서 토글 시 지운다.
- 초록 채움은 흰 글자 대비가 4.5:1을 넘도록 `--ok`를 15% 어둡게 섞어 쓴다. 글자색은 `--surface`(다크에서 어두운 글자)다.
- 미니맵은 펼친 뒤 노드로 이동해도 자동으로 접지 않는다(사용자가 고른 상태 유지).
- 카드 교체 시 `rise` 등장은 복습 화면에만 있었는데, 플래시 화면에도 같이 적용한다.

## 결과

- 브라우저 검사(임시 스크립트, msedge): 1280 + reduced-motion, 모션 있음, 390×844 항목 전부 통과. 콘솔 오류 없음.
  - reduced-motion: 닫은 다음 프레임에 `display: none`, role 목록 0개
  - 모션 있음: 닫는 중 높이 148 → 20px(`display: grid` 유지), 끝나면 `none`
  - keydown 리스너 재등록 없음(평가·재렌더 전후 등록 횟수 같음), 키 `1`은 최신 상태를 본다
  - 1280: `g.mm-node[aria-current]`가 보이고 클릭되며, 토글은 숨김
  - 390: 접힌 미니맵 66px(현재 노드가 띠 안), 평가 버튼 44px, 하위 카드 1열, 바 60px가 화면 바닥에 붙음, 가로 넘침 0, 마지막 카드가 바에 안 가림, 토스트 아래쪽 772.75 ≤ 바 위쪽 784
- 스크린샷 1440×900·390×844 라이트·다크 확인.
- 실행하지 않은 것: `npm run e2e`(오케스트레이터 몫), 실기기 진동, iOS safe-area(에뮬레이션 뷰포트만).

## 변경 사항

- `ReviewPage.tsx`는 고칠 필요가 없었다. 두 줄 배치는 CSS만으로 된다.
- 스크린샷에서 복습 행의 링크가 첫 줄에 끼어 세로로 찌그러지는 것을 발견해 `flex-basis: 8rem`으로 고쳤다.
- 바 높이는 `.flash`가 아닌 `body:has(.flash-nav)`에 `--flash-bar-h`로 둔다. `.toasts`가 `.flash` 밖이라 값을 두 번 적지 않기 위해서다.
