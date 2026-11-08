# 에이전트 SS — 서버 저장·동기화·공유 (S3)

작성 2026-11-08. 입력: `orchestration_server.md` §1 S3·§3, `04_tree_sharing_sync.md` §3.1~§3.8·§3.12, `evidence/sh/{conflicts,sequences,capacity}.md`, `03` §3.4 요청 표.

## 접근 방식

- **순수 함수 + 얇은 라우트.** 모든 판정은 `(db, userId, …, now)` 를 받는 동기 함수(`applyPush` `pullSince` `setVisibility` `reissueSlug` `sharedTree` `gallery` `renderShare` …)에 두고, Hono 라우트는 인증·리밋·본문 읽기·상태 코드만. 세션이 스텁이어도 check 가 함수를 직접 부른다.
- **seq 는 행마다 1개**(`UPDATE user_seq … RETURNING`). 배치당 1개로 하면 pull 페이지(500행)가 같은 seq 중간에서 끊겨 커서가 행을 건너뛴다.
- **LWW**: `updated_at` 비교, 들어온 값이 `now+5분` 초과면 `now` 로 깎음, 동률은 서버(먼저 도착) 승. 톰스톤 쓰기는 `deleted_at = updated_at = deletedAt` 으로 같은 키 비교. 더 새로운 put 은 `deleted_at` 을 지운다(C6).
- **트리 부활**(push put·restore·restoreTree)은 그 트리의 노드·srs 의 seq 를 새로 올린다 — 트리 톰스톤 동안 pull 이 하위를 가리므로, 부활 후 다른 기기가 하위를 받게 하려면 필요.
- **커서 만료 판정(C18)**: `user_seq.purged_seq` 컬럼 추가. `purgeTombstones`·톰스톤 물리 삭제 때 지운 행의 최대 seq 를 기록. `since > 0 && since < purged_seq` 면 410 `cursor_expired`(그 기기가 아직 받지 않은 톰스톤이 지워졌다는 뜻 — 정확한 판정, 날짜 추정 없음).
- **srs**: 행 LWW + `autoCorrectDays` 합집합(서버가 이겨도 들어온 날짜를 합쳐 저장·seq 올림, 합친 행을 `superseded` 로). 노드가 없거나 삭제됐거나 남의 것이면 `dropped`(C14). 노드 톰스톤은 그 노드의 srs 도 톰스톤.
- **id_taken**: 다른 사용자 소유 트리/노드 id, 또는 남의 트리에 속하는 노드 → 해당 id. 에러 아님.
- **tree_limit**: 새로 생기는 트리 + 기존 살아있는 트리 > 200 → 403(트랜잭션 전체 롤백). 트리당 살아있는 노드 > 5,000 → 400 `payload_too_large`.
- **공유**: slug 11자 base58(`randomBytes` + 거절 샘플링 `b < 232`), UNIQUE 충돌 재시도. `/api/t/:slug` 판정 404(없음·private) → 410(트리 삭제·소유자 탈퇴 유예) → 403(숨김, 소유자·관리자는 통과). 모든 결과 최소 40ms 로 맞춤.
- **OG**: `shell()` 의 `<title>` 교체 + `</head>` 앞 삽입, HTML 이스케이프. 200 은 `public, max-age=60, stale-while-revalidate=600`, 404/410/403 은 같은 셸·`no-store`(S4 시퀀스 — 닫힌 링크를 엣지에 남기지 않음).
- **갤러리**: `Map` 60초 캐시(키 `sort:page`), 21건 조회로 `hasMore`.
- 대안 검토: 배치당 seq(기각, 위), 날짜 기반 커서 만료(기각: 7일 넘게 안 썼어도 지워진 톰스톤이 없으면 만료시킬 이유 없음), 트리 톰스톤 시 노드 톰스톤 생성(기각: 04 §3.1 "1행만").

## 수정/생성 파일

- `server/sync/index.ts`(라우트), `push.ts`, `pull.ts`, `share.ts`(visibility·slug·/api/t·갤러리·OG), `map.ts`(행↔camel·검증), `seq.ts`(seq·부활), `owner.ts`(구현), `sync.check.ts`
- `server/migrations/002_trees.sql`(`user_seq.purged_seq`, `trees_slug` 는 UNIQUE 로 충분)
- 이 파일

## 단계

- [x] plan 작성
- [x] 002: `purged_seq` 추가
- [x] `map.ts`: 검증(UUID·길이·제어문자·enum) + row↔camel
- [x] `seq.ts`: `nextSeq`, `reviveTree`
- [x] `push.ts` `applyPush`
- [x] `pull.ts` `pullSince`(+ 410)
- [x] `share.ts`: `setVisibility` `reissueSlug` `sharedTree` `gallery` `renderShare`
- [x] `owner.ts` 11개 함수
- [x] `index.ts` 라우트(`/api/sync` `/api/trees*` `/api/t/:slug` `/copy` `/api/gallery` `/t/:slug`)
- [x] `sync.check.ts`
- [x] typecheck·lint·check·build, 커밋

## 검증

- `npm run check` — `sync.check.ts` 가 C1·C2·C3·C6·C7·C8/C9(고아 수용)·C10·C11·C13·C14·C15·C17·C18·C19 + 동률·tree_limit·purge 후 행 없음, 전이표 11행, slug 형식·회수·재발급, `/api/t` 404/410/403, 갤러리 필터, `restoreTreesOfUser`, OG 이스케이프, 라우트 401(세션 스텁)·`/t/:slug` 상태 코드.
- `npm run typecheck && npm run lint && npm run build`.

## 변경 사항

- `GET /api/t/:slug` 응답은 04 §3.6 표의 `{tree, nodes}` 대신 `src/core/api.ts` `SharedTree`(평평한 `{slug,title,visibility,owner:{nickname,avatar_url},node_count,copy_count,updated_at,nodes}`) + **`id`(원본 트리 id)** — 오케스트레이터 확정(msg_f66fcf098361). 클라이언트 복제가 `sourceTreeId` 로 쓴다. `owner.avatar_url` 은 `users.use_provider_avatar=1` 일 때만 값, 아니면 null.
- `GET /api/trees/:id` 는 `{ tree, nodes }`(Tree 는 camel + `visibility`·`slug`·`hiddenByAdmin`). `GET /api/trees` 는 휴지통용으로 삭제 유예 중 트리도 `deletedAt` 과 함께 준다.
- 트리 `sourceTreeId` 는 UUID 가 아니라 `[A-Za-z0-9-]{1,64}` 로 검증 — `repo.ts copyTree` 가 slug 를 넣는다(`SharedTree` 에 원본 id 없음).
- `/t/:slug` 오류 응답 캐시는 `no-store`(위).
- `purgeTombstones` 는 트랜잭션을 열지 않는다(SA 일일 작업이 감쌀 수 있게, 중첩 BEGIN 방지).
- `og:image` 는 크롤러가 상대 경로를 못 읽는 경우가 있어 절대 URL `env.origin + /og.png`.
- 응답 시간 동일화 하한 40ms(`/api/t/:slug`, `/t/:slug`).
- 소유자·관리자는 `GET /api/t/:slug` 에서 숨김(403)을 통과한다(04 §3.7 "읽기 hidden: owner ✓ 배너"). `/t/:slug` HTML 은 세션을 보지 않으므로 403 셸 → SPA 가 `/api/t` 로 다시 판정.
- 노드 put 은 노드 id 소유권을 트리보다 먼저 본다(남의 노드 id 를 모르는 트리에 넣어도 `id_taken`).

## CS 에게 (클라이언트 주의)

- push 응답 `seq` 는 **그 사용자의 현재 seq** 다. 다른 기기가 사이에 쓴 행도 포함하므로 `meta.cursor = push.seq` 로 바로 올리면 그 행을 건너뛴다. 안전한 방법: push 뒤 `cursor` 는 그대로 두고 pull 한 번(내 행을 되받아도 LWW 로 무해), 또는 `push.seq - applied 수 == cursor` 일 때만 올리기.
