# 오케스트레이션: 보안 검토 수정 → 재검토 (2026-11-14)

근거: `docs/research/security_2026-11-14/00_synthesis.md`(통합표 #1~#12) 와 원문 s1~s4. 요구: "수정 끝까지 진행, 수정 이후 한 번 더 검토".
수정 워커 2명(X1 서버, X2 문서·클라이언트·테스트) → 오케스트레이터 머지·검증 → 재검토 워커 2명(V1 서버 재공격, V2 클라이언트·문서·테스트 검증).

## 0. 공통 규칙
- Orca 새 worktree(브랜치), main 커밋 75a299c 기준. 소유 파일만. 새 npm 패키지 금지.
- 검증: `npm run typecheck && npm run lint && npm run check && npm run build`. 항목마다 **공격을 재현하던 요청이 이제 막히는지** check 단언으로 남긴다(보고서의 재현 스크립트 방식: 메모리 DB + `app.request()`). `npm run e2e` 금지(오케스트레이터 1회).
- 끝나면 자기 브랜치에 커밋(한국어, `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`), push 금지, `worker_done` 에 브랜치·항목 표(#·상태·단언 이름)·못 한 것.

| 워커 | 포트 | 브랜치 | 소유 |
|---|---|---|---|
| X1 서버 | node 4381 | agent-sec-server | `server/**`, `deploy/**`, `.env.example` |
| X2 문서·클라이언트·테스트 | vite 5382 / node 4382 | agent-sec-docs | `src/**`, `docs/**`, `e2e/**`(새 스펙 1개 `security.spec.ts` 만), `README.md` |

## 1. X1 서버

| # | 할 일 | 단언 |
|---|---|---|
| 1 (High) | `server/index.ts` 기동 가드: `env.authFake && (env.secure \|\| !['127.0.0.1','::1','localhost'].includes(env.host))` 면 throw. `deploy/drilldown-{server,backup,daily}.service` 에 `Environment=AUTH_FAKE=0` 을 **EnvironmentFile 뒤**에. `.env.example` 기본 `AUTH_FAKE=0` + "개발에서만 1" 주석 | http + HOST=0.0.0.0 기동 거부, http + 127.0.0.1 허용 |
| 2 (High) | `server/sync/push.ts` 병합 뒤 `auto_correct_days` 총량 상한(`LIMITS.autoDays`, 기존 3,660 재사용, 최신 쪽 유지). `server/sync/map.ts` 날짜 정규식 달력화 | 같은 노드 superseded push 20회 뒤 길이 ≤ 상한; `9999-99-99` 400 |
| 3 (Med) | `server/http.ts clientIp`: XFF 폴백 삭제(`cf-connecting-ip ?? 'local'`) | XFF 회전 13회 → 429 발생 |
| 4 (Med) | `server/account/legal.ts` reject/resume: 최근 `tree.hide` 감사 메타의 `takedown_id === id` 일 때만 해제(아니면 상태만 바꾸고 숨김 유지). 접수 시 `audit(... 'tree.hide', { takedown_id })` 가 기록되는지 확인하고 없으면 추가 | takedown → admin hide(별도 사유) → reject ⇒ hidden 유지; takedown 만 → reject ⇒ 해제 |
| 5 (Med) | `server/account/backup.ts`: `mkdirSync(dir,{recursive:true,mode:0o700})`, 백업 파일·`pre-migrate-*.db`(`server/db.ts`) 생성 뒤 `chmodSync(..., 0o600)` (Windows 에서는 no-op 허용, try) | 리눅스 모드 단언은 `process.platform !== 'win32'` 일 때만 |
| 6 (Med) | `server/account/legal.ts legalDaily`: 미처리 `takedowns`·`requests` 가 `received_at < now-180d` 이거나 대상 트리가 없으면 삭제(연락처 보존 상한). | 고아·180일 초과 삭제, 최근 미처리는 유지 |
| 7 (Low) | `server/sync/map.ts parseAttempt`: `nodeRecall`·`edgeAccuracy` 0..1 밖 `bad`, 카운트 음수 `bad`; `push.ts` 에서 `treeId` 가 내 트리(`owner_id`) 아니면 `dropped` | 남의 트리 attempt dropped, 1e308 400 |
| 8 (Low) | `server/account/oauth.ts signIn`: 로그인 뒤 사용자당 세션 최신 20개만 남기고 DELETE | 25회 로그인 → 세션 ≤ 20 |
| 9 (Low) | `server/index.ts` CSP: `secureHeaders({ contentSecurityPolicy: {...} })`. `script-src 'self' 'sha256-…'` 의 해시는 **기동 시 `dist/index.html` 의 모든 인라인 `<script>`(테마 스크립트·PWA inline register) 본문을 sha256-base64 로 계산**해 넣는다(클라이언트 변경 없음). `style-src 'self' 'unsafe-inline'`, `img-src 'self' https: data:`, `connect-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'`, `form-action 'self'`. dist 가 없으면(check 환경) 해시 없이. HSTS 는 `env.secure` 일 때만 | 응답에 CSP 헤더 + 해시 포함; `server/check.ts` 에 헤더 단언 |
| 12 (Info) | 선택: CSRF content-type 게이트를 content-length 와 무관하게 강제(상태 변경 + 본문 있음 + CT≠json → 415). 기존 check 가 깨지면 보류 | — |
| OG | `renderShare` 회귀 단언: 제목 `"><script>` 공개 후 셸에 raw `<script>` 없음(`<title>`·`content=` 둘 다) | sync.check 또는 server/check |

## 2. X2 문서·클라이언트·테스트

| # | 할 일 |
|---|---|
| 5·6 | `src/features/account/PrivacyPage.tsx` ITEMS: `피드백·문의 글(분류·본문·브라우저 종류) / 문의 처리 / 처리 후 90일`, `게시중단 요구자 성명·연락처 / 통보·재개 절차 / 처리 후 90일, 미처리 180일`, `정보주체 요청 메모 / 요청 처리 / 처리 후 90일, 미처리 180일`. ②·⑩ 백업 문구: "외부 전송본은 age 암호화, Pi 로컬 사본 14일은 평문(파일 권한 600·디스크 접근 통제)". ⑪ 변경 이력에 오늘 항목. `TermsPage` 5항 연락처 보존 문구 일치 |
| 1·10 | `docs/ops/runbook.md` §1: ".env 에서 AUTH_FAKE 줄 삭제 또는 0 확인, PUBLIC_ORIGIN 필수(https)" 체크 항목, 빌드는 다른 기기에서 하고 `dist` + `npm ci --omit=dev` 만 Pi 로(`sudo npm` 금지) 절차로 교체. §4 복원 리허설에 평문 로컬/암호문 외부 두 경로 `integrity_check` |
| 테스트 | `src/features/editor/content/content.check.ts`(또는 해당 check): `toHtml(parse('<img onerror=x>==p:</mark>=='))` 결과에 `<`/`>` 가 `div·mark·br·/` 외 태그로 남지 않음. `src/core/backup.check.ts`: `__proto__`·`constructor` 키 백업 통과 후 `Object.prototype` 미오염. `e2e/security.spec.ts` 1개: 악성 제목·노트·별칭 트리 공개 → `/t/<slug>`·갤러리 미리보기·플래시 탭에서 `page.on('dialog')` 0건, 주입 `<img>`·`<script>` 0건 (`server.spec.ts` 의 login/makeTree 헬퍼 복사 사용) |
| 문서 | `docs/CODEBASE.md` 서버 절에 "보안 결정" 소절 5줄(AUTH_FAKE 가드·CSP 해시·레이트 리밋 IP 출처·백업 권한·보존 주기). `docs/research/security_2026-11-14/00_synthesis.md` 는 건드리지 않는다(오케스트레이터가 결과 절 추가) |

## 3. 재검토 (머지 후, 읽기 전용)

- V1 서버: #1~#9·#12·OG 를 **원래 재현 스크립트 방식으로 다시 공격**해 막혔는지, 우회 변형(대소문자 헤더·IPv6 루프백·`::ffff:127.0.0.1`·HOST 미설정·CSP 해시가 실제 index.html 과 일치하는지·CSP 가 앱 동작을 깨지 않는지)을 본다. 새로 생긴 회귀(기존 check·e2e 외) 도 찾는다.
- V2 클라이언트·문서: CSP 적용 뒤 앱이 실제로 동작하는지(Playwright: 테마 스크립트·PWA 등록·아이콘·아바타·공지 링크·콘솔 CSP 위반 0), 처리방침/약관/런북이 코드와 1:1 인지, e2e/check 단언이 실제 결함을 잡는지(단언을 일부러 깨뜨려 실패 확인).
