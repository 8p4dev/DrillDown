# S4 보안 검토 — 인프라·운영·개인정보·공급망

기준: 2026-11-14 작업 트리(`C:\drilldown\app`). 읽기 전용 — 저장소 변경·커밋 없음, `npm run e2e` 미실행. 메모리 DB + `app.request()` 공격 스크립트(`...\81a3948d-...\scratchpad\probe_setup.mjs`·`p1~p3.mjs`)로 직접 조작해 확인했고, `git log -p` 비밀 grep·`npm audit`·`package-lock` 무결성·`node:sqlite` 실측을 돌렸다. 어제 `r1_server.md` 가 "deploy 유닛·백업·AUTH_FAKE 기동 거부·감사 삭제 경계 문제 없음/수정됨"으로 적은 항목을 다시 의심해 공격했다.

## 핵심 5줄

1. **운영 런북(§1·§4)대로 배포하면(AUTH_FAKE=0·PUBLIC_ORIGIN=https·admins.json) S4 영역에 Critical 은 없다.** 감사 로그 불변 트리거, 일일 작업 완결성(r1 M1 경계), 저장소 비밀 유출, SQL 인젝션 경로, Access 가 가리는 데이터 라우트는 공격해도 막혔다(아래 '안전' 목록, 재현 근거 포함).
2. **H1 — AUTH_FAKE 가 systemd 유닛에서 강제로 꺼지지 않고, 기동 가드는 https 스킴만 본다.** 세 유닛(`drilldown-server/backup/daily.service`) 어디에도 `Environment=AUTH_FAKE=0` 이 없다. 유일한 차단막은 `createApp` 의 `if (env.authFake && env.secure)` 인데 origin 이 http 면 통과한다. `.env.example` 기본이 `AUTH_FAKE=1` 이고 Cloudflare Access 는 `/api/admin/*` 만 가리므로, origin 이 http 인 채 배포되면 터널 너머 누구나 `GET /api/auth/fake/start?as=admin` 한 줄로 관리자가 된다(✔ 재현). S1 리뷰도 같은 가드 구멍을 찾았다 — 본 리뷰는 **배포 체인(EnvironmentFile·Access 범위)** 측면을 더한다.
3. **M1 — 로컬 백업 14개가 평문이다.** `age` 암호화는 **외부 업로드본에만** 적용되고 즉시 삭제된다(`backup.ts:32-35`). 항상 남는 `data/backups/app-YYYYMMDD.db` 14개와 `pre-migrate-NNN.db` 는 평문 SQLite 로, 리눅스 기본 권한 0644(✔ 실측 mode 666/umask)다. 그런데 처리방침(PrivacyPage ②·⑩)은 "암호화 백업"이라고만 적어 평문 로컬 사본의 존재를 숨긴다.
4. **M2 — 피드백 글이 처리방침 수집 항목 표에 없다 / 게시중단 연락처(PII)가 미처리 시 무기한 남는다.** `feedback.text`(≤500자 자유 글)·`client`(UA 축약)는 user_id 와 함께 저장되는데 PrivacyPage `ITEMS` 표에 빠져 있다(법 제30조 항목 고지 누락). 또 `legalDaily` 는 `takedowns`·`requests` 를 `resolved_at < now-90d` 로만 지워, 운영자가 큐를 안 비우면 신고자 성명·연락처가 영구 잔존한다(appeals 는 `tree_id NOT IN trees` 고아 정리가 있으나 takedowns 는 없음).
5. **공급망·플랫폼 — 치명적 없음, 주의 2건.** `npm audit` 6건(low 2·moderate 4)은 **전부 devDependencies**(vite-plugin-pwa·workbox·glob·minimatch — 빌드 타임)이고 프로덕션 9개(hono·@hono/node-server·dexie·react·react-dom·ts-fsrs)는 깨끗하다. 다만 Pi 에서 `npm ci && npm run build`(런북 §1-3)가 467개 dev 의존성과 `esbuild`·`fsevents` postinstall 스크립트를 운영 호스트에서 실행한다. `node:sqlite` 는 Node 24 에서 **실험적 API**(경고 억제 중)다.

## 위협 모델

| 자산 | 공격자 | 진입점 |
|---|---|---|
| 관리자 권한 | 비로그인·LAN·터널 너머 임의 사용자 | `/api/auth/fake/start?as=admin`(Access 밖), EnvironmentFile·유닛 설정 |
| DB 평문(provider_sub·닉네임·트리·학습 기록) | Pi 디스크 접근자, 백업 디렉터리 읽기, 분실·폐기 SD/NVMe | `data/backups/*.db`(평문 14개), `pre-migrate-*.db`, 외부 B2 버킷 |
| 신고자·게시중단 요구자 연락처(이메일·전화) | 큐를 보는 관리자, 장기 잔존 | `takedowns.claimant_contact`, `requests.note`, 보존 주기 |
| 개인정보 고지 신뢰성(법 제30조) | 규제·정보주체 | PrivacyPage·TermsPage ↔ 실제 수집·보존 |
| 공급망 | 악성 패키지·postinstall | `npm ci`(dev 포함)·`npm run build` on Pi |
| 요청 로그 PII | 로그 열람자 | `index.ts` 로그 줄, `metrics.ts` 오류·클라이언트 오류 |
| 감사 로그 무결성 | 흔적을 지우려는 관리자·침입자 | `audit_log` 트리거, 삭제 경로, PRAGMA |

전제: `127.0.0.1:3000` 바인딩 + Cloudflare Tunnel, 관리자 경로 앞 Access 2차, B2 쓰기 전용 키·버킷 14일 수명주기, age 비밀키는 운영자 2인 오프라인. 아래 심각도는 이 전제 기준이며, 전제가 깨지는 흔한 오설정(H1)을 명시한다.

## 발견 표

| ID | 심각도 | OWASP | 파일:줄 | 공격 시나리오(구체적 요청) | 영향 | 재현 | 고치는 법(최소 diff) | 공수 |
|---|---|---|---|---|---|---|---|---|
| H1 | High (오설정 조건부) | A05 보안 설정 오류 / A07 인증 실패 | `deploy/drilldown-server.service:15-18`, `server/index.ts:21`, `.env.example:14` | 운영자가 `.env.example` 을 복사해 `/etc/drilldown/env` 로 쓰고 `AUTH_FAKE` 줄을 지우지 않거나(기본 `1`) `PUBLIC_ORIGIN` 을 비워 둔다 → `env.origin='http://localhost:3000'`, `env.secure=false`. 유닛에는 `AUTH_FAKE=0` 을 박은 `Environment=` 가 없어 끌 수 없다. `createApp` 가드 `if(env.authFake && env.secure)` 는 http 라 통과. cloudflared 터널은 모든 경로를 127.0.0.1:3000 로 넘기고 Access 는 `/api/admin/*` 만 가리므로 `GET https://<도메인>/api/auth/fake/start?as=admin` → 302 + `sid` → 관리자. | 무인증 전체 관리자(사용자·트리 열람·정지·삭제, 설정·게시중단·세션 전폐기). Access 2차 인증도 우회(해당 경로가 Access 밖). | ✔ `p1.mjs`: NODE_ENV=production·http origin·AUTH_FAKE=1 에서 `createApp` 통과 → `fake/start?as=admin` 302 → `/api/me` role=admin(admins.json 미등재) → `/api/admin/stats` 200 | ① 가드를 바인딩까지 보게: `const loopback=['127.0.0.1','::1','localhost'].includes(env.host); if(env.authFake && (env.secure || !loopback)) throw new Error('AUTH_FAKE on non-loopback/https')` ② 세 유닛 `Environment=` 에 `AUTH_FAKE=0` 추가(EnvironmentFile 보다 Environment 가 뒤에 오게 — systemd 는 뒤 지정이 이김) ③ `.env.example` 기본을 `AUTH_FAKE=0` 으로 | S |
| M1 | Medium | A02 암호화 실패 / 처리방침 불일치 | `server/account/backup.ts:19-26,32-35`, `server/db.ts:30`, `src/features/account/PrivacyPage.tsx:23,65` | Pi 디스크·SD/NVMe 를 손에 넣거나(분실·폐기·절도·백업 디렉터리 읽기) 같은 호스트의 다른 프로세스가 `data/backups/app-*.db`(평문, 14개)·`pre-migrate-*.db`(평문)를 읽는다. `age` 는 외부 업로드본에만 적용되고 `finally` 로 즉시 지운다 — 로컬엔 암호문이 남지 않는다. | DB 전체(provider_sub·닉네임·공개/비공개 트리·학습 기록·신고/소명/피드백 자유 글) 평문 노출. 해킹 시 유출 신고 의무(규모 무관). 처리방침 "암호화 백업"(②·⑩)이 로컬 사본에는 거짓 → 고지 위반. | ✔ `p2.mjs`: 외부 미설정 시 `app-20261114.db` 평문 221KB, mode 666(리눅스 umask 022→644, 그룹·기타 읽기 가능) | ① 백업 파일 권한 조이기: `writeFileSync`/`backup()` 뒤 `chmodSync(file, 0o600)`, 디렉터리 `mkdirSync(dir,{recursive:true,mode:0o700})` ② 처리방침 ②·⑩을 "로컬 사본은 Pi 디스크에 평문 보관(접근 통제·디스크 암호화로 보호), 외부 전송본만 age 암호화"로 정정, 또는 로컬 사본도 age 암호화 | S |
| M2 | Medium | A04 안전하지 않은 설계 / 개인정보 최소·고지 | `src/features/account/PrivacyPage.tsx:13-24`, `server/account/legal.ts:37-38`, `server/account/daily.ts:34` | (a) 피드백 보내기: `POST /api/feedback {category,text}` → `feedback(user_id,text,client)` 저장되는데 PrivacyPage 항목 표에 "피드백 글"이 없다(법 제30조 ② 항목 고지 누락). (b) 게시중단: `POST /api/takedown` 으로 접수된 행이 관리자가 큐를 처리하지 않으면 `resolved_at` 이 NULL 이라 `legalDaily` 의 `resolved_at < now-90d` 삭제 대상이 안 됨 → `claimant_name`·`claimant_contact`(이메일/전화, ≤120자) 무기한 잔존. 트리가 purge 돼도 takedown 행은 그대로(appeals 와 달리 고아 정리 없음). | 수집 항목 미고지(규제 위험). 신고자·요구자 PII 가 목적(통보) 달성 후·대상 소멸 후에도 남음(최소 수집·보존 원칙 위반). | ✔ 코드 경로 확인(`legalDaily` 는 미처리 takedowns/requests 를 건드리지 않음; PrivacyPage ITEMS 10항목에 feedback 없음). 미재현(시간 경과 의존) — 설계 구멍으로 기록 | ① PrivacyPage `ITEMS` 에 `['피드백·문의 글','문의 처리','처리 후 90일']` 추가 ② `legalDaily` 에 미처리 장기 건 상한 또는 고아 정리: `DELETE FROM takedowns WHERE resolved_at IS NULL AND received_at < ? AND tree_id NOT IN (SELECT id FROM trees)` + 처리방침에 "미처리 신고 연락처 보존 기간" 명시 | S |
| L1 | Low | A06 취약·구식 요소 / 공급망 | `package.json`(scripts·devDeps), `docs/ops/runbook.md:3단계` | 런북대로 Pi 에서 `sudo npm ci && sudo npm run build` 실행 시 dev 의존성 467개가 설치되고 `esbuild`·`fsevents` 의 postinstall 이 운영 호스트에서(그것도 root 로 `sudo`) 돈다. dev 패키지 중 하나가 침해되면 빌드 호스트에서 코드 실행. | 운영 Pi 가 빌드 체인 공급망 공격면에 노출(특히 `sudo`). `npm audit` 6건은 모두 빌드 타임이라 런타임 영향은 없으나 빌드 시 악용 여지. | ✔ `npm audit`: low2·moderate4 전부 devDeps(vite-plugin-pwa·workbox-build·glob·minimatch·deepmerge·@rollup/plugin-node-resolve), prod 9개 0건. lockfile 무결성 ✔(475개 전부 `integrity`·registry.npmjs.org, 외부 URL 없음) | 다른 기기에서 빌드해 `dist/` + 프로덕션 의존성만 Pi 로(또는 `npm ci --omit=dev` 후 별도 빌드). `sudo npm` 대신 `drilldown` 사용자로. 월 1회 `npm audit` 유지. | M |
| L2 | Low | A06 취약·구식 요소 | `server/db.ts:5`, `deploy/*.service:ExecStart` | 서버·백업·일일 작업이 Node 24 의 **실험적** `node:sqlite`(`--no-warnings=ExperimentalWarning` 로 경고 억제)에 의존. `backup()`·`DatabaseSync`·`PRAGMA` 동작이 24.x 패치에서 바뀌면 백업·마이그레이션이 조용히 깨질 수 있다. | 가용성·복구 신뢰성 위험(치명적 아님). `engines: ">=24.19 <25"` 핀은 좋은 방어. | ✔ 실측: `node:sqlite` 로드 시 ExperimentalWarning, SQLite 3.53.3, `backup` export 존재 | `engines` 핀 유지 + 복원 리허설(런북 §4) 때마다 `backup()`/`integrity_check` 실제 검증. Node 24.x 업글 시 백업·마이그레이션 회귀 테스트. | S |

## 검토했으나 안전 (근거 파일:줄 — 공격 후 막힘/일치 확인)

- **감사 로그 불변 트리거 — API 층에서 우회 불가.** `004_appeals_audit_ro.sql:3-6` 의 `audit_no_update`(모든 UPDATE ABORT)·`audit_no_delete`(1년 내 행 DELETE ABORT). 어떤 라우트도 임의 SQL·임의 PRAGMA 를 노출하지 않는다(`/api/admin/ops/checkpoint` 는 `PRAGMA wal_checkpoint(TRUNCATE)` 고정, `admin.ts` CSV 는 읽기). 일일 삭제 컷오프가 트리거 식과 **같은** `CAST(strftime('%s','now') AS INTEGER)*1000 - 365*86400000` 라 r1 M1 의 "같은 초 경계에서 DELETE 전체 ABORT"가 사라졌다(✔ `p3.mjs`: 경계행 삭제·최근행 유지·`legalDaily` 실행·`runDaily ok=true`). PRAGMA `writable_schema`·테이블 재생성으로 트리거를 지우는 것은 **SQLite 파일 직접 접근(=Pi 침해)** 이 전제라 API 위협이 아니다(런북 §5 침해 대응이 다룸).
- **일일 작업 완결성(r1 M1).** `daily.ts:17-48` — 세션→purge→톰스톤→신고/소명 90일(+고아 appeals)→`legalDaily`→`productDaily`→감사 삭제(맨 뒤)→checkpoint 순. 한 사용자 purge 실패는 그 사용자만 롤백(`:21-29`), 감사 삭제가 맨 뒤라 앞 단계가 보호된다(✔ `p3.mjs` 완주).
- **탈퇴 purge 완전성(r1 M2).** `owner.ts:20-23` 가 ratings·srs·attempts·nodes·trees·user_seq·`appeals`·`feedback` 삭제 + reports.reporter_id NULL. r1 이 지적한 appeals·feedback 누락이 메워졌다. (잔여: 백업 14일 안 사본 — 처리방침 ④에 고지됨. takedown 은 익명 요구자라 user_id 없음 — purge 대상 아님.)
- **배포 유닛 하드닝.** `drilldown-server.service` 가 `User/Group=drilldown`(비루트)·`NoNewPrivileges`·`ProtectSystem=strict`·`ProtectHome`·`PrivateTmp`·`PrivateDevices`·`ProtectKernelTunables`·`ProtectControlGroups`·`RestrictSUIDSGID`·`ReadWritePaths=/var/lib/drilldown`·`MemoryMax=512M`. `ReadWritePaths` 가 서버가 쓰는 전부(app.db·backups·*.json)를 덮는다(r1 확인 재검증 ✔). backup/daily 유닛도 같은 하드닝 + `RCLONE_CONFIG`.
- **EnvironmentFile·RCLONE_CONFIG 권한.** 런북 §1-4 가 `/etc/drilldown/env` 를 `600 root`, `rclone.conf` 는 B2 **쓰기 전용** 키(목록·삭제 불가) + 버킷 14일 수명주기로 규정 — B2 키 유출 시에도 기존 백업 열람·삭제 불가. 서버·backup 유닛이 같은 `RCLONE_CONFIG=/etc/drilldown/rclone.conf` 를 가리켜 관리자 [지금 백업] 자식 프로세스도 업로드 가능(`drilldown-server.service:17`).
- **Cloudflare Access 범위 ↔ 데이터 노출.** Access Path 는 `api/admin/`(prefix). 모든 관리자 **데이터** 는 `/api/admin/*` 뒤에 있고 서버 `requireAdmin`(`http.ts:100-103`)가 비관리자에 **404**(존재 은닉)를 돌린다 — Access 는 심층 방어 2차. 해시 라우트 `#/admin`·관리자 JS 청크(`AdminPage-*.js`)는 정적 서빙이라 Access 밖이지만, 청크에 비밀이 없음을 확인했다(✔ `grep` 결과 `secret`·`token` 은 UI 라벨 문자열뿐, 키·엔드포인트 비밀 없음; 03 §3.4 M7 결정과 일치). **예외는 H1 의 `/api/auth/fake/start`** — 이것만 Access 밖이면서 관리자 세션을 만든다.
- **요청 로그·지표 PII.** `index.ts:31-36` 는 `ts method maskPath(path) status ms` 만 — 쿼리스트링·IP·원문 UA 없음, 공유 slug·UUID 마스킹(✔ `server/check.ts` F10 검증). `onError` 의 `console.error(e)` 는 예기치 않은 5xx 에만 돌고(HttpError 는 봉투로 반환, 로그 안 함) 스택엔 사용자 입력이 섞이지 않는다. `metrics.ts` `recordError` 는 `e.name` 40자만, `recordClientError` 는 클라이언트 메시지(제어문자 제거·200자, 대시보드 React 이스케이프), `maskPath` 동일. 감사 CSV 는 수식 주입 방지(`admin.ts:401` `^[=+\-@]` 앞 `'`). 메타에 자유 텍스트·개인정보 안 넣음(소명·피드백 본문은 각 테이블에만).
- **저장소 비밀 유출 — 없음.** `git log -p` 전체에서 `AIza…`·`ya29.`·`age1…`·`AGE-SECRET-KEY`·`KakaoAK <hex>`·`GOCSPX-`·`-----BEGIN … KEY-----`·`.env` 값 **검출 0**. `.gitignore` 가 `.env`·`config/admins.json`·`data/` 차단, 커밋된 건 `.env.example`·`admins.json.example`(플레이스홀더)뿐(✔ `git ls-files`). `dist/` 에 소스맵·`.env` 없음.
- **package-lock 무결성.** 475개 패키지 전부 `integrity` 해시 + `registry.npmjs.org` 해석, 외부/깃 URL 0(✔). postinstall 은 `esbuild`·`fsevents`(둘 다 dev/optional) 뿐.

## 테스트 공백

- **H1**: `createApp` 가 `authFake && !loopbackHost` 에서도 기동 거부하는지(현재 check 는 `authFake && secure` 만; http+0.0.0.0 조합 미검증). 세 유닛에 `AUTH_FAKE=0` 이 들어갔는지 배포 린트.
- **M1**: `runBackup` 뒤 `data/backups/*.db`·`pre-migrate-*.db` 파일 모드가 0600 인지. 외부 설정 無일 때 로컬 사본이 평문인 사실을 처리방침 문구와 대조하는 테스트.
- **M2**: `purgeUser`/`legalDaily` 후 미처리·고아 `takedowns`·`requests` 에 연락처가 남지 않는지(정책 확정 후). PrivacyPage `ITEMS` 가 실제 저장 테이블(feedback 포함)과 1:1 인지 대조 테스트.
- **감사 불변**: 트리거가 걸린 실제 파일 DB 에서 UPDATE/DELETE(1년 내) ABORT, 1년 경계행 DELETE 허용(현 check 는 `:memory:` 신규만; `p3.mjs` 가 경계만 확인).
- **복원 런북(§4)**: 평문 로컬 백업 → `age -d` 불필요 경로와 외부 암호문 → `age -d` 경로가 모두 `integrity_check=ok` 로 끝나는지 월 1회 리허설에서 실제 수행. 현재 e2e·check 는 백업 **생성** 만 다루고 **복원** 왕복은 수동.
- **공급망(L1)**: CI 에서 `npm audit --omit=dev` 가 0 을 유지하는지, prod 의존성에 install 스크립트가 없는지 자동 점검.
