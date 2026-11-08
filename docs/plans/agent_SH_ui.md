# 에이전트 SH — UI-First 구현: 공유 보기·공유 시트·동기화 상태·공개 배지·갤러리 (plan `orchestration_ui_first.md` U11)

작성 2026-11-08. 시작 커밋 15b037c. 서버 호출 없음(`fetch(` 0건), 공유 데이터는 `src/core/mock/shared.ts`.

## 접근 방식
- **mock 공유 데이터**(`shared.ts`): 데모 트리 2개는 손으로 쓴 개요(제목·내용·별칭) 배열을 모듈 로드 시 `TreeNode[]` 로 펼친다. id 는 `slug-n` 처럼 결정적(새로고침해도 같은 URL `?root=` 가 유효). 갤러리 가명 18건은 시드 고정 생성(제목 풀 × 가짜 닉네임). 복제 수·신고는 모듈 메모리에만 둔다(새로고침 시 초기화 — mock 범위).
- **메모리 학습 소스**(`SharedPage`): `StudySource` 구현. `record()` 는 `src/core/srs` 의 순수 함수 `applyGrade` 를 써서 Dexie 없이 같은 색 규칙(맞음=Good→초록, 틀림=Again→빨강)을 재현. 대안(`lastGradeSource` 만 넣기)은 `retrievability` 가 card 를 읽어 초록이 안 나와 기각.
- **보기 탭**: 에디터 GraphView 는 LM 소유·편집 로직과 얽혀 있어 쓰지 않고 `ul[role=tree]` 들여쓰기 목록. 내용은 `editor/content/format.ts` 의 `parse`·`toHtml` 로 형광펜 렌더(존재 확인됨).
- **DS 공용 컴포넌트**: 1차 구현 때는 `src/ui/Sheet`·`Avatar` 가 없어 `share/ds.tsx` 폴백을 썼고, main(09b4cbc 이후) 머지 뒤 실제 `../../ui/Sheet`·`../../ui/Avatar` 로 바꾸고 폴백 파일·scoped CSS(.sheet/.seg/.avatar)를 지웠다. 툴팁은 `data-tip` 속성만 붙인다.
- **동기화 데모**: `repo.ts` 쓰기 함수 끝에 `bump()`(로그인 시에만 syncing→800ms 뒤 saved). 오프라인 동안은 pending 카운트, online 복귀 시 syncing→saved. 전부 `src/core/mock/sync.ts` 안.
- 4색 규칙·반경·그림자 금지 준수. `share.css` 한 파일.

## 수정/생성 파일 (소유 범위 안)
- `src/core/mock/shared.ts` (신규) — `getSharedTree` `listGallery` `mockIssueSlug` `recordCopy` `submitReport`
- `src/core/mock/sync.ts` — `bump()` 추가, online/offline 리스너
- `src/core/repo.ts` — `copyTree` `setVisibility` `reissueSlug` + 쓰기 함수에 `bump()`
- `src/features/share/SyncStatus.tsx` `VisibilityBadge.tsx` `ShareSheet.tsx` `SharedPage.tsx` `GalleryPage.tsx` (스텁 교체)
- `src/features/share/share.css` (신규)
- `docs/specs/evidence/ui/sh/*.jpg` (≤8장, ≤150KB)
- `docs/plans/agent_SH_ui.md` (이 파일)

## 단계
- [x] 1 plan md 작성(이 파일)
- [x] 2 `mock/shared.ts`: 데모 트리 2개 + 갤러리 20건 + slug 발급 + 복제 수 + 신고 저장
- [x] 3 `mock/sync.ts`: `bump()`·오프라인 pending·online 복귀
- [x] 4 `repo.ts`: `copyTree`·`setVisibility`·`reissueSlug`·`bump()` 호출
- [x] 5 `ds.tsx` 폴백 Sheet·Avatar + `share.css` 골격
- [x] 6 `SyncStatus.tsx`·`VisibilityBadge.tsx`
- [x] 7 `ShareSheet.tsx`(비로그인 문구·세그먼트·링크 줄·복사·재발급·첫 공개 고지·public 조건)
- [x] 8 `SharedPage.tsx`(헤더·탭·보기 목록·복제 바·⋯ 메뉴·신고 시트·메모리 소스)
- [x] 9 `GalleryPage.tsx`
- [x] 10 typecheck·lint·check·build 통과, `fetch(` 0건, 금지 토큰 0건
- [x] 11 dev 8025 + 임시 Playwright: 4탭 렌더·복제→카드·시트 전이·비로그인 문구·갤러리 정렬, 스크린샷 ≤8장 → `evidence/ui/sh/`
- [x] 12 커밋(의미 단위), worker_done

## 검증 방법
- 2~4: `npm run typecheck`; `tsx` 로 `listGallery('copies').length === 20`, `getSharedTree('3fK9pQ2xT7m')!.nodes.length ≥ 20` 확인.
- 6~9: dev 서버 화면 확인 + Playwright 스크립트(scratch)로 접근 가능한 이름(`내 트리로 복제` `신고` `링크 복사` `비공개/링크/공개`) 존재 확인.
- 10: `grep -rn "fetch(" src/features/share src/core/mock/shared.ts src/core/repo.ts` 0건, `grep -rn "var(--accent\|--shadow\|--warn\|ease-spring\|pulse-ring\|spring-in\|backdrop-filter" src/features/share` 0건.

## 변경 사항
- **DS 머지 반영**(오케스트레이터 지시): `ds.tsx` 삭제, `Sheet`/`Avatar` 는 `src/ui`. DS `Avatar` 의 size 는 32|36|72 뿐이라 `size={32}` + `className="share-avatar"`(`--avatar-size: 24px`) 로 24px 를 맞췄다.
- **`.shared .tree-header { display: none }`**: LS 의 Flash/Dnd/BlankDnd 페이지가 `source` 가 있어도 자체 `TreeHeader`(편집 링크 `#/tree/<slug>` 포함)를 그려 공유 보기에 탭 줄이 둘이 됐다. 내 CSS 로 숨김(임시, `ponytail:` 주석). LS 에 "ephemeral 소스면 TreeHeader 생략" 요청.
- **갤러리에 로컬 public 트리 합치기(선택 항목)**: `listGallery` 가 동기 시그니처(`GalleryItem[]`)라 Dexie 를 합치려면 async 가 필요 → 하지 않음.
- **`repo.ts` → `mock/shared.ts` import**: `setVisibility` 가 `mockIssueSlug` 를 쓰므로 데모 트리 데이터(≈3KB gzip)가 repo 청크에 함께 들어간다. 서버 단계에서 slug 발급이 서버로 가면 사라짐. 예산 안(precache 568 KiB / 600).
- 검증 중 발견(내 파일 아님): ① LS 머지 전 `DndPage`/`BlankDndPage` 는 Dexie 빈 트리에서 `getRoot()` 가 throw 해 앱 전체가 내려갔다(머지 후 해소). ② 머지된 Toast 는 큐 1개 + 힌트(`ms:0`)가 머리를 막는다 — 공유 보기(anon)에 `NavUser` 의 힌트 "로그인하면 저장돼요" 가 먼저 떠서 내 토스트("링크 복사됨" 등)가 힌트 [확인] 뒤에 보인다. ③ `href.trees()` 가 `#/` 라 `/t/<slug>` 에서 상단 바 "내 트리" 를 누르면 `/t/<slug>#/` 가 되어 공유 보기에 머문다(라우터·App 소유) — 내 404 화면은 `/#/` 로 링크.

## 검증 결과 (2026-11-08, 임시 Playwright, msedge, 커밋 안 함)
- `/t/3fK9pQ2xT7m` 보기(treeitem 25, 형광펜 렌더)·플래시·빈칸·백지 4탭 렌더, `?m=` pushState, 탭별 헤더 복제 아이콘, 390 보기 탭은 바만(중복 없음), 1440 은 바 없음+헤더 버튼.
- ⋯ → 링크 복사(clipboard 일치)·신고 시트(라디오·메모·제출 토스트).
- 복제 → `#/` 카드, 노드 25·private·slug null·sourceTreeId=slug.
- 공유 시트: 비로그인 문구 / 로그인 후 private→unlisted(slug 발급, 동기화 중→저장됨)→public(첫 고지→확인, slug 유지)→재발급→복사→private(slug 회수); 오프라인이면 세그먼트 비활성 + "오프라인", 쓰기 시 "1건 대기", 온라인 복귀 → 저장됨.
- 갤러리 20건, 정렬 전환 시 순서 변경·복제 수 내림차순. 미지 slug → "링크를 찾을 수 없습니다".
- 스크린샷 8장 `docs/specs/evidence/ui/sh/` (22~65 KB): shared-view-390-light, shared-view-1440-dark, shared-flash-390-light, shared-report-390-light, share-sheet-390-light, share-sheet-1440-dark, gallery-390-light, gallery-1440-dark.
