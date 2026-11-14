# W2 운영자 관점 — 관리자 페이지(#/admin)에 들어가야 할 운영 요소

작성 2026-11-14. 대상: `C:\drilldown\app`. 읽은 것: `docs/CODEBASE.md` 8·9장, `docs/specs/03_account_admin.md` §3.4·§3.6·§3.7·§3.8, `docs/ops/runbook.md`, `deploy/*`, `server/account/{admin,backup,daily,session,index}.ts`, `server/{env,http,index,db}.ts`, `server/sync/*`, `src/features/admin/AdminPage.tsx`, `src/core/{api,me}.ts`, `src/core/sync/engine.ts`, `src/features/account/Banners.tsx`.
표기: 코드로 확인한 사실은 `파일:줄`, 추측은 **[가정]**. 공수 S = 반나절 이하, M = 1~2일, L = 3일+.

---

## 0. 현재 관리자 페이지가 운영자에게 보여 주는 것 (기준선)

| 영역 | 지금 있는 것 | 근거 |
|---|---|---|
| 대시보드 | 가입자(총·오늘·7일), 활성(7·30일), 트리(총·공개·숨김), 디스크 사용률·여유, 마지막 백업 시각·ok 점·바이트, 일일 작업 시각·ok 점·세션/톰스톤 수, 가동 시간·RSS, 정지·탈퇴 대기, 14일 가입 막대 | `AdminPage.tsx:90-107`, `admin.ts:65-88` |
| 시스템 탭 | 공지 1줄(80자)+켜기, 점검 모드 체크박스(즉시 저장), 감사 로그 50건+더 보기(필터·검색·내보내기 없음) | `AdminPage.tsx:271-296`, `admin.ts:255-288` |
| 서버 측 데이터 | `backup.json`·`daily.json` 파일 읽기, `statfsSync(dataDir)`, `process.uptime/memoryUsage` | `admin.ts:41,69,82-86` |
| 보호 | `/api/admin/*` 비관리자 404 + 120/분, 관리자 세션 24h, Cloudflare Access 2차(`api/admin/` 경로) | `admin.ts:126`, `session.ts:12`, `deploy/cloudflared.md:31-38` |

**눈에 띄는 빈틈(코드로 확인)**
- `backup.json` 에는 `uploaded`(외부 업로드 여부) 가 있지만 `AdminStats.backup` 타입과 화면에는 없다 → 오프사이트 백업이 꺼져 있어도 초록 점. `backup.ts:14,36` vs `src/core/api.ts:116`, `AdminPage.tsx:94`
- `backup.json`·`daily.json` 의 `error` 문자열이 화면에 안 나온다. 실패하면 빨간 점만 보이고 이유는 SSH `journalctl` 로만 확인. `backup.ts:40`, `daily.ts:24,37`, `AdminPage.tsx:94-95`
- 백업이 오래됐는지(예: 26시간 초과) 색으로 구분하지 않는다. `AdminPage.tsx:94`
- 서버 오류(500)는 `console.error(e)` 로 journald 에만 남고 집계가 없다. `server/index.ts:29-33`
- 레이트 리밋 429 는 던지기만 하고 세지 않는다. `server/http.ts:55-63`
- `DB 파일 크기·WAL 크기·세션 수·버전·빌드 해시` 가 `stats()` 에 없다. `admin.ts:65-88`
- 백업·일일 작업은 `import.meta.main` 일 때만 실행되는 별도 프로세스(systemd 타이머) 이고 HTTP 트리거가 없다. `backup.ts:46-52`, `daily.ts:45-51`, `deploy/drilldown-*.timer`
- 런북이 "관리자 화면 대신 `sqlite3`" 로 하라고 적은 작업이 셋: 관리자 sub 확인(`runbook.md:25`), 복원 후 감사 로그 기록(`runbook.md:81`), 전 세션 폐기(`runbook.md:88`).
- 스펙의 "일일 작업 실패 시 외부 알림(텔레그램 봇 1줄) [가정]" 은 구현이 없다(`server/` 에 telegram·notify 검색 결과 0). `03_account_admin.md` §3.8 표 7행

**운영 환경 제약(설계에 그대로 영향)**
- 서버 프로세스는 `drilldown` 사용자, `NoNewPrivileges`, `ProtectSystem=strict`, 쓰기 가능 경로는 `/var/lib/drilldown` 만, `MemoryMax=512M`. `deploy/drilldown-server.service:16-27`
  → 관리자 화면에서 **할 수 없는 것**: `systemctl`(cloudflared 중지·타이머 조작), `git pull`·`npm run build`, `/etc/drilldown/{env,admins.json}` 수정, `journalctl` 읽기.
  → **할 수 있는 것**: 데이터 디렉터리 읽기·쓰기, 자기 프로세스 종료(`Restart=on-failure`, 5초 뒤 systemd 가 되살림 `:16-17`), 같은 코드의 `runBackup`/`runDaily` 함수 호출 또는 `node server/account/*.ts` 자식 프로세스 생성.
- SQLite 단일 쓰기자, `synchronous=FULL`, `busy_timeout 3000`. `server/db.ts:16` → 요청당 DB 쓰기(메트릭 저장 등)는 금지, 긴 쿼리는 이벤트 루프를 막는다.
- 로그 정책: IP·UA·쿠키·닉네임·쿼리스트링 금지, `ts method path status ms` 만, slug 마스킹. `03_account_admin.md` §3.7 "로그에 남기지 않을 것", `server/index.ts:22-27` → 화면에 올리는 오류 요약도 같은 규칙.

---

## 1. 요소 표 (우선순위 순)

| # | 요소 | 왜 필요한가 | 데이터 출처 / 구현 단서 | 상태 | 우선 | 공수 |
|---|---|---|---|---|---|---|
| 1 | **백업 건강 패널**: 외부 업로드 여부·설정 여부, 마지막 백업 나이(26h 초과 경고), 오류 문구, 로컬 보관 개수(14) | 백업만 "있다" 가 아니라 "오프사이트에 복구 가능한 사본이 있다" 를 봐야 함. 지금은 둘을 구분 못 함 | `backup.json.uploaded` (`backup.ts:14,36`), `process.env.BACKUP_AGE_RECIPIENT/RCLONE_REMOTE` 유무(서버 유닛도 같은 `EnvironmentFile` 을 읽음 `drilldown-server.service:13`), `readdirSync(dataDir/backups)` 개수·합계 (`backup.ts:19,26`), `AdminStats.backup` 에 `uploaded·configured·files` 추가 | 부분 | 높 | S |
| 2 | **최근 서버 오류(5xx) 요약**: 재시작 이후 500 건수 + 최근 N건 `{ts, method, 마스킹 path, errName}` 링버퍼 | SSH 없이 "뭔가 깨졌다" 를 알 유일한 창. 사용자 신고 전에 발견 | `server/index.ts:29-33` onError 에서 메모리 배열(≤50) push. path 는 `:27` 의 slug 마스킹 재사용. 메시지 본문은 넣지 않음(§3.7). `stats()` 로 노출 | 없음 | 높 | S |
| 3 | **백업·일일 작업 수동 실행 버튼** + 진행 중 표시 + 결과 즉시 갱신 | 런북 "수동 실행" 이 SSH `systemctl start drilldown-daily` (`runbook.md:68`). 업데이트 직전·복원 직전·의심 상황에서 "지금 백업" 이 필요 | `runBackup(db)`·`runDaily(db)` 는 export 됨(`backup.ts:16`, `daily.ts:13`). **단, `runBackup` 은 `execFileSync('rclone', …, timeout 30분)` 으로 이벤트 루프를 막음(`backup.ts:34`)** → 서버 안에서 직접 호출 금지. `child_process.spawn(process.execPath, ['server/account/backup.ts'])` 로 systemd 와 같은 방식 실행, 동시 실행 방지 플래그 1개, 완료 후 `backup.json` 재읽기. 서버 유닛에는 `RCLONE_CONFIG` 가 없음(`drilldown-backup.service:14` 에만 있음) → 유닛에 한 줄 추가 필요(배포 파일 변경). `audit('system.backup_run'/'system.daily_run')` 기록 | 없음 | 높 | M |
| 4 | **디스크·DB 크기 카드**: `app.db` 크기, `app.db-wal` 크기, 백업 폴더 합계, 페이지·freelist(`PRAGMA page_count, page_size, freelist_count`), RSS/512M 비율 | WAL 이 비정상 성장하면 디스크·백업 시간 모두 악화. Pi 는 디스크가 작다. `MemoryMax=512M` 에 가까워지면 OOM-kill | `statSync(join(dataDir,'app.db'))`·`'app.db-wal'`, PRAGMA 3개(상수 시간), `deploy/drilldown-server.service:27` 의 512M 은 서버가 모르니 상수로 표기 **[가정: 유닛 값과 코드 상수 동기 수동]** | 부분(사용률만) | 높 | S |
| 5 | **일일 작업 결과 상세**: `error` 문구, purge 사용자 수, "오늘 04:00 이후 실행됐는가" 경고 | 지금은 점 색만. 실패 사유 보려면 `journalctl -u drilldown-daily` | `daily.json` 의 `error·purged_users` (`daily.ts:11,24,37`); `AdminStats.daily` 타입에 `error` 추가(`api.ts:117`); 기대 시각 03:00/04:00 은 타이머 상수(`deploy/*.timer:5`) 와 맞춤 | 부분 | 높 | S |
| 6 | **사건 대응(개인정보 유출) 패널**: [점검 모드 ON] [전 세션 폐기] [사건 기록(메모→audit `system.incident`)] + 런북 §5 체크리스트(SSH·외부 콘솔에서 해야 할 항목은 링크·문구만) | 72시간 신고 의무(`runbook.md:85`). 런북 2단계 "세션 무효화" 가 `sqlite3 'DELETE FROM sessions'` (`runbook.md:88`) — 새벽에 SSH 키 찾는 동안 세션이 살아 있다. 점검 모드는 이미 버튼 | `DELETE FROM sessions` 한 줄 + `audit(me,'system.sessions_revoke_all','settings',null,{count})`. 관리자 본인도 로그아웃됨(의도된 동작, 재로그인은 OAuth+Access). `cloudflared` 중지·시크릿 재발급은 권한상 불가 → 안내 텍스트 | 부분(점검만) | 높 | S |
| 7 | **AUTH_FAKE 켜짐 경고 배너**(대시보드 상단 빨간 띠) | 켜진 채 운영하면 누구나 `?as=admin` 으로 관리자(`CODEBASE.md:872,1002`). 지금은 기동 로그 한 줄에만 (`index.ts:74`, `runbook.md:35`) | `env.authFake` (`env.ts:20`) 를 `stats()` 에 `flags.auth_fake` 로 | 없음 | 높 | S |
| 8 | **배포 버전·빌드 식별·재시작 필요 여부·[서버 재시작]** | "지금 돌고 있는 게 어느 커밋인가" 를 사용자 신고와 대조. `git pull && build` 뒤 재시작을 잊은 경우 탐지 | git 해시: `/opt/drilldown/.git/HEAD` → ref 파일 `readFileSync` (exec 불필요) **[가정: 운영 배포가 clone 이라 .git 존재, `runbook.md:13` 근거]**; 빌드 id: `dist/index.html` 의 `index-<hash>.js` 정규식 + mtime; 서버 시작 시각 `Date.now()-uptime`; **재시작 필요 = `dist/index.html`·`server/` mtime > 시작 시각**; 재시작 버튼 = `audit` 후 `process.exit(1)` → `Restart=on-failure` 가 5초 뒤 기동(`drilldown-server.service:16-17`). `package.json` version 은 0.0.0 이라 의미 없음(`package.json:4`). `/api/health` 에는 버전을 넣지 않기로 한 결정 유지(03 §3.6 health 행) → `stats` 에만 | 없음 | 중 | S~M |
| 9 | **SW·클라이언트 번들 버전 표시**(관리자 브라우저 자신의 번들 해시) | "내 브라우저가 새 빌드를 받았나" 확인. 사용자 신고 시 "강제 새로고침" 안내 근거 | 클라이언트에서 `import.meta.url` 의 청크 해시(`AdminPage-DY9ResnD.js` 식, `dist/assets`) 를 표시, 서버 빌드 id(#8) 와 다르면 "새 버전 있음". SW 는 `registerType:'autoUpdate'`(`vite.config.ts:9`) 라 조작 불필요 | 없음 | 중 | S |
| 10 | **레이트 리밋 히트 카운터**(재시작 이후, 키 이름별 429 수: sync_push/sync_pull/admin/report/t/gallery…) | 남용·버그(클라이언트 폭주) 조기 발견. 지금은 흔적 0 | `http.ts:55-63` `hit()` 에서 `key.split(':')[0]` 별 `Map` 증가, `stats()` 노출. 메모리만(§3.6 "카운터는 메모리에만" 과 일치), 재시작 초기화 | 없음 | 중 | S |
| 11 | **동기화 건강 카운터**(재시작 이후): push/pull 호출 수, 410 cursor_expired 수, 400 payload_too_large 수, 403 tree_limit 수, push 결과의 superseded·dropped·id_taken 누계, 평균 ms | 충돌·전체 재동기화 폭증은 데이터 손상의 전조. 서버에는 지금 어떤 지표도 없다 | `sync/index.ts:27-35` 라우트에서 `applyPush` 결과(`push.ts:10-18` 의 배열 길이) 누계; 410 은 `pull.ts:10,12`; 로그 미들웨어(`index.ts:23-28`) 에서 상태코드별 카운트. **outbox 적체·시퀀스 지연은 서버가 알 수 없음**(outbox 는 클라이언트 Dexie, `engine.ts:49,101`; 서버는 기기 커서를 저장하지 않음) → 넣지 않는다. 대체: `user_seq` 에서 `purged_seq>0` 사용자 수(톰스톤 purge 가 일어난 계정 수) 1개 쿼리 | 없음 | 중 | S |
| 12 | **세션 수 카드**: 총 세션, 만료 대기(`expires_at<now`), 관리자 세션 수 | 세션 폭증 = 봇·루프 신호. 사건 대응 전후 확인 | `COUNT(*) FROM sessions` ×3 (`sessions_exp` 인덱스 있음 `001_account.sql:25`; 관리자 수는 `JOIN users WHERE role='admin'`) | 없음 | 중 | S |
| 13 | **공지·점검 예약(ON/OFF 시각)** | 새벽 업데이트 때 운영자가 깨어 있지 않아도 되게. 공지 "24시간 뒤 끈다"(`runbook.md:81`) 를 사람이 기억해야 함 | `settings` key-value 그대로, `notice:{text,enabled,until?}`·`maintenance:{enabled,from?,until?}`. `getSettings` 는 요청마다 호출됨(`account/index.ts:14`) → 거기서 `effective = enabled \|\| (from<=now<until)` 계산하면 스케줄러 불필요. `/api/me` 의 `maintenance/notice` 도 같은 함수 사용(`me.ts:61`). 클라이언트 배너는 60초·포커스마다 `/api/me` 재조회(`src/core/me.ts:171-174`) 라 자동 반영 | 부분(즉시 ON/OFF 만) | 중 | M |
| 14 | **감사 로그 필터·CSV 내보내기·운영 메모 기록** | 1년 보관(`daily.ts:31`) 이면 수천 건. "지난달 누가 뭘 숨겼나" 를 50건씩 넘기며 찾을 수 없다. 복원·사건 기록을 `sqlite3 INSERT` 로 하라는 런북(`runbook.md:81,92`) 대체 | `admin.ts:281-288` 에 `action=`·`target_id=`·`from/to` 조건 추가(`audit_ts`·`audit_target` 인덱스 `001:35-36`). CSV 는 같은 쿼리 상한 5,000행 스트리밍. 운영 메모 = `POST /api/admin/audit/note {action:'system.note'\|'system.restore'\|'system.incident', text≤200}` → `audit()` | 부분(목록만) | 중 | M |
| 15 | **OAuth 제공자 상태**: 제공자별 설정됨(id·secret 유무), 재시작 이후 콜백 실패 수(state 불일치·토큰·userinfo), 제공자별 마지막 로그인 시각 | 시크릿 회전 후 오타·만료를 사용자 신고 전에 발견. 시크릿 "만료일" 자체는 코드로 알 수 없음 **[가정: Google·Kakao 웹 클라이언트 시크릿은 만료 없음, 회전은 수동]** | `enabled()` 는 id 만 봄(`oauth.ts:19`), secret 유무도 함께; `oauth.ts:134,141` 의 `console.warn` 지점에서 카운터; 마지막 로그인 = `SELECT provider, MAX(created_at) FROM sessions JOIN users GROUP BY provider`(세션 수 규모라 가벼움) | 없음 | 중 | S |
| 16 | **관리자 목록·내 식별자 표시**: `admins.json` 내용(읽기 전용), 내 `provider:sub`, 사용자 상세에 `provider_sub` | 런북이 "관리자 화면 대신 sqlite3 로 sub 확인"(`runbook.md:25`). 두 번째 운영자 추가 때마다 SSH | `readFileSync(env.adminsFile)` (`env.ts:16`), `USER_COLS` 에 `provider_sub` 추가(`admin.ts:43`; 관리자 전용·검색은 이미 `provider:sub` 지원 `:137-139`). 파일 **편집** 은 `/etc/drilldown` 이 읽기 전용(`ProtectSystem=strict`) 이라 불가 → SSH 유지 | 부분(검색만) | 중 | S |
| 17 | **복원 절차 안내 패널 + 로컬 백업 파일 목록** | 복원은 서버를 멈추고 파일을 바꾸는 작업이라 화면에서 실행 불가. 대신 "지금 어떤 사본이 어디 있나" 와 절차 10단계를 화면에서 바로 보게 | `readdirSync(backups)` 파일명·크기·날짜(`backup.ts:19-26`), 런북 §4 텍스트 링크. **백업 파일 다운로드는 넣지 않음**(평문 DB 에 `provider_sub`·닉네임·트리 전부, §3.7; 암호화 사본은 업로드 뒤 삭제 `backup.ts:35`) | 없음 | 중 | S |
| 18 | **WAL checkpoint 수동 버튼** (`PRAGMA wal_checkpoint(TRUNCATE)`) | #4 에서 WAL 이 크게 보일 때 즉시 조치. 일일 작업은 04:00 에만(`daily.ts:34`) | 한 줄 PRAGMA, 수 ms~수백 ms. `audit` 기록 | 없음 | 중 | S |
| 19 | **VACUUM 버튼** | freelist 가 크면 파일 축소 | `VACUUM` 은 파일 크기 2배 임시 공간 + 실행 동안 쓰기 차단(이벤트 루프도 막힘). DB 수십 MB 수준이면 수 초 **[가정]**. 넣더라도 "점검 모드 ON 상태에서만 활성" 조건 + 2단계 확인. `daily.ts:34` 의 `PRAGMA optimize` 로 대부분 충분 | 없음 | 낮 | S |
| 20 | **만료 세션 즉시 정리 버튼** | — | `DELETE FROM sessions WHERE expires_at<?` 한 줄. 세션 미들웨어가 접근 시 지우고(`session.ts:50-52`) 일일 작업이 매일 지움(`daily.ts:17`) → 가치 낮음 | 없음 | 낮 | S |
| 21 | **Pi 자원**: loadavg, CPU 온도 | OOM·스로틀 전조 | `os.loadavg()`; 온도는 `/sys/class/thermal/thermal_zone0/temp` 읽기 **[가정: `ProtectKernelTunables` 는 `/proc/sys` 만 막고 `/sys/class/thermal` 은 읽힘, 미검증]**. 실패 시 `null` | 없음 | 낮 | S |
| 22 | **Tunnel 경유 확인**: 최근 요청에 `cf-connecting-ip` 헤더가 있었는가 | 터널이 죽으면 관리자 화면 자체가 안 열리므로 가치 낮음. 로컬 직접 접속과 구분용 | `http.ts:47` 에서 불리언 1개 기억 | 없음 | 낮 | S |

---

## 2. 항목별 메모 — "지금 SSH 로 하는 방식" vs "화면에 넣을 가치 vs 비용"

**#1 백업 건강.** 현재: 대시보드 점 색 + `journalctl -u drilldown-backup`, 오프사이트 확인은 B2 콘솔(`runbook.md:63`). 가치: 백업은 운영의 유일한 보험이고 "업로드 안 됨" 이 조용히 지속되는 상태가 가장 위험한데 지금 UI 는 그걸 초록으로 보여 준다. 비용: 타입 필드 2개 + 카드 문구. **최우선.**

**#2 5xx 요약.** 현재: `journalctl -u drilldown-server | grep ' 500 '`. 가치: 운영자가 SSH 없이 장애를 아는 유일한 수단. 비용: `onError` 에 10줄. 주의: 오류 `message` 에 사용자 입력이 섞일 수 있어 `e.name`·`e.constructor.name` 과 코드 위치 정도만. 요청 로그 7일 보관 원칙은 journald 몫이고, 이 버퍼는 메모리 50건·재시작 초기화.

**#3 수동 실행.** 현재: `sudo systemctl start drilldown-daily` 또는 긴 `sudo -u drilldown env … node server/account/daily.ts`(`runbook.md:68`). 가치: 업데이트·복원 리허설·사건 대응 직전의 "지금 백업" 은 월 1~2회 확실히 쓴다. 비용: M 인 이유는 (a) `execFileSync` 블로킹 때문에 자식 프로세스로 돌려야 하고 (b) 서버 유닛에 `RCLONE_CONFIG` 환경 변수 1줄을 추가해야 하며 (c) 자식 프로세스가 같은 `app.db` 를 여는데 WAL + `busy_timeout 3000`(`db.ts:16`) 으로 systemd 타이머와 똑같이 이미 공존 중이므로 새 위험은 아님. 동시 실행(타이머와 버튼이 겹침) 은 `backups/app-YYYYMMDD.db` 를 `rmSync` 후 다시 쓰는 구조(`backup.ts:23-24`) 라 "실행 중" 플래그로 버튼만 막으면 된다.

**#4 크기 카드.** 현재: `ls -la /var/lib/drilldown`, `du`. 가치: WAL 비대·freelist 는 운영자가 매달 한 번은 봐야 할 숫자. 비용: `statSync` 3번 + PRAGMA 3개. 전부 상수 시간.

**#5 일일 작업 상세.** 현재: `journalctl -u drilldown-daily`. 가치: purge 실패(`daily.ts:19-27`) 는 사용자마다 롤백·계속이라 조용히 매일 재시도되며, 화면엔 빨간 점만. 비용: 타입 `error` 1개 + 문구.

**#6 사건 대응.** 현재: 런북 §5 전부 SSH·외부 콘솔. 화면에서 가능한 것은 점검 ON(이미 있음)·전 세션 폐기·감사 기록. 가치: 72시간 시계가 돌 때 첫 5분에 할 일 두 개가 버튼이 된다. 비용: S. `cloudflared` 중지는 불가하므로 "Cloudflare 대시보드 → Tunnel 비활성" 안내 링크로 대체 **[가정: Zero Trust 대시보드에서 커넥터 비활성 가능]**.

**#7 AUTH_FAKE 경고.** 현재: 기동 로그. 가치/비용 비율이 가장 좋음(3줄). 운영에서 켜지면 "누구나 관리자" 라 화면 전체를 빨갛게 해도 과하지 않다.

**#8·#9 버전·재시작.** 현재: `git -C /opt/drilldown log -1`, `systemctl status`, `systemctl restart`. 가치: 1~2인 운영에서 "배포했는데 재시작을 잊음" 은 흔한 실수고, 재시작 버튼은 `process.exit(1)` 한 줄로 systemd 가 대신 해 준다. 단 `Restart=on-failure` 는 exit 0 에는 안 뜨므로 **반드시 비정상 코드**로 종료해야 함. 비용: S~M(파일 mtime 비교·HEAD 읽기). 주의: 재시작하면 메모리 카운터(#2·#10·#11)·레이트 리밋 버킷이 초기화된다 — 화면에 "재시작 이후" 라고 명시.

**#10·#11 카운터.** 현재: 없음(로그 grep 으로 상태코드 세기). 가치: 중. 폭주·충돌 추세를 보는 최소 지표. 비용: S. **넣지 말 것**: 사용자별·트리별 집계, 시계열 저장(SQLite 쓰기), outbox 적체 추정(서버가 모르는 값).

**#12 세션 수.** 현재: `sqlite3 'SELECT COUNT(*) FROM sessions'`. 사건 대응(#6) 전후 숫자 확인용으로 함께 넣으면 거의 공짜.

**#13 예약.** 현재: 운영자가 시간 맞춰 체크박스를 누르거나 공지를 끄는 걸 기억. 가치: 중(점검은 월 1회, 공지 자동 OFF 는 복원 런북 10단계가 요구). 비용: M — 서버 판정 1곳(`getSettings` 또는 `maintenanceMiddleware`), 설정 PUT 검증, UI 날짜 입력(`<input type="datetime-local">` 네이티브). 스케줄러 프로세스는 만들지 않는다.

**#14 감사 로그.** 현재: 50건 더 보기, 또는 `sqlite3`. 가치: 중 — 운영자 2인 상호 확인·사용자 문의("내 트리 왜 숨겨졌나") 대응. 비용: M(필터 3개·CSV·메모 POST). 작성자 닉네임 조인은 UUID 끝 6자리(`AdminPage.tsx:290`) 대신 표시해도 관리자 전용이라 무방.

**#15 OAuth.** 현재: 사용자 신고 또는 `journalctl | grep oauth_`. 가치: 중. 비용: S. "시크릿 만료" 는 데이터가 없어 넣을 수 없고, 대신 "마지막 성공 로그인 N시간 전" 이 사실상 같은 신호.

**#16 관리자 식별자.** 현재: `sqlite3 "select provider, provider_sub from users"`(`runbook.md:25`). 비용 S, 2번째 운영자 온보딩 때 1회 쓰지만 그 1회가 SSH 세션 하나를 통째로 없앤다.

**#17 복원 안내.** 실행은 불가능, 안내는 가능. 파일 목록은 "로컬 14개가 실제로 있나" 확인용. 다운로드 금지 이유는 표에 적었다.

**#18~#22.** 낮거나 중. #18 checkpoint 는 #4 와 세트로 넣을 때만 의미. #19 VACUUM 은 보류 권고(아래 §4). #20 은 중복. #21 온도는 읽히는지 Pi 에서 1회 확인 뒤 결정.

---

## 3. 공통 구현 단서 (W2 범위 안에서 가장 적게 바꾸는 길)

1. **메모리 카운터 모듈 1개** (`server/metrics.ts`, 30줄 내): `count(name)`, `recordError(e, c)`, `snapshot()`. `http.ts:61`(429), `index.ts:31`(500), `oauth.ts:134,141`, `sync/index.ts:27-35` 네 곳에서 호출. 재시작 시 0. SQLite 에는 쓰지 않는다.
2. **`stats()` 확장** (`admin.ts:65-88`): `db:{file,wal,pages,freelist,backups_bytes,backups_n}`, `backup.uploaded/configured`, `daily.error`, `sessions:{total,expired,admin}`, `build:{git,asset,started_at,restart_needed}`, `flags:{auth_fake}`, `oauth:{google:{configured,last_login_at},kakao:…}`, `metrics:snapshot()`. 쿼리는 전부 COUNT·PRAGMA·stat 이라 요청 1회 100ms 이내 **[가정]**. `AdminStats` 타입(`api.ts:113-121`) 동기.
3. **운영 동작 라우트 묶음** `POST /api/admin/ops/{backup,daily,checkpoint,restart,revoke-sessions,note}`: 모두 `requireAdmin`(이미 `/api/admin/*` 에 적용 `admin.ts:126`) + `audit(me, 'system.*', 'settings', …)`. backup/daily 는 `spawn` 자식 프로세스, 나머지는 한 줄 SQL 또는 `process.exit(1)`.
4. **UI**: 대시보드 카드 3~4개 추가, 시스템 탭에 "운영" 섹션(버튼 + 2단계 확인 `TwoStep` 재사용 `AdminPage.tsx:10`). 새 탭은 만들지 않는다(모바일 ≤760 카드 레이아웃 규칙 그대로).
5. **배포 파일 변경 1줄**: `deploy/drilldown-server.service` 의 `Environment=` 에 `RCLONE_CONFIG=/etc/drilldown/rclone.conf` 추가(#3 전제). 다른 유닛 변경 없음.

---

## 4. Pi 1대·SQLite 한계로 **넣지 말아야 할 것**

| 넣지 않는 것 | 이유 | 대신 |
|---|---|---|
| 실시간 로그 스트림·로그 검색 | 로그는 journald(stdout) 에 있고 프로세스는 `journalctl` 을 못 읽음(`ProtectSystem=strict`, 비루트). 프로세스 안에 로그를 쌓으면 512M 메모리와 §3.7 보관 규칙을 깸 | #2 의 5xx 링버퍼 50건 |
| 요청별 메트릭의 SQLite 저장(시계열·히스토그램) | 요청당 쓰기 = `synchronous=FULL` fsync(`db.ts:16`) + NVMe/SD 마모 + 단일 쓰기자와 경합 | 메모리 카운터, 재시작 초기화 |
| 무거운 집계(전체 `nodes`/`srs` GROUP BY, 사용자별 노드 수 랭킹, 트리별 충돌 수) | 단일 프로세스라 쿼리 동안 모든 요청이 멈춤. `nodes` 는 가장 큰 테이블 | 비정규화된 `trees.node_count`(`002_trees.sql:9`) 와 COUNT 만 |
| 동기화 "outbox 적체·시퀀스 지연" 추정 | 서버는 기기 커서·outbox 를 모름(`engine.ts:49,101`, 서버는 `user_seq.seq/purged_seq` 만 `seq.ts:10`) | 410·superseded·dropped 카운터(#11) |
| 자동 VACUUM·버튼 즉시 실행 | 2배 임시 공간 + 쓰기 전면 차단 + 이벤트 루프 블로킹 | `wal_checkpoint(TRUNCATE)` 버튼(#18) + 일일 `PRAGMA optimize`(`daily.ts:34`) |
| 백업 파일 다운로드·복원 업로드 | 평문 DB 전체 = 개인정보(§3.7); 복원은 서버 정지가 필요 | 안내 패널(#17) + 런북 |
| `admins.json`·`env` 편집, `cloudflared`·타이머 제어, `git pull`·빌드 | `/etc` 읽기 전용, `NoNewPrivileges`, systemctl 권한 없음(`drilldown-server.service:18-26`) | 읽기 표시만, 나머지는 SSH 유지 |
| 서버 내부에서 `runBackup` 직접 호출 | `execFileSync('rclone')` 최대 30분 블로킹(`backup.ts:34`) | 자식 프로세스 spawn(#3) |
| 외부 알림(텔레그램 등) 발신 | 비밀 토큰·외부 의존 추가. 스펙에서도 [가정] 단계 | 대시보드 색 경고 + 운영자가 하루 1회 열어 보는 습관 **[가정]**; 필요해지면 Cloudflare Health Check 로 `/api/health` 외부 감시 |
| 그래프·차트 추가(가입 추이 외) | 데이터 없음(시계열 미저장) | 숫자 카드 |

---

## 5. 순위 요약

1. **S 묶음(하루)**: #1 백업 건강 · #2 5xx 링버퍼 · #4 크기 카드 · #5 일일 상세 · #7 AUTH_FAKE 경고 · #12 세션 수 · #10/#11 카운터 — 전부 `stats()` 확장 + 카드. 런북에서 SSH 로 하던 "상태 확인" 의 대부분이 사라진다.
2. **동작 버튼(하루~이틀)**: #6 전 세션 폐기·사건 기록 · #3 수동 백업/일일(spawn) · #18 checkpoint · #8 재시작·버전.
3. **그다음(M)**: #13 공지·점검 예약 · #14 감사 로그 필터·CSV·메모 · #15 OAuth 상태 · #16 식별자 표시 · #17 복원 안내.
4. **보류**: #19 VACUUM · #20 세션 정리 · #21 온도 · #22 Tunnel 확인.

SSH 가 여전히 필요한 일(화면으로 못 없앰): 복원 실행, 시크릿 회전, `admins.json` 편집, OS·Node 업데이트, `cloudflared` 제어, journald 전체 열람.
