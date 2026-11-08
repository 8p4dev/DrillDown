# 05 교차 검증 보고 (RV)

작성 2026-11-08 · 에이전트 RV · 상위 `../plans/orchestration_redesign.md` §1 R11 · 작업 기록 `../plans/agent_RV_review.md`.
대상: `01_design_system.md`(DS) `02_layout_mobile.md`(LM) `03_account_admin.md`(AA) `04_tree_sharing_sync.md`(SH)와 각 `evidence/`. 네 문서와 evidence는 수정하지 않았다. 근거 등급: **[인용]** 문서 절 / **[코드]** 현재 코드 파일:줄 / **[출처]** URL 직접 확인(2026-11-08) / **[재현]** 이 세션에서 실행한 측정 / **[추정]** 계산·가정.

## 1. 요약

| 심각도 | 건수 |
|---|---|
| 높음 | 2 |
| 중간 | 15 |
| 낮음 | 20 |

**전체 판정: 수정 후 진행.** 재설계가 필요한 영역은 없다. 높음 2건은 둘 다 "같은 것을 두 문서가 다르게 정한" 종류라 오케스트레이터가 소유자를 정하면 3차에서 반나절 안에 고칠 수 있다. 중간 15건 중 6건은 AA↔SH 경계(삭제 유예·병합 UX·에러 봉투·상태 표시·서버 스택·신고)에 몰려 있다 — 두 문서가 서로의 "요청 표"를 통합 전에 교차 확인하지 못한 결과다. 사용자 결정으로 올릴 항목은 §6에 19개로 합쳤다.

핵심 발견 5개:
1. `reports` 테이블과 신고 API를 AA·SH가 **각자 다른 스키마·경로·리밋으로** 정의했다(H1).
2. 트리 삭제 확인을 LM은 없애고(토스트 되돌리기), SH·DS는 유지한다. 비로그인 사용자의 로컬 삭제는 되돌릴 수 없어 데이터 손실로 이어진다(H2).
3. DS의 precache 예산은 gzip과 비압축을 혼동했다. 네 문서가 추가하는 코드를 합산하면 ≤500 KiB·첫 화면 ≤115 KB를 넘길 가능성이 크다(M6).
4. Cloudflare Access로 `/admin*`을 막는다는 AA 설계는 해시 라우터(`#/admin`)에서 작동하지 않는다(M7).
5. 측정 2건(대비·용량)은 재현됐고 수치가 문서와 일치한다(§5). 출처 18개 중 17개가 주장을 뒷받침한다(§5.3).

## 2. 발견 표

높음 = 요구 미충족·결정 위반·문서 간 모순으로 구현이 막힘 / 중간 = 틀린 사실·빠진 규칙·근거 없는 수치 / 낮음 = 표현·일관성.

| # | 심각도 | 문서·절 | 문제 | 근거 | 수정 제안 | 담당 |
|---|---|---|---|---|---|---|
| H1 | 높음 | AA §3.4 "AA가 추가로 소유하겠다고 제안하는 테이블" ↔ SH §3.6 DDL 마지막 줄·§3.5 | **`reports` 테이블 이중 정의.** AA: `(id, tree_id, reporter_id, reason CHECK IN ('copyright','spam','abuse','other'), note, created_at, resolved_at, resolution)`, API `POST /api/reports {tree_id, reason, note}` 5/시(anon)·20/시(user). SH: `(id, tree_id, reason, note, ip_hash, created_at, handled_at)`, API `POST /api/t/:slug/report`, 5/일/IP, reason 3종. SH의 `ip_hash`는 AA §3.7 "IP 주소 로그 금지"와 충돌. 둘 다 "내 소유"라 적음 | [인용] AA §3.4 "AA 소유 제안 … `CREATE TABLE reports`", AA §3.6 `POST /api/reports`; SH §3.6 "`CREATE TABLE reports … ip_hash`", SH §3.5 "신고 API … 내 소유, 신고 목록·처리 화면은 AA(D4)" | 오케스트레이터가 소유자 1명을 정하고(권장: AA — 처리 화면·`audit_log`와 같은 소유), 나머지 문서는 "요청" 표로 바꾼다. 스키마는 AA 안 + SH의 경로(`/api/t/:slug/report`, slug 기반이라 tree id 노출 없음) 채택, `ip_hash` 삭제, 리밋 한 값 | 오케스트레이터 → AA·SH |
| H2 | 높음 | LM D9·§3.5 "확인창" ↔ SH §4 목록 행·§5(d) W4 ↔ DS §3.5 "confirm 글자 유지" | **트리 삭제 확인 방식이 3문서에서 다르다.** LM: `confirm()` 제거, 즉시 삭제 + 토스트 되돌리기 5초(SH 소프트 삭제 의존). SH: 로컬은 **하드 삭제** 유지, confirm 문구에 "30일 안에 복구" 추가, W4는 로그인 사용자만 10초 되돌리기(서버 restore API). DS: confirm 문장 글자 유지. 결과: LM안대로 confirm을 빼면 **비로그인 사용자의 트리 삭제는 되돌릴 수 없다**(로컬 하드 삭제 + 서버 없음) | [인용] LM D9 "`confirm()` 제거 → 실행 후 토스트 되돌리기(5초)"; SH §2 "로컬은 하드 삭제", §4 "삭제 confirm 문구에 … 추가"; DS §3.5 "confirm '…삭제할까요?…' 글자 유지 — 파괴적 확인"; [코드] `src/core/repo.ts:26-33` `deleteTree`가 trees·nodes·srs·attempts를 즉시 delete | 한 가지로 통일. 권장: 로컬도 소프트 삭제(`Tree.deletedAt`, 목록에서 숨기고 되돌리기 토스트 뒤 하드 삭제)로 LM안을 살리거나, confirm을 유지하고 LM D9에서 트리 삭제만 제외. 초 단위(5 vs 10)도 한 값 | 오케스트레이터 결정 → LM·SH·DS |
| M1 | 중간 | AA §3.3 "SH 의존" 표·§3.4 "SH에 요청" 표·flows.md §4 ↔ SH §3.3·§3.8 M7·§3.12 D3 | **삭제 유예가 7일(AA) vs 30일(SH).** AA: 탈퇴 7일 뒤 purge 함수가 `trees/nodes/srs/attempts/events` 삭제, 유예 중 `/t/<slug>` **404**. SH: `deleted_at` 30일 보존 뒤 물리 삭제, 삭제 트리 **410**, `events`는 서버 미저장. AA의 "7일 내 재로그인 = 취소" 때 SH가 일괄 설정한 `trees.deleted_at`을 누가 되돌리는지 양쪽 다 없음. Kakao unlink 웹훅은 "유예 없이 purge 즉시"(AA)인데 SH는 30일 | [인용] AA flows.md §4 "7일 경과 … SH: trees/nodes/srs 삭제"; AA §3.4 요청 표 "`users.deleted_at IS NOT NULL`인 소유자의 트리는 404"; SH §3.3 "deleted → 410 … 30일 뒤 물리 삭제"; SH D3 "`UPDATE trees SET deleted_at=now` … 30일 뒤 물리 삭제" | 유예 하나(권장 7일: AA가 Kakao 정책 근거를 댐)와 응답 코드 하나(410)를 정하고, "취소 시 `deleted_at=NULL WHERE owner_id`"를 SH D3에 추가. AA 요청 표에서 `events` 삭제 삭제 | AA·SH |
| M2 | 중간 | AA §3.3 "로그인 전 로컬 트리 UX"·flows.md §5 ↔ SH §3.8 M1·M2 | **첫 로그인 병합 UX가 다르다.** AA: L>0,S=0이면 "자동 업로드, 사용자 선택 없음" 토스트; L>0,S>0이면 바텀시트 "[합치기] [이 기기 것만 유지]". SH: M1 "모두 올린다(**확인 1회**)", M2 "합집합" — "이 기기 것만 유지" 선택지는 없고 §3.8 끝에 "선택해서 올리기를 두지 않는 이유"까지 적음 | [인용] AA flows.md §5 "(자동 업로드, 사용자 선택 없음) [제안]", "[이 기기 것만 유지] … SH 확인 필요"; SH M1 "확인 대화 '이 기기의 트리 n개를 계정에 저장합니다' 1개", M2 "합집합" | SH 규칙이 데이터 소유자이므로 AA flows.md §5를 SH M1~M4에 맞춘다(대화 1개 재사용). "이 기기 것만 유지"는 삭제하거나 SH M3(계정 전환)로 한정 | AA |
| M3 | 중간 | AA §3.6 "공통" ↔ SH §3.6 "API" | **API 에러 봉투가 다르다.** AA `{ error: { code, message, field? } }`, SH `{ error: '<code>', message? }`. 둘 다 `src/core/api.ts` fetch 래퍼를 신규 파일로 제안(AA §5(b)·SH §5(b)) — 한 래퍼가 두 형식을 파싱할 수 없음. 코드 이름도 AA `not_found`/`rate_limited` 체계 vs SH `cursor_expired`/`idTaken`(camelCase 혼재) | [인용] AA §3.6 "오류는 `{ "error": { "code": …" ; SH §3.6 "에러 형식 공통 `{ error: '<code>', message?: string }`", 응답 필드 `idTaken` | AA 형식(필드 오류 표현 가능)으로 통일, SH 코드명을 snake_case로. `api.ts` 소유자 1명(AA) 지정 | 오케스트레이터 → SH |
| M4 | 중간 | DS §3.5 마지막 행·§3.6 #17·§3.9 ↔ SH §3.10 "동기화 상태 표시"·§3.12 D5 ↔ LM §3.1 목록 "동기화 상태는 … 아바타의 작은 점" | **동기화 상태 언어가 3문서에서 다르다.** DS: 4상태 `로컬/저장 중/저장됨/동기화 실패`, 8px 사각 점 + 짧은 글자. SH: 4상태 `저장됨/동기화 중/오프라인(n건 대기, 탭=재시도)/오류(탭=사유 1줄)` + 충돌 토스트, "비로그인은 표시 없음", DS에 아이콘 5종 요청. LM: 상단 바 아바타의 작은 점(글자·탭 동작 없음). DS의 "로컬" 상태는 SH 집합에 없고 SH의 "오프라인·n건 대기"는 DS·LM에 없음 | [인용] DS §3.5 "저장 상태 로컬 / 저장 중 / 저장됨 / 동기화 실패"; SH §3.10 표 4행 + "비로그인은 상태 표시 자체가 없다"; SH D5 "상태 아이콘 5종"; LM §3.1 "아바타의 작은 점으로(SH 의존)[제안]" | SH 상태 집합을 기준으로 DS #17·§3.5를 다시 쓰고, LM은 "n건 대기" 글자와 탭 동작이 들어갈 자리(목록 헤더 제안)를 정한다 | DS·LM(SH 기준) |
| M5 | 중간 | SH §3.4.1·§3.12 D1·§5(d) W2·§3.9·capacity.md ↔ AA §2 "TLS·정적 파일"·§3.1 배치 | **SH는 Caddy·Postgres를 전제, AA는 둘 다 뺐다.** SH: "Caddy(AA 스택 의존 D1)에서 `/t/*`만 reverse_proxy", W2 "Caddy에서 터널 외 접근 거부", §3.9 "pg_dump gzip 300 MB/일", capacity "Postgres `nodes` 1행 240 B". AA: "Caddy/nginx 없음", Node 1프로세스가 정적 서빙, SQLite `sqlite.backup()`. AA 배치도의 `/*` 정적 서빙 표에 `/t/:slug` HTML 경로가 없음 | [인용] SH §3.4.1 "Caddy(AA 스택 의존 D1)에서 `/t/*`만 API 서버로 reverse_proxy"; AA §2 "**Caddy/nginx 없음** [제안]"; AA §3.1 배치 "`/*` dist/ 정적 서빙" | SH §3.4.1·D1·W2·§3.9를 "Node 같은 프로세스에서 `/t/:slug` 라우트가 index.html을 치환"으로 고치고 백업 문장을 SQLite로. AA 배치도에 `/t/:slug`(SH) 추가 | SH(주)·AA |
| M6 | 중간 | DS §3.8 예산표 | **리소스 예산이 네 문서의 추가분을 감당하지 못할 가능성.** (1) precache 예산 "신규 화면 4개 lazy 청크 포함 — 각 ≤ 4 KB **gzip** 가정"인데 Workbox precache 수치는 **비압축**(bundle.md: JS 450,448 + CSS 49,623 + html ≈ 489.9 KiB와 일치) → 단위 혼동. (2) 합산 추정(아래 §5.4): 아이콘 18.3 KB(DS 측정) + 테마·툴팁 1.3 + LM viewport/Hint ≈ 6 + AA api/useMe/로그인/계정/관리자 ≈ 45 + SH sync/공유 보기/시트/상태 ≈ 30 − DS 삭제 5 ≈ **+95 KB → ≈ 585 KiB > 500 KiB**. (3) 첫 화면: 아이콘 테이블이 `App.tsx`(상단 바)에서 import되면 메인 청크에 들어가고, `sync.ts`·`useMe`·상태 표시·`viewport.ts`도 앱 시작 시 로드 → ≈ +15 KB gzip → **≈ 123 KB > 115 KB** | [인용] DS §3.8 "precache 489.88 KiB → ≤ 500 KiB … 각 ≤ 4 KB gzip 가정 [가정]"; [코드] `vite.config.ts` PWA 기본 glob(모든 js·css·html precache), bundle.md 36 entries; [추정] §5.4 표 | 예산을 다시 세운다: precache ≤ 600 KiB 또는 관리자·공유 보기 청크를 `globIgnores`로 precache 제외(런타임 캐시) 중 택일. 아이콘은 화면별 분할 import(목록 화면이 쓰는 ~15개만 메인 청크). 구현 1단계 뒤 `bundle.md` 재측정을 완료 기준에 넣는다 | DS(예산)·오케스트레이터 |
| M7 | 중간 | AA §2 "관리자 인증"·§3.4 관리자 인증 2·§3.7 위협표 | **Cloudflare Access로 `/admin*`을 막을 수 없다.** 라우트는 해시(`#/admin`, AA §3.4·§5(b))라 서버에 도달하는 경로는 항상 `/`. Access는 `/api/admin/*`만 가린다. 관리자 화면 JS 청크(`AdminPage-*.js`)는 누구나 받을 수 있음(내용 노출은 없으나 "존재를 숨긴다(404)" 의도와 어긋남) | [인용] AA §3.4 "라우트 `#/admin`(해시 라우터)", "Cloudflare Access 정책: `/admin*`·`/api/admin/*`"; [코드] `src/router.ts:12-22` 해시만 파싱 | 문장을 "`/api/admin/*`만 Access"로 고치고, 관리자 청크 비노출이 필요하면 `/admin` **경로** 라우트(SH `parseLocation`처럼 pathname 분기)로 바꾼 뒤 Access를 건다 | AA |
| M8 | 중간 | AA §3.2 콜백 흐름 | **인앱 브라우저·PWA 설치 상태의 로그인 미검토.** 공유 링크 유입 채널이 카카오톡인데(SH §3.4.1 OG 설계) 카카오톡 인앱 브라우저(WebView)에서 "Google로 계속"은 Google OAuth 정책상 임베디드 UA로 거부될 수 있다. iOS 홈 화면 설치(standalone) 상태의 OAuth 302 왕복과 쿠키 저장소 분리도 언급 없음 | [출처] Google OAuth 2.0 Policies "A developer must not direct a Google OAuth 2.0 authorization request to an embedded user-agent" https://developers.google.com/identity/protocols/oauth2/policies ; [추정] 카카오톡 Android 인앱 브라우저가 WebView인지와 실제 거부 응답(`disallowed_useragent`)은 이 세션에서 확인 못 함 | AA §3.2에 "인앱 브라우저 감지 시 '외부 브라우저로 열기' 안내"와 "standalone에서의 OAuth 흐름"을 M 체크리스트(LM M6와 함께)로 추가 | AA(+LM M6) |
| M9 | 중간 | LM §3.2 입력칸 인벤토리 I1~I13 | **요구 원문 "모바일 키보드"가 모든 입력칸에 대해 규칙이 있는지** — 누락: (a) 공유 보기 **신고 note**(SH `POST /api/t/:slug/report {note?}`, AA `note ≤300자`) — 하단 고정 복제 바가 있는 화면이라 규칙이 필요, (b) 관리자 정지·숨김 `reason`(AA §3.6), (c) 계정 삭제 모달(AA)의 입력 여부. 반대로 I12 "공유 slug 편집 `input`"은 SH에 없다(slug는 서버 발급·재발급만, SH §3.3 "재발급은 소유자 명시 동작만") | [인용] LM §3.2 I12 "공유 slug 편집 input (신규 …) [SH 의존]"; SH §3.3 "slug … 서버 crypto.randomBytes에서 생성"; AA §3.6 `POST /api/reports … note?: ≤300자`, `suspend … { reason? }` | I12를 삭제하고 신고 note(시트, 규칙 4(a) 적용)·관리자 reason(상단 표 안, I10과 같음)을 추가. 공유 보기 행의 "입력칸 없음"을 고친다 | LM(SH·AA 확인) |
| M10 | 중간 | LM §3.1 공유 보기 와이어·§3.2 규칙 4 | **공유 보기의 빈칸·백지 탭에서 하단 UI 2개가 겹친다.** 복제 바(`.flash-nav` 재사용, fixed 60px)와 `.dnd-dock`(sticky 38dvh 시트)·채점 후 `.dnd-bar`. LM은 플래시 탭만 "다음/요약 바가 복제 바를 대체"라고 정했고 빈칸·백지는 규칙 없음. SH §3.10은 하단에 `복제`+`신고` 둘 다 고정 | [인용] LM §3.1 "플래시 탭에서는 `[다음 개념 →][요약]` 바가 이를 대체하고 복제는 헤더 오른쪽 아이콘으로"; SH §3.10 "하단 고정: `내 트리로 복제`(주 동작), `신고`(보조)"; [코드] `dnd.css:126,142` 38dvh | 퀴즈 탭에서도 복제를 헤더 아이콘으로 내리고(플래시와 동일), `신고`는 ⋯ 메뉴(AA §4)로 통일. SH §3.10 하단 요소 문장 수정 | LM·SH |
| M11 | 중간 | AA §3.3 "계정 삭제" ↔ DS §3.6 카탈로그·§4 계정 행 ↔ LM D9 | **계정 삭제 확인 상호작용 3갈래.** AA: 모달 + "버튼 2초 홀드 [DS 인터랙션에 위임]". DS: 카탈로그 21항목에 홀드 없음, §4 계정 행은 "탈퇴 danger 글자 + confirm 글자". LM: `confirm()` 전면 제거(관리자만 2단계 버튼), 계정 탈퇴는 언급 없음 | [인용] AA §3.3 "버튼 2초 홀드 [DS 인터랙션에 위임]"; DS §4 "탈퇴 danger 글자 + confirm 글자"; LM D9 "`confirm()` 제거" | LM의 관리자 2단계 버튼(`[탈퇴]` → `[정말 탈퇴]` 3초)을 계정 탈퇴에도 쓰는 것으로 통일하고 DS #22로 등록 | DS·AA·LM |
| M12 | 중간 | DS §3.4 폰트 표 "가독성 관찰" 열 | **R7 완료 기준 "가독성 근거(x-height, 한글 자폭, 숫자 구분)"가 전부 [가정].** 후보 6개의 가독성 열이 모두 `[가정]`이며 측정(x-height 비율·자폭·`tnum` 지원 여부 확인)이 없다. 결론 "시스템 스택"은 요구 원문 8행("상용 사용 가능한 무료 폰트 중 가독성 좋은 폰트")이 요구한 **선택을 하지 않는** 결론이라 DS §6 Q2로 사용자에게 올라가 있지만 기본값이 원문과 반대 | [인용] DS §3.4 표의 가독성 열 6행 모두 "[가정]"; plan §1 R7 완료 기준 "가독성 근거(x-height, 한글 자폭, 숫자 구분)"; DS §5(d) 5·6 자인 | 2순위 후보(SUIT 또는 Pretendard 서브셋) 1개에 대해 x-height·자폭·숫자 폭을 실제 폰트 파일에서 재고(`opentype.js`/fonttools 반나절), "리소스 최소"와의 트레이드오프 표로 사용자 결정(§6 D2)을 뒷받침 | DS |
| M13 | 중간 | DS §2 "형광펜"·§3.1.4·§6 Q1 ↔ `orchestration_modes.md` §0·E1·E2 | **이전 사용자 결정과 충돌.** modes §0(사용자 결정 2026-11-01)은 형광펜 3색 분홍·노랑·하늘을 정했고, DS는 오케스트레이터 **가정** A6를 근거로 초록·빨강·밑줄로 바꾼다. 가정이 사용자 결정을 덮었다. DS가 §6 질문으로 올린 것은 맞음 | [인용] modes §0 E2 "형광펜 3색(분홍·노랑·하늘) 아이콘"; plan §2 A6 "초록·빨강 외의 유채색 … 쓰지 않는다" [가정 등급]; DS §3.1.4 "[제안] … A6 위반" | 사용자 결정 항목(§6 D1)으로 유지하되 기본값은 **현행 유지**(사용자 결정이 가정보다 우선). DS는 "A6 예외: 사용자 데이터 색" 안도 적어 둔다 | 사용자 결정 |
| M14 | 중간 | SH §3.1·conflicts.md C12·§3.11 ③ ↔ `decisions.md` 4 | **"오프라인 편집 동기화"는 decisions 4의 MVP 제외 항목**인데 SH ①~③은 outbox·LWW·톰스톤·충돌 20종으로 그것을 설계한다(③ L). plan R10 "여러 기기 동기화"가 이를 함의하므로 위반이 아니라 **긴장**이며, 범위(온라인 push-only로 시작 vs 전체)는 사용자 결정 | [인용] decisions 4 "MVP 제외: … 오프라인 편집 동기화, 공동 편집"; SH C12 "오프라인 3일간 편집 20건"; SH §3.11 ③ L | §6 D4로 올림. SH §1에 decisions 4와의 관계 한 줄 | 사용자 결정·SH |
| M15 | 중간 | AA §2 백업·§3.8·§5(d) 7 ↔ SH §3.1 톰스톤·Dexie v2 | **빠진 운영 요소.** (a) 백업 **복원 절차**가 "아무 Linux 기기에서 같은 명령으로 기동" 한 문장뿐(암호 해제 키 위치·`WAL` 파일·Tunnel 재연결·DNS 전환 순서 없음). (b) 서버 스키마 마이그레이션 도구 없음(`schema.sql` 1개) — SH 테이블·AA 테이블이 같은 파일에 들어가는데 버전 관리 규칙 없음. Dexie v2는 다운그레이드 불가(롤백 전략 없음). (c) 일일 작업이 AA(세션 정리·7일 purge·감사 1년)와 SH(톰스톤 30일)에 흩어져 있고 스케줄러 소유자 없음 | [인용] AA §3.1 "복원 = 파일 놓고 기동", AA §2 "월 1회 노트북 복원 리허설"; SH §3.1 "서버는 … 매일 1회 물리 삭제" | AA §3.8에 "복원 런북 10줄"과 "일일 작업 목록(AA 소유, SH 함수 호출)"을 추가. 마이그레이션은 `server/migrations/NNN.sql` + `user_version` PRAGMA 1줄 규칙 | AA(SH 함수 명세) |
| L1 | 낮음 | LM §3.1·§3.6·§5(b) `index.css` 인용 전부 | **`index.css` 줄 번호가 모두 어긋남.** `--nav-h`는 :14(LM :16), `--tap`은 :30(LM :37), `.topnav`는 :51(LM :48), `.topnav a`는 :58(LM :55), `main` 패딩 :78(LM :81), 16px 규칙 :111(LM :97), `.toasts` :157-174(LM :117-127). 다른 CSS 파일 인용은 정확함 | [코드] `grep -n` 결과 §5.2 | (b) 표의 `index.css` 줄을 갱신 | LM |
| L2 | 낮음 | AA §3.4 권한 매트릭스 "공개 트리 신고" ↔ SH §3.7 "신고" | owner: AA ❌(자기 트리 신고 불가) vs SH ✓; admin: AA ✅ vs SH —. 또 SH는 admin 복구(30일) ✓인데 AA에 복구 API 없음 | [인용] 두 표의 해당 행 | AA 값(owner ❌)으로 통일, `POST /api/admin/trees/:id/restore` 추가 여부 결정 | SH·AA |
| L3 | 낮음 | DS §3.5 상단 행 ↔ LM §3.1 결정된 상단 바 | 복습 링크: DS "≤420px 아이콘만" vs LM "`복습`+due 배지 •3". 비로그인 아이콘: DS `log-in` vs LM "사람 아이콘". ≥761 로그인: LM "텍스트 버튼" vs DS 아이콘 전용 | [인용] DS §3.5 "아이콘+글자, ≤420px 아이콘만 … log-in"; LM §3.1 "`[■] 내 트리 복습•3 [◐] [▣]`", "≥761은 `로그인` 텍스트 버튼" | 상단 바 요소 표 하나로 합치기(LM 배치 + DS 언어). DS §3.5 3행 수정 | DS |
| L4 | 낮음 | DS §3.5 아이콘 규칙 ↔ LM §3.5 툴팁 행 | 길게 누르기 400ms(DS) vs 500ms(LM). DS는 CSS `::after` 툴팁, LM은 위/아래 뒤집기·좌우 클램프(JS 필요) | [인용] DS "길게 누르기 400ms … `data-tip` → CSS `::after`"; LM "길게 누르기 500ms … 상단 60px 안이면 아래로 뒤집음, 화면 좌우 8px 안에 클램프" | 500ms(LM, 카드 끌기 250ms와 간격)로 통일, 구현 방식은 LM 규칙에 맞춰 DS가 "작은 JS" 인정 | DS |
| L5 | 낮음 | DS §4 목록 "아바타 정사각 이니셜 단색(5색조 삭제)" ↔ AA §3.3 "톤 0~5 + DS 팔레트" | 생성 아바타가 단색인지 6톤인지 불일치 | [인용] 양쪽 문장; [코드] `TreeListPage.tsx:17` `toneOf` 6값, `treelist.css:43-47` | 회색 단계 6톤(무채색)으로 하면 둘 다 만족 — DS가 명시 | DS |
| L6 | 낮음 | DS §2·§3.1 토큰 표 | `--shadow`·`--shadow-lift`·`--shadow-pop` **삭제**는 plan §3.2 "기존 이름 유지(… `--shadow-*` …)" 계약 밖. `--accent`·`--warn`만 DS 재량으로 허용됨 | [인용] plan §3.2 토큰 문장; DS §3.1 "`--shadow-*` 폐기" | 오케스트레이터 승인 또는 `--shadow-*: none` 별칭 유지 | 오케스트레이터 |
| L7 | 낮음 | SH §3.6 DDL 머리말 | "`jsonb→text`, `bigint→integer`로 1:1 치환 가능" — 실제 DDL에는 `uuid` `boolean` `double precision` `smallint` `real` `UPDATE … RETURNING`·부분 인덱스도 있다. SQLite는 타입 친화성으로 대부분 그대로 받아들이고(uuid·jsonb→NUMERIC 친화성, 문자열은 TEXT로 저장) 부분 인덱스·RETURNING도 지원하므로 결론은 맞지만 치환표가 불완전. FK는 `enableForeignKeyConstraints`(node:sqlite 기본 켜짐) 전제 | [인용] SH §3.6 DDL 전체; [출처] https://nodejs.org/api/sqlite.html | 치환표 5줄 추가, `uuid`→`TEXT`로 명시(친화성 의존 금지) | SH |
| L8 | 낮음 | SH §3.3·§5(c) slug 추측 | "기대 적중 ≈ 1.4×10¹¹년" — 재계산: 1/(2.7×10⁻¹⁶) = 3.7×10¹⁵회 ÷ (60/분 = 3.15×10⁷/년) ≈ **1.2×10⁸년**. 3자릿수 오차, 결론 불변 | [추정] 계산 | 수치 수정 | SH |
| L9 | 낮음 | SH §5(c)·§3.9·capacity.md gzip | 300노드 gzip이 §5(c) 10,552 B, measure_output.txt 10,545 B, 이 세션 재실행 10,497 B — zlib 구현 차이. 문서는 한 값만 | [재현] §5.1 | "≈10.5 KB(실행마다 ±0.5%)"로 적기 | SH |
| L10 | 낮음 | LM §3.4·§7 [출처 8]·[출처 11] | [출처 8](Apple 포럼 800125)에서 "iPhone 11 346pt·제안 바 45pt"를 **찾지 못함**(스레드는 24px 잔차만). [출처 11]은 취미 저장소 PR의 시뮬레이터 측정으로 301/320/44pt는 확인되나 1차 근거로 약함 | [출처] https://developer.apple.com/forums/thread/800125 ; https://github.com/Saffsanity/sill/pull/30 | 346pt는 [가정]으로 낮추거나 출처 교체. 설계는 `--kb` 실측 의존이라 영향 없음 | LM |
| L11 | 낮음 | AA §7 [출처 33]·[출처 34]·[출처 35] | 법령·판결 근거가 2차 자료(itwiki·언론)와 본문을 읽을 수 없는 PDF. [출처 34] PDF는 존재(2026-04-21, 7쪽)하나 요지 인용의 출처 문장을 확인할 수 없음 | [출처] https://www.scourt.go.kr/sjudge/1776736872554_110112.pdf (바이너리만) | 판결 요지에 [가정] 또는 "요약 출처: 언론 n" 표시 | AA |
| L12 | 낮음 | AA §2·§3.1 "Node 24 + `node:sqlite`" | `node:sqlite`의 안정성 등급(Node 25.7에서 1.2 Release candidate, Node 24 LTS에서는 실험 경고) 미표기. `sqlite.backup()`은 모듈 함수로 존재 ✓ | [출처] https://nodejs.org/api/sqlite.html "Stability: 1.2 - Release candidate … v25.7.0" | 등급과 Node 버전 고정(예: ≥25.7 또는 24 LTS + 경고 억제) 명시 | AA |
| L13 | 낮음 | AA §3.6 표 ↔ §4 로그인 행 ↔ §5(d) 9 | `state` 불일치 응답이 §3.6은 400 `oauth_state_mismatch`, §4는 `#/login?e=state` 토스트. 아바타 옵트인은 두 안(10분 캐시 / 재로그인) 중 §5(d)에서 재로그인 추천이지만 §3.6 표는 미결 | [인용] 해당 세 곳 | 302 `#/login?e=state`로 통일, §3.6 표를 재로그인 안으로 확정 | AA |
| L14 | 낮음 | AA §5(b) `vite.config.ts` ↔ SH §3.4.1 PWA | `navigateFallbackDenylist`: AA `[/^\/api/, /^\/t\//]` vs SH `[/^\/api\//]`("`/t/*`는 걸려도 무해") | [인용] 양쪽 | 한 값. `/t/`를 denylist에 넣으면 오프라인에서 열리지 않지만 어차피 네트워크 필요 → AA 값 권장 | SH |
| L15 | 낮음 | AA §3.4 첫 문단 ↔ LM §3.1 관리자 | 모바일 관리자 행 동작: AA "⋯ 메뉴", LM "마지막 줄 오른쪽 정렬 [정지][삭제] + 2단계 버튼" | [인용] 양쪽 | LM안으로(AA는 "LM 의존"이라 적음) AA 문장 수정 | AA |
| L16 | 낮음 | DS §3.2·§5(c) | "최저값은 **연두 틴트** 위 초록 글자 4.57" — 스크립트 라벨은 "초록 글자/초록 8% 틴트(플래시 green)". 또 §3.1 `--warn` 행 "`nodeColor`가 green/lightgreen/none만 반환"은 red도 반환(`:73`) — 요점(yellow 미반환)은 맞음 | [재현] contrast 출력 30행; [코드] `src/core/srs/index.ts:73,76` | 문구 수정 | DS |
| L17 | 낮음 | AA §3.4 점검 모드 ↔ SH §3.10 오류 상태 | 점검 모드 `/api/*` 503을 SH 상태 집합(오프라인=fetch 실패, 오류=4xx)이 다루지 않음 | [인용] AA "점검 모드(ON이면 `/api/*`가 503)"; SH §3.10 "오류 … 4xx" | 503·`Retry-After`는 "오프라인(재시도)" 상태로 분류 | SH |
| L18 | 낮음 | AA §3.4 대시보드 | R9 "가입 **추이**"가 총·오늘·7일 카운트뿐, 시계열 없음(약함) | [인용] plan R9 "사용자 수·가입 추이"; AA §3.4 "가입자(총·오늘·7일)" | `GET /api/admin/stats`에 일별 14일 배열 1개 추가 | AA |
| L19 | 낮음 | AA §5(b) `types.ts` 행 ↔ SH R-T1 | AA "클라이언트 `Tree` 타입 변경 없음" vs SH `Tree`에 선택 필드 3개 요청. 모순은 아니나 통합 문서에서 한 문장으로 | [인용] 양쪽 | AA 문장을 "AA는 변경 없음, SH R-T1 참조"로 | AA |
| L20 | 낮음 | SH §3.10 ↔ AA §4 공유 보기 | 신고 위치: SH "하단 고정 … `신고`(보조, 작은 텍스트)" vs AA "신고 버튼(⋯ 메뉴)" | [인용] 양쪽 | ⋯ 메뉴로 통일(M10과 함께) | SH |

**문제 없음으로 확인한 항목**(과제가 지목한 후보 중): (b) DS "테마 토글 상단 바 오른쪽(LM 확정)" — LM D2·타 문서 의존 표가 실제로 그렇게 정함 ✓. (c) `trees.hidden_by_admin_at`는 SH DDL에 포함 ✓, 집계 인덱스 `trees_owner_seq`가 owner COUNT를 덮음 ✓. (d) 역할명 4종과 뜻은 양쪽 동일 ✓(행 차이는 L2). (g) 라우트 이름 `login account admin shared`, `#/admin`, `/t/<slug>`는 네 문서 일치 ✓. (f) Dexie v2 테이블명 `outbox`·`meta`는 SH만 정의, AA는 "SH 소유"로 위임 ✓(`syncedAt` 예시 이름만 다름, 무해). 코드 대조 표본 ≥10 중 LM `index.css`를 제외한 모든 인용이 정확(§5.2).

## 3. 요구사항 대조표 (축 1)

### 3.1 plan §1 완료 기준

| R | 완료 기준 항목 | 충족 위치 | 판정 |
|---|---|---|---|
| R1 | 라이트·다크 토큰 표 전체(hex) | DS §3.1 | ✓ |
| R1 | 모든 글자/바탕 쌍 대비 계산값 | DS §3.2, contrast.md | ✓ 재현(§5.1) |
| R1 | 숙련도 단계의 색 아닌 두 번째 단서 | DS §3.1.2 마크·띠 패턴 | ✓ |
| R1 | 기존 토큰 대응표 | DS §3.1 표·§3.1.1 | ✓ (shadow 삭제는 L6) |
| R2 | 컴포넌트별 형태·상태 표 | DS §3.3 | ✓ |
| R3 | 화면별 텍스트 인벤토리(현재→바꾼 뒤) | DS §3.5 | ✓ (집계 70 vs 표 행 수는 묶음 행 때문, 무해) |
| R3 | 아이콘 목록(SVG 인라인, 개수·바이트) | DS §3.5, icons.md | ✓ 비압축 측정, gzip은 [가정](DS 자인) |
| R3 | 인터랙션 카탈로그(트리거·변화·지속·이징·reduced) | DS §3.6 | ✓ (홀드 없음 → M11) |
| R3 | 모든 아이콘 `aria-label` + 길게 누르기/호버 툴팁 | DS §3.5 규칙, LM §3.5 | ✓ (ms 불일치 L4) |
| R3 | 배치 | LM §3.5 6자리 규칙 | ✓ |
| R4 | 상태 기계·저장 키·부팅 순서·토글 위치·모양·E2E 항목 | DS §3.7, LM D2 | ✓ |
| R5 | 첫 로드 바이트 예산·기준선·목표 | DS §3.8, bundle.md | △ 예산 산정 오류(M6) |
| R5 | 폰트 후보별 실제 woff2 크기(서브셋 포함) | DS §3.4, fonts.md | ✓ |
| R5 | 제외한 의존성 목록 | DS §3.8, AA §3.1 끝 | ✓ |
| R5 | 서버 Pi 1대·월 비용 | AA §3.1·§3.8 | ✓ (Pi ARM 미측정은 [가정] 표시됨) |
| R5 | 레이아웃 비용 | LM §3.7 | ✓ |
| R6 | 6+4 화면 × 390/768/1440 | LM §3.1 | ✓ 기존 6개 측정, 신규 4개는 와이어만(768 표 요약) |
| R6 | 입력칸 인벤토리와 키보드 동작 | LM §3.2 | △ 누락·허수(M9) |
| R6 | 하단 바가 올라오거나 숨는 규칙 | LM D6·규칙 4 | △ 공유 보기 퀴즈 탭(M10) |
| R6 | `interactive-widget`·`visualViewport`·`dvh`·16px·iOS 차이 | LM §3.3 | ✓ 출처 확인(§5.3) |
| R6 | 브라우저별 전략표·수동 체크리스트·자동화 검사 | LM §3.3·§5(e) | ✓ |
| R7 | 후보 비교표(라이선스 URL·크기·가독성·다크 가중치) | DS §3.4 | △ 가독성 전부 [가정](M12) |
| R7 | 결정과 fallback 스택, 서브셋 방법 | DS §3.4 | ✓ (결정 자체는 사용자 질문 D2) |
| R8 | 흐름도(로그인·로그아웃·탈퇴·재로그인 병합) | AA §3.2, flows.md | △ 병합 UX가 SH와 불일치(M2) |
| R8 | 테이블·API | AA §3.5·§3.6 | ✓ (봉투 M3) |
| R8 | 개인정보 인벤토리 | AA §3.7 | ✓ |
| R8 | 위협·대응표 | AA §3.7 | △ 인앱 브라우저·Access 해시(M7·M8) |
| R8 | 비용 | AA §3.8, cost_table.md | ✓ |
| R8 | 계정 화면 5요소 | AA §3.3 | ✓ |
| R9 | 화면 목록 + 데이터 출처 | AA §3.4 | ✓ (추이 L18) |
| R9 | 권한 매트릭스 | AA §3.4, SH §3.7 | ✓ (행 차이 L2) |
| R9 | 감사 로그 | AA §3.4 DDL | ✓ |
| R9 | `role=admin` 허용목록 | AA §3.4 | ✓ |
| R10 | 동기화 모델(큐·LWW·충돌 시나리오표) | SH §3.1, conflicts.md C1~C20 | ✓ |
| R10 | 서버 스키마·API | SH §3.6 | ✓ (스택 문구 M5, 봉투 M3) |
| R10 | URL·slug 규칙 | SH §3.3·§3.4 | ✓ (수치 L8) |
| R10 | 권한 매트릭스 | SH §3.7 | ✓ |
| R10 | 복제 시 SRS 처리 | SH §3.4.3 "비움" | ✓ |
| R10 | 용량 추정 | SH §3.9, capacity.md | ✓ 재현(§5.1) |
| R11 | 각 문서 §5 (a)(b)(c)(d) | 네 문서 모두 | ✓ |

### 3.2 사용자 원문 11줄 대조

| 줄 | 원문 | 충족 | 비고 |
|---|---|---|---|
| 1 | 리퀴드 디자인 전부 폐기 | 0차 커밋 e52f5b0 | ✓ |
| 2 | 흰·검·초록·빨강 위주 | DS §3.1 | ✓ 제공자 브랜드색만 예외 질문(D5) |
| 3 | 사각형(최소 필렛) | DS §3.3 radius 0/2/2 | ✓ |
| 4 | 마이크로 인터랙티브, 최소 텍스트로 직관 이해 | DS §3.5·§3.6, LM §3.5 | △ "직관적으로 이해"의 검증은 목업 라벨 검사뿐. 아이콘 전용 15곳 중 `sun-moon`(자동 테마)·`corner-down-right`(더 들어가기)·`crosshair`(범위)는 관습이 약해 1회성 힌트(LM) 대상인지 확인 필요 — 사용성 테스트는 범위 밖이므로 [가정]으로만 적음 |
| 5 | 라이트/다크 전환 | DS §3.7 | ✓ 시나리오 ④ 통과 |
| 6 | 리소스 최소 | DS §3.8, AA §3.1·§3.8, LM §3.7 | △ 클라이언트 예산 재산정 필요(M6) |
| 7 | 모바일·PC, 키보드 | LM 전체 | △ M9·M10 |
| 8 | 상용 무료 폰트 중 가독성 좋은 폰트 | DS §3.4 | △ 결론이 "웹폰트 없음"(M12, D2) |
| 9 | 로그인·계정(프로필 이미지 등) | AA §3.2·§3.3 | ✓ (M2·M8·M11) |
| 10 | 관리자 페이지 | AA §3.4 | ✓ (M7) |
| 11 | 트리 저장·프라이빗·공개·링크 | SH 전체 | ✓ (H1·H2·M1·M14) |

## 4. 시나리오 추적 결과 (축 7)

네 문서만 보고 따라간 결과. "막힘" = 문서로는 다음 단계를 결정할 수 없음.

### ① 비로그인으로 트리 3개 → 폰에서 Kakao 로그인 → PC에서도 로그인
1. 폰 상단 바 사람 아이콘(LM) → `#/login`(AA) → "카카오로 계속" → `GET /api/auth/kakao/start?return_to=#/` → 콜백 → `sid` 쿠키 → `return_to`로 302. ✓
2. 로그인 성공 토스트(DS #18) + `sync.onLogin(userId)`(SH §4) — AA §5(b) `useMe()`에는 이 호출이 없음. **느슨함**: 호출 지점을 AA가 적어야 함(M2와 함께).
3. L=3,S=0: AA는 자동 업로드 토스트, SH M1은 확인 대화 1회. **막힘**(M2).
4. 업로드 중 `meta.userId`는 완료 후 기록(SH W7) ✓. 상태 표시: 어떤 모양·어디(M4) **막힘**.
5. PC: 로그인 → L=0,S=3 → AA 토스트 "가져왔어요", SH M2 합집합 → pull `since=0` → 목록 ✓.
6. 카카오톡 인앱 브라우저에서 시작했다면 Google 경로는 거부될 수 있음(M8) — 이 시나리오(Kakao)는 영향 없음.

### ② 트리를 링크로 공유 → 받은 사람이 로그인 없이 백지 퀴즈 → 복제
1. 소유자: 목록 ⋯ → `공유…` 시트(SH §3.10) → 세그먼트 `링크` → `PUT /api/trees/:id/visibility` → slug·URL → `복사`(DS #19 link→check) ✓. 비로그인 소유자는 "로그인하면 링크로…" 1줄 ✓.
2. 수신자: `GET /t/<slug>` → 서버가 OG 치환 HTML(SH §3.4.1; 서버 위치는 M5로 문구 수정 필요) → `parseLocation` → `shared` → `GET /api/t/:slug` ✓.
3. 상단 바: anon이라 `내 트리` 숨김(LM, 로컬 트리 0) ✓. 탭 `[보기|플래시|빈칸|백지]` ✓.
4. 백지 탭: `BlankDndPage`에 메모리 소스 주입(SH), 첫 채점 때 "기록 저장 안 됨" 토스트 1회 ✓. **막힘**: 하단에 `.dnd-dock`(38dvh)과 복제 고정 바(60px)가 동시에 있음(M10). 신고 위치 2갈래(L20).
5. `내 트리로 복제` → 로컬 트리 생성(id 재발급, SRS 비움) → 토스트 "복제됨 … [열기]" → `#/tree/<id>` ✓. `POST /api/t/:slug/copy` 204 ✓. 이후 상단 바 `내 트리` 표시 ✓.
6. 수신자가 삭제하려 하면 H2(비로그인 삭제 되돌리기 없음)에 걸림.

### ③ 모바일 에디터에서 노드 제목 입력 중 키보드 열림 → 하단 도구
1. 카드 두 번 탭(1회성 힌트, LM) → `input.title-input`(I3) 포커스 → `focusin` → `ensureVisible` → 키보드 → `--kb` 갱신 → 두 번째 `ensureVisible` ✓.
2. `.zoom-tools` `visibility: hidden`, 토스트 상단 이동, 캔버스 높이 불변(D5) ✓. 패널 도구 모음은 흐름 안(캔버스 아래)이라 키보드에 가려져도 제목 편집에는 불필요 ✓.
3. 미해결(LM 자인): 카드가 `scale(.5)`라 렌더 8px → iOS 확대 가능성(M3 체크). 설계로는 막힘 없음.
4. DS #15 노드 생성 애니메이션·#16 접기와 키보드 규칙 충돌 없음 ✓.
**결론: 막힘 없음.** 실기기 확인 항목만 남음.

### ④ 다크 모드 수동 설정 후 시스템 테마가 바뀜
1. 토글 `dark` → `data-theme=dark`, `theme=dark`, meta `#121212` ✓.
2. 시스템 → light: `matchMedia change` → 유효 테마 재계산 → 저장값 있으므로 dark 유지(DS 상태 기계 "light/dark에서는 시스템 변경 무시") ✓. CSS `:root[data-theme=dark]` 블록이 적용 ✓, `color-scheme` 동기 ✓.
3. 새로고침: 부팅 스크립트가 `localStorage.theme` 읽어 속성 설정 → FOUC 없음 ✓. 다른 탭: `storage` 이벤트 ✓.
4. manifest `theme_color` 고정 `#f4f4f4`는 설치 스플래시만 영향 ✓.
**결론: 막힘 없음.** E2E 항목 (6)이 이 시나리오를 덮는다.

### ⑤ 관리자가 신고된 공개 트리를 숨김 → 소유자에게 보이는 것
1. 신고 접수 경로가 2개(H1) — **막힘**.
2. 관리자 `#/admin` 공개 트리 탭 → 신고 보기 → `POST /api/admin/reports/:id/resolve {hidden}` → `trees.hidden_by_admin_at=now` + `audit_log` ✓ (AA가 SH 테이블에 씀 — 허용됨, 요청 표 반영).
3. 소유자: `/t/<slug>` 403 + 배너 "운영 정책으로 숨김"(SH 전이표), 공유 시트 ④ 배너, `GET /api/trees` `hiddenByAdmin` ✓. public 전환 거부 403 `hidden_by_admin` ✓, private 전환은 허용 ✓.
4. 빠진 것(낮음): 소유자 **통지** 없음(시트를 열어야 앎), 관리자가 적은 `reason`이 소유자에게 전달되지 않음, 소유자 이의 제기 경로 없음. 구현을 막지는 않음.
5. 갤러리 미운영(D3 기본값 "켬"이지만 사용자 결정) 시 `public`의 의미가 바뀌어 이 시나리오 자체가 약해짐.

## 5. 측정 재현 결과 (축 5)

### 5.1 스크립트 재실행 [재현]

| 스크립트 | 명령 | 문서 값 | 재현 값 | 판정 |
|---|---|---|---|---|
| `evidence/ds/contrast.mjs` | `node docs/specs/evidence/ds/contrast.mjs` | FAIL 0건; 최저 4.57(라이트)·4.72(다크); 비텍스트 최저 3.14; 다크 deuteranopia 초록↔빨강 ΔE 8, protanopia 32; 연두↔빨강 P 11 | FAIL 0건; 4.57(초록 글자/초록 8% 틴트) · 4.72(다크 빨강 글자/빨강 틴트); 3.14; ΔE 8 / 32 / 11 | **일치** (라벨 차이 L16) |
| `evidence/sh/measure_size.mjs` | `node docs/specs/evidence/sh/measure_size.mjs` | 300노드 JSON 76,457 B; gzip 10,552 B; 1,000노드 254,962 B; URL 해시 922자 / 상한 8,935자; 100노드 839 / 3,076자 | 76,457 B; **10,497 B**; 254,962 B; 922 / 8,935; 839 / 3,076 | **일치**(gzip ±0.5%, L9) |

실행 뒤 `git status`에 `src/**`·`evidence/**` 변경 없음. 출력은 scratchpad에만 두었다.

### 5.2 코드 대조 표본 (축 4)

| 문서 인용 | 실제 [코드] | 판정 |
|---|---|---|
| DS `srs/index.ts:76` green/lightgreen/none만, `:66` NodeColor에 yellow | `:66` `'yellow'` 포함, `:76` 3값 반환(`:73`에서 red도) | ✓(L16) |
| DS `index.css:44,47,93,109,133,146-149` | 링크 accent / 포커스 accent / primary accent / 입력 포커스 / `#f2994a` / reduced-motion 1ms | ✓ 전부 |
| DS `editor.css:62-63` heat 24%/75%, `:66` left/top 트랜지션, `:106-108` 형광펜, `:104` 50% | 일치 | ✓ |
| DS `index.html:7-8` theme-color 2개, `vite.config.ts` `#3b6cf0`/`#f4f5f7` | 일치 | ✓ |
| DS `FlashCard.tsx:46` success/warn, `useDragDrop.ts:67,98`, `DndPage.tsx:50`, `TreeListPage.tsx:44` haptic | 일치 | ✓ |
| DS "accent 참조 50곳 이상" | `var(--accent` 73곳(6파일) | ✓ |
| LM `index.css` 7곳 | 전부 다른 줄(§2 L1) | ✗ |
| LM `editor.css:14,213,214,226,228,155,16`, `treelist.css:8,13,90`, `flash.css:8,155,176-186`, `dnd.css:124,126,133,142,147,164`, `tree-header.css:23` | 일치 | ✓ |
| LM `EditorPage.tsx:175,364,558,570,631,673`, `TreeListPage.tsx:55,72,78,117`, `NodeRow.tsx:12-16,76,115,118`, `kit.tsx:29,49`, `Toast.tsx:19`(최대 3개 = `slice(-2)` :20) | 일치 | ✓ |
| LM `GraphView.tsx:50-87,94-127` | 파일은 `src/features/editor/graph/GraphView.tsx`(경로 생략), 내용 일치 | ✓(경로만) |
| AA `router.ts` Route 3종·`parseHash`, `App.tsx` 링크 2개, `db.ts` v1 5테이블, `TreeListPage:17 toneOf`, `treelist.css:37-47`, `events.ts exportEvents`, `vite.config.ts` 프록시 없음 | 일치 | ✓ |
| SH "`childrenOf`는 order만 정렬" | `repo.ts:50` `.sort((a,b)=>a.order-b.order)` — 안정 정렬 필요 주장 **확인** | ✓ |
| SH "현재 코드가 `attempts`에 쓰지 않음" | `db.attempts` 참조는 `db.ts:9,17`·`repo.ts:27,31`(삭제)뿐, `add/put` 없음 — **확인** | ✓ |
| SH "`recordGrade`가 `db.srs.put` 직접", `deleteTree` 하드 삭제, `renameTree`·`putNodes` updatedAt 갱신, `Tree` 4필드, `parseHash` 해시만·`hashchange`만 | `srs/index.ts:123`, `repo.ts:26-33,16-23,67-77`, `types.ts:4-9`, `router.ts:12-22,51` | ✓ |

### 5.3 출처 표본 (18개 열어 봄)

| 문서 | 출처 | 주장 | 확인 결과 |
|---|---|---|---|
| LM 7 | WebKit 259770 | RESOLVED FIXED 2026-11, iOS 27.3 베타, `resizes-content` 이상 보고 | ✓ (Modified 2026-11-06, "not 27.2", "resizes-content doesn't work as expected") |
| LM 6 | caniuse interactive-widget | Samsung 21+, Firefox 159, Safari ~27.2 미지원, Opera 80 | ✓ |
| LM 1 | Chrome 블로그 | 108에서 기본 `resizes-visual` | ✓ |
| LM 12 | AOSP keyboard-heights.xml | 1.285in, 200~227dp | ✓ |
| LM 11 | Saffsanity/sill PR 30 | 301/320pt, 제안 바 44pt | ✓ 존재·수치 일치(근거 등급 약함, L10) |
| LM 8 | Apple 포럼 800125 | 24px 잔차 iOS 26.0; 346pt/45pt | △ 24px ✓, 346pt/45pt **미발견**(L10) |
| AA 31 / SH 4 | OWASP 세션 | 64비트 엔트로피, 로그인 시 재발급 | ✓ |
| AA 10 | Kakao OIDC discovery | S256, userinfo, `nickname`·`picture` 클레임 | ✓ |
| AA 8 | Kakao 동의항목 | 닉네임·프로필 사진 비즈 앱 불필요, 이메일은 비즈 앱 | ✓ |
| AA 12 | Kakao 연결 끊기 알림 | 어드민 키 헤더, 3초 내 200, 재시도 언급 없음 | ✓ (AA의 "재시도 [가정]"도 정확) |
| SH 1 | Chromium url_constants.h | `kMaxURLChars = 2*1024*1024` | ✓ |
| AA 18 | sqlite.org/whentouse | 10만 hit/일, writers take turns | ✓ |
| AA 30 | markaicode Caddy 벤치 | Caddy 유휴 30~60 MB | ✓ (59.2 MB; URL slug는 "celery"지만 내용은 Nginx vs Caddy) |
| DS 10 | lucide-static@1.70.0 | ISC, 1.70.0 존재 | ✓ |
| DS 4 | Pretendard LICENSE | OFL 1.1, RFN 'Pretendard' | ✓ |
| DS 5 | SUIT LICENSE | OFL 1.1, RFN SUIT | ✓ |
| AA 19 | nodejs.org sqlite | `sqlite.backup()` 존재 | ✓ (안정성 1.2 RC — L12) |
| AA 34 | 대법원 PDF | 2026-04 판결 요지 | △ 파일 존재, 본문 추출 불가(L11) |
| (RV 추가) | Google OAuth 정책 | 임베디드 UA 금지 | ✓ (M8 근거) |

열람 실패: 없음(모두 응답). 열어 보지 않은 출처(DS 1·3·6~9·11, LM 2~5·9·10·13~15, AA 1~7·9·11·13~17·20~29·32·33·35~38, SH 2·3·5~10)는 판단하지 않았다.

### 5.4 리소스 예산 합산 [추정]

| 추가 코드 | 비압축 추정 | 근거 |
|---|---|---|
| DS 아이콘 테이블 52개 | +18.3 KB | icons.md [측정] |
| DS `theme.ts`+토글, 툴팁 CSS, 부팅 스크립트 | +1.5 KB | DS §3.8 |
| DS 삭제(그림자·backdrop·keyframes·5색조 등) | −5 KB | DS §3.8 [가정] |
| LM `viewport.ts` `Hint.tsx` + CSS | +6 KB | 계약 3함수 + 토스트 변형 |
| AA `api.ts` `useMe` 배너 `avatar.ts` | +6 KB | — |
| AA `LoginPage` `AccountPage`(기기 목록·내보내기·삭제·휴지통) | +14 KB | — |
| AA `AdminPage` + 탭 3 + `admin.css` | +25 KB | 표 4개·검색·페이지네이션 |
| SH `sync.ts`(push·pull·LWW·고아·커서·상태) | +12 KB | — |
| SH `SharedPage` `ShareSheet` `SyncStatus` 라우터·소스 prop | +18 KB | — |
| **합계** | **≈ +95 KB → precache ≈ 585 KiB** | 예산 500 KiB |

첫 화면(gzip): 아이콘 ≈ 6(DS 추정) + 테마 0.5 + `api`/`useMe` 1.5 + `sync.ts` 4 + 상태 표시·공개 아이콘·시트 lazy 경계 2 + `viewport.ts` 1 ≈ **+15 KB → ≈ 123 KB**(예산 115). 모두 [추정]이며 실측은 구현 1단계 뒤 가능 — 그래서 M6의 제안은 "예산 재설정 + 재측정 완료 기준"이다.

## 6. 사용자에게 올릴 결정 사항

네 문서 §6을 합치고 중복을 제거했다(DS 6·LM 6·AA 8·SH 6 → 19). "기본값 제안"은 답이 없을 때 3차가 전제할 값이며, 근거는 해당 문서의 자체 추천이다.

| # | 결정 | 출처 | 기본값 제안 |
|---|---|---|---|
| D1 | 형광펜 분홍·노랑·하늘 → 초록·빨강·밑줄로 바꿀지(2026-11-01 결정과 충돌, M13) | DS 1 | **현행 3색 유지**(사용자 결정 > 가정 A6; A6에 "사용자 데이터 색 예외" 추가) |
| D2 | 웹폰트 없이 시스템 폰트(최소 183 KB 절약) vs SUIT 2파일 339 KB | DS 2 | 시스템 폰트(측정 근거 있음). M12 보강 후 재질문 |
| D3 | 공개 갤러리 운영 여부(신고·저작권 응대) | AA 4, SH Q1, plan 미결 | 켬(④단계 S) |
| D4 | 오프라인 편집 동기화 범위(decisions 4 제외 항목, M14): 전체(①~③) vs 온라인 push·LWW만 | RV | ①·② 먼저, ③(충돌 UI·휴지통)은 사용 후 결정 |
| D5 | Google·Kakao 버튼 브랜드색 A6 예외 | DS 5, AA | 예외 허용(제공자 규정) |
| D6 | 숙련도 초록/연두 2단계 유지 vs 초록 1단계 | DS 3 | 2단계 유지(현행 SRS) |
| D7 | 파랑 accent 폐기 → 링크는 밑줄 검정 | DS 4 | 폐기 |
| D8 | 하단 탭 바 없이 상단 바만 | LM 1 | 상단 바만 |
| D9 | 관리자 PC 우선, 모바일 읽기 중심 | LM 2 | PC 우선 |
| D10 | 가로 모드 지원(규칙만) vs 세로 고정 안내 | LM 3 | 규칙만(D11) |
| D11 | `interactive-widget` 미지정 + VirtualKeyboard API는 실기기 뒤 | LM 4 | 동의 |
| D12 | PWA 설치 안내를 1회성 힌트 슬롯으로 통합; 복습 링크 `복습`+배지 | LM 5·6 | 통합·배지 표시 |
| D13 | Pi 보유 여부·모델(2/4/8GB) → 하드웨어 28만 원이 0인지 | AA 1, plan 미결 | 미보유 가정(4GB) |
| D14 | 가정 회선 약관(서버 운영 금지 조항) 확인; 금지면 VPS 월 6~7천 원 | AA 2 | 사용자 확인 필요(기본값 없음) |
| D15 | Naver 로그인 추가(검수 필수, S + 대기); Apple 제외 | AA 3 | 보류, Apple 제외 |
| D16 | 계정 삭제 유예 7일(AA) vs 트리 보존 30일(SH) 통일(M1) | AA 5, SH Q4 | 7일 통일 |
| D17 | 관리자 2차 인증 Cloudflare Access(`/api/admin/*`만, M7) | AA 6 | 사용(운영자 이메일 2개) |
| D18 | 처리방침 보호책임자 이메일 1개; 도메인 | AA 7, SH Q6, plan 미결 | 사용자 입력 필요 |
| D19 | 공유 보기 비로그인 학습 기록 미저장; private 전환 시 링크 회수; `events` 서버 미저장 | SH Q2·Q3·Q5 | 미저장 / 회수 / 미저장 |

오케스트레이터 결정(사용자 아님): H1 `reports` 소유, H2 삭제 확인 방식, M3 에러 봉투·`api.ts` 소유, L6 `--shadow-*` 계약, AA §6-8(`settings` 테이블, `users.nickname_edited_at`, `sessions.last_seen_at`), SH D7(`types.ts` R-T1·R-T2).

## 7. 이 검토의 한계

- **실기기·브라우저 없음.** LM의 키보드 시뮬레이션·스크린샷을 다시 찍지 않았고 `measure.json` 수치를 앱에서 재측정하지 않았다. dev 서버를 띄우지 않았다.
- **출처 18/약 80.** 열어 보지 않은 출처의 정확성은 판단하지 않았다. 열람한 PDF 1건은 본문을 읽지 못했다.
- **예산 합산은 추정.** §5.4의 KB는 구현 전 추정이며 ±50%일 수 있다. 결론(초과 가능성)은 추정 하한에서도 유지된다.
- **AA 메모리 측정 미재현.** `memory_measure.md`의 63 MB는 Windows x64 값이고 AA 스스로 Pi 미측정을 밝혔다. 재실행하지 않았다.
- **evidence 전문 미열람.** `conflicts.md` C1~C20은 행 머리만 읽었고 각 기대 결과의 논리를 하나씩 검증하지 않았다. `sources.md`·`sequences.md` 본문, `mock.html`은 열지 않았다.
- **사용성 판단 없음.** "직관적으로 이해"(원문 4행)는 사용자 테스트 없이는 판정할 수 없어 [가정]으로만 적었다.
- **같은 모델의 검토.** 네 문서와 같은 종류의 에이전트가 검토했으므로 네 문서가 공유하는 맹점(예: Pi 1대 운영 전제 자체의 타당성, 한국 개인정보법 해석)은 이 검토도 공유할 수 있다.
