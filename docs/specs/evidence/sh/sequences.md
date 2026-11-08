# 시퀀스 다이어그램(텍스트) (SH, 2026-11-08)

표기: `C` 클라이언트(브라우저·Dexie), `S` API 서버, `CF` Cloudflare(캐시·터널), `Bot` 메신저 크롤러. 모든 `/api/*`는 세션 쿠키(AA 문서) 또는 anon.

## S1. 편집 → push (로그인 사용자)
```
사용자        EditorPage            repo.ts                 Dexie                 sync.ts                S
  │ 타이핑        │                     │                        │                     │                  │
  │──────────────▶│ commit(next)        │                        │                     │                  │
  │               │──putNodes(changed)─▶│ tx(rw trees,nodes,outbox)                    │                  │
  │               │                     │──bulkPut(nodes)───────▶│                     │                  │
  │               │                     │──trees.update(updatedAt)──────────────────▶ │                  │
  │               │                     │──outbox.put({kind:'node',id,treeId,op:'put'}) ─▶ (노드당 1행, 있으면 덮어씀)
  │               │                     │◀──────────────────────│                     │                  │
  │               │                     │── schedule()  ────────────────────────────▶│ 2초 디바운스       │
  │               │                     │                        │                     │──read outbox────▶│Dexie
  │               │                     │                        │                     │──bulkGet rows────▶│
  │               │                     │                        │                     │──POST /api/sync {trees,nodes,srs,attempts,deleted} ─▶ S
  │               │                     │                        │                     │                  │ 행별 LWW
  │               │                     │                        │                     │◀─200 {applied:[ids], superseded:[{row}], dropped:[ids], seq}
  │               │                     │                        │                     │──superseded 행을 Dexie에 put(outbox 없이) + 토스트 "다른 기기 변경 반영됨 n건"
  │               │                     │                        │                     │──outbox.delete(applied∪superseded∪dropped)
  │               │                     │                        │                     │──meta.cursor = seq  (push 응답의 seq는 이번 쓰기 포함 → 다음 pull에서 내 쓰기를 되받지 않음)
  │  상태표시 "저장됨"◀────────────────────────────────────────────────────────────────│
```
오프라인이면 `fetch` 실패 → outbox 유지, 상태 "오프라인 · n건 대기". `online`·`visibilitychange(visible)`·앱 시작 시 재시도.

## S2. pull (앱 시작·포커스·60초 폴링)
```
sync.ts                                   S
  │── GET /api/sync?since=<meta.cursor> ─▶│  WHERE owner_id=me AND seq>since ORDER BY seq LIMIT 500
  │◀─ 200 {trees:[..톰스톤 포함], nodes:[..], srs:[..], seq, more:bool}
  │  Dexie tx(rw 전부, outbox 제외):
  │   trees: deletedAt → 로컬 트리·노드·srs·attempts 하드 삭제(deleteTree와 동일 경로, outbox 기록 없음)
  │          아니면 put (visibility·slug 포함)
  │   nodes: deletedAt → 로컬 삭제 + srs 삭제 / 아니면 로컬 행과 updatedAt 비교, 서버가 크면 put
  │          (로컬이 크면 outbox에 이미 있으므로 다음 push가 이김)
  │   srs  : updatedAt 비교 + autoCorrectDays 합집합
  │   고아 검사: parentId가 트리에 없으면 parentId=root, updatedAt=now, outbox put
  │  meta.cursor = seq;  more면 반복
  │  화면: Dexie liveQuery 또는 reload 이벤트로 갱신(EditorPage는 nodesRef 교체 시 undo 스택 유지)
```
410 `cursor_expired`면 → outbox 먼저 push → `GET /api/sync?since=0`(스냅샷) → 로컬에 없는 서버 트리 추가, 서버에 없는 로컬 트리(= 다른 기기에서 지운 것, 톰스톤 만료)는 **"이 기기에만 있는 트리 n개"** 로 묶어 사용자에게 올리기/지우기 선택(04 §3.8 표 M4).

## S3. 첫 로그인 병합
```
AA 로그인 UX           sync.ts                        Dexie                 S
  │ 로그인 완료(userId) │                               │                     │
  │────────────────────▶│ meta.userId == null ?          │                     │
  │                     │──trees.toArray()──────────────▶│  로컬 트리 n개       │
  │   (AA) "로컬 트리 n개를 계정에 올립니다" 확인 ─ 데이터 규칙은 SH §3.8      │
  │                     │──POST /api/sync {trees,nodes,srs,attempts 전부} (500행씩) ─▶│
  │                     │◀─ 200 / 409 id_taken{ids} → 해당 트리 id·노드 id 재발급 후 재전송
  │                     │──GET /api/sync?since=0 ──────────────────────────────▶│  서버 트리(다른 기기)
  │                     │◀─ 트리·노드·srs ─ Dexie에 put (S2 규칙)
  │                     │──meta.userId=u, meta.cursor=seq
  │                     │── 이후 모든 repo 쓰기가 outbox를 남김(S1)
```
같은 기기에서 로그아웃 → 재로그인(같은 사용자): `meta.userId == u`면 S2만 수행. 다른 사용자(u2): 04 §3.8 M3.

## S4. 공유 보기 `/t/<slug>` (비로그인)
```
Bot/브라우저           CF                 Caddy                  S(API)                 DB
  │ GET /t/abc…        │                  │                       │                      │
  │───────────────────▶│ 캐시 miss         │                       │                      │
  │                    │─────────────────▶│ /t/* → reverse_proxy ─▶│ SELECT title,node_count,visibility,hidden,deleted WHERE slug
  │                    │                  │                       │◀─────────────────────│
  │                    │                  │                       │ visibility∈{unlisted,public} ∧ !hidden ∧ !deleted ?
  │                    │                  │                       │   → index.html 템플릿에 <title> og:title og:description("노드 300개 · Drill Down") og:image(정적 1장) og:url canonical robots(unlisted면 noindex) 치환, Cache-Control: public,max-age=60
  │                    │                  │                       │   아니면 → 410/404 HTML(동일 셸, "링크가 닫혔습니다"), no-store
  │◀───────────────────│◀─────────────────│◀──────────────────────│
  │ (브라우저) SPA 부팅 → router: pathname /t/<slug> → route shared
  │──GET /api/t/abc… ───────────────────────────────────────────▶│ {tree:{id,title,nodeCount,copyCount,owner:{nickname}}, nodes:[...]}  Cache-Control: private,no-store
  │  읽기 전용 소스로 플래시·빈칸·백지 실행(srs는 메모리 Map, 저장 안 함)
  │  [내 트리로 복제] → 로컬: 새 treeId·nodeId, sourceTreeId=원본 id, srs 없음, 로그인이면 outbox → push
  │──POST /api/t/abc…/copy (fire-and-forget, copy_count+1, 20/일/IP)
```

## S5. 공개 범위 전이 (소유자)
```
TreeListPage ⋯ → 공유 시트     sync.ts/API                     S
  │ private → unlisted          │──PUT /api/trees/:id/visibility {visibility:'unlisted'} ─▶│ slug 없으면 생성(11자 base58, 충돌 재시도), seq++
  │                              │◀─ {visibility, slug, url:"https://<domain>/t/<slug>"}
  │  로컬 trees.update (outbox 없이 — 서버 응답이 진실)                                  │
  │ unlisted → public            │──PUT … {visibility:'public'} ─▶│ 조건: title 비어있지 않음, node_count ≥ 3, hidden 아님. 갤러리 노출
  │ public/unlisted → private    │──PUT … {visibility:'private'} ─▶│ slug = NULL (회수), 기존 링크 404
  │ 링크 재발급                   │──POST /api/trees/:id/slug ──────▶│ 새 slug, 옛 slug 즉시 404
```
visibility 변경은 outbox가 아니라 전용 API다: slug는 서버만 발급하고, 오프라인에서 "공개"를 누를 수 없게 한다(버튼 비활성, 상태 "오프라인").
