# 워커 WY — 서버 후속: 별점 시 공개 트리 목록 캐시는 public 트리일 때만 비움 (F4)

기준 커밋 `aa96323`(main `ce4d5d6` + 후속 plan). 포트 4364(이번엔 서버를 띄울 필요 없음 — 순수 함수 단언). 소유: `server/**`, 이 문서.
배경: `orchestration_editor_share_followup.md` §1.2 F4, 직전 기록 `agent_WY_rating.md`.

## 접근 방식

- `rateTree` 의 `clearGalleryCache()` 호출에 `t.visibility === 'public'` 가드 한 줄. `ShareRow` 에 이미 `visibility` 가 있으므로 추가 조회 없음.
- unlisted 트리는 `gallery()` 의 `WHERE t.visibility = 'public'` 에 걸려 목록에 없으니, 그 트리의 평균이 바뀌어도 캐시된 목록은 그대로 옳다.
- 검토한 대안: 캐시 키별 선택 무효화(트리가 든 페이지만) — 캐시 항목에 slug 집합을 더 들고 다녀야 하고 20건×500키 규모에서 이득 없음. 기각.
- 단언은 기존 별점·갤러리 블록(`sync.check.ts` 326~332행) 바로 뒤에 붙인다. 같은 `now`(T0) 로 재조회 시 반환 객체가 **같은 참조**면 캐시 적중(`assert.equal` 참조 비교), 다른 참조+새 값이면 비워진 것.
- `tsRow` 는 조회 시점 스냅샷이라 visibility 를 바꾼 뒤에는 `shareRow(s4)` 로 새로 읽는다(`lookupShare` 는 unlisted 도 ok).
- 이후 단언(`rateTree(db, W, tsRow, 3)` → count 4, 라우트 갤러리 copyCount)은 ratings 행 수·copy_count 만 보므로 내 블록에서 A 의 재평가(upsert, count 유지)와 public 복귀로 영향 없음.

## 수정/생성 파일

- `server/sync/share.ts` — `rateTree` 가드 + 주석
- `server/sync/sync.check.ts` — 단언 추가
- `docs/plans/agent_WY_followup.md` — 이 문서

## 단계

- [ ] 0. `npm ci`, plan·코드 읽기, 이 문서
- [ ] 1. `share.ts` `rateTree`: `if (t.visibility === 'public') clearGalleryCache()`
- [ ] 2. `sync.check.ts`: unlisted 전환 → 캐시 채움 → 평가 → 같은 T0 재조회가 같은 객체; public 복귀 → 평가 → 다른 객체·새 ratingAvg
- [ ] 3. `npm run typecheck`·`lint`(경고 0)·`check`·`build`
- [ ] 4. 커밋, worker_done

## 검증 방법

- 1~2: `node server/check.ts`(check 스크립트 마지막 항목). 가드를 빼면 unlisted 단언(같은 참조)이 실패하고, 가드를 `!== 'public'` 로 뒤집으면 public 단언이 실패하는지 각각 한 번 확인.
- 3: 네 명령 모두 종료 코드 0, lint 경고 0.
