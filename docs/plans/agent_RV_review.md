# 에이전트 RV plan — 교차 검증(레드팀)

작성 2026-11-08. 상위 `orchestration_redesign.md` §1 R11. 산출물 `docs/specs/05_review.md`. 네 문서(`01`~`04`)·`evidence/`·`src/**`는 읽기만 한다.

## 접근 방식

- 검토 축 7개(요구 충족·문서 간 정합·결정 위반·코드 대조·근거 품질·실현 가능성·시나리오 추적)를 **각각 체크리스트로 먼저 쓰고**, 체크한 결과만 발견 표에 올린다. 설계는 다시 하지 않는다.
- 심각도 근거는 요구 원문 11줄·plan §1~§3·`decisions.md`·`orchestration_modes.md` §0·현재 코드뿐이다. 사용자 선호는 추측하지 않는다.
- 코드 대조는 `grep`·`sed -n`으로 파일:줄을 직접 연다(표본 ≥10). 측정 2건(`contrast.mjs`·`measure_size.mjs`)은 Node로 재실행해 문서 수치와 비교한다(결과 파일은 커밋하지 않음). 출처는 WebFetch로 ≥10개 열어 본다.
- 대안: 문서별 순차 리뷰 → 기각(문서 간 모순은 같은 주제를 네 문서에서 동시에 봐야 보인다). 주제별(서버·UI 언어·라우트·타입·예산·역할) 가로 비교를 택한다.

## 수정/생성 파일

- `docs/specs/05_review.md` (생성)
- `docs/plans/agent_RV_review.md` (이 파일)
- 임시: scratchpad에 측정 출력·fetch 결과. 커밋 안 함.

## 단계

- [x] 1. 읽기: plan 전체, decisions 1~9, modes §0, 01~04 전문
- [x] 2. plan 작성(이 파일)
- [x] 3. 축 2 정합성 후보 (a)~(h) 메모 → 표 초안
- [x] 4. 코드 대조: 네 문서의 [코드] 인용 표본 ≥10 + SH 주장 2건(`attempts` 미기록, `childrenOf` 정렬) 직접 확인
- [x] 5. 측정 재현: `node docs/specs/evidence/ds/contrast.mjs`, `node docs/specs/evidence/sh/measure_size.mjs` → 문서 수치 대조. evidence 하위 md(bundle·fonts·capacity·conflicts·flows·cost) 표본 열람
- [x] 6. 출처 표본 ≥10 WebFetch (라이선스·브라우저 동작·OAuth·OWASP·가격)
- [x] 7. 축 1 요구 대조표(R1~R10 완료 기준 + 사용자 원문 11줄)
- [x] 8. 축 3 결정 위반·긴장 (decisions 1~9, modes §0, A3~A10, §3.2·§3.3 계약)
- [x] 9. 축 6 공수 합산·운영 요소 누락
- [x] 10. 축 7 시나리오 5개 추적
- [x] 11. `05_review.md` 작성(요약·발견 표·대조표·시나리오·측정·사용자 결정·한계)
- [x] 12. `npm run typecheck && npm run lint && npm run build` → 코드 무변경 확인, 커밋, worker_done

## 검증 방법

- 각 발견 행에 "근거" 열(인용 줄·코드 파일:줄·출처 URL) 없으면 표에서 뺀다.
- 측정은 명령·출력 요약·문서값·차이를 §5에 적는다.
- 완료 기준: 7축 전부 절이 있고, 발견 표 행마다 근거·담당이 있고, 측정 2건 재현, 커밋.

## 변경 사항

- 출처 열람은 18건(WebFetch). 실패 0건이나 대법원 PDF는 본문 추출 불가 → "존재 확인·내용 미확인"으로 적었다.
- 측정 출력은 scratchpad에만 두고 커밋하지 않았다(규칙). `git status`로 src·evidence 무변경 확인.
