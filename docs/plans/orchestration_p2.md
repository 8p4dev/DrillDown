# 오케스트레이션 — P2·잔여 (2026-11-09)

근거: `docs/research/many_trees/E1_evaluation.md` §4 P2 표, `orchestration_p1.md` §5 남김, 사용자 "권장안대로 나머지도".
결정: precache 예산 600 → **640 KiB**(00 §리소스·01 §2·§3.8, 이 커밋). 하루 상한(Q8)·원본 갱신 알림(Q2)·하단 시트(Q10)는 권장안대로 **계속 보류**.

## 1. 범위
| 넣음 | U / 항목 |
|---|---|
| 에디터 작성 | U12(P1 누락분: `BULLET` 하이픈·번호 뒤 공백 필수, `- [ ]`·`> ` 제거) + U12 확장(마크다운 `#` 깊이, 들여쓰기 단위 추정) · U27 `::` 한 줄 메모 · U28 별칭 칩(패널) · U26 서브트리 복제·'이 가지 내보내기' · U19 확장 ←→ 사촌 이동 |
| 그래프·공통 | U21 큰 트리 성능(새 카드만 측정, `childrenOf` Map, memo, 1,000노드 초과 시 초기 viewDepth=3) · 폰에서 루트 카드 탭이 접기를 토글함 · 정보 토스트가 10초 [되돌리기] 뒤에서 기다림 |
| 학습 | U38 플래시 진행 저장(localStorage 7일) · U40 '모름만 다시'·모름 카드 같은 세션 재출제 · U41 셔플·기한 아닌 형제 재평가 줄이기 · U28 백지 '이것도 정답'(별칭 추가) · 미니맵 숨김 시 빈 aside |
| 공유·갤러리 | U38 공유 보기 첫 채점 토스트 [복제] 버튼(Q3 확인 포함) · U60 내 목록 카드에 복제 수·운영 숨김 배지 · '더 보기' 실패 페이지 건너뜀 버그 |
| 동기화·서버 | `applyRemote` outbox 를 pull 1회당 한 번만 읽기 · U48 `bumpChildren` 쿼리 조건 · U03 확장(새 기기에서 서버에 7일 보존 중인 삭제 트리가 휴지통에 보이는지 확인 → 안 보이면 최소 수정) |

| 뺌(조건 대기) | 이유 |
|---|---|
| U13 리프 세로 쌓기, U06 노드 소프트 삭제, U10 접기 마이그레이션, U24 트리 간 이동 | M~L. E1 착수 조건(재측정·복구 요청·덮어쓰기 신고·서버 확인) 미충족 |
| U33 2단계 하루 상한, U56·U59, U51 하단 시트 | Q8·Q2·Q10 보류 |
| U43 정렬 선택기, U08 응답 압축 | 요청 시 / 배포 경로 확인 뒤 |
| tree_limit 보류 영속 | 새로고침하면 재전송 → 403 → 다시 보류로 자가 복구. 불필요 |

## 2. 분할 (배타 소유)
| ID | 소유 파일 | 포트 |
|---|---|---|
| WE3 | `src/features/editor/**`(`graph/**`·TreeListPage.tsx·treelist.css 제외), `src/core/outline.ts`·`outline.check.ts`, `src/core/repo.ts`, `TreeHeader.tsx`·`tree-header.css` | 5351/4351 |
| WE4 | `src/features/editor/graph/**`, `src/features/Toast.tsx` | 5352/4352 |
| WS2 | `src/features/flash/**`, `src/features/dnd/**`, `src/core/srs/**` | 5353/4353 |
| WG2 | `src/features/share/**`, `src/features/editor/TreeListPage.tsx`·`treelist.css`, `server/sync/share.ts`·`sync.check.ts` | 5354/4354 |
| WY2 | `src/core/sync/**`·`sync.ts`, `server/sync/**`(share.ts·sync.check.ts 제외), `src/features/account/**` | 5355/4355 |
| 오케스트레이터 | `src/App.tsx`, `router.ts`, `src/core/types.ts`·`db.ts`·`path.ts`·`api.ts`·`me.ts`, `src/ui/**`, `index.css`, `e2e/**`, `docs/**`, 설정 | — |

## 3. 계약
- C1~C4 는 `orchestration_p1.md` §3 그대로(경로 공용, `?root=`, viewDepth 로컬, E2E 셀렉터 유지).
- **C5 별칭**: 별칭은 기존 `TreeNode.aliases` 만 쓴다(새 필드 금지). 채점의 별칭 비교는 기존 함수를 쓴다.
- **C6 메모 문법**: 붙여넣기 한 줄 `제목 :: 메모` → title=`제목`, note=`메모`. 내보내기(`nodesToOutline`)도 같은 문법으로 왕복(note 가 한 줄일 때만, 여러 줄 메모는 지금처럼 내보내기에서 제외 또는 기존 방식).

## 4. 공통 규칙
`orchestration_p1.md` §4 1~6 그대로(자기 파일만·`npm ci`·지정 포트·PID 종료·`npm run e2e` 금지·게이트 4개 통과 후 커밋·`*.check.ts` 단언·과설계 금지·worker_done 형식). 범위 밖이 필요하면 `ask`.

## 5. 진행 기록
- 2026-11-09 예산 640 KiB 반영, 계획 커밋 → WE3·WE4·WS2·WG2·WY2 디스패치
