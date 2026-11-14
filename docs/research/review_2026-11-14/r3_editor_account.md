# R3 편집기·계정 코드 리뷰 (src/features/editor, account, Toast, feel, viewport)

읽기 전용 리뷰. 범위 전 파일 정독, `npm run typecheck` 0 오류, `oxlint` 범위 0 경고 확인. 추측은 넣지 않았고 아래는 모두 코드로 확인한 것이다.

## 핵심 5줄

1. **H1 데이터 손실**: 패널/카드 내용 실시간 편집 중 다른 기기 변경(`dd:remote`)이 들어오면, 편집을 끝낼 때 **원격 반영 이전 스냅샷**이 실행 취소 스택에 들어간다. 그 뒤 Ctrl+Z 한 번이면 다른 기기가 만든 노드가 `deleteNodes` → outbox 'del' → 서버 톰스톤으로 지워진다. 문서(E2)가 막으려던 바로 그 경로다. 고치는 법은 한 줄.
2. **M1**: `GraphView` 의 ResizeObserver 가 첫 레이아웃 이펙트 **뒤**에 만들어져서, 처음부터 있던 카드는 영원히 관찰되지 않는다. 노드 객체가 안 바뀌는 크기 변화(제목 입력칸 전환, 760px 경계에서 카드 폭 전환)가 배치에 반영되지 않는다. 한 줄 고침.
3. **M2**: 계정 화면 닉네임 입력의 `done` 플래그가 포커스 때 초기화되지 않아, Enter/Esc 뒤 다음 편집의 blur 저장이 한 번 건너뛸 수 있다(목록 화면 `TreeCard` 는 이미 올바르게 처리). 한 줄 고침.
4. 보안·개인정보는 양호: 서버는 UA 를 `'Chrome · Android'` 로 축약해서만 저장(`server/account/session.ts:24-37`), 세션은 id 앞 6자만 노출, 내용 HTML 은 이스케이프 후 텍스트 노드로만 들어간다. 로그인 화면의 `?r=` 정지 사유가 URL 로 위조 가능한 것만 L.
5. 지울 것: `useVisualViewport`(미사용), 목록 화면 "학습 기록 내보내기"(계정 내보내기와 중복), `FEEDBACK_CATEGORY` 3중 정의, 상대시간 헬퍼 2개, `countTree` 가 `childIndex` 를 재구현. 합치면 약 40줄 감소.

## 발견 표

| ID | 심각도 | 분류 | 파일:줄 | 문제 | 고치는 법 | 공수 |
|---|---|---|---|---|---|---|
| H1 | H | 버그·데이터 손실 | `src/features/editor/EditorPage.tsx:194-208`, `:385-395` | `onRemote` 는 `undoRef/redoRef` 를 비우지만 `liveBase.current`(실시간 편집 시작 스냅샷)는 그대로 둔다. 편집이 끝나는 `endLive` 가 `base !== nodesRef.current` 이므로 원격 반영 **이전** 배열을 undo 1단계로 넣는다. 이후 `restore(false)` → `persist(prev, next)` 에서 `removed = prev.filter(!ids.has)` 가 원격 추가 노드를 골라 `deleteNodes` → outbox 'del' → 서버에서 다른 기기 노드가 삭제된다. 재현 조건: 두 기기, 한쪽이 패널 제목·내용 입력 중(또는 카드 내용 편집 중)에 pull 도착. | `onRemote` 의 `nodesRef.current = next` 바로 뒤에 `if (liveBase.current) liveBase.current = next` 한 줄. (원격 뒤의 타이핑만 undo 대상이 되고 원격 전 상태로는 못 돌아간다 — E2 의도와 일치) | S |
| M1 | M | 버그·배치 | `src/features/editor/graph/GraphView.tsx:98-126` | RO 는 `useEffect`(122) 에서 만들어지는데, 카드 관찰은 `useLayoutEffect`(106) 에서 `old?.el !== el` 일 때만 한다. 마운트 순서가 레이아웃 이펙트 → 패시브 이펙트라 첫 렌더의 모든 카드는 `ro.current` 가 null 일 때 지나가고, 이후 렌더에선 `old.el === el` 이라 다시 관찰하지 않는다. 결과: 노드 객체가 바뀌지 않는 크기 변화는 재측정되지 않는다 — 제목 편집 입력칸 ↔ 2줄 말줄임 제목 전환(`draft` 만 바뀜), `NodeRow.tsx:66` 의 760px 경계 폭 전환(모든 카드 폭이 바뀌지만 노드는 그대로 → 겹침), 카드 내용 편집기 마운트. 주석(72)의 "RO 가 잡는다" 전제가 깨져 있다. | 레이아웃 이펙트 첫 줄에 `ro.current ??= new ResizeObserver((es) => flushSync(() => measure(es.map((e) => e.target as HTMLElement))))` 를 두고, `useEffect` 는 `return () => ro.current?.disconnect()` 만 남긴다. | S |
| M2 | M | 버그·오류 처리 | `src/features/account/AccountPage.tsx:172-178` | `done.current` 는 blur 핸들러 끝에서만 false 로 돌아간다. Enter/Esc → `done = true` → `setEditing(false)` 로 입력칸이 언마운트되면 blur 가 오지 않는 브라우저에서 `done` 이 true 로 남고, 다음 편집에서 바깥 클릭(blur) 저장이 한 번 무시된다. 같은 패턴의 `TreeListPage.tsx:207` 은 `onFocus` 에서 초기화한다. | `onFocus={(e) => { done.current = false; e.target.select() }}` | S |
| M3 | M | 오류 처리 | `src/features/account/AccountPage.tsx:54`, `:204-213` | 세션 목록 로드 실패(`loadSessions().catch(() => {})`)가 완전히 묵음이라, 테두리만 있는 빈 `<ul>` 이 "기기가 없다"처럼 보인다. 오프라인·5xx 에서 사용자가 알 길이 없다. | `.catch(fail)` 로 바꾸거나(이미 있는 토스트 헬퍼), `sessions.length === 0` 이면 `<span className="empty-line">불러오지 못했어요</span>` 를 그린다. | S |
| L1 | L | 보안·위조 | `src/features/account/LoginPage.tsx:295-299`, `src/router.ts:33` | `#/login?e=suspended&r=<임의 문구>` 링크를 누구나 만들 수 있고 앱이 그 문구를 "정지된 계정이에요 · 사유: …" 로 자기 UI 안에 보여 준다(피싱 문구 주입). 200자 제한만 있다. | `r` 표시를 빼고 사유는 서버가 `GET /api/me` 403 응답 본문 등 인증된 경로로 주거나, 최소한 "사유" 를 보여 주지 않고 `e` 만 쓴다. | M |
| L2 | L | 성능·리스너 | `src/features/editor/EditorPage.tsx:212` | `dd:remote` 리스너 이펙트 의존성이 `[treeId, editId, noteEditId, selId]` 라 선택·편집 상태가 바뀔 때마다 리스너를 떼고 붙인다(누수는 없음). `keep` 은 이미 있는 `editRef`·`selRef` 와 ref 하나로 대체 가능. | `noteEditId` 용 ref 하나 추가 후 `keep = new Set([editRef.current, noteRef.current, liveBase.current ? selRef.current : null])`, 의존성 `[treeId]`. | S |
| L3 | L | 성능·리스너 | `src/features/editor/NodeRow.tsx:16-20`, `:66` | 카드마다 `useSyncExternalStore(subscribeNarrow)` 로 matchMedia 리스너를 1개씩 건다(보이는 카드 수만큼). 값은 전부 같다. | `EditorPage`/`GraphView` 에서 한 번 구독해 `narrow` 를 prop 으로 내리거나, `widths` 자체를 prop 으로. memo 비교에 들어가도 값이 바뀌는 건 경계 통과 때 1회. | S |
| L4 | L | 과잉 설계 | `src/features/Toast.tsx:274`, `:279`, `:320` | 액션 라벨 글자(`/되돌리기\|실행 취소/`)로 "대체 가능 여부"와 아이콘을 정한다. 라벨 문구가 바뀌면 조용히 동작이 바뀐다(`EditorPage` 는 두 문구를 섞어 쓴다: 566 `'실행 취소'`, 597·692 `'되돌리기'`). | `Action` 에 `undo?: true` 한 필드. 호출처 3곳에 `undo: true` 추가. | S |
| L5 | L | 접근성·오류 처리 | `src/features/account/LoginPage.tsx:281`, `:285` | 설정 안 된 제공자의 안내 `UNSET` 이 `disabled` 버튼의 `data-tip` 에만 있어 키보드·SR·터치에서 읽을 방법이 없다. | 버튼 아래 `<span className="stat">{UNSET}</span>` 한 줄로 보이게. | S |

검토했지만 문제 없음으로 확인한 것(추측 제거용): `persist` 의 병렬 트랜잭션(342-344 주석대로 IndexedDB 순서 보장), `restore` 의 updatedAt 갱신(E1)과 `undoIf` 동일성, 토스트 [실행 취소]가 편집기 언마운트 뒤 눌려도 DB 에만 쓰고 네비게이션은 하지 않음, 제목 입력·패널·별칭·검색의 `isComposing` 가드(keyCode 229 포함), `NoteEditor` 의 조합 중 DOM 미갱신 + `compositionend` 1회 동기화, `toHtml` 이스케이프(텍스트 노드만, 속성 없음), outbox 는 `[kind+id]` upsert + 2초 디바운스라 패널 키 입력마다 서버 push 가 가지 않음, `AccountPage.restore` 의 410 분기와 비-410 실패 시 로컬 복구 진행, `quit` 의 `wipeLocal` 하드 삭제가 outbox 를 남기지 않음(재로그인 복구 가능).

## 삭제·단순화 목록

| 대상 | 파일:줄 | 왜 | 대체 |
|---|---|---|---|
| `useVisualViewport`, `subscribe` 래퍼, `useSyncExternalStore` import | `src/features/viewport.ts:3`, `:55-58` | 저장소 어디서도 쓰지 않음(grep 0건) | 삭제 (−5줄) |
| "학습 기록 내보내기" 버튼 + `exportLog` + `exportEvents`·`I.download` import | `src/features/editor/TreeListPage.tsx:4`, `:135-140`, `:152-154` | 계정 화면 "데이터 내보내기"(`AccountPage.tsx:80-91`)가 events 를 이미 포함. 목록 머리에 다운로드 아이콘 하나가 더 있을 이유가 없음. CODEBASE 6.1 에도 없음 | 삭제 (−10줄) |
| `FEEDBACK_CATEGORY` 3중 정의 | `account/AccountPage.tsx:31`, `account/FeedbackSheet.tsx:13`, `admin/FeedbackTab.tsx:11` | 같은 표가 세 번. 주석에 "컴포넌트 파일에서 상수 export 금지 lint" 라고 적혀 있는데, `core/api.ts` 는 컴포넌트 파일이 아니라 `FeedbackCategory` 타입 옆에 두면 된다 | `core/api.ts` 에 `export const FEEDBACK_CATEGORY` 1개 (−2 정의) |
| 상대시간 헬퍼 2개 `rel` / `ago` | `AccountPage.tsx:25-28`, `TreeListPage.tsx:31-39` | 같은 일을 다른 문구로 두 번("3시간 전" 둘 다). `ago` 는 Intl.RelativeTimeFormat 으로 월·년까지 처리 | `ago` 하나를 `ui/` 나 `core/` 로 올리고 `rel` 삭제 (−4줄) |
| `countTree` 의 kids Map 구성 | `EditorPage.tsx:93-101` | `core/path.ts:233-242` `childIndex` 와 동일한 코드(parentId 묶기 + byOrder 정렬). `visibleRows`(68)·`descendantsOf` 는 이미 `childIndex` 를 쓴다 | `const kids = childIndex(ns)` 후 pos/desc 만 계산 (−8줄). `GraphView.tsx:57-69` `moving` 도 같은 패턴 |
| 인라인 Lucide 문자열 | `AccountPage.tsx:30`, `:32`, `EditorPage.tsx:968-978` | `ui/icons.all.ts` 가 "첫 화면 외 아이콘" 보관소. 세 파일에 아이콘 리터럴이 흩어져 있음 | `icons.all.ts` 로 이동 (줄 수 동일, 파일 −2곳) |
| CSS 중복 선택자 | `editor/treelist.css:43` + `:103` (`.tree-title` 두 번, 103 이 43 의 padding 을 덮어씀), `editor/editor.css:76` + `:83` (`.node-row.resizing` 두 번) | 같은 선택자를 두 블록으로 나눠 놓아 읽는 사람이 둘을 합쳐야 함 | 각각 한 블록으로 병합 |

지우면 안 되는 것(확인함): `NodeRow` memo 비교자(콜백 제외) — 300장 입력 시 재렌더 방지에 실제로 필요하고, 콜백이 모두 ref/setState 만 쓰는 전제도 코드로 맞음. `Toast` 큐 규칙은 복잡하지만 `hint`/정보/액션 우선순위가 각각 쓰이고 있음.

## 테스트 공백

e2e 8 파일 23 테스트, `npm run check` 의 `layout.check`·`content.check` 가 순수 로직을 덮는다. 빠진 것:

1. **H1 재현 테스트 없음**: 두 컨텍스트, A 가 패널 제목 입력 중(`.detail-title` 포커스 유지) 에 B 가 노드를 추가·동기화 → A 가 blur 후 Ctrl+Z → B 노드가 남아 있어야 한다. `server.spec.ts` 의 두 기기 헬퍼로 바로 쓸 수 있다.
2. **M1**: 뷰포트를 900→700px 로 바꾼 뒤(또는 제목 편집 진입 뒤) `.node-row` 사각형 쌍 겹침 0 을 확인하는 e2e. `layout.check` 의 `overlap` 헬퍼를 DOM rect 에 그대로 적용.
3. **계정 화면**: 닉네임 Enter 저장 → 두 번째 편집을 바깥 클릭으로 저장(M2), 세션 목록 로드 실패 표시(M3), 기기 1개 로그아웃·"다른 기기 모두 로그아웃", 백업 내보내기→가져오기 왕복(`backup.check` 는 `parseBackup` 만), 휴지통 복구의 410 분기. 현재 `server.spec.ts:123` 탈퇴 흐름만 있다.
4. **편집기 구조 조작**: 다시 실행(Ctrl+Y), 잘라내기→붙여넣기, 형제 순서 동률 재번호(E6, `moveSibling` 544-549), 가지 복제, 세로 보기 전환 뒤 방향별 offset 보존과 [자동 정렬], 검색으로 포커스 밖 노드 점프(`jump` 437 의 해시 변경). e2e 에 Delete→실행 취소·IME·개요 가져오기만 있다.
5. **Toast 큐 규칙** (`Toast.tsx:276-291`: 정보 토스트 끼어들기, 대기 2개 상한, 남은 시간 재계산)은 순수 로직인데 check 가 없다. `queue` 조작부를 함수로 떼면 `tsx` 10줄로 검증 가능.
6. **viewport.ts `compute`/`ensureVisible`**: 가상 키보드 높이 판정(`MIN_KB`)과 스크롤러 탐색은 기기 없이 못 보지만, `compute` 는 `visualViewport` 가짜 객체로 check 가능. 현재 0.
