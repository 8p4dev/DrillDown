# 에이전트 A — 에디터 plan (R1 · R2)

근거: `docs/plans/orchestration_core_features.md` §2 R1·R2, §4.2, §5 · `drilldown-biz/reports/04_tech.md` §1·§8 리스크 1

## 접근 방식
- **저장소(repo.ts)**: Dexie 트랜잭션으로 직접 구현. `putNodes` 는 bulkPut 후 관련 트리의 `updatedAt` 갱신, 루트 노드 title 이 바뀌면 `tree.title` 도 동기화(에디터에서 루트 이름을 고쳐도 목록과 일치). `deleteNodes` 는 노드와 해당 `srs` 를 함께 지운다(고아 srs 가 복습 큐에 남지 않도록).
  순수 헬퍼(`getRoot`, `childrenOf`, `descendantsOf`)도 계약대로 repo.ts 에 둔다.
- **개요(outline.ts)**: 순수 함수. 파서는 "들여쓰기 폭 스택" 방식 — 줄머리 공백 폭(탭=4, 스페이스=1)을 계산하고, 스택 꼭대기 폭이 현재 폭 이상이면 pop → 부모 결정. 2칸·4칸·탭이 섞여도 상대적 깊이로 처리된다(절대 단위 추정 대안은 혼용 시 깨져서 기각). 줄머리 기호 `- * • · ◦ ▪`, `1.` `1)` `1.2.`, `가.` `가)`, `(1)` `(가)`, `①~⑳`, `Ⅰ.` 제거. 빈 줄·기호만 있는 줄 무시. 직렬화는 2칸 들여쓰기.
- **에디터 상태**: `EditorPage` 가 트리의 노드 배열을 불변 객체로 들고, 모든 변경은 `commit(next)` 하나로 통과 → 이전 배열과 참조 비교 diff 로 `putNodes`/`deleteNodes` (저장은 promise 체인으로 순서 보장). 실행취소는 **트리 단위 스냅샷**(노드 배열) undo/redo 스택, 50단계. 대안(커맨드 패턴 역연산)은 연산마다 역연산을 짜야 해서 기각 — 스냅샷+diff 는 연산 수와 무관하게 한 곳.
- **키보드**: 탐색 모드 핸들러는 아웃라이너 컨테이너(`tabIndex=0`)에만, 편집 모드는 행 `<input>` 에만. 문자 단축키는 `e.code`(`KeyH`, `KeyX`, `KeyV`, `KeyZ`, `KeyY`)로 판정 → 한글 자판 상태에서도 동작. 편집 중 `isComposing || keyCode===229` 이면 Enter/Tab/Esc 무시(글자 중복·유실 방지).
- **잘라내기/붙여넣기**: `Ctrl+X` 는 서브트리를 "잘라냄" 표시(행 흐리게), `Ctrl+V` 시 선택 노드의 마지막 자식으로 **이동**(같은 id 유지 → srs 학습 기록 보존). Windows 탐색기와 같은 의미. 순환(자기/자기 자손 아래) 붙여넣기는 거부·안내. 대안(잘라낼 때 즉시 삭제 후 재삽입)은 srs 가 지워져 기각.
- **순서키**: 중간 삽입은 앞뒤 형제 order 의 중간값(types.ts 주석 규약).
- **색칠 연결 지점**: `NodeRow` 가 `colorClassOf?: (nodeId: string) => string` 를 받는다(기본 `() => 'c-none'`). `EditorPage` 도 같은 prop 을 받아 그대로 전달 → Wave 2 에서 D 가 `EditorPage.tsx` 안에서 채운다.
- **가져오기/내보내기 UI**: 에디터 하단 패널. 가져오기 = 텍스트 영역 + 두 버튼 「선택 노드의 자식으로 추가」/「첫 줄을 루트로」(첫 최상위 항목 → 루트 제목 교체, 그 자식과 나머지 최상위 항목은 루트 자식으로 추가). 한 번의 commit = 실행취소 1단계. 내보내기 = 2칸 들여쓰기 텍스트를 클립보드에 복사 + 텍스트 영역에 표시.
- 트리 목록의 이름 변경·삭제 확인은 네이티브 `prompt`/`confirm`.

## 수정/생성 파일
- `docs/plans/agent_A_editor.md` (이 문서)
- `src/core/repo.ts` (신규)
- `src/core/outline.ts` (신규)
- `src/core/outline.check.ts` (신규, assert 점검 — `npx tsx src/core/outline.check.ts`)
- `src/features/editor/TreeListPage.tsx` (교체)
- `src/features/editor/EditorPage.tsx` (교체)
- `src/features/editor/NodeRow.tsx` (신규)
- `src/features/editor/editor.css` (신규, 에디터 전용 스타일)
- 소유 범위 밖 파일 수정 없음.

## 작업 목록
- [x] 1. plan 문서 작성
- [ ] 2. `outline.ts` parse/serialize/outlineToNodes/nodesToOutline
- [ ] 3. `outline.check.ts` (혼합 들여쓰기·번호 제거·빈 줄·왕복·노드 변환) → tsx 실행 통과
- [ ] 4. `repo.ts` 계약 함수 전부
- [ ] 5. `TreeListPage` — 목록·생성·이름 변경·삭제·편집/학습/백지 퀴즈 링크
- [ ] 6. `NodeRow` + `EditorPage` 로드·렌더·선택·탐색(↑↓←→, 접힘 건너뜀)
- [ ] 7. 편집 모드(Space/F2/Enter/Tab/Shift+Tab/Esc, IME 가드, 빈 새 노드 정리)
- [ ] 8. 구조 편집(Enter 형제, Tab 자식, Shift+Tab, Alt+↑↓, H, Delete 확인)
- [ ] 9. 잘라내기/붙여넣기(순환 거부) + 실행취소/다시실행 50단계
- [ ] 10. 메모·허용 표현 패널
- [ ] 11. 가져오기/내보내기 패널
- [ ] 12. `npm run build` · `npm run lint` 통과, `npm run build && npx vite preview` 1회 기동 확인
- [ ] 13. 의미 단위 커밋 + worker_done 보고

## 검증 방법
- 2~4: `npx tsx src/core/outline.check.ts` 출력 "outline ok", `npm run build`(tsc -b 타입체크)
- 5~11: `npm run build` · `npm run lint` 통과 + 코드 리뷰로 키 매핑 대조. 브라우저 동작은 12에서 preview 1회 기동 확인(장기 실행·E2E 금지).
- 완료 기준 매핑: 마우스 없는 3단계 트리 작성(Enter/Tab 흐름), "노동법" Enter 확정(IME 가드 + Enter 시 draft 그대로 저장), 새로고침 유지(IndexedDB 즉시 저장), 잘라내기·붙여넣기·실행취소, 순환 거부(`descendantsOf` 검사).
