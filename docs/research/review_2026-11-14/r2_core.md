# R2 클라이언트 코어·UI 공용 리뷰 (src/core/**, src/ui/**, App·router·main·index.css·vite.config·package.json)

기준 커밋: 작업 트리 2026-11-14. 읽기 전용. `npm run typecheck`·`npx oxlint`·`npm run check` 전부 통과한 상태에서 읽었다. 아래는 코드 추적으로 확인한 것만 적었고, 브라우저 IndexedDB 가 필요한 항목(동기화 엔진)은 node 실행 재현 대신 서버 push/pull 코드(server/sync/push.ts·pull.ts·oauth.ts)와 대조해 경로를 확인했다.

## 핵심 5줄

1. **H1 (데이터 손실)** `sync/engine.ts:239` — push 응답 superseded 를 적용한 직후 고아 복구를 돌린다. 아직 pull 하지 않은 새 부모 아래로 옮겨진 노드를 루트로 끌어내리고 `updatedAt=now` 로 재push 하므로, 다른 기기가 한 구조 변경이 모든 기기에서 되돌아간다. 한 줄 삭제로 고친다.
2. **H2 (교차 계정 노출)** `sync/engine.ts:547`, `me.ts:41` — A 로 로그인된 탭이 열려 있는 상태에서 다른 탭에서 B 로 로그인하면(서버가 세션을 교체, `oauth.ts:93-95`) A 의 엔진이 멈추지 않고 B 쿠키로 push·pull 을 계속한다. `id_taken → reId → 재push` 경로로 A 의 로컬 트리가 B 계정 서버에 생성된다. `stop()` 한 줄 + 서버 측 userId 검증 권고.
3. **M1** `sync/engine.ts:230-241` — 응답이 유실된 push 를 재시도하거나 두 탭이 같은 행을 보내면 서버가 `updatedAt` 동일 행을 superseded 로 돌려(`push.ts:86-89`), 내용이 그대로인데 "다른 기기 변경 반영됨 N건 [내 버전 유지]" 토스트가 뜬다.
4. **M2** `attempts` 경로(types·db·engine·repo)는 클라이언트에 기록 코드가 없어 죽은 코드인데, 서버 `account/product.ts` 의 관리자 지표(백지 완료·K2·활성화율)가 이 테이블을 읽는다. 기록을 넣거나 경로를 지우거나 결정이 필요하다.
5. 그 밖에는 건강하다. 의존성은 전부 쓰이고, 번들 분할(index 223KB / engine 14KB / icons.all 별도 청크)도 의도대로이며, 접근성·모바일 기본(포커스 트랩, aria-live, 44px 표적, 16px 입력)은 지켜져 있다. 죽은 export 는 `getMe` 등 소수다.

## 발견 표

| ID | 심각도 | 분류 | 파일:줄 | 문제 | 고치는 법 | 공수 |
|---|---|---|---|---|---|---|
| H1 | H | 버그·데이터 손실 | `src/core/sync/engine.ts:238-239` | `run()` 은 push → pull 순서다(`:95-97`). push 응답 superseded 로 받은 노드 X 가 서버에선 부모 P 아래인데 P 가 아직 pull 전이면, `applyRemote(sup)` 직후 `rescueOrphans(ch)` 가 X 를 루트 아래로 옮기고 `updatedAt=now` 로 track 한다(`:493-494`). 이어지는 pull 에서 서버의 X(부모 P)는 outbox 의 더 새 로컬 행에 져서(`:442` localWins) 무시되고, 두 번째 `pushAll`(`:98`) 이 X(부모=루트)를 올려 서버·다른 기기 B 의 X 가 전부 루트로 이동한다. 시나리오: B 가 새 노드 P 를 만들고 X 를 그 아래로 옮김 → A 가 오프라인에서 (B 보다 이른 시각에) X 제목만 수정 → A 온라인. 사용자에겐 "복구된 노드 1개를 루트 아래 두었습니다" 만 보인다. 서버는 부모 존재를 검증하지 않으므로(`push.ts:75` 주석) 그대로 저장된다. | `:239` `await rescueOrphans(ch)` 삭제. 고아 복구는 `pullFrom` 마지막 페이지 뒤(`:394`, D1)에만 둔다 — pull 이 P 를 가져오면 고아가 아니고, P 가 서버에서 지워졌으면 그 톰스톤이 트리를 `changed` 에 넣어 거기서 복구된다. `sync(false)`(push 전용) 바퀴에서는 다음 pull(≤60초)까지 고아로 남는데 편집기는 부모 없는 노드를 그리지 않으므로 보이는 피해가 없다. | S |
| H2 | H | 보안·개인정보(계정 간 데이터 이동) | `src/core/sync/engine.ts:547-549`, `src/core/me.ts:41-45` | `onLogin(B)` 에서 `cur(A) !== B` 면 `pendingUser` 만 세우고 **`stop()` 을 부르지 않는다**. `me.ts:41` 도 id 가 바뀔 때 `onLogout` 없이 `onLogin` 만 부른다. 서버 `oauth.ts:93-95` 는 로그인 중인 사용자가 다시 로그인하면 기존 세션을 지우고 교체하고, `LoginPage.tsx` 에 로그인 상태 가드가 없어 `#/login` 으로 B 로그인이 가능하다. 열려 있던 다른 탭의 A 엔진은 60초 poll·visibilitychange(`:44, :62`) 로 B 쿠키를 들고 `POST /api/sync` → 서버 `push.ts:34` 가 A 소유 트리를 `id_taken` 으로 응답 → `reId()`(`:311`) 가 로컬 트리·노드에 새 id 를 주고 track → 다음 바퀴에서 B 계정에 `created`. pull 도 A 의 커서로 B 의 seq 공간을 읽어(대개 410) 전체 재동기화 → "이 기기에만 있던 트리 N개를 계정에 올렸습니다"(`:369-373`). 병합 대화에서 "이전 계정 트리 지우고 시작" 을 눌러도 B 서버에는 이미 복사본이 남는다. 공용 PC·가족 태블릿에서 현실적인 경로다. | (1) `engine.ts:547` `if (cur) {` 다음 줄에 `stop()` 추가(또는 `me.ts:41` 에서 `prevId && id !== prevId` 면 `s.onLogout()` 먼저). (2) visibilitychange 가 `sync()` 와 `refreshMe()` 를 동시에 깨우는 잔여 경쟁은 클라이언트만으로 못 막는다: push 본문에 `userId`(meta) 를 담고 서버가 세션 사용자와 다르면 409 로 거절(R3 영역, 각 1줄). | S |
| M1 | M | 버그·UX | `src/core/sync/engine.ts:230-241`, `server/sync/push.ts:86-89, 126-137` | 서버는 `updatedAt` 이 **같은** 행도 superseded 로 돌려준다. 그래서 (a) 응답이 유실된 push(`ApiError 0` → offline → 재시도) 가 같은 행을 다시 보내거나 (b) 두 탭이 같은 outbox 행을 보내면, `applyRemote` 는 `local.updatedAt === x.updatedAt` 으로 아무것도 안 쓰는데(`:448, :431, :469`) `n` 은 세어져 "다른 기기 변경 반영됨 N건 [내 버전 유지]" 가 뜬다. 버튼을 누르면 `keepMine` 이 멀쩡한 행의 `updatedAt` 을 올려 재push 한다. 모바일 네트워크에서 자주 생길 수 있는 혼란이다. | `n`·`losers` 를 계산하기 전에 `sup.trees/nodes/srs` 를 `cur` 의 `updatedAt` 과 다른 행만 남긴다(3줄). 또는 `applyRemote` 가 실제로 쓴 행 수를 돌려주게 해 `n` 으로 쓴다. | S |
| M2 | M | 죽은 코드 ↔ 서버 의존 불일치 | `src/core/types.ts:84-95`, `src/core/db.ts:13,23,31`, `src/core/sync/engine.ts:18-19,157-160,188-191,332-335,510-515`, `src/core/repo.ts:41-45` | `BlankAttempt`·`db.attempts`·outbox kind `'attempt'` 를 쓰는 코드가 `src/features` 에 한 줄도 없다(grep 0건). 그런데 `server/account/product.ts` 는 `attempts` 로 백지 완료·K2·재현율·활성화율을 계산하므로 관리자 지표가 항상 0 이다. 백지 완료 이벤트는 `logEvent('dnd_attempt_completed')`(로컬 events 테이블)로만 남는다. | 결정 필요. (a) 지표를 살릴 거면 `BlankDndPage.tsx:74` 근처에서 `db.attempts.add({...})` + `track([{kind:'attempt',...}])` 5줄. (b) 안 쓸 거면 클라이언트 attempts 경로 전부 삭제(Dexie `version(3)` 에서 테이블 제외) + 서버 지표에서 attempts 제거. | M |
| L1 | L | 버그(경계) | `src/core/sync/engine.ts:172, 297` | 휴지통 트리가 서버의 더 새 버전에 져서 복원됐을 때 "내 버전 유지" 를 누르면 `keepMine` 이 `deletedAt`(옛 삭제 시각)을 그대로 둔 채 track 하고, `pushOnce` 가 그 옛 `deletedAt` 을 LWW 스탬프로 보내(`:172`) 서버에서 또 진다 → 같은 토스트가 반복된다. | `:172` 를 `item = { id: r.id, deletedAt: r.at }` 로(track 시각이 곧 "지금 다시 지웠다"). 일반 삭제는 `markTreeDeleted` 의 `deletedAt` 과 `r.at` 이 같은 ms 수준이라 동작 변화 없음. | S |
| L2 | L | 단순화 | `src/core/sync/engine.ts:138` | `import('../me').then((m) => (m as { refreshMe?: () => unknown }).refreshMe?.())` — `refreshMe` 는 `me.ts:70` 의 확정 export 다. | `import('../me').then((m) => m.refreshMe())` | S |
| L3 | L | 중복 | `src/core/db.ts:47`, `src/core/repo.ts:12`, `src/core/sync/engine.ts:14` | `Omit<OutboxRow, 'seq' \| 'at'>` 가 세 곳에 따로 정의. | `db.ts` 에 `export type Row = Omit<OutboxRow, 'seq' \| 'at'>` 하나 두고 둘은 import. | S |

보안·개인정보 점검 결과(문제 없음): `api.ts` 는 same-origin 쿠키·JSON 만, `main.tsx:8-12` 오류 보고는 메시지 200자 + 번들 파일명만(UA·IP 없음), `inapp.ts` 는 UA 를 판별에만 쓰고 저장하지 않음, `me.ts:86` `safeReturn` 은 `#/` 해시만 허용(오픈 리디렉트 차단), `Icon.tsx` 의 `dangerouslySetInnerHTML` 은 정적 문자열만 받는다.

성능(Pi 1대)·번들: 엔진은 outbox 500행·900KB 배치, pull 500행 페이지로 서버 LIMITS 안에 있고, `listTreeMeta` 는 쿼리 3회로 N+1 없음. `dist/assets`: index 223KB, db(Dexie+ts-fsrs) 99KB, engine 15KB, icons.all 별도 청크로 메인에 섞이지 않음(grep 확인). 바꿀 것 없음.

접근성·모바일: `Sheet`(role=dialog, 포커스 트랩·복귀, Esc), `TwoStep`(aria-live 문장), `Avatar`(role=img+aria-label), `ThemeToggle`(aria-pressed), `index.css:34,132` coarse 포인터 44px·입력 16px, safe-area 패딩 — 기본 충족. 발견 없음.

## 삭제·단순화 목록

| 대상 | 위치 | 근거 | 조치 |
|---|---|---|---|
| `getMe` | `src/core/me.ts:58` | 호출처 0 (src·server·e2e 전체 grep) | 삭제 |
| `NodeColor` 의 `'yellow'` | `src/core/srs/index.ts:65` | `nodeColor` 가 절대 돌려주지 않고 CSS 에도 `.c-yellow` 없음(`index.css:200` 주석 "yellow 없음") | 유니언에서 제거 |
| `maximize`, `chevronUp`, `arrowLeft`, `loaderCircle` | `src/ui/icons.all.ts` | import 0건 (Rollup 이 청크에서 떨어내므로 번들 영향은 없지만 소스 dead) | 삭제 (재생성 스크립트 목록에서도 제외) |
| `icons.all.ts:6-9` 재수출 `undo2`·`x`·`megaphone` | `src/ui/icons.all.ts` | 9개 파일이 `icons.all` 에서 가져오지만 실체는 `icons.ts` 의 `I.*`. 간접층 1개 | 가져오는 쪽을 `I.undo2` 등으로 바꾸고 4줄 삭제 |
| `export` 키워드만 죽은 것 | `inapp.ts:3 INAPP_RE`, `me.ts:87 loginUrl`, `repo.ts:68 EVENTS_MS`, `srs/index.ts:13 asCard`, `:20 FADE`, `:111 recordGrade`, `router.ts:24 parseHash`, `:45 parseLocation`, `theme.ts:55 setTheme`, `api.ts Role·ApiErrorBody`, `sync.ts SyncState`, `icons.ts IconName` | 파일 안에서만 쓰임. `export` 를 떼면 `noUnusedLocals` 가 앞으로 진짜 dead 를 잡아 준다 | `export` 제거 |
| `--fs-2xl` | `src/index.css:9` | 정의 1곳, 사용 0 | 삭제 |
| `db.version(1)` 블록 | `src/core/db.ts:18-24` | upgrade() 가 없는 과거 버전 선언은 Dexie 3+ 에서 불필요(최신 버전만 선언해도 기존 DB 와 스키마 차이를 맞춘다). 적용 전 Dexie 4 문서 "Dexie.version()" 절에서 한 번 확인 | 7줄 삭제 |
| attempts 경로 | 위 M2 | (b) 를 택하면 types 12줄·db 3줄·engine ~12줄·repo 2줄 + `ALL()` 에서 `db.attempts` 제거 | M2 결정에 따름 |
| `fail()` 캐스트, Row 타입 중복 | L2·L3 | 위 표 | — |

package.json: `dependencies`(dexie·ts-fsrs·react·react-dom·hono·@hono/node-server)·`devDependencies`(playwright·@types/*·plugin-react·oxlint·tsx·typescript·vite·vite-plugin-pwa) 전부 사용 중. 스크립트도 전부 유효. 지울 것 없음.

## 테스트 공백

| 공백 | 지금 상태 | 제안 |
|---|---|---|
| 동기화 엔진 자동 테스트 없음 | `src/core/sync/engine.ts` 592줄에 check 스크립트 0개. e2e 만 간접 통과. `fake-indexeddb` 미설치 | devDep `fake-indexeddb` 1개 추가 후 `engine.check.ts` 하나: (1) H1 — superseded 응답(부모 미도착) 뒤 pull 로 부모가 오면 노드가 루트로 가지 않는지, (2) M1 — 같은 `updatedAt` superseded 는 토스트/변경 0 인지, (3) 410 전체 재동기화의 `trash`/`up` 분류(7일·outbox·held), (4) `reId` 의 parentId·srs·attempts 매핑, (5) `track` 제자리 갱신(seq 유지·at 단조)과 push 후 "보낸 뒤 바뀜" 보존. api 는 `fetch` 스텁으로 |
| 계정 전환(H2) | 없음 | Playwright 한 context 두 page: page1 A 로그인·편집 → page2 `#/login` 으로 B 로그인 → page1 visibilitychange → B 의 `/api/trees` 에 A 트리가 없어야 함 |
| 멀티탭 push 중복 | 없음 | 위 e2e 와 같은 구성으로 두 탭 동시 편집 뒤 outbox 0·토스트 0 |
| `backup.ts` 가져오기 트랜잭션 | `parseBackup`·`planImport` 는 check 있음, `importBackup`(노드 id 충돌 → taken 확장 `:57`) 은 없음 | 위 fake-indexeddb 도입 시 같은 파일에 1 케이스 |
| `me.ts` 상태 전이 | 없음(모듈 전역 + 부수효과) | 우선순위 낮음. H2 수정 뒤 "id 변경 시 onLogout → onLogin 순서" 만 e2e 로 |
