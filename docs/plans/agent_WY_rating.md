# 워커 WY — 서버: 공개 트리 별점 API (orchestration_editor_share.md §1.4)

기준 커밋 `5222a15`(main). 포트 5364/4364. 소유: `server/**`, `docs/CODEBASE.md` §4·§9, 이 문서.

## 접근 방식

- 새 의존성 없음. 기존 패턴 그대로: 판정은 `share.ts` 순수 함수, 라우트(`index.ts`)는 인증·리밋·상태 코드만. 단언은 `sync.check.ts`(메모리 DB + `app.request`).
- 테이블 `ratings(user_id, tree_id, stars, updated_at)` PK(user_id, tree_id) → 1인 1표는 PK 가 보장, upsert 로 수정. `stars` 범위는 DB CHECK 와 라우트 400 둘 다(라우트가 먼저 거르고 CHECK 는 안전망).
- 집계는 SQL `AVG`·`COUNT`. 평균 소수 1자리는 JS `Math.round(avg * 10) / 10`(한 곳 `round1`).
- `rateTree` 뒤 `clearGalleryCache()` — 갤러리는 60초 캐시이므로 비우지 않으면 `ratingAvg` 가 늦게 반영된다.
- `sharedTree(db, t, viewer?)` 에 viewer 를 넘겨 `mine`·`canRate` 를 채운다. `GET /api/t/:slug` 는 `c.get('user')` 를 그대로 넘긴다(비로그인 null → `mine:null, canRate:false`).
- 검토한 대안: 평균을 `trees` 열에 비정규화(쓰기 때 갱신) — 평가 수가 적고 갤러리 20건 LEFT JOIN 으로 충분해 기각(인덱스 `ratings_tree` 로 트리별 집계). 별점 삭제 API — plan §2 A5 대로 만들지 않음.

## 수정/생성 파일

- `server/migrations/003_ratings.sql` — 신규
- `server/sync/share.ts` — `ratingOf`, `rateTree`, `sharedTree` viewer, `gallery` LEFT JOIN, `ShareRow` export
- `server/sync/index.ts` — `GET /api/t/:slug` viewer, `PUT /api/t/:slug/rating`
- `server/sync/owner.ts` — `purgeUser` 에 ratings 삭제
- `server/sync/sync.check.ts` — 단언
- `docs/CODEBASE.md` — §4 대응표 한 줄, §9 API 표 한 줄
- `docs/plans/agent_WY_rating.md` — 이 문서

## 단계

- [x] 0. `npm ci`, plan·CODEBASE·코드 읽기, 이 문서
- [x] 1. Y1 `003_ratings.sql` + sync.check 에서 `openDb(':memory:')` 가 적용(테이블 존재 단언은 Y2 단언이 겸함)
- [x] 2. Y2 `share.ts`: `ratingOf`·`rateTree`·`sharedTree(viewer)`·`gallery` 집계 + sync.check 단언(평가→avg/count/mine, 재평가→count 유지·avg 갱신, 다른 사용자→count 2, 갤러리 ratingAvg·ratingCount, 캐시 비움)
- [x] 3. Y3 `index.ts`: GET viewer, `PUT /api/t/:slug/rating` + `app.request` 단언(401·400 0/6/'a'·403 own_tree·200 모양·재평가 200·404)
- [x] 4. Y4 `owner.ts` `purgeUser` ratings(users 행 삭제 전) + 단언
- [x] 5. Y5 CODEBASE §4·§9 한 줄씩
- [x] 6. `npm run typecheck`·`lint`·`check`·`build`, 서버 4364 curl 확인 후 PID 종료
- [x] 7. 의미 단위 커밋, worker_done

## 검증 방법

- 1~4: `node server/check.ts`(sync.check 단언). 라우트는 `app.request` 로 비로그인 앱·로그인 앱(S)·타인 앱 각각 호출.
- 4: `purgeUser` 가 users 행을 지우지 않는다(호출자 SA 가 지움) — ratings 는 `users(id)` FK 라 purgeUser 안에서 먼저 지워야 FK 위반이 없다. 단언: purgeUser 뒤 `ratings WHERE user_id` 0.
- 6: typecheck(tsc -b + tsconfig.server)·lint 경고 0·check·build. 4364 에 `AUTH_FAKE=1` 로 띄워 curl: 비로그인 PUT 401, 로그인 PUT 200.

## 변경 사항

- Y3 리밋: 지시의 `hit(c, \`rate:${userId}\`, 30, MIN)` 대신 기존 미들웨어 `limit('rate', 30, MIN)` 을 썼다. `requireUser` 뒤에 오므로 키가 `rate:<userId>` 로 같고, 다른 로그인 라우트와 같은 모양이다.
- Y3 본인 트리 403 판정은 라우트가 아니라 `rateTree` 안에 두었다(순수 함수 단언으로도 잡히게).
- sync.check: 라우트 단언용 앱(`app`·`ownApp`·새 `appA`)이 같은 `onErr` 핸들러를 쓰도록 묶었다(기존 `ownApp` 은 onError 가 없어 HttpError 가 500 이 됐다).
- 확인 추가: 4364 에 `AUTH_FAKE=1` 로 띄워 curl — 비로그인 401 · 본인 403 own_tree · stars 0 → 400 bad_request · 4점 200 · 5점 재평가 200(count 1) · GET 로그인/비로그인 rating · 갤러리 `ratingAvg 5, ratingCount 1` · 파일 DB `user_version 3`, `ratings`·`ratings_tree` 존재. PID 로 종료.
