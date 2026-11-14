# R4 리뷰 — 학습(flash·dnd) · 공유(share) · 관리자(admin) 화면

읽은 범위: `src/features/flash/**`(6파일) · `src/features/dnd/**`(7) · `src/features/share/**`(11) · `src/features/admin/**`(12) 전부, 그리고 교차 확인용으로 `App.tsx`·`router.ts`·`core/api.ts`·`core/source.ts`·`core/srs/index.ts`·`core/sync/engine.ts`·`server/sync/share.ts`·`server/account/{admin,product,legal}.ts`·`dist/` 번들 CSS 의존 그래프. `npm run typecheck`·`lint`·`flash.check`·`dnd.check` 모두 통과(2026-11-14 기준). 아래는 전부 코드로 확인한 것만 적었다. 저장소는 수정하지 않았다.

## 핵심 5줄

1. **H** 백지·빈칸 퀴즈가 `attempts`(BlankAttempt)를 어디서도 쓰지 않는다 → 서버 `attempts` 테이블이 영원히 비고, 지표 탭의 K2·회독 재현율·자기채점·구조 오답·활성화율·"백지 완료" 그래프가 전부 0/—. 지표 탭이 통째로 죽은 화면이다.
2. **M** 플래시 진행 저장: 범위(ScopeSelect)를 바꾸면 **이전 범위의 세션이 새 범위 키에 덮어써져** 저장된 진행을 잃는다(effect 선언 순서 문제). 고치는 법은 `App.tsx` 한 줄(`key={r.treeId + r.rootId}`, dnd 와 같게).
3. **M** 지표 탭 추천 고정: 설정 GET 이 끝나기 전·실패한 상태에서 [추천]을 누르면 `featured_slugs` 가 그 한 개로 **덮어써진다**(기존 추천 전부 소실).
4. **M** 관리자 파괴 동작 중 TwoStep 없는 것: 신고 큐의 [숨김](확정 숨김) · [보류 30일] · 소명 [숨김 해제] · 게시중단 [재개] · 운영 스위치 체크박스(전 사용자 기능 끄기). 공유 보기는 신고 폼 더블 클릭으로 2건 접수 가능(자동 숨김 임계치에 바로 반영).
5. 삭제 가능: FlashCard `rateable`/"참고" 경로(복습 화면 삭제 후 죽은 코드) · Minimap 의 `aria-hidden` 아래 role/aria/키 핸들러 · `p2/when/DAY` 4곳 중복 · `FEEDBACK_CATEGORY` 3곳 · `Dday` 2종 · `Tree` 캐스트 3곳. 갤러리 직접 진입(#/gallery)은 미리보기 시트 CSS(`share-list.css`)가 로드되지 않는다.

## 발견 표

| ID | 심각도 | 분류 | 파일:줄 | 문제 | 고치는 법 (가장 짧은 diff) | 공수 |
|---|---|---|---|---|---|---|
| R4-01 | H | 버그·데이터 | `src/features/dnd/DndPage.tsx:59-72`, `BlankDndPage.tsx:62-75`, (근거) `src/core/sync/engine.ts:157,190`, `server/account/product.ts:65-134` | `grade()` 가 `recordResults` 와 `logEvent` 만 하고 `db.attempts` 에 `BlankAttempt` 를 넣는 코드가 클라이언트 어디에도 없다(`grep attempts.add\|kind: 'attempt'` 0건). 엔진은 attempts 를 push 하도록 준비돼 있고 서버 지표는 전부 그 테이블을 읽는다 → 지표 탭(MetricsTab) 학습 카드·"백지 완료" 시리즈·retrieval_active 가 영구 0. 11_cost_recovery 의 킬 기준(K2 20%)을 측정할 수 없다 | `grade()` 성공 뒤 `source.ephemeral` 아니면 `db.attempts.add({ id: newId(), treeId, rootId, startedAt, completedAt: Date.now(), nodeRecall: s.correct/s.total, edgeAccuracy: s.correct/s.total, autoGradedCount: s.total, selfGradedCount: 0, overriddenCount: 0 })` + `track([{ kind: 'attempt', id, treeId, op: 'put' }])`. `startedAt` 은 Quiz 마운트 시각 `useRef(Date.now())`. 한 곳에 두려면 `StudySource` 에 `attempt?(a)` 를 추가하고 dexieSource 만 구현(memorySource 는 생략) | M |
| R4-02 | M | 버그·데이터 손실 | `src/features/flash/FlashPage.tsx:73,80-91`, `src/App.tsx:128` | `key` 가 바뀌는 커밋에서 effect 80(저장본 읽기 → `setOffer(saved); setSession(null)`)과 effect 89(`store.set(key, session)`)가 **같은 커밋에 선언 순서대로** 실행된다. 89 는 아직 이전 범위의 `session` 을 들고 있어 **새 키에 이전 범위 세션을 씀** → 새 범위의 저장 진행(S_R)이 덮어써지고 sessionStorage live 플래그까지 켜진다. 사용자가 "이어서/처음부터" 를 고르지 않고 떠나면 복구 불가. 이전 세션이 `sub`(모름만·약점만)이고 부모 범위로 올라간 경우 `readProgress` 의 개념 수 검사도 통과해(`flash.check.ts:30` 의 S4 규칙) 다음 방문에 **다른 범위의 세션이 조용히 이어진다**. dnd 페이지는 이미 `key={treeId + rootId}` 라 해당 없음 | `App.tsx:128` `key={r.treeId}` → `key={r.treeId + r.rootId}`, `SharedPage.tsx:315` `key={slug}` → `key={slug + rootId}`. 범위가 바뀌면 리마운트되어 stale 세션이 없다(dnd 와 동일 규칙) | S |
| R4-03 | M | 버그·데이터 | `src/features/admin/MetricsTab.tsx:57,136-139` | `Curation featured={res?.settings.featured_slugs ?? []}`: `/api/admin/product/settings` 응답 전(또는 guard 로 실패 뒤)에 트리 표가 먼저 뜨면 `featured=[]` → [추천] 1회 클릭이 `save({ featured_slugs: [slug] })` 로 **서버의 추천 목록을 통째로 교체**한다 | `{res ? <Curation featured={res.settings.featured_slugs} …/> : <Loading />}` | S |
| R4-04 | M | 안전장치 | `src/features/admin/TreesTab.tsx:82-83,98-99`, `RequestsTab.tsx:79,109`, `MetricsTab.tsx:51` | TwoStep 없는 파괴 동작: 신고 묶음의 [숨김](= `resolve(…,'hidden')`, 서버는 **확정 숨김** + 그 트리 신고 전부 종결) · [보류 30일] · 소명 [숨김 해제](공개 복귀) · 게시중단 [재개](법적 상태 전이) · 정보주체 [완료](감사 기록, 되돌리기 없음) · 운영 스위치 체크박스(클릭 1번에 전 사용자 갤러리/공개 전환 차단). 같은 파일의 TreeRow 는 TwoStep + 사유 입력을 쓰고 있어 일관성도 깨진다 | 각 `<button>` → `<TwoStep label=… confirmLabel="정말 …" onConfirm=…/>`(이미 import 됨). 스위치는 `onChange` 대신 `TwoStep` 또는 저장 버튼 1개로 | S |
| R4-05 | M | 버그·중복 접수 | `src/features/share/SharedPage.tsx:187-197,369` | 신고 폼에 busy 상태가 없다. 응답 전 두 번 누르면 **신고 2건** 접수 → `auto_hide_reports` 임계치(T2 #28)에 즉시 2 가 쌓여 자동 임시 숨김이 더 쉽게 발동(로그인 20/시 한도 안에서 1인이 N건 가능) | `const [sending, setSending] = useState(false)`; submit 버튼 `disabled={sending}`; `sendReport` 에서 set/finally | S |
| R4-06 | M | UI 정합성(flags) | `src/features/share/SharedPage.tsx:222-232,263`, `GalleryPage.tsx:102-106`, `src/App.tsx:115` | 운영 스위치 `report`/`rating` 이 꺼져도 신고 메뉴·별 5개가 그대로 보이고 서버 403 토스트로만 끝난다. 갤러리는 꺼지면 404 인데 화면은 "불러오지 못했습니다 · 다시 시도"(오류로 오해). 비로그인은 `me` 가 없어 상단 '공개 트리' 링크가 항상 보인다(`/api/t/:slug`·`/api/gallery` 응답에 flags 가 없어 비로그인 게이팅 불가) | 로그인 사용자만이라도: `const fl = me?.product.flags`; `fl?.report !== false && <li>신고</li>`, 별점 `disabled={ownTree \|\| fl?.rating === false}`. 갤러리: `e.status === 404` 면 "지금은 꺼져 있습니다" 문구. 비로그인까지 하려면 서버가 `/api/t/:slug` 응답에 `flags` 1필드 추가(다른 워커 영역) | S |
| R4-07 | M | 접근성 | `src/features/share/ShareCard.tsx:35-46,50-56` | `role="treeitem"` 카드가 `tabIndex` 와 키 핸들러가 없어 **키보드로 선택·접기 불가**(aria-selected/expanded 만 선언). 접기 배지는 `aria-hidden` + onClick 뿐. 선택이 없으면 [여기부터 학습]도 못 쓴다 → 공유 보기 그래프는 마우스 전용 | 카드에 `tabIndex={p.selected ? 0 : -1}` + `onKeyDown`: Enter/Space → onSelect, ArrowLeft/Right → `p.hasChildren && onToggle()`. 배지의 `aria-hidden` 은 유지(카드가 대신 받음) | S |
| R4-08 | M | 버그(CSS 누락) | `src/features/share/GalleryPage.tsx:11`, `share-list.css:19-31`, (근거) dist 의존: `GalleryPage → share.css` 만 | `.share-sheet{display:grid;gap}`·`.sheet-head .sheet-x{44px}` 가 `share-list.css` 에 있는데 GalleryPage 는 `share.css` 만 import. **#/gallery 로 직접 진입**(새 탭·링크)하면 미리보기 시트가 간격 0·닫기 버튼 작음. 트리 목록을 먼저 거친 세션에서만 우연히 정상 | `.share-sheet`·`.sheet-head .sheet-x` 두 규칙을 `src/index.css` 의 `.sheet-head` 옆(282줄)으로 옮긴다(Sheet 는 ui/ 공용). 또는 GalleryPage 에 `import './share-list.css'` 1줄 | S |
| R4-09 | L | 오류 처리 | `src/features/share/SharedPage.tsx:143` | `copyTree(t)` 가 try 밖. IndexedDB 쿼터·트랜잭션 실패 시 unhandled rejection, 사용자는 아무 피드백 없음(5xx 아닌 클라이언트 오류라 `/api/client-error` 로도 안 감) | `try { tree = await copyTree(t) } catch { return toast('복제하지 못했어요 · 저장 공간을 확인하세요') }` | S |
| R4-10 | L | 상태 불일치 | `src/features/admin/TreesTab.tsx:125-128,74-83` | TreeRow 의 숨김/해제(`act`)는 trees 만 갱신하고 `reports` 상태의 `tree.hidden_by_admin_at` 은 안 건드린다 → 신고 묶음에 "숨김 중" 표식·[보류 30일] 버튼이 틀린 채 남는다(`hold` 는 반대로 reports 까지 갱신). 소명 수용(`decide`)도 reports 미갱신 | 신고 묶음의 `hidden` 을 `live.find(x => x.id === t.id)?.hidden_by_admin_at ?? t.hidden_by_admin_at` 로 trees 에서 파생 | S |
| R4-11 | L | 버그(표시) | `src/features/admin/Dashboard.tsx:26,41` | `rssPct = Math.round(s.rss / o.rss_max * 100)`: systemd MemoryMax 없는 환경(개발·`rss_max=0`)이면 `Infinity%`, dot 은 빨강 | `o.rss_max ? … : null` 로 분기, null 이면 "한도 없음" | S |
| R4-12 | L | 성능(Pi) | `src/features/admin/SystemTab.tsx:83`, (근거) `server/account/ops.ts:50,60` | 백업·일일 작업 중 `/api/admin/stats` 를 3초마다 호출. 서버는 매 호출에 `readdirSync(server, recursive)` + 백업 파일별 `statSync` + 디스크 통계. 작업 중엔 Pi 가 가장 바쁜 시점 | 폴링 간격 10초, 또는 `/api/admin/ops/jobs` 같은 가벼운 엔드포인트(서버 측 변경) | S |
| R4-13 | L | 성능(Pi) | `src/features/share/GalleryPage.tsx:85-91` | 미리보기는 `GET /api/t/<slug>` 로 **전체 노드(note 포함, 최대 5,000)** 를 받아 제목 60줄만 보여 준다. 공개 트리 쪽은 캐시도 없다(갤러리 60초 캐시는 목록만) | 당장은 그대로(링크 열기와 같은 비용). 줄이려면 서버가 `?fields=titles` 또는 gallery item 에 `preview` 60줄을 넣는다(다른 워커) | M |
| R4-14 | L | 오류 처리 | `src/features/share/ShareSheet.tsx:87,91` | `localStorage.getItem/setItem(ACK)` 가 try 없음. 저장소가 막힌 브라우저(사생활 모드 일부·기업 정책)에서 "공개" 클릭이 SecurityError 로 터져 아무 반응 없음. 같은 파일 다른 곳과 FlashPage 는 전부 try 로 감쌈 | FlashPage 의 `store.get/set` 과 같은 3줄 래퍼 또는 `try { … } catch {}` | S |
| R4-15 | L | 일관성 | `src/features/share/SharedPage.tsx:37-42` vs `src/features/admin/shared.ts:8` | 신고 사유 라벨이 두 벌: 사용자 "욕설/유해" · 관리자 "욕설·혐오" | `REASON` 하나를 `core/api.ts` 의 `ReportReason` 옆에 두고 둘 다 import | S |
| R4-16 | L | 안전장치 | `src/features/admin/NoticeForm.tsx:64,61-66` | 점검 "예약 저장" 은 지정 시각에 전 사용자 503 인데 일반 submit. 켜기는 TwoStep | `<button type="submit">` → TwoStep(form 밖 onConfirm 으로 save 호출) 또는 그대로 두고 저장 토스트에 시각 명시 | S |
| R4-17 | L | 버그(시간대) | `src/features/admin/RequestsTab.tsx:35` vs `SystemTab.tsx:195` | `new Date('YYYY-MM-DD')` 는 **UTC 자정**, SystemTab 의 `dayStart` 는 `T00:00:00`(로컬). 접수일이 KST 기준 09:00 로 저장되고 D-N 계산 기준이 9시간 밀린다 | `new Date(f.received_at + 'T00:00:00').getTime()` (SystemTab 과 같게) | S |
| R4-18 | L | 문구 | `src/features/dnd/BlankDndPage.tsx:24` | 백지 퀴즈 힌트가 "카드 탭 → 빈칸 탭" — 백지에는 빈칸이 없다(id 도 'dnd' 와 같아 둘 중 먼저 본 것만 뜬다) | `'카드 탭 → 붙일 자리 탭'`, id `'blank'` | S |
| R4-19 | L | 오류 처리 | `src/features/flash/FlashCard.tsx:104` | `record` 가 `null`(노드가 다른 기기에서 지워짐)이면 조용히 return — 화면엔 "알음/모름" 결과 버튼이 그대로 남아 기록된 것처럼 보임 | `if (!s) { setRated(m => …delete); return toast('삭제된 노드예요') }` (S3 분기와 같은 3줄) | S |
| R4-20 | L | 접근성 | `src/features/admin/UsersTab.tsx:49,109`, `SystemTab.tsx:118` | 로딩 표현이 세 가지: `<Loading/>`(재시도 없음), 인라인 `aria-busy + 다시 시도`(UsersTab 2곳), `Admins` 는 로딩 중 `null`(섹션이 통째로 사라짐) | `Loading({ onRetry? })` 하나로 통일, Admins 도 `<Loading/>` | S |

보안·개인정보: 신고·게시중단·관리자 화면에서 IP/이메일/UA 저장은 클라이언트 쪽에 없다(연락처는 게시중단 요청에만, 서버 90일 삭제). `toHtml` 은 `esc` 로 텍스트를 이스케이프하고 `hl-${c}` 의 `c` 는 정규식 `[pyb]` 에서만 나온다 → 공유 트리 note 의 XSS 경로 없음(확인: `format.ts:10,43,94-100`). 관리자 API 는 전부 서버 role 검사이고 클라이언트 `AdminPage` 의 `role==='admin'` 은 표시용. 특이사항 없음.

## 삭제·단순화 목록

| 대상 | 내용 | 줄 수 |
|---|---|---|
| `FlashCard.tsx:68-69,79,117,163,180-181` + `flash.css:80-81` | `rateable` prop·`canRate`·`.flash-kid.ref`·"참고" span — 복습 화면(6.5, 2026-11-12 삭제)만 쓰던 것. 호출자 0(`grep rateable` → FlashCard 만). 주석의 "ReviewPage 공용"·"복습 공용" 도 함께 | −14 |
| `Minimap.tsx:55-63`, `flash.css:136-138` | `<figure aria-hidden>` 안의 `role="button"`·`aria-label`·`aria-current`·`tabIndex=-1`·`onKeyDown` 은 AT 도 키보드도 닿지 않는다(figure 가 숨김). `onClick` 과 `<title>` 만 남기면 같다. `.mm-node:focus`·`:focus-visible` 규칙도 죽은 CSS | −10 |
| `FlashPage.tsx:75,80-88` | `fresh()` 의 `!concepts.length` 분기는 바로 아래 S19 빈 상태 early return 이 있어 렌더에 못 닿지만 effect 는 돌아 `flash:<tree>:<scope>` 에 쓰레기 진행을 쓴다(다음 방문에 readProgress 가 지움). effect 첫 줄 `if (!tree \|\| !concepts.length) return` 이면 분기 삭제 가능 | −2 |
| `DndPage.tsx:21-38` ≈ `BlankDndPage.tsx:21-38` | 페이지 껍데기(소스·범위 해석·ScopeGate 분기)가 글자 몇 개 빼고 동일. `kit.tsx` 에 `QuizShell({ mode, gate: (scope) => boolean, children })` 하나로 | −15 |
| `admin/shared.ts:9-11`, `share/ReportStatusPage.tsx:8-9`, `account/Banners.tsx:12`, `core/srs/index.ts:36` | `p2`·`when`·날짜 포맷 4벌 | `src/core/fmt.ts` 1곳(관리자 chunk 를 공개 페이지가 import 하지 않게 core 에) | −8 |
| `Dashboard.tsx:10`, `RequestsTab.tsx:19`, `SystemTab.tsx:18`, `TreesTab.tsx:12` | `DAY = 86400_000` 4벌(`repo.ts` 의 `TRASH_MS` 도 같은 식) | `shared.ts` 에 `export const DAY` | −3 |
| `TreesTab.tsx:13-14`, `RequestsTab.tsx:22-23` | `dday`/`Dday` 2벌(임계 7일 vs 3일, over 표시 유무만 다름) | `widgets.tsx` 에 `Dday({ at, soon = 3, clamp = false })` | −3 |
| `FeedbackTab.tsx:11`, `account/FeedbackSheet.tsx:13`, `account/AccountPage.tsx:31` | `FEEDBACK_CATEGORY` 3벌(주석: "컴포넌트 파일에서 상수 export 금지 lint") | 타입이 있는 `core/api.ts` 에 `export const FEEDBACK_CATEGORY` (컴포넌트 파일이 아님) | −4 |
| `admin/shared.ts:2,42-48` + 각 탭의 `Object.assign(ACTION, …)` 6곳 | 모듈 로드 시 전역 표를 변이하는 등록 패턴 — 워커 동시 편집 회피용이었다고 주석에 적혀 있다. 지금은 한 표로 합치는 게 읽기 쉽고 `datalist` 정렬도 안정적 | 0(이동) |
| `ShareSheet.tsx:107`, `VisibilityBadge.tsx:11`, `core/sync/engine.ts:9` | `(tree as Tree & { hiddenByAdmin?: boolean })` 캐스트 3곳 — 엔진이 실제로 그 필드를 저장한다(`engine.ts:419`) | `types.ts` `Tree` 에 `hiddenByAdmin?: boolean` 1줄 추가 → 캐스트 3개 삭제 | −3 |
| `core/api.ts` `ProductStats`/`AdminStats.product` | 클라이언트에서 `s.product` 를 읽는 곳 0(`grep feedback_open` 없음). 서버는 매 stats 호출마다 계산 | 타입·서버 계산 삭제(서버는 다른 워커) 또는 Dashboard 에 "열린 피드백" 카드로 **쓴다** | ±2 |
| `GalleryPage.tsx:65` | `useEffect` 의존 배열에 `key`(파생값) 중복 — `sort,page,q,retry` 로 이미 결정됨 | 삭제 | −0 |
| `SharedPage.tsx:149` | `source` useMemo 가 `doCopy` 를 캡처해 `me` 가 로드 시점에 고정(eslint-disable 로 덮음). `copy: () => void doCopyRef.current()` 식 ref 1줄이면 disable 주석과 stale 문제가 함께 사라진다 | −1 |

## 테스트 공백

e2e 는 `modes.spec.ts`(플래시·빈칸·백지 각 1 happy path) 와 `server.spec.ts:71`(공유 링크 보기·플래시·복제·숨김 403) 뿐이다. 관리자 화면 e2e 는 **0건**. 순수 로직 check 는 `flash.check`·`dnd.check` 가 있다.

- **플래시 진행 복구(R4-02)**: 범위 A 에서 2장 평가 → ScopeSelect 로 루트 → 새로고침 → 루트 저장본이 보존되는지. 현재는 effect 순서 때문에 재현 가능한 회귀인데 어떤 테스트도 `flash:<tree>:<scope>` 저장본의 교차 오염을 보지 않는다. `readProgress` 단위로는 못 잡고(순수 함수는 맞게 동작) 컴포넌트/e2e 가 필요.
- **attempts 기록(R4-01)**: 백지 채점 뒤 `db.attempts` 1건 + 로그인 시 push 본문에 `attempts` 포함. 서버 `product.check.ts` 가 attempts 를 직접 INSERT 해서 지표를 검증하므로 클라이언트가 안 쓰는 것을 아무도 못 잡았다. e2e: 백지 채점 → `/api/admin/product/metrics` 의 `attempts` 가 1 인지.
- **채점 기록 중복**: FlashCard "다시 평가"(S2 base 재계산)가 두 번 기록되지 않는지는 `srs.check.ts` 영역이라 가정하고 넘겼다. 새로고침 뒤 `initialRated` 로 복원된 항목을 다시 평가하면 `before` 맵이 비어 **2회 복습으로 집계**된다(`FlashCard.tsx:90-91`) — 의도인지 명세(S2) 확인 필요, 테스트 없음.
- **flags 게이팅(R4-06)**: 스위치 off 상태에서 공유 보기 신고/별점, 갤러리 404 문구. `product.check.ts` 는 서버 거절만 본다.
- **갤러리 직접 진입 CSS(R4-08)**: `page.goto('/#/gallery')` 로 시작해 미리보기 시트의 `.sheet-x` 크기 44px 단언 하나면 잡힌다.
- **관리자**: TwoStep 2단계 동작(arm → 3초 해제), 신고 묶음 숨김 후 `open_reports` 0·표식 정합(R4-10), 추천 고정 덮어쓰기(R4-03), 모바일 760px 표→카드 변환에서 `td.act` 버튼 44px. 전부 e2e 0건.
- **빈칸/백지 터치 드래그**: `useDragDrop` 은 포인터 이벤트 직접 구현인데 e2e 는 데스크톱 `dragTo` 만. 모바일 스펙(`mobile.spec.ts`)에 터치 포인터 시퀀스(pointerdown → move 4px 이상 → up) 1건.
