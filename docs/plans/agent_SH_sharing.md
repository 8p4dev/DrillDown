# 에이전트 SH — 트리 저장·동기화·공개 범위·공유 링크·복제 (plan `orchestration_redesign.md` R10)

작성 2026-11-08. 산출물은 코드가 아니라 설계 문서다(plan A1). `src/**` 수정 없음.

## 접근 방식
- **저장 모델**: 로컬 Dexie가 기준(A10). 서버는 "로그인 사용자의 백업·여러 기기·공유" 용도. 동기화는 **노드 단위 변경 로그 + outbox 큐 + LWW(`updatedAt`) + 톰스톤 + `since` 커서**로 한다.
  - 검토한 대안: ① 트리 전체 스냅샷 업로드(단순하지만 두 기기 동시 편집 시 한쪽 편집이 통째로 사라짐, 300노드 30KB를 키 입력마다 보내기엔 과함) ② CRDT(Yjs/Automerge — 공동 편집 없음(decisions 4)이라 과설계, 번들 +수십 KB로 R5 위배) ③ 노드 단위 LWW(선택 — `TreeNode.updatedAt`이 이미 모든 쓰기에서 갱신되고, 충돌 결과가 설명 가능).
- **동기화 훅 위치**: `repo.ts`의 쓰기 함수(createTree·renameTree·deleteTree·putNodes·deleteNodes)가 유일한 쓰기 경로다[코드]. 같은 Dexie 트랜잭션 안에서 `outbox`에 행을 넣는다. 화면 코드는 바뀌지 않는다.
- **공유 보기**: `/t/<slug>`는 서버가 HTML을 서빙(OG 메타 주입) → 클라이언트는 해시 라우트 `#/t/<slug>`로 넘겨 기존 플래시·빈칸·백지 컴포넌트를 "읽기 전용 소스"로 재사용. URL 해시 압축 전송(R4 #10)은 메신저 URL 길이를 조사해 채택/기각.
- **복제**: copy-on-import(04_tech §4). 새 ID, `sourceTreeId` 계보, SRS 비움.
- **srs 동기화**: 포함(여러 기기 복습이 R4 #13의 핵심 사용 사례). 카드 병합 규칙은 `updatedAt` LWW + `autoCorrectDays` 합집합 + `miss` max. `attempts`·`events`는 append-only 업로드(id 중복 무시), 다운로드는 하지 않음(통계 화면이 아직 없음 → 서버에 쌓기만).
- 측정: 300노드 트리의 JSON 바이트·gzip·base64url 길이를 Node 스크립트로 직접 잰다. URL 길이 한계는 웹 출처로.

## 수정/생성 파일 (소유 범위 안)
- `docs/plans/agent_SH_sharing.md` (이 파일)
- `docs/specs/04_tree_sharing_sync.md`
- `docs/specs/evidence/sh/conflicts.md` (충돌 시나리오 표)
- `docs/specs/evidence/sh/capacity.md` (용량 계산 + 측정 스크립트 결과)
- `docs/specs/evidence/sh/measure_size.mjs` (측정 스크립트, 커밋함 — 재현용. src 밖)
- `docs/specs/evidence/sh/sequences.md` (시퀀스 다이어그램 텍스트)

## 단계
- [x] 읽기: plan §1~§4, types/db/repo/outline/events/srs/router/TreeListPage/EditorPage persist, R4 #1 #9 #10 #13 #14, backlog, 04_tech §4·§7, 11 §2·§6, decisions
- [x] plan md 작성(이 파일)
- [x] 측정: 300노드 트리 바이트(JSON·gzip·base64url) 스크립트 실행 → `evidence/sh/capacity.md`
- [x] 조사: URL 길이 한계(브라우저·카카오톡·슬랙·OG 크롤러) 출처 확보
- [x] `evidence/sh/conflicts.md` 충돌 시나리오 표(기대 결과)
- [x] `evidence/sh/sequences.md` 시퀀스(첫 로그인 병합·편집 push/pull·공유 보기·복제)
- [x] spec §1~§3: 결정 요약, 저장·동기화 모델, 동기화 대상, 공개 범위 상태 전이, slug, 공유 보기, 갤러리, 서버 스키마·API, 권한 매트릭스, 첫 로그인 병합, 용량, UI 정보 구조, 공수
- [x] spec §4 화면별 적용, §5 검증(요구 대조·코드 대조·측정·약점), §6 미결, §7 출처
- [x] 자체 점검: 상태 전이표·권한 매트릭스 빈칸 0, 스키마↔types 필드 대조 불일치 0, 상대 경로 링크 존재
- [x] `npm run typecheck && npm run lint && npm run build` (코드 무변경 확인)
- [x] 커밋(의미 단위 2~3개), worker_done

## 검증 방법
- 측정값: 스크립트 출력을 그대로 evidence에 붙인다.
- 표 빈칸: grep으로 `| |`·`TBD` 없음 확인.
- 링크: 문서에 적은 상대 경로가 존재하는지 `ls`.
- 코드 무변경: `git status`에 `src/` 없음 + typecheck/lint/build 통과.

## 변경 사항
- 과제가 예시로 든 `/api/trees/:id/changes?since=`(트리별 커서) 대신 **사용자 단위 커서 `GET/POST /api/sync`** 로 정했다. 이유: 트리별 커서는 트리 수만큼 요청이 필요하고 다른 기기에서 새로 만든 트리를 발견하지 못한다(spec §3.1).
- 조사 중 발견: 현재 코드는 `attempts` 테이블에 **쓰지 않는다**(`db.attempts.add` 호출처 없음). spec §3.1·§3.2·§4에 [코드]로 명시하고 서버 테이블은 선행 생성으로 두었다.
- 카카오 디벨로퍼스 공식 문서는 fetch가 리다이렉트·404로 실패해 devtalk 체크리스트(2차)만 출처로 남겼다. 카카오톡 URL 길이 상한은 [가정] 처리.
- 측정 파일 `measure_output.txt`를 evidence에 추가(계획에 없던 파일, 재현 출력 보관용).
