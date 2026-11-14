# S2 보안 검토 — API 권한·입력 검증·주입·DoS

영역: `server/sync/**`(index·push·pull·map·owner·share·seq), `server/account/`(admin·legal·product·ops·daily·backup), `server/db.ts`, `migrations/*.sql`
기준: 2026-11-14 작업 트리. 읽기 전용. 메모리 DB + `applyPush`/`pullSince` 직접 호출 스크립트와 `AUTH_FAKE=1` 서버(포트 4372, curl)로 실제 공격해 재현 여부를 표시했다. 어제 리뷰(`r1_server.md`)가 '문제 없음'으로 적은 항목(IDOR·SQL·CSRF·세션·M3·M4)도 다시 공격했다.

## 핵심 5줄

1. **S2-01 (High) `srs.auto_correct_days` 무제한 병합 DoS** — `parseSrs` 는 한 번에 보내는 배열만 3,660개로 막고(`map.ts:85`), `applyPush` 는 저장된 집합에 **총량 상한 없이** 합친다. 게다가 병합은 LWW 에서 진 superseded 경로에서도 돈다. 40KB 요청을 반복해 한 행을 GB 급으로 키울 수 있다(✔ 재현: 21회 요청에 76,860개·약 1MB). r1 H2 가 `card` 만 막고 이 필드를 놓쳤다.
2. **S2-02 (Medium) 게시중단 reject/resume 이 "무관한 관리자 숨김"을 풀어 버린다(H1 잔여)** — reject 핸들러의 `unhide` 가 `k.hidden_at && isHidden` 만 보고 "지금 숨김이 이 요청 때문인지"는 보지 않는다. 게시중단으로 숨긴 뒤 관리자가 별도 사유(스팸)로 다시 숨기면, 그 게시중단을 기각하는 순간 스팸 숨김까지 풀려 공개로 돌아간다(✔ 재현).
3. **S2-03 (Low→Med) `attempts` 의 `tree_id`·`root_id` 소유권·수치 범위 미검증** — 로그인 사용자가 남의 `tree_id`/`root_id` 와 `nodeRecall=1e308`·`edgeAccuracy=5` 같은 값을 넣을 수 있고(✔ 저장 확인), 이 행들은 관리자 지표(`productMetrics` 의 AVG·median·structure_error)에 전부 합산돼 대시보드 숫자를 오염시킨다.
4. **권한·격리는 견고하다.** 남의 트리/노드/srs 로 읽기·쓰기·덮기 시도는 전부 `id_taken`·`dropped`·404 로 막혔고(✔[2][3][4]), pull 은 `owner_id`/`user_id` 로만 돌려준다(✔[5]). `/api/admin/*` 는 비관리자에 404(✔[7]).
5. **주입·봄은 막혔다.** 동적 SQL 조각은 전부 상수 + 바인딩(LIKE 는 ESCAPE), 깊은 중첩 JSON·1.9MB 문자열은 400 으로 끊기고 프로세스는 살아 있다(✔[10][11]). M3(익명 신고 자동 숨김)·M4(게시중단 임시화)도 실제로 고쳐져 있다(✔[8][12]).

## 위협 모델

| 자산 | 공격자 | 진입점 |
|---|---|---|
| 다른 사용자의 트리·노드·학습 기록(기밀·무결성) | 로그인한 일반 사용자 | `POST /api/sync`(push), `GET /api/sync`(pull), `/api/trees/:id*` |
| 공개 트리의 가용성(공개 상태) | 비로그인·로그인 사용자, 큐를 늦게 보는 운영자 | `/api/t/:slug/report`, `/api/takedown`, 관리자 `takedowns/:id`·`hide`/`unhide` |
| Pi 디스크·CPU(가용성) | 로그인한 일반 사용자 | `POST /api/sync` 본문 필드(특히 `srs.autoCorrectDays`) |
| 관리자 지표·감사의 신뢰성(무결성) | 로그인한 일반 사용자 | `POST /api/sync`(`attempts`) |
| 관리자 기능·파일시스템 | 비관리자, 탈취된 일반 세션 | `/api/admin/*`(requireAdmin 뒤), `ops.ts` 파일 접근·spawn |
| 서버 비밀·백업 | DB·백업 파일 유출 시 | `backup.ts`, 정적·OG 경로 |

자산 특성(비밀번호·이메일·IP 미저장, 운영자 1~2인, Pi 1대 + Cloudflare Tunnel)상 **가용성(단일 Pi 디스크/CPU)과 공개 상태 무결성**이 기밀성보다 현실적 위험이 크다. 발견도 그쪽에 몰렸다.

## 발견 표

| ID | 심각도 | OWASP | 파일:줄 | 공격 시나리오(구체적 요청) | 영향 | 재현 | 고치는 법(가장 짧은 diff) | 공수 |
|---|---|---|---|---|---|---|---|---|
| S2-01 | **High** | A05 오설정·자원 소진 / A04 | `server/sync/push.ts:124-126,136`, `server/sync/map.ts:84-85,95` | 로그인 후 같은 노드에 `POST /api/sync {"srs":[{nodeId,treeId,card,due,updatedAt:1,autoCorrectDays:[3,660개의 서로 다른 유효 날짜]}]}` 를 반복. `updatedAt` 을 과거로 둬 superseded 경로여도 `if (days.length !== prevDays.length) UPDATE srs SET auto_correct_days` 가 매번 집합을 키운다. 300/분 한도 안에서 한 요청(≈40KB)이 행 하나에 3,660개씩 영구 누적. | 한 srs 행의 `auto_correct_days` JSON 이 무제한 증가(디스크 고갈). 매 pull 마다 `srsOut` 이 그 거대한 JSON 을 `JSON.parse`(CPU). r1 H2 의 `card` 상한이 못 막는 형제 결함. | ✔ 1회 push=3,660 → +20회 superseded push=**76,860개·999,181바이트**, 계속 선형 증가 | `parseSrs` 는 1회만 막으므로 병합 지점에 총량 상한: `push.ts` 의 `days` 계산 뒤 `if (days.length > LIMITS.autoDays) days = days.slice(-LIMITS.autoDays)` (또는 애초에 날짜를 저장하지 말고 요약). | S |
| S2-02 | **Medium** | A01 접근통제(상태 전이) | `server/account/legal.ts:129-131` | ① 공개 트리에 `POST /api/takedown`(임시 숨김, `takedowns.hidden_at` 기록) ② 관리자가 별도 사유로 `POST /api/admin/trees/:id/hide`(확정 숨김) ③ 관리자가 `POST /api/admin/takedowns/:id {"action":"reject"}`. `unhide = reject && k.hidden_at && isHidden` 이 참 → `setHidden(false)` 로 ②의 숨김까지 해제. | 관리자가 의도적으로 내린(스팸 등) 트리가, 무관한 게시중단을 기각하는 순간 공개로 복귀. r1 H1 이 접수 시점 double-stamp 는 고쳤으나 **해제 시점의 과잉 판정**이 남음. | ✔ 재현: hide 후 reject → `hidden_by_admin_at` None | reject/resume 이 "이 요청이 만든 숨김"만 풀도록, 접수 때 `hidden_until`(또는 전용 플래그)을 기준으로: `const unhide = (action==='resume'||action==='reject') && tid && k.hidden_at && isHidden(db,tid) && !isConfirmedByOther(...)` — 최소로는 해제 전 "현재 숨김 사유가 이 takedown 인지"(가장 최근 `tree.hide` 감사의 `takedown_id===id`) 확인. | M |
| S2-03 | Low→Med | A04 설계(검증 누락) / A09 | `server/sync/push.ts:143-153`, `server/sync/map.ts:100-108` | 로그인 후 `POST /api/sync {"attempts":[{id,treeId:<남의 트리 UUID>,rootId:<남의 노드>,nodeRecall:1e308,edgeAccuracy:5,...}]}`. `parseAttempt` 는 `treeId`/`rootId` 가 내 트리인지 검사하지 않고, `nodeRecall`·`edgeAccuracy` 는 `num`(유한수)만 통과시켜 범위를 안 본다. | 모든 사용자 `attempts` 를 합산하는 관리자 `GET /api/admin/product/metrics` 의 `AVG(edge_accuracy)`·`structure_error`·`median(node_recall)` 등이 오염(음수·거대값). 가용성 아님·관리자 전용이나 지표 신뢰성 훼손. | ✔ `tree_id`=남의 트리, `node_recall=1e308` 저장 확인[6] | `parseAttempt` 에 범위 검증: `nodeRecall`·`edgeAccuracy` 를 `0..1` 로 clamp 하거나 `bad`. `treeId`/`rootId` 는 적어도 `attempts` 집계가 트리 소유자 조인을 타게 하거나, push 때 내 트리인지 확인. | S |
| S2-04 | Low | A04 입력 검증 | `server/sync/map.ts:95` | `autoCorrectDays` 날짜 정규식 `/^\d{4}-\d{2}-\d{2}$/` 이 달력을 검증하지 않아 `"9999-99-99"` 같은 값도 통과. 유효 문자열 공간이 ≈1억 개로 커져 S2-01 의 상한(서로 다른 날짜 수)을 거의 없앤다. | S2-01 증폭(한 행 최대치가 수천만 개로). 단독으로도 무의미·미래 날짜 저장. | ✔ 정규식상 통과(코드 검토) | 월 `0[1-9]\|1[0-2]`, 일 `0[1-9]\|[12]\d\|3[01]` 로 좁히거나, 애초에 S2-01 수정으로 총량을 막으면 됨. | S |

## 검토했으나 안전(근거 파일:줄)

- **IDOR(트리)**: `/api/trees/:id`·`visibility`·`slug`·`restore`·`delete` 는 모두 `ownTree`(`owner.ts:37-40`)가 `owner_id !== userId → 404`. 존재 누설 없음.
- **IDOR(push 노드·srs·트리·attempts)**: 남의 트리 id 로 트리 push → `myTree` 가 `taken`(`push.ts:32-36`), 남의 노드 id 덮기 → `taken`(`push.ts:78,96`), 남의 노드에 srs → `dropped`(`push.ts:121`), 남의 attempt id → `taken`(`push.ts:145`). ✔[2]insertedRow=0 ✔[3]B의 노드 title·owner 불변 ✔[4]A소유 srs 0행.
- **pull 격리**: `pull.ts:15-19` 전 쿼리가 `owner_id=?`/`user_id=?`. ✔[5] A의 pull 에 B 행 0건.
- **superseded 응답 누설 없음**: superseded 로 돌려주는 `cur` 는 소유권 확인 뒤에만 조회(`push.ts:33-36,122`). 남의 행은 그 전에 `continue`.
- **parentId 가 남의 노드를 가리킴**: `parseNode` 는 UUID 만 보고 저장하나(`map.ts:73`), pull 은 소유자 행만 내려보내 남의 노드는 전달 안 됨 → 누설 없음(클라이언트가 고아를 루트로, `engine.ts:498-503`). 무결성상 저품질이나 보안 영향 없음.
- **관리자 경로**: `requireAdmin`(`http.ts:42-45`) 404, 모든 `/api/admin/*` 가 그 뒤 등록(`admin.ts:190`). 다른 관리자 정지·삭제 상호 잠금(`ops.ts:101-107`), 자기 정지 금지(`admin.ts:231,244`). ✔[7] 비관리자 404 / 관리자 200.
- **SQL 주입**: 갤러리 `q` 는 `LIKE ? ESCAPE '!'` + `[!%_]` 이스케이프(`share.ts:134-135`), 관리자 검색·감사 `LIKE ? ESCAPE '\\'`(`admin.ts:207,392`), `ORDER BY`·동적 열은 상수 삼항/`Object.keys`(`pull.ts:21-25`, `owner.ts:83-92`, `product.ts:83-84`). 값은 전부 바인딩. 주입 없음.
- **프로토타입 오염**: 모든 `parse*` 가 리터럴 키만 읽고, `card` 는 `JSON.stringify` 후 저장(`push.ts:132`). `__proto__` 키가 와도 자체 속성일 뿐.
- **깊은 중첩·거대 문자열 DoS**: `body()` 가 `JSON.parse` 를 try/catch(`http.ts:76-80`), 60,000단 중첩 배열 → 400, 1.9MB title → `text` 길이 검증으로 400(`map.ts:47`). ✔[10][11] 둘 다 400·health 정상.
- **본문 상한**: `bodyLimit(2MB+64KB)`(`index.ts:44`) + `body(LIMITS.bytes)`(`index.ts` 전역) + push 500행(`map.ts:131`). 3MB 신고 본문 → 413(`check.ts`).
- **M3(r1) 재검**: 자동 숨김이 `COUNT(DISTINCT reporter_id ... reporter_id IS NOT NULL)`(`admin.ts:155`). ✔[12] 익명 신고 5건(IP 5개)·임계값 1 에도 숨김 안 됨.
- **M4(r1) 재검**: `/api/takedown` 이 `setHidden(..., now+HOLD_MS)` 로 30일 임시 숨김(`legal.ts:87`), `legalDaily` 가 만료 자동 해제(`legal.ts:32-36`). ✔ 접수 시 `hidden_until` 세팅 확인.
- **접수 상태 열거**: `GET /api/report/:id` 는 UUID 필수, 임의 UUID → 404(`legal.ts:100`), 연락처·트리 미노출(상태만). ✔[9].
- **ops.ts 파일시스템·spawn**: `gitHead`·`admins`·백업 목록은 사용자 입력 없는 상수 경로(`ops.ts:43-55,69,149`), spawn 은 `job in JOBS`(`ops.ts:156`)로 고정 스크립트만, `process.exit` 는 `running` 플래그로 가드(`ops.ts:172`, r1 L2 반영). 경로 조작 불가.
- **CSV 수식 주입**: 감사 CSV `cell()` 이 `^[=+\-@]` 를 `'` 로 접두(`admin.ts:401`).
- **레이트 리밋 키**: 접두사 네임스페이스로 충돌 방지(`report:u:`/`report:ip:`, `http.ts:56-68`). IP 는 Tunnel 뒤 `cf-connecting-ip` 만 신뢰(`http.ts:48`) — 직접 접속 불가 전제.
- **CSRF**: `sec-fetch-site`+`origin`+JSON 3중(`index.ts:49-60`), 카카오 웹훅만 예외(관리 키 timingSafeEqual). ✔ 헤더 없는 교차출처 POST → 403.
- **seq 경쟁**: 단일 프로세스 WAL·`BEGIN IMMEDIATE`(`db.ts:47`)로 직렬화, `nextSeq` RETURNING(`seq.ts:5-8`).
- **마이그레이션**: 번호순 한 트랜잭션씩, 실패 ROLLBACK + 메시지(`db.ts:31-42`), 데이터 있으면 `pre-migrate` 백업(`db.ts:30`). 004 감사 트리거(append-only)·005/006 인덱스는 의도대로.

## 테스트 공백

- **S2-01**: `sync.check.ts` 는 `autoCorrectDays` 병합의 **정확성(합집합)** 만 보고 **총량 상한**은 안 본다. 같은 노드에 유효 날짜를 반복 push 했을 때 `length(auto_correct_days)` 가 한계 안에 머무는지 검증 없음.
- **S2-02**: `account.check.ts:337` 은 H1 의 double-stamp(두 번째가 다시 숨기지 않음)만 본다. "게시중단 숨김 위에 관리자가 독립 숨김을 얹은 뒤 그 게시중단을 reject 하면 관리자 숨김이 유지되는지"는 테스트 없음.
- **S2-03**: `attempts` 의 `tree_id`/`root_id` 가 신청자 소유인지, `nodeRecall`/`edgeAccuracy` 가 `0..1` 범위인지 검증하는 테스트 없음. 관리자 지표가 범위 밖 값에 견디는지도 없음.
- **일반**: 범위 밖 수치(`order`·`offset`·`due` 의 극단값)가 하류(레이아웃·FSRS 곡선)에서 안전한지 서버 테스트 없음. 다만 서버는 그대로 저장만 하므로 서버측 위험은 S2-03 로 수렴.

## 재현 스크립트

- 메모리 DB 직접 호출: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\529f1b4a-fe16-4aab-85ac-905147f508c6\scratchpad\attack.ts` (`node --no-warnings=ExperimentalWarning <경로>`). 출력 [1]~[6].
- HTTP 전 구간: `AUTH_FAKE=1 PORT=4372` 서버에 curl — 관리자 게이팅[7], 게시중단/숨김 상호작용[8], 접수 상태[9], JSON 봄[10]·거대 문자열[11], 익명 자동 숨김[12]. 저장소 변경·`npm run e2e` 없음.
