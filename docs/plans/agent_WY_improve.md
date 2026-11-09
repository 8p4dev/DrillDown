# 워커 WY — 서버·동기화 개선 (orchestration_improve.md §1.4)

기준 커밋 1a0519d. 포트 5363/4363. 소유: `server/**`, `src/core/sync/**`, `src/core/sync.ts`, `src/core/backup.ts`·`backup.check.ts`, `src/core/events.ts`.

## 접근 방식

- 새 의존성 없음. 설치된 hono 4.13 의 `hono/body-limit`·`hono/secure-headers` 만 쓴다.
- 서버 판정은 기존처럼 push/pull/share/owner 순수 함수에 넣고, 라우트(index.ts)는 미들웨어 추가만.
- 트리 제목(F7)은 계약 C7 대로 "루트 노드 행이 기준": 서버 push 의 `touched` 루프가 트리 제목을 살아 있는 루트 제목으로 맞추고(바뀌면 seq 만 증가, `updated_at` 은 그대로 — LWW 에 끼어들지 않게), 클라이언트 applyRemote 는 루트 노드를 적용할 때 로컬 `trees.title` 만 고친다(track 없음).
- F4 는 410 전체 재동기화 때 "서버에 없는 로컬 트리"를 둘로 나눈다: 7일 안 `updatedAt` 이거나 outbox·보류(held)에 있는 트리는 재업로드, 나머지는 `deletedAt=now` 로 로컬 휴지통(track 없음). F3(서버 복원으로 seq 되감김) 때도 최근 트리는 다시 올라간다.
  - 휴지통 복구가 "7일 복구 가능" 하려면 복구된 트리의 노드도 서버에 가야 한다. 지금 `repo.restoreTree` 는 tree put 1행만 track 하므로 서버에 빈 트리만 생긴다(기존 구멍, F4 로 더 자주 드러남). 서버 push 응답에 `created`(새로 INSERT 된 트리 id)를 더하고, 엔진이 그 트리의 outbox 에 없는 노드·srs 를 enqueue 해 다음 바퀴에 올린다. 서버·엔진 모두 WY 소유라 다른 워커 파일을 건드리지 않는다.
- 검토한 대안: F4 에서 서버에 없는 트리를 그냥 지우기(데이터 손실 위험, 기각 — plan §2), 전부 재업로드(지운 트리 부활, 기존 문제). F7 에서 `updated_at` 도 올리기(클라이언트 보류 tree put 과 LWW 충돌 유발, 기각).

## 수정/생성 파일

- `server/index.ts` — F1 bodyLimit, F9 secureHeaders, F10 로그 slug 가림
- `server/db.ts` — F3 `synchronous=FULL`
- `server/sync/pull.ts` — F3 `since > cur.seq` → 410
- `server/sync/push.ts` — F7 트리 제목 = 루트 제목, F4 `created`
- `server/sync/share.ts` — F13 정지 사용자 숨김(lookupShare·gallery)
- `server/sync/owner.ts` — F14 purgeUser 가 reports.reporter_id 비움
- `server/account/me.ts` — F12 카카오 웹훅 리밋 분리
- `server/account/daily.ts` — F15 사용자별 try/catch
- `server/account/backup.ts` — F16 도구 없으면 ok=false
- `server/check.ts`, `server/sync/sync.check.ts`, `server/account/account.check.ts` — 단언
- `src/core/sync/engine.ts` — F4, F7(클라이언트), F17 events.clear, MAX_BYTES 주석, `created` 처리
- `src/core/backup.ts`, `src/core/backup.check.ts` — F18 순수 `planImport` + 단언
- `docs/plans/agent_WY_improve.md` — 이 문서

## 단계

- [x] 0. `npm ci`, plan·CODEBASE·코드 읽기, 이 문서
- [x] 1. F1 bodyLimit `/api/*` (`LIMITS.bytes + 64KB`, 413 기존 봉투) + server/check 3MB POST → 413 단언
- [x] 2. F3 pull `since > seq` → 410, db `synchronous=FULL` + sync.check 단언
- [x] 3. F7 서버: push touched(+적용된 tree put) 루프에서 trees.title ← 루트 제목, seq 증가 + sync.check 단언(기존 제목 단언 보정)
- [x] 4. F13 share: `suspended_at` → 403 hidden(갤러리 제외) + 단언. F14 purgeUser reports + 단언
- [x] 5. F9 secureHeaders(CSP 없음) + F10 로그 slug 가림 + server/check 헤더 단언
- [x] 6. F12 카카오 웹훅 리밋(인증 뒤 별도 키) + account.check 단언. F15 daily 사용자별 try/catch. F16 backup 도구 없으면 ok=false
- [x] 7. 엔진: F17 wipe_other 때 events.clear, MAX_BYTES 주석, F7 applyRemote 루트 → trees.title
- [x] 8. 엔진 F4: 410 때 최근(7일)·outbox·held 트리만 재업로드, 나머지 로컬 휴지통 + 서버 `created` → 노드·srs enqueue
- [x] 9. F18 backup `planImport` 순수화, 모든 행 `updatedAt=now` + backup.check 단언
- [x] 10. `npm run typecheck`·`lint`·`check`·`build`, 서버 4363 띄워 curl 로 413·보안 헤더·`/t/:slug` 로그 확인 후 종료
- [x] 11. 의미 단위 커밋, worker_done

## 검증 방법

- 1~6: `node server/check.ts`(server.check → account.check → sync.check) 단언. F1 은 추가로 4363 서버에 3MB POST curl → 413.
- 7~8: 순수 로직 아님(IndexedDB). typecheck + 코드 리뷰. 410 경로는 서버 단언(F3)으로 트리거만 확인. E2E 는 머지 후 오케스트레이터.
- 9: `tsx src/core/backup.check.ts`.
- 10: typecheck·lint(경고 0)·check·build(precache ≤640 KiB).

## 변경 사항

- F4 보강 `created`: 서버 push 응답에 새로 INSERT 된 트리 id 를 더하고(`PushResult.created`), 엔진이 그 트리의 outbox 에 없고 이번에 보내지 않은 노드·srs 를 enqueue 한다. 이유: 휴지통 복구(`repo.restoreTree`)는 tree put 1행만 track 하므로 F4 로 휴지통에 간 트리를 복구하면 서버에 빈 트리만 생긴다. "7일 복구 가능" 을 지키려면 필요했고, 서버·엔진 모두 WY 소유라 다른 워커 파일을 건드리지 않았다. 같은 구멍이던 "격리됐던 tree 행이 뒤늦게 통과" 도 함께 닫힌다.
- F7 서버: `touched` 뿐 아니라 적용된 tree put 도 제목 보정 대상에 넣었다(루트 없이 tree 행만 와도 루트가 이기도록, 계약 C7). 제목이 같으면 seq 도 올리지 않는다(처음엔 `nextSeq` 가 인자로 먼저 평가돼 항상 올라갔다 — 단언이 잡아냄).
- F13: 정지 소유자의 트리는 403 `hidden`(관리자 숨김과 같은 코드·소유자/관리자 통과). plan §2 "운영 숨김과 같은 효과" 그대로.
- F12: 인증 실패는 기존 `auth` 버킷(10/분)에 그대로 세어 키 추측을 억제하고, 인증된 웹훅만 `kakao_unlink` 키 600/분.
- F15·F16 은 순수 로직이 아니라(트랜잭션 실패 유도·외부 바이너리) 단언을 추가하지 않았다. runDaily 기존 단언(ok=true)은 통과.
- 검증 추가: 4363 서버에 curl — 3MB POST 413(content-length 경로·chunked 경로 모두), `/t/nope`·`/` 보안 헤더(CSP·COEP 없음), fake OAuth 302 정상, 로그 `/t/:slug`.

## 결과

- typecheck·lint(경고 0)·check(server·account·sync·backup 단언 추가)·build(precache 630 KiB ≤ 640) 통과.
- E2E 영향: 셀렉터·흐름 변경 없음. 서버 응답에 `created` 필드가 늘었을 뿐(기존 필드 불변). 트리 제목이 루트 제목을 따르는 것은 E2E 가 만드는 트리(루트=제목)와 일치.
- 남은 위험: F4 의 410 경로는 IndexedDB 라 단언이 없다(머지 후 E2E `server.spec` 동기화 흐름 + 오케스트레이터 F3 시나리오 확인 권장). `secureHeaders` 의 COOP/CORP same-origin 은 팝업·외부 임베드가 없어 영향 없음을 코드로만 확인.
