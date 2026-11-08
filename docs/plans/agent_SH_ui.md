# 에이전트 SH — UI-First 구현: 공유 보기·공유 시트·동기화 상태·공개 배지·갤러리 (plan `orchestration_ui_first.md` U11)

작성 2026-11-08. 시작 커밋 15b037c. 서버 호출 없음(`fetch(` 0건), 공유 데이터는 `src/core/mock/shared.ts`.

## 접근 방식
- **mock 공유 데이터**(`shared.ts`): 데모 트리 2개는 손으로 쓴 개요(제목·내용·별칭) 배열을 모듈 로드 시 `TreeNode[]` 로 펼친다. id 는 `slug-n` 처럼 결정적(새로고침해도 같은 URL `?root=` 가 유효). 갤러리 가명 18건은 시드 고정 생성(제목 풀 × 가짜 닉네임). 복제 수·신고는 모듈 메모리에만 둔다(새로고침 시 초기화 — mock 범위).
- **메모리 학습 소스**(`SharedPage`): `StudySource` 구현. `record()` 는 `src/core/srs` 의 순수 함수 `applyGrade` 를 써서 Dexie 없이 같은 색 규칙(맞음=Good→초록, 틀림=Again→빨강)을 재현. 대안(`lastGradeSource` 만 넣기)은 `retrievability` 가 card 를 읽어 초록이 안 나와 기각.
- **보기 탭**: 에디터 GraphView 는 LM 소유·편집 로직과 얽혀 있어 쓰지 않고 `ul[role=tree]` 들여쓰기 목록. 내용은 `editor/content/format.ts` 의 `parse`·`toHtml` 로 형광펜 렌더(존재 확인됨).
- **DS 공용 컴포넌트 부재**: 이 워크트리에는 `src/ui/Sheet`·`Avatar`·`Tooltip` 가 아직 없다(DS 가 신규 작성). 빌드를 깨지 않기 위해 `src/features/share/ds.tsx` 에 같은 시그니처의 최소 `Sheet({open,onClose,label,children})`·`Avatar({name,url,size})` 폴백을 두고, 머지 때 import 한 줄을 `../../ui/Sheet`·`../../ui/Avatar` 로 바꾼다(완료 보고에 명시). 툴팁은 `data-tip` 속성만 붙인다.
- **동기화 데모**: `repo.ts` 쓰기 함수 끝에 `bump()`(로그인 시에만 syncing→800ms 뒤 saved). 오프라인 동안은 pending 카운트, online 복귀 시 syncing→saved. 전부 `src/core/mock/sync.ts` 안.
- 4색 규칙·반경·그림자 금지 준수. `share.css` 한 파일.

## 수정/생성 파일 (소유 범위 안)
- `src/core/mock/shared.ts` (신규) — `getSharedTree` `listGallery` `mockIssueSlug` `recordCopy` `submitReport`
- `src/core/mock/sync.ts` — `bump()` 추가, online/offline 리스너
- `src/core/repo.ts` — `copyTree` `setVisibility` `reissueSlug` + 쓰기 함수에 `bump()`
- `src/features/share/ds.tsx` (신규, 임시) — Sheet·Avatar 폴백
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
- [ ] 11 dev 8025 + 임시 Playwright: 4탭 렌더·복제→카드·시트 전이·비로그인 문구·갤러리 정렬, 스크린샷 ≤8장 → `evidence/ui/sh/`
- [ ] 12 커밋(의미 단위), worker_done

## 검증 방법
- 2~4: `npm run typecheck`; `tsx` 로 `listGallery('copies').length === 20`, `getSharedTree('3fK9pQ2xT7m')!.nodes.length ≥ 20` 확인.
- 6~9: dev 서버 화면 확인 + Playwright 스크립트(scratch)로 접근 가능한 이름(`내 트리로 복제` `신고` `링크 복사` `비공개/링크/공개`) 존재 확인.
- 10: `grep -rn "fetch(" src/features/share src/core/mock/shared.ts src/core/repo.ts` 0건, `grep -rn "var(--accent\|--shadow\|--warn\|ease-spring\|pulse-ring\|spring-in\|backdrop-filter" src/features/share` 0건.

## 변경 사항
(진행 중 기록)
