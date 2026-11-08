# 04 — 트리 저장·동기화·공개 범위·공유 링크·복제 (SH)

작성 2026-11-08 · plan [`orchestration_redesign.md`](../plans/orchestration_redesign.md) R10 · 에이전트 plan [`agent_SH_sharing.md`](../plans/agent_SH_sharing.md) · 증거 [`evidence/sh/`](evidence/sh/)
근거 등급: **[결정]** 이 문서가 정함 / **[제안]** 오케스트레이터 확인 필요 / **[가정]** 확인 안 됨 / **[출처 n]** §7 / **[코드]** 현재 코드 사실. 공수 S(반나절)·M(1~2일)·L(3일+).

## 1. 목적과 범위

담당 요구사항은 R10 하나다: 로컬 우선을 유지하면서 로그인 사용자의 트리를 서버에 저장해 여러 기기에서 맞추고, 트리마다 `private / unlisted / public` 공개 범위를 두며, `/t/<slug>` 공유 보기에서 로그인 없이 열람·플래시·빈칸·백지 퀴즈와 "내 트리로 복제"를 제공한다 [결정]. 공동 편집·트리 마켓·원본 갱신 자동 반영은 범위 밖이다 [출처 7 decisions 4].
decisions 4는 "오프라인 편집 동기화"도 MVP 제외로 적었다. plan R10의 "여러 기기 동기화"는 오프라인 동안 쌓인 편집의 전송을 함의하므로 이 문서는 전체(outbox·LWW·톰스톤)를 설계하되, 구현 범위(온라인 push-only로 시작 vs 전체)는 사용자 결정 D4(§6 Q7)로 남긴다 [결정, RV M14].
이 문서가 소유하는 서버 테이블은 `trees` `nodes` `srs` `attempts`다 [결정, plan §3.3]. `users` `sessions` `audit_log`와 로그인 UX·관리자 화면은 AA(03) 소유이며, 경계는 §3.12 "타 문서 의존" 표에 적었다.

## 2. 결정 요약표

| 항목 | 결정 | 대안(기각 이유) | 근거 |
|---|---|---|---|
| 저장 기준 | 로컬 Dexie가 진실, 서버는 로그인 사용자의 백업·여러 기기·공유용. 비로그인은 지금과 같이 로컬만 | 서버 우선(오프라인 학습 불가, Pi 장애 = 서비스 중단) | plan A10, [출처 8] 11 §2.2 "오프라인 큐 우선순위 상향" |
| 동기화 단위 | 엔티티(트리·노드·srs 1행) 단위 변경 전송, LWW(`updatedAt`), 삭제 톰스톤, 사용자 단위 `seq` 커서 | 트리 전체 스냅샷(동시 편집 시 한쪽 통째로 유실, 키 입력마다 75KB) / CRDT(공동 편집 없음, 번들 증가로 R5 위배) | §3.1, [`conflicts.md`](evidence/sh/conflicts.md), [코드] `TreeNode.updatedAt`이 모든 편집에서 갱신됨 |
| 변경 큐 | Dexie v2 `outbox` 테이블. `repo.ts`·`srs/index.ts`의 쓰기 트랜잭션 안에서 기록, 엔티티당 1행으로 합침 | 메모리 큐(새로고침 시 유실) / 쓰기마다 즉시 fetch(오프라인 처리 불가) | §3.1 |
| 동기화 대상 | `trees` `nodes` 필수, `srs` 포함(여러 기기 복습), `attempts` 업로드만, `events` **서버 미저장**(로컬 유지) | events 포함(사용자당 연 750KB, 소비 화면 없음, 개인정보 최소화 위배) | §3.2, [`capacity.md`](evidence/sh/capacity.md) §2 |
| 공개 범위 | `private`(기본) / `unlisted`(링크) / `public`(갤러리). private로 돌리면 slug 회수 | slug 영구 유지(RemNote식, "비공개로 바꿨는데 링크가 산다"는 오해) | §3.3 |
| slug | 11자 base58, 서버 CSPRNG, ≈64.4비트 | 짧은 6~8자(열거 가능), UUID 노출(36자, 추측은 안 되나 복사 불편) | [출처 4] OWASP 64비트 |
| 공유 보기 URL | 경로 `/t/<slug>`를 서버가 HTML로 서빙(OG 메타 주입), 클라이언트 라우터가 `pathname`도 읽음 | 해시 `#/t/<slug>`만(크롤러에 해시가 안 가 미리보기 불가) | §3.4 |
| URL 해시 압축 전송 | **기각**(MVP). 측정 300노드 4~9천 자, 미리보기 불가, 메신저 상한 미확인 | 채택(서버 없이 공유) | §3.4.4, [`capacity.md`](evidence/sh/capacity.md) §5 |
| 복제 | copy-on-import: 클라이언트가 새 id 발급, `sourceTreeId` 계보, SRS 비움. 서버는 복제 수만 센다 | 서버 측 복제(로그인 필수, 비로그인 체험 불가) | [출처 9] 04_tech §4 |
| 비로그인 학습 기록 | 저장 안 함(세션 메모리만). 복제하면 그때부터 기록 | 로컬 임시 저장(복제 전 기록 승계 로직 추가, 범위 대비 이득 작음) | §3.4.2 |
| 갤러리 | 최소형(최근·복제 수 정렬, 검색 없음) + 신고(⋯ 메뉴, 테이블·API는 AA 소유). **운영 여부는 사용자 결정** | 전체 검색·태그(운영 부담, 콘텐츠 없음) | §3.5, plan 미결 |
| 삭제 | 확인창 없음 + 되돌리기 토스트 10초. **로컬도 소프트 삭제**(`Tree.deletedAt`, 목록에서 숨김, 7일 보존 뒤 앱 시작 시 하드 삭제 — 2026-11-09 Q6 개정). 로그인 사용자는 서버 소프트 삭제 **7일 유예** → 복구 API | `confirm()` 유지(LM D9와 충돌) / 즉시 영구 삭제(C11 유실 복구 불가) | §3.1·§3.3·§3.10, RV H2·M1 |
| 첫 로그인 병합 | 로컬 트리 **모두 올리기**(확인 1회), id 충돌 시 재발급 | 트리 선택 UI(공수 M 추가, 사용자가 나중에 지우면 됨) | §3.8 |
| 구현 순서 | ① 서버 저장+첫 로그인 병합 M → ② 공유 링크 M → ③ 두 기기 동기화·srs·충돌 UI L → ④ 갤러리 S | — | §3.11 |

## 3. 상세 설계

### 3.1 저장·동기화 모델 [R10-1]

**원칙** [결정]
1. 모든 화면은 지금처럼 Dexie만 읽고 쓴다. 동기화는 `repo.ts`의 쓰기 함수와 `srs/index.ts`의 `recordGrade` 안에서 `outbox`에 한 행을 남기는 것으로 시작하고, 별도 모듈 `src/core/sync.ts`(신규)가 큐를 비운다. 화면 코드는 상태 표시(§3.10) 말고는 바뀌지 않는다.
2. `meta.userId`가 비어 있으면(비로그인) outbox를 쓰지 않는다. 첫 로그인 때 전체 업로드로 대신한다(§3.8). 이렇게 해야 비로그인 사용자의 IndexedDB가 큐로 불어나지 않는다.
3. 서버는 행을 받을 때마다 사용자 단위 단조 증가 `seq`를 매긴다. 클라이언트는 `meta.cursor`(마지막으로 받은 seq)로 pull한다. 커서는 사용자 1개다: 트리별 커서(`/api/trees/:id/changes?since=`)는 트리 수만큼 요청이 필요하고 다른 기기에서 **새로 만든 트리**를 발견하지 못해 기각했다 [결정].

**Dexie 버전 2** [결정] (현재 `db.version(1)` 5테이블 [코드])
```ts
db.version(2).stores({
  trees: 'id, updatedAt, slug',          // Tree에 visibility?·slug?·sourceTreeId? 필드 추가(선택 필드라 upgrade() 불필요)
  nodes: 'id, treeId, parentId',         // 변경 없음
  srs: 'nodeId, treeId, due',            // 변경 없음
  events: 'id, ts, type, treeId',        // 변경 없음
  attempts: 'id, treeId, completedAt',   // 변경 없음
  outbox: '++seq, &[kind+id]',           // 신규. 엔티티당 1행(복합 유니크)
  meta: 'key',                           // 신규. userId · cursor · lastSyncAt · lastSyncError
})
```
Dexie는 버전 블록에 바뀐 테이블만 적어도 되지만 공식 예제는 전체를 반복한다 [출처 5]. 전체를 반복한다(읽기 쉬움, 누락 사고 없음) [결정]. 새 선택 필드만 추가하므로 `upgrade()` 콜백은 없다 [결정].

```ts
interface OutboxRow { seq?: number; kind: 'tree' | 'node' | 'srs' | 'attempt'; id: ID; treeId: ID; op: 'put' | 'del'; at: number }
interface MetaRow { key: 'userId' | 'cursor' | 'lastSyncAt' | 'lastSyncError'; value: string | number | null }
```
outbox에는 페이로드를 넣지 않는다. 비울 때 현재 행을 읽어 보내므로 같은 노드를 100번 고쳐도 1행·1전송이다 [결정]. `del`은 행이 이미 없으므로 `id`·`treeId`·`at`(삭제 시각 = 톰스톤 `deletedAt`)만 있으면 된다.

**쓰기 훅 위치** [코드] → [결정]
| 함수 | 현재 하는 일 | 추가되는 outbox 행 |
|---|---|---|
| `createTree` | trees.add + 루트 nodes.add | tree put, node put |
| `renameTree` | trees.update + 루트 nodes.update | tree put, node put |
| `deleteTree` → **3개로 분리**(RV H2): `markTreeDeleted(id)` = `trees.update({deletedAt: now})`(목록에서 숨김) / `restoreTree(id)` = `deletedAt` 제거 / `purgeDeletedTrees()` = `deletedAt < now−7일` 인 트리의 trees·nodes·srs·attempts 하드 삭제(목록 진입 시 호출, Q6 개정) | 현재는 즉시 하드 삭제 | `markTreeDeleted`: tree del **1행만**(서버가 트리 톰스톤으로 하위를 가린다. 노드 300개 톰스톤을 만들지 않음). `restoreTree`: tree put(서버는 7일 이내 `deleted_at=NULL`). `purge`: outbox 없음 |
| `putNodes` | nodes.bulkPut + trees.updatedAt(루트면 title) | node put × n, tree put |
| `deleteNodes` | nodes·srs bulkDelete + trees.updatedAt | node del × n(srs는 서버 cascade), tree put |
| `addAlias` | putNodes 경유 | (putNodes가 처리) |
| `srs/index.ts` `recordGrade` | srs.put | srs put |
| `attempts` 쓰기 | **현재 쓰는 코드 없음**[코드] — 테이블·타입(`BlankAttempt`)만 있고 `db.attempts.add`를 부르는 곳이 `src/`에 없다(`deleteTree`의 삭제만 있음) | 쓰기가 생길 때 `repo.ts`에 `addAttempt()`를 두고 거기서 attempt put(화면이 `db.attempts`를 직접 만지지 않게) |
| `events.ts` `logEvent` | events.add | 없음(§3.2) |

**push** [결정] — `POST /api/sync`. 디바운스 2초, 500행 또는 1MB 단위, 트리 → 노드 → srs → attempts 순서(서버 FK 만족). 응답의 `superseded`(서버 버전이 이긴 행)는 outbox 없이 로컬에 put하고 토스트 "다른 기기 변경 반영됨 n건 · 내 버전 유지"를 띄운다. "내 버전 유지"는 보관해 둔 패자 행을 `updatedAt=now`로 다시 put해 되돌린다(LWW를 역이용) [결정]. 트리거: 쓰기 후 2초, `online`, `visibilitychange→visible`, 앱 시작.
**pull** [결정] — `GET /api/sync?since=`. 트리거: 앱 시작, 포커스 복귀, 화면이 보이는 동안 60초 폴링, push 직후는 생략(push 응답 seq가 커서를 올림). WebSocket·SSE는 쓰지 않는다: Pi 1대·터널에서 유휴 연결 수천 개를 유지할 이유가 없고 60초 지연은 "폰에서 고치고 PC에서 이어 쓰기" 사용 사례에 충분하다 [결정]. 적용 규칙과 고아 처리는 [`sequences.md`](evidence/sh/sequences.md) S2.
**LWW 비교 키** [결정] — `updatedAt`(클라이언트 epoch ms). 서버는 `updatedAt > serverNow + 5분`이면 `serverNow`로 깎는다(시계가 앞선 기기가 영원히 이기는 것 방지). 삭제도 `deletedAt`을 같은 키로 비교하는 쓰기다. 동률은 먼저 도착한 쪽.
**삭제 유예와 톰스톤** [결정] — 복구 가능 기간(유예)과 톰스톤 보존 기간은 **둘 다 7일**이다(AA 탈퇴 유예와 동일, RV M1, AA 3차 요청). AA 일일 작업이 SH `purgeTombstones()`를 불러 `deleted_at`이 7일 지난 trees 행과 그 nodes·srs·attempts, 그리고 `deleted_at`이 7일 지난 nodes·srs 행을 물리 삭제한다. 커서 만료 기준도 7일이다: 마지막 pull이 7일보다 오래된 기기는 410 `cursor_expired` → outbox를 먼저 비우고 `since=0` 스냅샷을 받는다(C18). 두 값을 하나로 묶은 비용: 7~30일 꺼져 있던 기기도 스냅샷과 "이 기기에만 있는 트리" 확인(§3.8 M4)을 거친다. 숫자 하나·작업 하나가 운영상 더 단순해서 이 비용을 받아들인다. 30일 톰스톤 안(내용만 7일에 비우기)은 기각했다.
**충돌 시나리오** — 20개 시나리오와 기대 결과: [`evidence/sh/conflicts.md`](evidence/sh/conflicts.md). 요약: 제목·이동·삭제·순서·삭제된 부모 아래 삽입·트리 삭제 vs 노드 수정·srs 동시 채점·시계 편차·id 충돌·커서 만료가 모두 "엔티티 LWW + 톰스톤도 쓰기 + 고아는 루트로" 세 규칙으로 결정된다. 유일한 데이터 보강 코드 변경은 `childrenOf`의 정렬을 `(order, id)`로 안정화하는 1줄이다(C4·C5).

### 3.2 무엇을 동기화하나 [R10-2]

| 테이블 | 포함 | 방향 | 충돌 규칙 | 이유 | 용량(사용자당, [`capacity.md`](evidence/sh/capacity.md)) |
|---|---|---|---|---|---|
| `trees` | **필수** | 양방향 | 행 LWW. `visibility`·`slug`는 서버가 진실(전용 API로만 변경, §3.3) | 트리 목록 자체 | 5행 ≈ 1KB |
| `nodes` | **필수** | 양방향 | 행 LWW + 고아 → 루트 | 편집 내용 | 1,500행 ≈ 350KB |
| `srs` | **포함** [결정] | 양방향 | 행 LWW(card·due·lastGradeSource·lastStructure·pendingRecheck·miss) + `autoCorrectDays` **합집합** | R4 #13의 사용 사례가 "지하철 폰 복습 + PC 편집"이라 복습 상태가 안 맞으면 기능 의미가 없다 [출처 1]. FSRS 카드는 리뷰 로그를 재생하지 않는 한 두 카드를 합칠 수 없으므로 행 단위 LWW로 1회 복습 손실을 허용한다(C13). `autoCorrectDays`는 "서로 다른 날짜에 자동 정답"이라는 사실의 집합이라 합집합이 맞다. `miss`도 LWW(차이를 더하면 두 기기가 번갈아 복습할 때 폭주) | 750행 ≈ 323KB |
| `attempts` | **업로드만** [결정] | 클라→서버 | append-only, PK 중복은 무시 | 백지 1회당 1행으로 작고(120B), 대시보드(R4 #4)가 생길 때 서버에서 집계할 수 있다. 내려받지 않는 이유: 소비 화면이 아직 없음. 주의: 현재 코드는 이 테이블에 **쓰지 않는다**[코드] — 서버 테이블은 미리 만들되 데이터는 백지 퀴즈가 기록을 시작할 때부터 | 연 100행 ≈ 12KB |
| `events` | **서버 미저장** [결정] | — | — | 활성일 50건 × 150B = 사용자당 연 750KB로 `nodes`보다 크고, 소비 화면이 없으며, 11 §6 최소 수집 원칙에 맞다 [출처 8]. 현재의 로컬 내보내기(⤓)는 유지. 대시보드 설계 때 재검토 | 0 |

### 3.3 공개 범위 [R10-3]

**상태** [결정]: `visibility ∈ {private, unlisted, public}` + 직교 플래그 `deleted_at`(소유자 삭제), `hidden_by_admin_at`(AA 요청 필드, 관리자 숨김). 기본 `private`. 복제본은 항상 `private`로 시작.

**상태 전이표** (빈칸 없음) [결정]
| 현재 → 다음 | 허용 주체 | 조건 | 서버가 하는 일 | 링크 `/t/<slug>` | 갤러리 | 캐시 |
|---|---|---|---|---|---|---|
| private → unlisted | owner | 오프라인 아님 | slug 없으면 발급. `seq++` | 열림 | 없음 | 해당 없음(새 URL) |
| private → public | owner | title 비어있지 않음, 노드 ≥ 3, `hidden_by_admin_at` NULL, 첫 공개 시 저작권·신고 고지 동의 1회(`users` 아닌 클라이언트 localStorage `publicNoticeAck`, AA 의존 아님) | slug 없으면 발급 | 열림 | 등재 | 갤러리 목록 60초 캐시 |
| unlisted → public | owner | 위와 같음 | slug 유지 | 열림(같은 URL) | 등재 | 갤러리 60초 |
| unlisted → private | owner | — | **slug = NULL(회수)** | 404 | 없음 | HTML 60초 캐시에 제목만 남을 수 있음(JSON은 no-store라 내용은 즉시 차단) |
| public → unlisted | owner | — | slug 유지 | 열림 | 제외 | 갤러리 60초 |
| public → private | owner | — | slug 회수 | 404 | 제외 | 위와 같음 |
| (any) → 링크 재발급 | owner | unlisted·public | 새 slug, 옛 slug는 즉시 404(재사용 금지 테이블 불필요: 64비트 공간) | 새 URL | 유지 | 옛 HTML 60초 |
| (any) → deleted | owner | — | `deleted_at=now`, slug **유지**(복구 대비), 7일 뒤 행 전체 물리 삭제(`purgeTombstones`, §3.1) | 410 "삭제된 트리"(7일) → 404 | 제외 | JSON 즉시 차단 |
| deleted → (이전 visibility) | owner | 7일 이내 | `deleted_at=NULL` (`POST /api/trees/:id/restore`) | 복원 | 이전이 public이면 재등재 | — |
| (any) → hidden | admin | 신고 처리 | `hidden_by_admin_at=now`(AA `audit_log` 기록은 AA) | 403 "운영 정책으로 숨김"(소유자에게는 배너와 함께 보임) | 제외 | JSON 즉시 차단 |
| hidden → (any) | admin만 | — | `hidden_by_admin_at=NULL` | 복원 | 복원 | — |
| hidden 상태에서 owner가 visibility 변경 | owner | 허용(private로 돌릴 수 있어야 함) | visibility만 변경, hidden 유지 | 계속 403 | 제외 | — |

**slug 규칙** [결정]
- 11자, 알파벳 base58(`123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`, 0·O·I·l 제외 — 구두 전달·손입력 오류 방지). 58^11 ≈ 2^64.4 → OWASP 세션 ID 최소 엔트로피 64비트 충족 [출처 4]. 서버 `crypto.randomBytes`에서 생성, UNIQUE 충돌 시 재시도(확률 무시 가능).
- 추측 난이도: 유효 slug 5천 개(1천 명 × 5트리) ÷ 2^64 ≈ 2.7×10⁻¹⁶/시도. `/api/t/*` 60회/분/IP 제한에서 기대 적중 시간 ≈ 1.2×10⁸년 [계산, §5(c)]. 404와 410·403의 응답 시간을 같게 한다(존재 여부 누설 방지) [결정].
- 재발급은 소유자 명시 동작만. private 전이 시 자동 회수(위 표).
- URL은 `https://<domain>/t/<slug>`뿐. 제목 슬러그(`/t/<slug>/근로기준법`)는 넣지 않는다(한글 URL 인코딩이 메신저에서 길어지고, slug만으로 충분).

**소유자가 트리를 지우면**: 7일간 410(제목 없이 "삭제된 트리입니다"), 이후 404. 이미 복제한 사람의 복제본은 영향 없음(C20). 소유자가 계정을 탈퇴하면 AA의 탈퇴 흐름이 `softDeleteTreesOfUser(ownerId)`로 `deleted_at`을 일괄 설정하고, 7일 내 재로그인(탈퇴 취소)이면 `restoreTreesOfUser(ownerId, since)`로 되돌린다. `since`는 `users.deleted_at`이다. 일괄 삭제 시각이 트리 `deleted_at`과 같으므로 `deleted_at >= since`인 행만 되살리면, 탈퇴 전에 사용자가 직접 지운 트리는 지운 채로 남는다(AA 의존 D3).
**저작권·신고 고지** [결정]: 첫 public 전환 시 1회 "공개하면 누구나 열람·복제할 수 있습니다. 타인의 교재·강의 목차를 그대로 올리면 신고로 숨김 처리될 수 있습니다." 공유 보기 하단에 "신고" 링크(§3.5). 숨김은 AA가 요청한 `hidden_by_admin_at`을 내 스키마에 넣어 수용한다(§3.6).

### 3.4 공유 보기 `/t/<slug>` [R10-4]

**3.4.1 서버 서빙과 OG** [결정]
- 별도 프록시 없음(AA: Caddy/nginx 제외, RV M5). AA의 Node 1프로세스(Hono)에 `GET /t/:slug` 라우트(SH 핸들러)를 정적 서빙보다 먼저 등록한다. 핸들러는 기동 시 읽어 둔 `dist/index.html`의 `<head>` 자리표시자(`<title>`·OG)를 치환해 돌려준다. 정적 파일 `/*`는 같은 프로세스의 정적 서빙(AA §3.1)이다. 넣는 태그: `og:title`(트리 제목), `og:description`("노드 N개 · 플래시카드·빈칸·백지 퀴즈 — Drill Down"), `og:url`(= 요청 URL, 카카오 체크리스트가 og:url 불일치를 실패 원인으로 든다 [출처 3]), `og:image`(정적 1200×630 PNG 1장, 2:1에 가깝게 중앙 배치 — 카카오는 800×400 2:1로 크롭 [출처 3], 슬랙은 1200×630 권고 [출처 6]), `og:type=website`, `twitter:card=summary_large_image`, `<link rel=canonical>`, unlisted면 `<meta name=robots content=noindex>`.
- 트리 내용으로 OG 이미지를 그리지 않는다(Pi CPU·캐시·폰트 서브셋 부담, R5) [결정]. 제목은 텍스트 태그로 충분.
- 캐시: HTML `Cache-Control: public, max-age=60, stale-while-revalidate=600`(Cloudflare 엣지 캐시 허용). 트리 JSON `GET /api/t/:slug`는 `private, no-store`. 그래서 private 전환 뒤 60초 동안 제목만 보일 수 있고 내용은 즉시 막힌다(§3.3). Cloudflare 퍼지 API 호출은 넣지 않는다(S 절약, 60초 허용) [결정].
- 크롤러 조건 [출처 3]: 200 응답, 80/443 포트, `og` 태그 존재, 봇 UA `facebookexternalhit/1.1;kakaotalk-scrap/1.0` 차단 금지. 슬랙은 OG·Twitter Card 메타를 읽는다 [출처 6]. 레이트 리밋에서 알려진 크롤러 UA는 제외한다.
- PWA 서비스 워커: `navigateFallbackDenylist: [/^\/api/, /^\/t\//]`(AA 값으로 통일, RV L14). `/t/*`를 제외하는 이유: 오프라인에서 서비스 워커가 캐시한 셸을 돌려주면 OG 없는 빈 셸이 뜨고, 어차피 `/api/t/:slug` 네트워크가 필요하다 [결정].

**3.4.2 클라이언트 라우트** [결정] — 현재 `parseHash`는 해시만 읽는다 [코드 `router.ts`]. 변경:
```ts
export type Route = ... | { name: 'shared'; slug: string; mode: 'view' | Mode; rootId?: string }
export function parseLocation(loc: Location): Route {
  const m = /^\/t\/([1-9A-HJ-NP-Za-km-z]{11})$/.exec(loc.pathname)
  if (m) { const q = new URLSearchParams(loc.search); return { name: 'shared', slug: m[1], mode: (q.get('m') as Mode) ?? 'view', rootId: q.get('root') ?? undefined } }
  return parseHash(loc.hash)
}
export const href = { ...,
  shared: (slug: string, mode?: Mode, rootId?: string) => `/t/${slug}${mode ? `?m=${mode}${rootId ? `&root=${rootId}` : ''}` : ''}` }
```
`useRoute`는 `hashchange`에 더해 `popstate`를 듣는다. 공유 보기 안의 모드 전환은 `history.pushState`로 `?m=`만 바꾼다(해시를 쓰면 복사한 URL이 `#/...`가 되어 재공유 시 OG가 빠진다). 공유 보기에서 "내 트리"로 나가는 링크는 기존 `#/`.
**읽기 전용 소스**: 플래시·빈칸·백지 페이지는 지금 `getTreeNodes(treeId)`·`getSrsMap`·`recordResult`를 직접 부른다 [코드]. 공유 보기는 `GET /api/t/:slug`의 노드 배열을 메모리에 들고 같은 컴포넌트를 쓰되, 데이터 소스를 prop(`source: { nodes, srs: Map, record(nodeId, ok) }`)으로 주입한다. 기본 구현은 Dexie(현재 동작), 공유 보기 구현은 메모리 Map(`record`는 Map만 갱신). 학습 기록은 **저장하지 않는다** [결정]: 비로그인 체험은 "맛보기"이고, 복제하면 그때부터 로컬에 기록된다. 로컬 임시 저장 후 복제 때 승계하는 대안은 공수 M을 더해 기각.
**편집 금지**: 공유 보기에는 에디터 모드가 없다(`m=edit` 무시). 노드 제목·메모·별칭은 보이되 입력 불가.

**3.4.3 내 트리로 복제** [결정]
- 클라이언트가 `GET /api/t/:slug` 결과로 로컬 트리를 만든다: 새 `treeId`, 모든 `nodeId` 재발급(parentId 매핑), `updatedAt=now`, `Tree.sourceTreeId = 원본 id`, `visibility='private'`, `slug=null`, `offset`·`width`·`collapsed`는 유지(저자의 배치가 학습에 도움), `aliases`·`note` 유지. SRS·attempts는 비움.
- 로그인 상태면 `createTree`/`putNodes` 경로를 타므로 outbox가 자동으로 서버에 올린다. 비로그인은 로컬에만 남고 첫 로그인 병합 때 올라간다.
- `POST /api/t/:slug/copy`를 응답 무시로 호출해 `copy_count`를 올린다(갤러리 정렬용, 20회/일/IP).
- 원본 갱신 반영은 **범위 밖**임을 복제 직후 토스트에 적는다: "복제됨 · 원본이 바뀌어도 이 트리는 바뀌지 않습니다". `sourceTreeId`는 나중의 "원본 업데이트 확인" 기능을 위한 계보일 뿐이다 [출처 9].
- 복제본 노드에 `sourceNodeId`(04_tech 초안)는 넣지 않는다: 노드 단위 통계·diff 병합은 범위 밖이고 `TreeNode` 계약 변경을 늘린다 [결정].

**3.4.4 URL 해시 압축 전송(R4 #10) — 기각** [결정]
- 측정([`capacity.md`](evidence/sh/capacity.md) §5): 300노드를 id 없는 축약 포맷으로 deflate+base64url 하면 어휘 반복이 많은 트리 922자, 무작위 음절 상한 8,935자. 실제 트리는 4~7천 자로 본다 [가정]. 30노드는 650~2,400자.
- 브라우저는 통과한다: Chromium 프로세스 간 URL 상한 2MiB [출처 1]. IE의 2,083자는 폐기 브라우저 값이고, "2,000자 이하가 안전"은 서버·프록시 포함 실용 권고다 [출처 2].
- 기각 이유 ① 해시는 서버로 가지 않아 메신저 미리보기(제목·이미지)가 불가능하다 — 공유 링크의 유입 효과(R4 #10 "시드 트리 체험 유입")가 사라진다. ② 카카오톡·슬랙의 URL 길이 상한은 공식 문서에서 확인하지 못했다(S3·S6에 없음) → 수천 자 URL이 잘리거나 링크 인식이 안 될 위험을 검증 없이 감수할 수 없다. ③ 로컬 우선 + 서버 공유 구조에서 비용 절감 효과가 작다(Pi 1대로 충분, §3.9).
- 남길 것: 30노드 이하 소형 트리의 "서버 없는 링크"가 필요해지면 같은 축약 포맷을 `#/import=<base64url>`로 붙일 수 있다(미리보기 없음 명시). 지금은 만들지 않는다.

### 3.5 갤러리(public 목록) [미결 포함]

**최소 형태** [제안]: `GET /api/gallery?sort=recent|copies&page=1` → 20건/페이지, 항목 `{slug, title, nodeCount, copyCount, ownerNickname, updatedAt}`. 정렬 2가지, 검색·태그·카테고리 없음. 서버 60초 캐시. 조건 `visibility='public' AND deleted_at IS NULL AND hidden_by_admin_at IS NULL`.
**운영 부담**: 신고 처리(AA 관리자 화면 R9), 저작권 분쟁(교재 목차 그대로 올리기), 스팸(링크 홍보 트리). 1천 명 규모에서 월 수 건으로 본다 [가정].
**신고 — AA 의존** (RV H1: 테이블·API·처리 화면 모두 AA 소유로 확정)
| 항목 | 값(AA 확정) | SH 쪽 역할 |
|---|---|---|
| 경로 | `POST /api/t/:slug/report { reason, note?: ≤300자 }` — slug 기반이라 tree id 비노출 | 공유 보기 ⋯ 메뉴에서 호출(§3.10) |
| 리밋 | anon IP당 5/시(메모리 카운터만, 저장·로그 없음) · user 20/시 | — |
| 저장 | AA `reports(id, tree_id, reporter_id NULL, reason, note, created_at, resolved_at, resolution)` — `ip_hash` 없음 | slug → `tree_id` 변환은 SH `trees` 조회 |
| 처리 | 관리자가 `trees.hidden_by_admin_at` 설정/해제 | 필드는 SH DDL(§3.6) |
**사용자 결정으로 남길 점**(§6 Q1): 갤러리를 켤지. 끄면 `public`은 "링크 + 검색 엔진 색인 허용(noindex 없음)"만 뜻하고 갤러리 화면·신고 처리 화면이 빠져 공수 S + AA 공수가 준다. 켜면 시드 트리 40개(decisions 3)의 배포 채널이 생긴다.

### 3.6 서버 스키마와 API [R10-6]

**DDL** [결정] — 서버는 AA가 정한 Node 1프로세스 + `node:sqlite`(WAL)다(RV M5). 아래는 타입을 또렷이 적기 위한 Postgres 표기이고, 실제 `server/schema.sql`은 다음 치환표로 옮긴다(SQLite 타입 친화성에 기대지 않고 명시, RV L7). 배열·JSON 연산자는 쓰지 않는다.
| Postgres 표기 | SQLite(`node:sqlite`) | 비고 |
|---|---|---|
| `uuid` | `TEXT`(36자 소문자 UUID 문자열) | NUMERIC 친화성에 맡기지 않고 TEXT 명시. 행 크기 실측에 반영(§3.9) |
| `jsonb` | `TEXT`(JSON 문자열) | 클라이언트가 `JSON.parse`. 필요하면 `CHECK (json_valid(col))` |
| `bigint` / `integer` / `smallint` | `INTEGER` | epoch ms는 64비트 INTEGER 안 |
| `boolean` | `INTEGER` 0/1 | |
| `double precision` / `real` | `REAL` | |
| 부분 인덱스 `WHERE …`, `UPDATE … RETURNING`, `CHECK` | 그대로 지원 | [출처 11, 12] |
| `REFERENCES … ON DELETE CASCADE` | 그대로. `node:sqlite`의 `enableForeignKeyConstraints`가 기본 **켜짐**인 것을 전제 | [출처 11] |
| `user_seq` 발급 | `UPDATE user_seq SET seq = seq + 1 WHERE user_id = ? RETURNING seq` — 단일 프로세스·WAL이라 직렬화됨 | |
```sql
CREATE TABLE trees (
  id                 uuid PRIMARY KEY,                       -- 클라이언트 생성 UUID
  owner_id           uuid NOT NULL REFERENCES users(id),
  title              text NOT NULL,
  visibility         text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','unlisted','public')),
  slug               text UNIQUE,                            -- NULL = 링크 없음. 11자 base58
  source_tree_id     uuid,                                   -- 복제 계보(FK 아님: 원본이 지워져도 남김)
  node_count         integer NOT NULL DEFAULT 0,             -- 공유 보기 OG·갤러리용 비정규화(push 때 갱신)
  copy_count         integer NOT NULL DEFAULT 0,
  created_at         bigint NOT NULL,                        -- epoch ms (클라이언트 값 그대로 — LWW 비교와 동일 단위)
  updated_at         bigint NOT NULL,
  deleted_at         bigint,                                 -- 소유자 삭제(7일 유예 = 톰스톤 보존)
  hidden_by_admin_at bigint,                                 -- AA 요청 필드(관리자 숨김)
  seq                bigint NOT NULL                         -- 사용자별 변경 순번(아래 user_seq)
);
CREATE INDEX trees_owner_seq ON trees(owner_id, seq);
CREATE INDEX trees_gallery ON trees(updated_at DESC) WHERE visibility='public' AND deleted_at IS NULL AND hidden_by_admin_at IS NULL;

CREATE TABLE nodes (
  id          uuid PRIMARY KEY,
  tree_id     uuid NOT NULL REFERENCES trees(id) ON DELETE CASCADE,
  owner_id    uuid NOT NULL,                                 -- 비정규화: (owner_id, seq) 인덱스로 pull 한 번에
  parent_id   uuid,                                          -- NULL = 루트. FK 아님(고아는 클라이언트가 복구)
  "order"     double precision NOT NULL,
  title       text NOT NULL,
  note        text,
  aliases     jsonb NOT NULL DEFAULT '[]',
  collapsed   boolean,
  "offset"    jsonb,                                         -- {x,y}
  width       smallint CHECK (width IN (1,2,3)),
  updated_at  bigint NOT NULL,
  deleted_at  bigint,
  seq         bigint NOT NULL
);
CREATE INDEX nodes_tree ON nodes(tree_id) WHERE deleted_at IS NULL;
CREATE INDEX nodes_owner_seq ON nodes(owner_id, seq);

CREATE TABLE srs (
  user_id           uuid NOT NULL REFERENCES users(id),
  node_id           uuid NOT NULL,                           -- FK 아님: 노드 톰스톤 뒤에도 7일 보존
  tree_id           uuid NOT NULL,
  card              jsonb NOT NULL,                          -- ts-fsrs Card 그대로(형태는 core/srs 소유)
  due               bigint NOT NULL,
  last_grade_source text,
  last_structure    text,
  auto_correct_days jsonb NOT NULL DEFAULT '[]',             -- ["YYYY-MM-DD", ...]
  pending_recheck   boolean NOT NULL DEFAULT false,
  miss              smallint,
  updated_at        bigint NOT NULL,
  deleted_at        bigint,
  seq               bigint NOT NULL,
  PRIMARY KEY (user_id, node_id)
);
CREATE INDEX srs_owner_seq ON srs(user_id, seq);

CREATE TABLE attempts (
  id                uuid PRIMARY KEY,
  user_id           uuid NOT NULL REFERENCES users(id),
  tree_id           uuid NOT NULL,
  root_id           uuid NOT NULL,
  started_at        bigint NOT NULL,
  completed_at      bigint NOT NULL,
  node_recall       real NOT NULL,
  edge_accuracy     real NOT NULL,
  auto_graded_count integer NOT NULL,
  self_graded_count integer NOT NULL,
  overridden_count  integer NOT NULL
);
CREATE INDEX attempts_user ON attempts(user_id, completed_at);

CREATE TABLE user_seq (user_id uuid PRIMARY KEY, seq bigint NOT NULL DEFAULT 0);  -- 사용자별 순번 발급(UPDATE ... RETURNING)
-- reports 테이블은 AA 소유(§3.5 표). 이 DDL에 없다.
```
`version` 컬럼은 두지 않는다: `seq`가 행 버전이자 커서다 [결정]. 시각은 epoch ms `bigint`로 저장한다: 클라이언트 `updatedAt`과 같은 단위라 LWW 비교에 변환이 없고 타임존 문제가 없다 [결정].

**필드 대응표 (서버 ↔ `types.ts`)** — camelCase ↔ snake_case 기계 변환, 이름 불일치 0건 [코드 대조]
| 서버 `trees` | `Tree` | 비고 |
|---|---|---|
| id | id | |
| owner_id | (없음) | 로컬은 단일 사용자. `meta.userId`가 대신 |
| title | title | |
| visibility | visibility? (신규) | 타입 추가 요청 R-T1 |
| slug | slug? (신규) | R-T1 |
| source_tree_id | sourceTreeId? (신규) | R-T1 |
| node_count / copy_count | (없음) | 서버 비정규화. 공유 보기 응답에만 |
| created_at / updated_at | createdAt / updatedAt | |
| deleted_at | deletedAt? (신규) | R-T1. 로컬 소프트 삭제(되돌리기 토스트 동안·purge 전) |
| hidden_by_admin_at / seq | (없음) | hidden은 공유 시트 표시용으로 응답에만 |

| 서버 `nodes` | `TreeNode` | 비고 |
|---|---|---|
| id / tree_id / parent_id | id / treeId / parentId | |
| owner_id | (없음) | 서버 인덱스용 |
| "order" | order | |
| title / note | title / note? | |
| aliases | aliases | string[] |
| collapsed / "offset" / width | collapsed? / offset? / width? | |
| updated_at | updatedAt | |
| deleted_at / seq | (없음) | |

| 서버 `srs` | `NodeSrs` | 비고 |
|---|---|---|
| user_id | (없음) | |
| node_id / tree_id | nodeId / treeId | |
| card / due | card / due | |
| last_grade_source / last_structure | lastGradeSource / lastStructure | |
| auto_correct_days / pending_recheck / miss | autoCorrectDays / pendingRecheck / miss? | |
| updated_at | updatedAt | |

| 서버 `attempts` | `BlankAttempt` | 비고 |
|---|---|---|
| id / tree_id / root_id | id / treeId / rootId | |
| user_id | (없음) | |
| started_at / completed_at | startedAt / completedAt | |
| node_recall / edge_accuracy | nodeRecall / edgeAccuracy | |
| auto_graded_count / self_graded_count / overridden_count | autoGradedCount / selfGradedCount / overriddenCount | |

**`types.ts` 변경 요청(오케스트레이터 승인 필요, 공유 계약)** [제안]
| # | 변경 | 이유 |
|---|---|---|
| R-T1 | `Tree`에 `visibility?: 'private'\|'unlisted'\|'public'`, `slug?: string\|null`, `sourceTreeId?: ID`, `deletedAt?: number` 추가 | 목록 카드에 공개 상태 아이콘·링크 복사, 복제 계보, 로컬 소프트 삭제(RV H2) |
| R-T2 | `OutboxRow` `MetaRow` 타입 추가(§3.1) | Dexie v2 테이블 |
| R-T3 | 없음 — `TreeNode` `NodeSrs` `BlankAttempt`는 변경 없이 서버와 1:1 | |

**API** [결정] — 접두사 `/api`, JSON, 세션 쿠키(AA). 에러 봉투는 AA 공통 형식 `{ error: { code, message, field? } }`, 코드명 snake_case(RV M3). AA 공통 코드(`unauthorized` `forbidden` `not_found` `invalid` `rate_limited` `maintenance`)에 SH가 더하는 코드: `payload_too_large` `id_taken` `tree_limit` `cursor_expired` `not_publishable` `hidden_by_admin` `not_shared` `deleted` `hidden` `purged`. fetch 래퍼 `src/core/api.ts`는 AA 소유이며 SH `sync.ts`는 import만 한다.
| 메서드·경로 | 인증 | 요청 | 응답 | 에러 | 리밋 |
|---|---|---|---|---|---|
| `POST /api/sync` | user | `{ trees: Tree[], nodes: TreeNode[], srs: NodeSrs[], attempts: BlankAttempt[], deleted: { trees: [{id, deletedAt}], nodes: [{id, treeId, deletedAt}] } }` ≤500행·1MB. Tree에 `visibility`·`slug`가 와도 무시 | `{ seq, applied: ID[], superseded: { trees: Tree[], nodes: TreeNode[], srs: NodeSrs[] }, dropped: ID[], id_taken: ID[] }` | 400 `payload_too_large` / 400 `invalid`(`field`에 `nodes[3].title` 식 위치, 제한 §3.9) / 다른 사용자의 id는 에러가 아니라 200 본문 `id_taken`(클라이언트가 재발급) / 403 `tree_limit`(트리 200개) | 60/분/사용자 |
| `GET /api/sync?since=<seq>` | user | — | `{ seq, more, trees: Tree&{deletedAt?}[], nodes: TreeNode&{deletedAt?}[], srs: NodeSrs[] }` ≤500행 | 410 `cursor_expired` | 60/분/사용자 |
| `GET /api/trees` | user | — | `{ trees: (Tree & {visibility, slug, nodeCount, copyCount, hiddenByAdmin: boolean})[] }` | — | 60/분 |
| `GET /api/trees/:id` | owner | — | `{ tree, nodes }` 스냅샷(전체 복원용, 공유 보기와 동일 형태) | 404 | 30/분 |
| `DELETE /api/trees/:id` | owner | — | `{ deletedAt }` (outbox `tree del`과 같은 효과. 직접 호출용) | 404 | 30/분 |
| `POST /api/trees/:id/restore` | owner | — | `{ tree }` (7일 이내) | 404 / 410 `purged`(7일 경과) | 10/분 |
| `PUT /api/trees/:id/visibility` | owner | `{ visibility }` | `{ visibility, slug, url }` | 400 `not_publishable`(노드<3, 제목 없음) / 403 `hidden_by_admin`(public 전환 거부) | 30/분 |
| `POST /api/trees/:id/slug` | owner | — | `{ slug, url }` | 400 `not_shared`(private) | 10/분 |
| `GET /api/t/:slug` | anon | — | `{ tree: { id, title, nodeCount, copyCount, visibility, owner: { nickname }, updatedAt }, nodes: TreeNode[] }` `Cache-Control: private, no-store` | 404 / 410 `deleted` / 403 `hidden`(응답 시간 동일) | 60/분/IP |
| `GET /t/:slug` | anon | — | HTML(OG 주입, §3.4.1) 200 / 404 / 410 / 403 모두 같은 셸 | — | 60/분/IP(크롤러 UA 제외) |
| `POST /api/t/:slug/copy` | anon | — | 204 | 404 | 20/일/IP |
| `POST /api/t/:slug/report` | anon·user | **AA 소유**(§3.5 표). 경로만 여기 적음 | 201 `{ id }` | AA | anon 5/시/IP · user 20/시 |
| `GET /api/gallery?sort=&page=` | anon | — | `{ items: [...], page, hasMore }` 20건, 60초 캐시 | 400 | 30/분/IP |

페이로드 상한·행 제한(title 200자, note 5,000자, aliases 50×50, 트리당 노드 5,000, 사용자당 트리 200, 요청 2MB)과 근거는 [`capacity.md`](evidence/sh/capacity.md) §4. 레이트 리밋은 Pi 보호보다 열거·부풀리기 억제가 목적이다. 구현은 API 서버 메모리 토큰 버킷으로 충분하다(1프로세스) [결정]. IP는 Cloudflare `CF-Connecting-IP` 헤더를 쓴다(터널 뒤라 원격 주소가 전부 터널 IP) [결정].

### 3.7 권한 매트릭스 [R10-7]

역할은 plan §3.3·AA와 같다: `anon`(비로그인) `owner`(트리 소유자) `user`(로그인한 타인) `admin`. 빈칸 없음. ✓ 허용, ✗ 거부(403/404), △ 조건.
| 동작 \ 역할 | anon | owner | user | admin |
|---|---|---|---|---|
| 읽기 private | ✗ 404 | ✓ | ✗ 404 | ✓(관리자 화면에서 제목·노드 수만. 내용 열람은 신고 처리 시에만, AA `audit_log` 기록) |
| 읽기 unlisted(`/t/`) | ✓ | ✓ | ✓ | ✓ |
| 읽기 public | ✓ | ✓ | ✓ | ✓ |
| 읽기 hidden | ✗ 403 | ✓(배너 "운영 정책으로 숨김") | ✗ 403 | ✓ |
| 읽기 deleted(7일) | ✗ 410 | ✓(휴지통 목록, 복구) | ✗ 410 | ✓ |
| 복제 unlisted·public | ✓(로컬) | ✓(자기 트리 복제 = 사본) | ✓ | ✓ |
| 복제 private·hidden·deleted | ✗ | △ private 자기 것만(사본 만들기) | ✗ | ✗ |
| 편집(노드·제목) | ✗ | ✓ | ✗ | ✗(관리자는 내용을 고치지 않는다) |
| 공개 범위 변경 | ✗ | ✓(hidden이면 public 전환만 ✗) | ✗ | ✗ |
| 링크 재발급 | ✗ | ✓ | ✗ | ✗ |
| 삭제 | ✗ | ✓(소프트) | ✗ | △ 사용자 삭제(AA R9)의 일부로 일괄 소프트 삭제만 |
| 복구(7일) | ✗ | ✓ | ✗ | △ AA 결정 참조(`POST /api/admin/trees/:id/restore` 추가 여부, RV L2) |
| 숨김/해제 | ✗ | ✗ | ✗ | ✓ |
| 신고(AA API) | ✓(5/시/IP) | ✗(자기 트리 신고 불가, AA와 통일) | ✓(20/시) | — |
| 갤러리 열람 | ✓ | ✓ | ✓ | ✓ |
| 동기화(`/api/sync`) | ✗ 401 | ✓(자기 데이터만) | ✗(타인 트리 id를 넣으면 `idTaken`) | ✓(자기 데이터만) |

### 3.8 첫 로그인 병합 [R10-8]

데이터 규칙만 정한다. 화면·문구·순서는 AA(D2). 흐름은 [`sequences.md`](evidence/sh/sequences.md) S3.
| # | 상황 | 규칙 [결정] | AA 의존 |
|---|---|---|---|
| M1 | 비로그인 시절 로컬 트리 n개, 서버 0개(첫 가입) | **모두 올린다**(확인 1회). 트리·노드 id 유지, `createdAt`·`updatedAt` 유지. SRS·attempts도 올림 | 확인 대화 "이 기기의 트리 n개를 계정에 저장합니다" 1개 |
| M2 | 로컬 n개, 서버 m개(다른 기기에서 쓰던 계정으로 이 기기에서 처음 로그인) | 합집합. 로컬은 모두 올리고 서버 것은 모두 내려받는다. 같은 id가 양쪽에 있으면 LWW(§3.1) | 같은 대화에 "+ 계정의 트리 m개를 가져옵니다" |
| M3 | 이 기기에 다른 계정(u1)의 데이터가 남아 있는데 u2로 로그인(`meta.userId = u1`) | u1 데이터는 **u2에 올리지 않는다**. 선택: "u1의 트리 지우고 시작"(기본) / "이 계정으로 복제"(id 재발급 + sourceTreeId 없음, SRS 비움). 어느 쪽이든 `meta.userId=u2`, cursor=0으로 S2 | 계정 전환 대화 1개 |
| M4 | 커서 만료(C18) 또는 서버에 없는 로컬 트리 발견 | "이 기기에만 있는 트리 n개" → 올리기(기본) / 지우기 | 대화 1개(M1과 같은 컴포넌트) |
| M5 | id 충돌(C17, 409 `idTaken`) | 트리·노드 id 재발급 후 재전송. 사용자에게 안 보임 | 없음 |
| M6 | 로그아웃 | 로컬 데이터 **유지**(오프라인 학습 계속), outbox는 유지(재로그인 시 push), `meta.userId`는 유지(소유자 기록). 공용 기기 대비 "이 기기에서 데이터 지우기" 선택은 AA 계정 화면 | 로그아웃 시 선택지 1개 |
| M7 | 탈퇴 | 서버: `softDeleteTreesOfUser(ownerId)` 일괄 소프트 삭제 → 7일 뒤 AA 일일 작업이 `purgeUser(ownerId)`. 7일 내 재로그인 = 탈퇴 취소 → `restoreTreesOfUser(ownerId, since = users.deleted_at)`. Kakao unlink 웹훅도 같은 7일 규칙(AA 3차, 가입 미완료만 즉시 purge). 로컬: M6과 같음(지우기 선택 제공) | 탈퇴·취소 흐름이 함수 호출(D3) |

"선택해서 올리기"를 두지 않는 이유: 비로그인 시절 트리는 보통 1~5개이고, 올린 뒤 지우는 것이 선택 UI보다 쉽다 [결정]. 트리 200개 상한을 넘기면 M1에서 `tree_limit`이 나며 "가장 오래된 것부터 n개는 올리지 못했습니다"로 알린다.

### 3.9 용량·비용 [R10-9]

직접 측정·계산: [`evidence/sh/capacity.md`](evidence/sh/capacity.md), 스크립트 [`measure_size.mjs`](evidence/sh/measure_size.mjs)(JSON·압축) · [`measure_sqlite.mjs`](evidence/sh/measure_sqlite.mjs)(`node:sqlite` 실측), 원본 출력 [`measure_output.txt`](evidence/sh/measure_output.txt) · [`measure_sqlite_output.txt`](evidence/sh/measure_sqlite_output.txt).
| 항목 | 값 | 등급 |
|---|---|---|
| 트리 1개(300노드) 클라이언트 JSON | 76,457 B(노드당 255 B, UUID 3개가 42%) | [측정] |
| 같은 트리 gzip / brotli | ≈10.5 KB(실행마다 ±0.5%, zlib 구현 차, RV L9) / 8.2 KB — 어휘 편향 있음, 실제 ~35 KB로 가정 | [측정]/[가정] |
| SQLite `nodes` 300행 + 인덱스 2개 | ≈ 106 KB(행 361 B. UUID 3개가 TEXT 36자라 Postgres 추정 240 B보다 큼) | [측정] `measure_sqlite.mjs`, 6,000행 VACUUM 후 |
| SQLite `srs` 300행(완전 학습) | ≈ 134 KB(행 458 B, Card JSON 220 B) | [측정] |
| 사용자 1명(트리 5개, 학습 50%) | ≈ 0.9 MB | [계산], 04_tech §7의 1 MB 가정 안 |
| 1천 명 DB | ≈ 0.9~1.1 GB(+톰스톤 20 MB) | [계산] |
| 일 요청 | MAU 300 × 40회 = 12,000/일 ≈ 0.14 req/s, 피크 ≈ 6 req/s | [계산] |
| Pi 1대 여유 | 11 §2.3의 Pi 3B 200 TPS 기준으로도 30배 | [출처 8]/[추론] |
| 백업 | `sqlite.backup()` 파일 ≈ 1 GB → gzip 30% [가정] ≈ 300 MB/일 × 14일 = 4.2 GB < B2 무료 10 GB(파이프라인은 AA §2: backup → age → rclone) | [계산], [출처 8] |
| 상한 | 트리 5,000노드, 트리 200개/사용자, push 500행·1 MB, 요청 2 MB | [결정] |

비용 결론: 저장·요청 모두 11 §2의 Pi 1대 + Cloudflare 무료 범위 안이다. 추가 월 비용 0원 [추론]. 제약은 용량이 아니라 가용성(11 §2.4)이며, 로컬 우선 구조가 그 완충이다.

### 3.10 UI 언어 — 정보 구조만 [R10-10]

모양(색·형태·아이콘)은 DS(01), 위치는 LM(02). 여기서는 상태·요소·문구 뼈대만 정한다 [결정].
**공개 범위 컨트롤(3상태)** — 목록 카드 ⋯ 메뉴 "공유…" → 시트. 요소: ① 세그먼트 3개 `비공개 / 링크 / 공개`(현재 값 표시, 오프라인이면 비활성 + "오프라인"), ② 링크 줄(링크·공개일 때만): URL 텍스트, `복사`, `열기`, `재발급`, ③ 공개일 때 안내 1줄 "갤러리에 표시됩니다 · 노드 N개", ④ hidden이면 배너 "운영 정책으로 숨김 — 링크가 열리지 않습니다", ⑤ 첫 공개 시 고지 1회(§3.3). 비로그인 사용자에게는 시트 대신 "로그인하면 링크로 공유할 수 있습니다" 1줄(AA 로그인 진입점).
**카드 표식** — 목록 카드에 공개 상태 아이콘 1개(비공개는 표시 없음, 링크·공개는 아이콘) + `aria-label`. 복제본은 "복제됨" 표식 없음(사용자에게 의미 없음, `sourceTreeId`는 데이터로만).
**트리 삭제(확인창 없음, RV H2)** — ⋯ 메뉴 `삭제` 즉시 실행(`markTreeDeleted`) → 카드 사라짐 → 토스트 "삭제됨 · [되돌리기]" **10초**(노드 삭제와 같은 패턴). 되돌리기 → `restoreTree`, 카드 복귀. 7일 동안 계정 화면 휴지통에서 복구 가능(비로그인은 목록의 휴지통 아이콘으로 진입), 7일 뒤 `purgeDeletedTrees` 하드 삭제. 다른 기기에서 지운 트리(pull 톰스톤)도 로컬에 소프트 삭제로 남아 휴지통에 보인다(Q6 개정, 2026-11-09).
**동기화 상태 표시(4상태 + 1토스트)** — 전역 1곳(위치 LM).
| 상태 | 조건 | 표시 | 동작 |
|---|---|---|---|
| 저장됨 | outbox 0, 마지막 push 성공 | 아이콘(정적) | 없음 |
| 동기화 중 | push/pull 진행 | 아이콘 애니메이션(reduced-motion 시 정적 대체) | 없음 |
| 오프라인 | `navigator.onLine=false`, fetch 실패, 또는 **503 + `Retry-After`**(AA 점검 모드, RV L17) | 아이콘 + "n건 대기" | 탭하면 재시도. 503이면 `Retry-After` 뒤 자동 재시도 |
| 오류 | 4xx(리밋·용량 초과·401). 503은 오류가 아니라 오프라인 | 아이콘(danger) | 탭하면 사유 1줄(예: "트리가 너무 큽니다(5,000노드)" / "다시 로그인") |
| 충돌 반영(토스트) | push 응답 `superseded` ≥ 1 또는 pull에서 열린 트리의 노드가 바뀜 | "다른 기기 변경 반영됨 n건 · [내 버전 유지]" 1회 | 내 버전 유지 → 패자 행 재-put(§3.1) |
비로그인은 상태 표시 자체가 없다(로컬만).
**공유 보기 화면** — 상단: 제목, "노드 N개 · 작성자 닉네임", 모드 탭(보기·플래시·빈칸·백지). 하단 고정 요소는 **탭별 행동 바 하나**뿐이다(RV M10·L20, LM §3.1과 동일): 보기 탭은 `내 트리로 복제` 바, 플래시 탭은 `.flash-nav`(다음·요약), 빈칸·백지 탭은 `.dnd-dock`. 보기 외 탭에서 복제는 헤더 오른쪽 아이콘으로 옮긴다. 퀴즈 탭의 dock과 겹치지 않게 하기 위해서다. **신고는 모든 탭에서 헤더 `⋯` 메뉴 → 하단 시트**다(LM 요청). `⋯` 메뉴 항목은 신고·링크 복사 2개다. 시트 안에는 사유 선택과 메모 ≤300자(선택)가 있고, 제출은 AA API `POST /api/t/:slug/report`다. 시트 배치·키보드 규칙은 LM I12를 따른다. 비로그인 체험 중 기록이 저장되지 않음을 첫 채점 시 토스트 1회로 알림. 복제 완료 토스트 "복제됨 · 원본이 바뀌어도 이 트리는 바뀌지 않습니다 · [열기]".

### 3.11 구현 공수와 순서 [R10-11]

| 단계 | 내용 | 공수 | 선행 |
|---|---|---|---|
| ① 서버 저장 | Dexie v2(outbox·meta), repo/srs 훅, 트리 소프트 삭제(`markTreeDeleted`/`restoreTree`/`purgeDeletedTrees`) + 되돌리기 토스트 10초(`confirm()` 제거), `sync.ts` push·pull(LWW·톰스톤·커서·고아), 서버 `trees nodes srs attempts user_seq` + `POST/GET /api/sync` + `/api/trees*`(restore 포함) + `softDeleteTreesOfUser`·`restoreTreesOfUser`·`purgeUser`·`purgeTombstones` 함수, 첫 로그인 병합 M1·M2·M5·M6, 상태 표시 4상태 | **M~L**(클라 M, 서버 M) | AA 세션 쿠키·users·`api.ts`·일일 작업 스케줄러 |
| ② 공유 링크 | visibility API·slug·`GET /t/:slug` 라우트(OG 치환)·`/api/t/:slug`·복제·`copy`·라우터 `parseLocation`·공유 보기 화면(읽기 전용 소스 주입, 보기 탭 복제 바·그 외 탭 헤더 복제 아이콘, `⋯` → 신고 시트)·공유 시트 | **M** | ①, Hono 라우트 등록 순서(AA D1) |
| ③ 동기화 다듬기 | 60초 폴링·포커스 pull, `superseded` 토스트·내 버전 유지, srs 합집합 병합, 커서 만료 M4, M3 계정 전환, 휴지통 복구 UI, `childrenOf` 안정 정렬, 두 기기 E2E | **L** | ① |
| ④ 갤러리 | `/api/gallery`·갤러리 화면(목록 20건·정렬 2개)·⋯ 신고 메뉴(AA API 호출)·관리자 숨김 연동 | **S**(신고 API·처리 화면은 AA) | ②, 사용자 결정 Q1 |

①을 push-only 백업으로 먼저 끊지 않는 이유: pull 없이는 두 번째 기기에서 아무것도 안 보여 "저장됐다"는 확신을 줄 수 없고, push/pull은 같은 행 형식·같은 LWW 코드를 쓴다 [결정].

### 3.12 타 문서 의존

| 내가 필요한 것 | 소유 | 요청 내용 |
|---|---|---|
| D1 서버 라우트·바인딩 | AA | Hono에 `GET /t/:slug`(SH 핸들러)를 정적 서빙보다 먼저 등록. `CF-Connecting-IP` 신뢰. Node는 `127.0.0.1`에만 바인딩(외부는 같은 호스트의 `cloudflared` Tunnel로만). `schema.sql`에 SH 절(§3.6) 포함 |
| D2 첫 로그인 병합 UX | AA | §3.8 M1~M4 대화 4개(컴포넌트 1개 재사용 가능), 로그아웃 시 "기기 데이터 지우기" 선택 |
| D3 탈퇴·취소·일일 작업 | AA | SH가 제공하는 함수 4개, 호출은 AA. ① `softDeleteTreesOfUser(ownerId)` = `UPDATE trees SET deleted_at=now WHERE owner_id=? AND deleted_at IS NULL` (탈퇴). ② `restoreTreesOfUser(ownerId, since)` = `UPDATE trees SET deleted_at=NULL WHERE owner_id=? AND deleted_at >= ?`, `since` = `users.deleted_at` (탈퇴 취소. 탈퇴 전에 직접 지운 트리는 되살리지 않음). ③ `purgeUser(ownerId)` = `trees`·`nodes`·`srs`·`attempts`·`user_seq` 물리 삭제 (7일 경과, AA 일일 작업). **`events`는 서버 미저장이라 대상에 없다.** ④ `purgeTombstones()` = `deleted_at`이 7일 지난 trees(+하위 nodes·srs·attempts)·nodes·srs 행 물리 삭제 (AA 일일 작업) |
| D4 신고 전체 | AA | `reports` 테이블·`POST /api/t/:slug/report`·처리 화면·숨김 토글(`trees.hidden_by_admin_at` 설정/해제)·`audit_log`. 리밋 anon 5/시·user 20/시. **`hidden_by_admin_at` 필드는 §3.6 DDL에 포함했다** |
| D8 `src/core/api.ts` | AA | fetch 래퍼 `api<T>()`·`ApiError`(봉투 `{ error: { code, message, field? } }`). SH `sync.ts`는 import만 |
| D5 공유 시트·상태 표시 모양 | DS | 3상태 세그먼트, 상태 아이콘 5종(저장됨·동기화 중·오프라인·오류·공개 상태), 토스트 액션 버튼 |
| D6 위치 | LM | 상태 표시 위치(목록 헤더 vs 트리 헤더), 공유 보기 하단 고정 바(`복제`·`신고`)와 키보드·`.flash-nav`·`.dnd-dock` 공존 |
| D7 `types.ts` R-T1·R-T2 | 오케스트레이터 | §3.6 요청표 |

## 4. 화면별 적용

| 화면 | 바뀌는 것 | 바뀌지 않는 것 |
|---|---|---|
| 목록(TreeListPage) | ⋯ 메뉴에 `공유…`(로그인) 추가, 카드에 공개 상태 아이콘, 헤더에 동기화 상태 표시(위치 LM), **삭제 `confirm()` 제거** → `markTreeDeleted` + 되돌리기 토스트 10초(§3.10), `listTrees`는 `deletedAt` 없는 트리만 | 생성·이름 변경 호출(repo가 outbox 처리) |
| 에디터 | 저장 실패 토스트 외에 "다른 기기 변경 반영됨" 토스트, pull로 노드가 바뀌면 `nodesRef` 교체(undo 스택 유지). 나머지 없음 | `persist`·`commit`·가져오기·내보내기 |
| 플래시 | 데이터 소스 prop 주입(기본 Dexie). 공유 보기에서는 메모리 소스 | 카드 UI·채점 규칙 |
| 복습(ReviewPage) | 없음(srs가 동기화되므로 자동으로 여러 기기 due가 맞음) | — |
| 빈칸(DndPage) / 백지(BlankDndPage) | 데이터 소스 prop 주입. `recordResult`(srs)는 소스 경유. attempts는 현재 기록하지 않음[코드] — 기록을 시작하면 `repo.addAttempt` 경유 | 퀴즈 로직 |
| 로그인 | (AA) 로그인 완료 콜백에서 `sync.onLogin(userId)` 1회 호출 → §3.8 | — |
| 계정 | (AA) 섹션 2개 요청: "휴지통(7일)" 목록+복구, "이 기기 데이터 지우기" | — |
| 관리자 | (AA) 공개 트리 목록·신고 목록·숨김 토글 — 데이터는 §3.6 `trees`·`reports` | — |
| 공유 보기(`/t/<slug>`) 신규 | §3.4·§3.10. 라우트 `shared`, 모드 탭, 복제(보기 탭 하단 바, 그 외 탭 헤더 아이콘)·신고(헤더 `⋯` → 시트, AA API). 하단은 탭별 행동 바 하나 | 학습 컴포넌트 재사용 |
| 갤러리(미결) 신규 | §3.5 최소형 | — |

## 5. 검증

### (a) 요구사항 대조표
| 요구(과제 지시 1~11, plan R10 완료 기준) | 어디서 충족 | 증거 |
|---|---|---|
| 1 저장 모델: outbox·노드 LWW·톰스톤·since 커서·스냅샷 vs 노드 단위·오프라인·동시 편집 시나리오표 | §3.1 | [`conflicts.md`](evidence/sh/conflicts.md) C1~C20, [`sequences.md`](evidence/sh/sequences.md) S1·S2 |
| 2 동기화 대상(trees·nodes·srs·attempts·events) 포함 여부·이유·용량 | §3.2 | [`capacity.md`](evidence/sh/capacity.md) §2 |
| 3 공개 범위 상태 전이·slug·삭제 시 링크·저작권·`hidden_by_admin_at` | §3.3, §3.6 DDL | 전이표 11행 빈칸 0 |
| 4 `/t/<slug>` 비로그인 학습·복제·OG·해시 라우터·URL 해시 대안 | §3.4 | S4, capacity §5, 출처 1·2·3·6 |
| 5 갤러리 최소형·운영 부담·사용자 결정 | §3.5, §6 Q1 | — |
| 6 서버 스키마·필드 대응·Dexie v2·API·에러·리밋·상한 | §3.6, §3.1 | 대응표 4개 불일치 0 |
| 7 권한 매트릭스 anon·owner·user·admin | §3.7 | 16행 × 4열 빈칸 0 |
| 8 첫 로그인 병합 규칙 + AA 의존표 | §3.8 | S3 |
| 9 용량·비용 | §3.9 | 측정 스크립트·출력 |
| 10 UI 정보 구조 | §3.10 | — |
| 11 공수·순서 | §3.11 | — |
| plan R10 "복제 시 SRS 처리" | §3.4.3(비움) | — |

### (b) 코드베이스 대조 (파일 단위, 구현 때 바뀔 것)
| 파일 | 현재 [코드] | 변경 |
|---|---|---|
| `src/core/types.ts` | `Tree` 4필드 | R-T1 선택 필드 3개, R-T2 타입 2개(오케스트레이터) |
| `src/core/db.ts` | `version(1)` 5테이블 | `version(2)` + `outbox` `meta`, `trees` 인덱스에 `slug` |
| `src/core/repo.ts` | 5개 쓰기 함수, `childrenOf`는 `order`만 정렬, `deleteTree`는 즉시 하드 삭제, `listTrees`는 전부 반환 | 각 쓰기 트랜잭션에 `db.outbox` 추가(표 §3.1), `deleteTree` → `markTreeDeleted`/`restoreTree`/`purgeDeletedTrees`로 분리(tree del 1행), `listTrees`에 `deletedAt` 필터, `childrenOf` 정렬 `(a.order - b.order) \|\| a.id.localeCompare(b.id)`, 신규 `copyTree(remote)`·`applyRemote(batch)`(outbox 없이 쓰는 내부 함수) |
| `src/core/srs/index.ts` | `recordGrade`가 `db.srs.put` 직접 | 트랜잭션으로 감싸 `outbox` srs put 추가. `getSrsMap`·`recordResult`는 공유 보기용 메모리 소스와 인터페이스 공유 |
| `src/core/events.ts` | `logEvent` | 변경 없음(서버 미저장) |
| `src/core/sync.ts` 신규 | — | push·pull·LWW 적용·고아 복구·커서·상태 스토어·`onLogin`·`superseded` 보관 |
| `src/core/api.ts` 신규 | — | **AA 소유**(RV M3, D8). SH는 `api<T>()`·`ApiError`를 import만 |
| `src/router.ts` | `parseHash`, `Route` 3종, `hashchange`만 | `parseLocation`(pathname `/t/` 우선), `Route`에 `shared`, `href.shared`, `popstate` 리스너 |
| `src/App.tsx` | 라우트 → 페이지 매핑 | `shared` → `SharedPage`(lazy) |
| `src/features/shared/SharedPage.tsx` 신규 | — | `/api/t/:slug` 로드, 모드 탭, 메모리 소스로 Flash/Dnd/Blank 렌더, 복제·신고 |
| `src/features/flash/FlashPage.tsx` `FlashCard.tsx`, `dnd/DndPage.tsx` `BlankDndPage.tsx` | `getTreeNodes`·`getSrsMap`·`recordResult` 직접 호출 | `source` prop(기본값 = 현재 Dexie 함수들). 로직 변경 없음 |
| `src/features/editor/TreeListPage.tsx` | ⋯ 메뉴 이름 변경·삭제(`confirm()` 55행) | `confirm()` 제거 → `markTreeDeleted` + 되돌리기 토스트 10초, `공유…` 항목 + `ShareSheet`, 카드 공개 아이콘, 헤더 `SyncStatus` |
| `src/features/editor/EditorPage.tsx` | `persist`로 `putNodes`·`deleteNodes` | 변경 없음(outbox는 repo). pull 반영용 `useRemoteChanges(treeId)` 구독 1개 추가 |
| `index.html` | 정적 `<title>` | OG 자리표시자 주석(`<!--OG-->`) 1줄 — 서버가 치환, 정적 서빙 시 그대로 무해 |
| `vite.config.ts` | PWA manifest | `workbox.navigateFallbackDenylist: [/^\/api/, /^\/t\//]`(AA 값, RV L14) |
| `server/`(AA 골격) + SH 파일 `sync.ts` `share.ts` `schema.sql` SH 절 | 없음 | §3.6 DDL·API, `GET /t/:slug` OG 치환 라우트, `softDeleteTreesOfUser`·`restoreTreesOfUser`·`purgeUser`·`purgeTombstones` 함수(호출은 AA 일일 작업·탈퇴 흐름, D3) |
| `e2e/` | 13개 | 두 컨텍스트 동기화·공유 보기 비로그인·복제 시나리오(4차 오케스트레이터) |

### (c) 직접 측정·계산 결과
- 300노드 트리 JSON 76,457 B, gzip ≈10.5 KB(실행마다 ±0.5%: 이 측정 10,552 B, RV 재현 10,545·10,497 B), 1,000노드 254,962 B — [`measure_output.txt`](evidence/sh/measure_output.txt). 스크립트는 `node docs/specs/evidence/sh/measure_size.mjs`로 재현.
- SQLite 실측(`node:sqlite` v24.19, 트리 20개 × 300노드 = 6,000행, VACUUM 후): 노드 1행 361 B(인덱스 2개 포함), srs 1행 458 B → 300노드 트리 nodes ≈ 106 KB, srs ≈ 134 KB — [`measure_sqlite_output.txt`](evidence/sh/measure_sqlite_output.txt), `node docs/specs/evidence/sh/measure_sqlite.mjs`.
- URL 해시 길이: 300노드 축약 922자(어휘 편향)~8,935자(무작위 음절 상한), 100노드 839~3,076자 — 같은 파일.
- 행 크기·사용자당·1천 명·요청 수·백업: [`capacity.md`](evidence/sh/capacity.md) §1~§4(계산식 포함).
- slug 추측: 5,000 ÷ 2^64 ≈ 2.7×10⁻¹⁶/시도 → 기대 3.7×10¹⁵회, 60회/분 = 3.15×10⁷회/년 → 기대 적중 ≈ **1.2×10⁸년** [계산, RV L8 재계산 — 이전 1.4×10¹¹년은 자릿수 오류].
- 측정의 한계: 합성 트리(어휘 40개)라 압축률이 낙관적이다. 실제 사용자 트리 10개로 재측정하는 항목을 구현 단계 체크리스트에 남긴다 [가정].

### (d) 스스로 찾은 약점과 보완
| # | 약점 | 영향 | 보완 |
|---|---|---|---|
| W1 | LWW가 클라이언트 시계에 의존. 5분 이내 편차는 보정 못 함 | 시계가 3분 빠른 폰이 PC 편집을 덮음 | 서버 깎기(+5분)로 상한. 추가로 push 응답에 `serverNow`를 실어 클라이언트가 편차를 측정해 `updatedAt`에 보정치를 더하는 방식(S)을 ③에서 검토 [제안] |
| W2 | slug 열거 | 64비트·60/분/IP로 사실상 불가. 다만 Cloudflare 뒤에서 IP가 가려지면 리밋이 터널 IP 1개로 묶여 전원이 막힘 | `CF-Connecting-IP`를 반드시 쓰고(§3.6), Node를 `127.0.0.1`에만 바인딩해 같은 호스트의 `cloudflared` Tunnel 외 접근을 막아 헤더 위조를 차단한다(RV M5, D1) |
| W3 | 행 단위 LWW라 같은 노드의 다른 필드 동시 편집(C2)에서 한쪽 유실 | 드묾 [가정] | "내 버전 유지" 토스트로 1회 복구. 필드 단위 LWW는 `updatedAt`을 필드별로 둬야 해 `TreeNode` 계약 변경이 커서 보류 |
| W4 | 삭제 복구 경로: 로컬 되돌리기 토스트 10초(비로그인 포함, H2로 해결) 뒤 ~7일 구간은 서버 `restore` API와 계정 화면 휴지통(AA)에 의존 → ①단계에 계정 화면이 없으면 그 구간은 API만 | 토스트 뒤 ~7일 구간의 C11 복구 | ①에 `POST /api/trees/:id/restore`를 넣고 휴지통 UI는 AA 계정 2단계에서 |
| W5 | 큰 트리 업로드: 5,000노드 스냅샷 1.25MB를 모바일 데이터에서 올림. 첫 로그인 병합 때 트리 200개면 수십 MB | 느림·실패 반복 | 500행 배치 + 배치별 커서 저장(중단 지점 재개), 상태 표시 "n/m 올리는 중" |
| W6 | `markTreeDeleted`가 노드 톰스톤을 만들지 않아 pull하는 기기가 트리 톰스톤만 받고 로컬 노드를 스스로 지워야 함 | 구현 누락 시 고아 노드 300개가 남음 | S2 규칙에 명시(트리 톰스톤 → 로컬 `deleteTree` 경로 재사용). E2E 항목 |
| W7 | 비로그인 outbox 미기록 → 로그인 직후 전체 업로드 중 앱을 닫으면 일부만 올라감 | 다음 실행 때 M4("이 기기에만 있는 트리")로 잡힘 | `meta.userId`는 전체 업로드 완료 후에 기록(그 전엔 재시도) |
| W8 | 공유 보기 JSON이 `no-store`라 인기 public 트리 1개에 접속이 몰리면 Pi가 매번 DB 조회 | 6 req/s 피크 기준 문제 없음 [계산] | 필요해지면 `/api/t/:slug`만 `public, max-age=60`으로 바꾸고 private 전환 시 slug 회수(URL 자체가 바뀌므로 캐시 무해) — 이미 그 구조 |
| W9 | `order`가 double이라 같은 자리에 반복 삽입하면 정밀도 소진(1e-16) | 수백 번 삽입 뒤 순서 붕괴 | 현재 코드의 문제이기도 함. 서버는 무관. 에디터에서 형제 재번호 매기기(이미 있는지 확인 필요) [가정] |
| W10 | Safari가 7일 미사용 IndexedDB를 지울 수 있음(R4 #1) → 로그인 사용자는 서버에서 복원되지만 `meta`도 지워져 M2로 재진입 | 올바른 동작이나 outbox 미전송분 유실 | 2초 디바운스가 짧아 유실 창이 작음. 비로그인은 R4 #1 백업이 유일한 수단(범위 밖) |

## 6. 미결·사용자 질문

| # | 질문 | 기본값(답 없으면) |
|---|---|---|
| Q1 | 공개 갤러리를 운영할 것인가(신고·저작권 응대 부담, 월 수 건 [가정])? 끄면 `public`은 "링크 + 검색 색인 허용"만 뜻한다 | 켬(④단계, S). 시드 트리 배포 채널 |
| Q2 | 공유 보기에서 비로그인 학습 기록을 전혀 저장하지 않는 결정(복제 후 기록 시작)에 동의하는가? | 저장 안 함 |
| Q3 | private 전환 시 링크 자동 회수(옛 링크 404) vs 유지(RemNote식) | 회수 |
| Q4 | 삭제 트리 7일 유예(오케스트레이터 M1 결정, AA 탈퇴 유예와 동일) — 더 길게(30일) 원하는가? | 7일 |
| Q5 | `events`를 서버에 저장하지 않는 결정 — 대시보드(R4 #4)를 "여러 기기 합산"으로 만들 계획이면 지금부터 올려야 한다 | 미저장 |
| Q6 | 도메인(OG `og:url`·canonical에 필요) | 미정(AA·사용자) |
| Q7 (= RV D4) | 오프라인 편집 동기화 범위: 전체(outbox·LWW·톰스톤, ③ L) vs 온라인 push-only로 시작(오프라인 편집은 다음 접속 때 트리 스냅샷 업로드, 충돌 시 서버 우선). decisions 4는 "오프라인 편집 동기화"를 MVP 제외로 적었다 | 전체(SH 설계대로), 구현은 ③으로 분리 |

## 7. 출처 (확인일 2026-11-08)

1. Chromium `url/url_constants.h` — `inline constexpr size_t kMaxURLChars = 2 * 1024 * 1024;` https://chromium.googlesource.com/chromium/src/+/HEAD/url/url_constants.h
2. 브라우저별 URL 길이 정리(2차 자료, IE 2,083자·실용 2,000자 권고·Safari ~80,000자 등 출처 간 상충) https://www.baeldung.com/cs/max-url-length , https://www.geeksforgeeks.org/maximum-length-of-a-url-in-different-browsers — 벤더 문서가 아니므로 Chromium 값(1)만 [출처]로, 나머지는 [가정] 취급
3. 카카오 devtalk "카카오톡 scrap(url 미리보기) 안될때 체크 리스트" — og 태그 필수, og:url 일치, JPG/PNG, 800×400 2:1 크롭, 봇 UA `facebookexternalhit/1.1;kakaotalk-scrap/1.0`, 80/443 포트. URL 길이 언급 없음 https://devtalk.kakao.com/t/scrap-url/116202 (카카오 디벨로퍼스 공식 문서 `developers.kakao.com/docs/latest/ko/kakaotalk-share/common`은 리다이렉트·404로 확인 실패)
4. OWASP Session Management Cheat Sheet — "Session identifiers must have at least 64 bits of entropy", 16 hex 문자 예시, 585년 추측 예 https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
5. Dexie `Dexie.version()` 문서 — 버전 2 블록 예제(기존 테이블 반복, `upgrade()`), "If you are on Dexie < 3.0, also keep the declarations previous versions" https://dexie.org/docs/Dexie/Dexie.version() ; 설계 튜토리얼 "New versions need only to specify changed tables" https://old.dexie.org/docs/Tutorial/Design
6. Slack "Unfurling links in messages" — "Slack crawls the URL, looks for common OpenGraph and X (formerly known as Twitter) Card metadata" https://docs.slack.dev/messaging/unfurling-links-in-messages/ ; 1200×630 권고는 2차 자료 https://nuxtseo.com/learn/mastering-meta/slack
7. `../drilldown-biz/brief/decisions.md` 3~4(공유 링크 MVP 포함, 공동 편집·마켓·오프라인 편집 동기화 제외), 6~9(Pi 자체 호스팅, LLM 없음) — 로컬 파일
8. `../drilldown-biz/reports/11_cost_recovery.md` §2.1~2.4(Pi 5 + Tunnel, Pi 3B 200 TPS, B2 10GB 무료, 가용성 99%), §6(최소 수집) — 로컬 파일
9. `../drilldown-biz/reports/04_tech.md` §4(visibility·source_tree_id·copy-on-import·fractional sort key), §7(사용자당 1MB, MAU 30%) — 로컬 파일
10. `docs/research/R4_platform.md` #1 #9 #10 #13 #14 — 로컬 파일
11. Node.js `node:sqlite` 문서 — `DatabaseSync` 옵션 `enableForeignKeyConstraints` 기본 `true` https://nodejs.org/api/sqlite.html
12. SQLite 문서 — 데이터 타입 친화성 https://www.sqlite.org/datatype3.html , 부분 인덱스 https://www.sqlite.org/partialindex.html , RETURNING https://www.sqlite.org/lang_returning.html

## 8. 3차 변경 기록 (RV `05_review.md` → 오케스트레이터 판정 plan §3.5)

| RV # | 변경 위치 | 내용 |
|---|---|---|
| H1 | §2 갤러리 행, §3.5 신고 표(신규), §3.6 DDL(`reports` 삭제), §3.6 API 표 report 행, §3.7 신고 행, §3.11 ④, §3.12 D4 | `reports` 테이블·신고 API·처리 화면 소유 = AA. 내 문서는 "AA 의존" 표로. 경로 `POST /api/t/:slug/report` 채택, `ip_hash` 없음, 리밋 anon 5/시·user 20/시. `hidden_by_admin_at`은 DDL 유지 |
| H2 | §2 삭제 행, §3.1 훅 표 `deleteTree` 행, §3.6 R-T1·필드 대응표, §3.10 "트리 삭제" 문단(신규), §3.11 ①, §4 목록 행, §5(b) repo·TreeListPage 행, §5(d) W4·W6 | 확인창 없음 + 되돌리기 토스트 10초. 로컬도 소프트 삭제: `Tree.deletedAt`(R-T1 추가), `deleteTree` → `markTreeDeleted`/`restoreTree`/`purgeDeletedTrees`, `listTrees` 필터. 로그인 사용자는 서버 소프트 삭제로 이어짐 |
| M1 | §3.1 "삭제 유예와 톰스톤", §3.3 전이표 deleted 2행·"소유자가 트리를 지우면", §3.6 restore 행, §3.7 deleted·복구 행, §3.8 M7, §3.12 D3, §4 계정 행, §6 Q4 | 유예 30일 → **7일**, 응답 410 유지. 탈퇴 취소 `restoreTreesOfUser` = `UPDATE trees SET deleted_at=NULL WHERE owner_id` D3에 추가(AA 요청 3건은 아래 "AA 요청" 행) |
| AA 요청 1 | §3.3 "소유자가 트리를 지우면", §3.8 M7, §3.12 D3 | `restoreTreesOfUser(ownerId, since)`: `deleted_at >= since`(= `users.deleted_at`)만 복원해 탈퇴 전 직접 지운 트리는 되살리지 않음. 함수명도 AA 문서(`softDeleteTreesOfUser`·`purgeUser`)에 맞춤 |
| AA 요청 2 | §3.1 "삭제 유예와 톰스톤", §3.3 전이표 deleted 행, §3.6 DDL 주석 2곳, §3.9 표, evidence `conflicts.md` C18·`capacity.md` §3 | 톰스톤 보존 30일 → **7일**(유예와 같은 값). 커서 만료도 7일. 비용(7~30일 꺼진 기기는 스냅샷 + M4 확인)과 기각한 30일 안을 §3.1에 적음 |
| AA 요청 3 | §3.12 D3 ③ | `purgeUser`는 `trees`·`nodes`·`srs`·`attempts`·`user_seq`만 삭제. `events`는 서버 미저장이라 제외 |
| LM 요청 | §3.10 공유 보기 문단, §4 공유 보기 행, §3.11 ② | 신고 = 헤더 `⋯` 메뉴(신고·링크 복사) → 하단 시트(사유 + 메모 ≤300자, LM I12 키보드 규칙). 하단 바는 탭별 하나: 보기 탭만 복제 바, 그 외 탭은 헤더 복제 아이콘(LM §3.1과 일치) |
| M3 | §3.6 API 머리말·sync 행, §3.12 D8(신규), §5(b) api.ts 행 | 에러 봉투 `{ error: { code, message, field? } }`, 코드 snake_case(`idTaken` → `id_taken`, `invalid_row` → `invalid`+`field`). `src/core/api.ts`는 AA 소유 |
| M5 | §3.4.1 첫 bullet, §3.6 DDL 머리말, §3.9 표(SQLite 실측·백업), §3.11 ②, §3.12 D1, §5(b) vite·server 행, §5(c), §5(d) W2, evidence `capacity.md`·`sequences.md` S4 | Caddy·Postgres 전제 제거. `/t/:slug`는 Node 같은 프로세스의 Hono 라우트가 index.html에 OG 치환. W2는 Node `127.0.0.1` 바인딩 + Tunnel. 백업은 `sqlite.backup()` 기준. 행 크기는 `node:sqlite`로 **실측**(`measure_sqlite.mjs` 신규: 노드 361 B, srs 458 B → 사용자당 0.9 MB) |
| M10 | §3.10 공유 보기 문단, §4 공유 보기 행, §3.11 ② | 하단 고정은 화면별 행동 바 하나. 복제 = 헤더 아이콘, 신고 = ⋯ 메뉴(LM과 동일) |
| M14 | §1 둘째 문단, §6 Q7(신규) | decisions 4(오프라인 편집 동기화 MVP 제외)와의 관계 한 줄. 범위는 사용자 결정 D4 |
| L2 | §3.7 신고·복구 행 | owner 신고 ✗로 통일. admin 복구는 AA 결정 참조(`/api/admin/trees/:id/restore` 추가 여부) |
| L7 | §3.6 DDL 머리말 치환표(신규 8행), §7 출처 11·12 | SQLite 치환표, `uuid`→`TEXT` 명시, FK는 `node:sqlite` 기본 활성 전제 |
| L8 | §3.3 slug 문단, §5(c) | 기대 적중 1.4×10¹¹년 → **1.2×10⁸년** |
| L9 | §3.9 표, §5(c), evidence `capacity.md` | gzip "≈10.5 KB(실행마다 ±0.5%)" |
| L14 | §3.4.1 PWA bullet, §5(b) vite 행 | `navigateFallbackDenylist: [/^\/api/, /^\/t\//]`(AA 값) |
| L17 | §3.10 상태 표 오프라인·오류 행 | 503 + `Retry-After`는 "오프라인(재시도)" |
| L20 | §3.10 공유 보기 문단, §4 공유 보기 행 | 신고 위치 `⋯` 메뉴 → 시트 |

3차 커밋은 워커가 사용량 한도로 중단된 뒤 오케스트레이터가 워크트리의 미커밋 수정을 검토해 마무리했다(`since` 인자 한 줄 추가).
