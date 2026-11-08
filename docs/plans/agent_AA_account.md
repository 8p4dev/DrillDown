# 에이전트 AA plan — 로그인·계정·관리자·서버 (R8·R9·R5 서버)

작성 2026-11-08. 상위 plan: `orchestration_redesign.md` §1(R5·R8·R9) §3.1(문서 형식) §3.3(서버 모델). 산출물은 코드가 아니라 설계 문서다.

## 접근 방식
- 입력: `decisions.md` 6~9, `11_cost_recovery.md` §2·§3·§6, `04_tech.md` §4·§7, `R4_platform.md` #12·#13, `feature_backlog.md`, 코드 `src/core/*` `src/App.tsx` `src/router.ts` `TreeListPage.tsx`(`toneOf`).
- 서버 스택은 5개 후보를 Pi 5 ARM64·1인 운영·백업·OAuth 난이도·TS 타입 공유 기준으로 비교한다. 메모리 수치는 출처 또는 이 PC에서 직접 측정(Node 24 내장 `node:sqlite`)한 값으로 쓰고 ARM 환산은 [가정]으로 표시한다. 11 §2의 Postgres 2대 권고와 "리소스 최소" 요구를 1대 SQLite 구성으로 재평가한다.
- OAuth는 Google·Kakao 공식 문서를 WebFetch로 확인해 스코프·검수·비즈 앱 조건을 URL+확인일과 함께 적는다. Naver·Apple은 평가만.
- 계정·관리자·API·개인정보는 plan §3.3 이름(`users` `sessions` `audit_log`, 역할 `anon/user/owner/admin`)을 그대로 쓰고, SH 소유 테이블 필드는 "요청" 표로만 적는다.
- 검토한 대안·트레이드오프는 문서 §2 결정 요약표에 넣는다.

## 수정/생성 파일
- `docs/plans/agent_AA_account.md` (이 파일)
- `docs/specs/03_account_admin.md`
- `docs/specs/evidence/aa/cost_table.md` (월 비용·하드웨어 계산표)
- `docs/specs/evidence/aa/memory_measure.md` (스택 메모리 측정 결과 + 측정 스크립트 본문)
- `docs/specs/evidence/aa/flows.md` (로그인·로그아웃·탈퇴·로컬 병합 흐름도, mermaid/ASCII)
- `docs/specs/evidence/aa/sources.md` (제공자 정책 발췌, 확인일)
- 그 외 전부 읽기 전용. `src/**`·설정·의존성 수정 없음.

## 단계별 작업
- [x] 1. 상위 plan·결정·11·04·R4·백로그·코드 읽기
- [x] 2. 이 plan 작성
- [x] 3. 웹 조사: Google OAuth(스코프·검수), Kakao(동의 항목·비즈 앱·검수), Naver·Apple(평가), PocketBase/Postgres/SQLite 메모리 출처, Cloudflare Tunnel/Access, B2, 도메인 가격, 개인정보 처리방침 필수 항목·유출 신고
- [x] 4. 측정: 이 PC에서 Node 24 bare http + `node:sqlite` RSS 측정 → `evidence/aa/memory_measure.md`
- [x] 5. 계산: 월 비용·하드웨어 1회 비용·디스크 추정 → `evidence/aa/cost_table.md`
- [x] 6. 흐름도 → `evidence/aa/flows.md`
- [x] 7. `03_account_admin.md` §1~§4 (목적, 결정 요약표, 상세: 스택·OAuth·세션·계정·관리자·API·개인정보·비용·공수, 화면별 적용)
- [x] 8. `03_account_admin.md` §5 검증(요구 대조표·코드 대조·측정·약점) §6 미결 §7 출처
- [x] 9. `npm run typecheck && npm run lint && npm run build` (코드 무변경 확인), 링크 경로 확인
- [x] 10. 커밋(의미 단위 1~2개), worker_done 보고

## 검증 방법
- 3: 각 주장 옆에 URL+확인일. 확인 못 한 것은 [가정].
- 4: 스크립트 출력(RSS 바이트)을 evidence에 그대로 붙인다.
- 5: 산식·단가·출처를 표로. 11 §3과 차이를 명시.
- 7~8: §5 (a) R5(서버)·R8·R9 완료 기준 열의 항목이 모두 어느 절에서 충족되는지 표로 채움. (b) `App.tsx` `router.ts` `db.ts` `types.ts` 변경점 파일 단위. 권한 매트릭스 빈칸 0.
- 9: 세 명령 종료 코드 0, `git status`에 src 변경 없음.
