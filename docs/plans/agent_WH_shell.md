# 워커 WH — 셸: 오늘의 복습 삭제 · 상단 바 '공개 트리' · 명칭 (2026-11-11)

상위: `orchestration_editor_share.md` §1.1 (R1·R9·R10a). base = main `5222a15`. 포트 vite 5361 / 서버 4361.

## 접근
- 삭제 위주. 새 코드는 상단 바 `<a>` 한 줄과 TITLES 글자 하나.
- `dd:due` 는 발신(`srs/index.ts` `notifyDue`)·수신(App) 을 함께 지운다(계약 C7). 학습 기록 저장(`recordGrade`·`recordResults`)은 그대로.
- `TreeMeta.due`·`listTreeMeta(dueBy)`·`summarizeTrees(dueBy)` 인자 삭제. `studiedAt`·`usedAt`(정렬) 유지.
- `flash.ts` 의 `parentQueue`·`byOverdue` 와 그것만 쓰던 `preorder` 삭제(grep: ReviewPage 만 사용). `requeueMissed`·`missedConcepts`·`weakQueue` 등 플래시용은 유지.
- 대안 검토: `#/review` 를 `#/` 로 리다이렉트하는 분기 추가 → 불필요(parseHash 기본 분기가 이미 `trees`).

## 수정/생성 파일
- 삭제: `src/features/flash/ReviewPage.tsx`
- `src/App.tsx`, `src/router.ts`, `src/core/srs/index.ts`, `src/core/repo.ts`, `src/core/repo.check.ts`,
  `src/features/flash/flash.ts`, `flash.check.ts`, `flash.css`, `src/features/editor/TreeListPage.tsx`, `treelist.css`
- 건드리지 않음: `src/index.css`(`.nav-long/.nav-short` 이미 있음), `srs.check.ts`(dueByTree 단언 없음), `e2e/**`, `docs/CODEBASE.md`

## 단계
- [x] 1. `npm ci`
- [x] 2. R1 라우터·App: `review` 라우트·href·lazy·TITLES·링크·배지·`countDue` 삭제. `dd:due` 리스너 삭제
- [x] 3. R1 srs: `notifyDue`·`dueByTree` 삭제
- [x] 4. R1 repo: `TreeMeta.due`·`dueBy` 인자·due 집계 삭제, `repo.check.ts` 갱신
- [x] 5. R1 flash: `ReviewPage.tsx` 삭제, `flash.ts` `preorder`·`parentQueue`·`byOverdue` 삭제, `flash.check.ts` 갱신, `flash.css` 복습 절·`.review-link` 삭제
- [x] 6. R1 TreeListPage: '복습 n'·`endOfToday` 삭제
- [x] 7. R9 App 상단 바 '공개 트리' 링크(항상 표시), TreeListPage `.trees-gallery` 문단·CSS 삭제
- [x] 8. R10a `TITLES.gallery = '공개 트리'`
- [x] 9. `rg "review|dd:due|dueByTree|parentQueue|byOverdue" src` 0건 확인, typecheck·lint·check·build
- [x] 10. 서버 4361 로 빌드 띄워 1440·390 상단 바·내 트리 화면 확인(스크래치 Playwright) 후 종료
- [x] 11. 커밋, worker_done

## 검증
- 2~8: `npm run typecheck`, `npm run lint`, `npm run check`(repo·flash 단언), `npm run build`
- 9: grep 0건
- 10: 스크린샷에서 상단 바 = 내 트리 · 공개 트리(390 에선 '공개'), '오늘의 복습' 없음, `#/gallery` 에서 aria-current, `#/review` → 내 트리, 트리 카드에 '복습 n' 없음, '공개 트리 둘러보기' 문단 없음

## 변경 사항
- App 의 `dd:remote` 리스너는 `countTrees` 재집계용으로 남긴다. 공유 보기에서 다른 기기 트리가 pull 되면 '내 트리' 링크가 나타나야 하는 기존 동작이라 지우면 회귀. 지운 것은 due 재집계만.

## 결과 (2026-11-11)
- typecheck·lint(경고 0)·check·build 통과. `rg "review|dd:due|dueByTree|parentQueue|byOverdue" src` 는 ts-fsrs API(`scheduler.review`, `last_review` 정규식) 2건만 남음(복습 기능 아님).
- 서버 4361 + 스크래치 Playwright(msedge) 1440·390: 상단 바 = 내 트리 · 공개 트리(390 은 '공개'), '오늘의 복습' 없음, `#/gallery` 에서 aria-current=page, 탭 제목 '공개 트리 — Drill Down', `#/review` → 내 트리, 트리 카드 메타 '노드 1 · 방금'(복습 n 없음), '공개 트리 둘러보기' 문단 없음.
- E2E 영향: `#/review` 이동(regress S1)만. 셀렉터 C4 는 모두 유지.
