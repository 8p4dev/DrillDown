# 운영 런북 — Drill Down 서버 (Pi 1대)

근거: `docs/specs/03_account_admin.md` §3.1·§3.7·§3.8, 배포 파일 `deploy/`. 경로 규칙: 앱 `/opt/drilldown`, 데이터 `/var/lib/drilldown`, 설정·비밀 `/etc/drilldown/`.

## 1. 설치 (새 Pi)

1. Raspberry Pi OS Lite 64-bit, `unattended-upgrades`, SSH 키 전용(Tailscale 또는 Access 뒤).
2. Node 24 LTS(NodeSource 24.x), `age`, `rclone`, `cloudflared` 설치. `node -v` ≥ 24.19, < 25.
3. 사용자·디렉터리:
   ```sh
   sudo useradd --system --home /var/lib/drilldown --shell /usr/sbin/nologin drilldown
   sudo mkdir -p /var/lib/drilldown /etc/drilldown && sudo chown drilldown: /var/lib/drilldown
   sudo git clone <repo> /opt/drilldown && sudo chown -R drilldown: /opt/drilldown
   ```
   **빌드는 Pi 에서 하지 않는다**(dev 의존성 460여 개·postinstall 이 운영 호스트에서 돌지 않게, S4 L1). 빌드 기기(노트북)에서:
   ```sh
   git clone <repo> && cd <repo> && npm ci && npm run build        # dist/ 생성
   rsync -a --delete dist/ drilldown@<pi>:/opt/drilldown/dist/
   ```
   Pi 에서는 `drilldown` 사용자로 런타임 의존성만: `sudo -u drilldown npm ci --omit=dev` (`sudo npm` 금지 — root 로 postinstall 이 돈다). 서버는 `dist/` 를 정적으로 서빙할 뿐 빌드 도구가 필요 없다.
4. `/etc/drilldown/env` (권한 600, owner root — systemd 가 읽어 넘긴다). `.env.example` 기준 + 백업 변수:
   ```
   PUBLIC_ORIGIN=https://<도메인>
   GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
   KAKAO_CLIENT_ID= / KAKAO_CLIENT_SECRET= / KAKAO_ADMIN_KEY=
   PRIVACY_CONTACT=<보호책임자 이메일>
   AUTH_FAKE=0
   BACKUP_AGE_RECIPIENT=/etc/drilldown/backup.pub     # age 공개키(파일 또는 age1… 문자열)
   BACKUP_RCLONE_REMOTE=b2:drilldown-backup
   ```
5. `/etc/drilldown/admins.json`: `["google:<sub>", "kakao:<회원번호>"]` — 로그인 때와 관리자 요청마다 대조한다(빼면 다음 관리자 요청에 즉시 강등 + 세션 폐기, 따로 SQL 을 칠 필요 없음). sub 는 **관리자 → 시스템 → 관리자 목록**(내 식별자) 또는 **사용자 탭 → 상세**(식별자 `provider:sub`)에서 복사한다. 파일 편집만 SSH(`/etc` 는 읽기 전용).
6. `/etc/drilldown/rclone.conf`: B2 **쓰기 전용** 앱 키(목록·삭제 불가). 버킷 수명주기 14일.
7. 유닛 설치:
   ```sh
   sudo cp deploy/drilldown-*.service deploy/drilldown-*.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now drilldown-server drilldown-backup.timer drilldown-daily.timer
   curl -s localhost:3000/api/health   # {"ok":true}
   ```
8. Tunnel·Access: `deploy/cloudflared.md`.
9. 기동 전 env 체크(S1 H1·S4 H1 — 이 둘이 틀리면 Access 밖 경로 한 줄로 누구나 관리자가 된다):
   - [ ] `/etc/drilldown/env` 에 `AUTH_FAKE` 줄이 **없거나 `AUTH_FAKE=0`** 이다(`grep AUTH_FAKE /etc/drilldown/env`). 유닛 셋에 `Environment=AUTH_FAKE=0` 이 EnvironmentFile 뒤에 있어 env 파일 값을 덮는다.
   - [ ] `PUBLIC_ORIGIN=https://<도메인>` 이 **반드시** 있다(비우면 `http://localhost:3000` 으로 잡혀 쿠키 `Secure` 가 빠지고 OAuth redirect 가 어긋난다).
   - [ ] `HOST` 는 비우거나 `127.0.0.1`(터널만 들어온다).
   서버는 `AUTH_FAKE=1` 이면서 origin 이 https 이거나 바인딩이 루프백(127.0.0.1·::1·localhost)이 아니면 기동을 거부한다 — `journalctl -u drilldown-server` 에 `AUTH_FAKE` 줄이 보이면 env 를 고치고 재시작. 로컬 http 개발 기동 로그에 `AUTH_FAKE` 가 보이면 가짜 로그인이 열린 상태다.

## 2. OAuth 앱 등록 체크리스트

공통 redirect URI = `<PUBLIC_ORIGIN>/api/auth/<provider>/callback` (정확히 일치해야 한다).

**Google** (Cloud Console)
- [ ] 프로젝트 생성 → OAuth 동의 화면 External, 앱 이름·지원 이메일
- [ ] 홈페이지 `<PUBLIC_ORIGIN>/`, 처리방침 `<PUBLIC_ORIGIN>/#/privacy` URL 입력(프로덕션 게시 필수)
- [ ] 스코프 `openid`, `profile` 만(이메일 없음 → 검증 불필요)
- [ ] 사용자 인증 정보 → OAuth 클라이언트 ID(웹) → 승인된 리디렉션 URI `<PUBLIC_ORIGIN>/api/auth/google/callback`
- [ ] 클라이언트 ID·시크릿 → `/etc/drilldown/env`, 게시 상태 "프로덕션"

**Kakao** (Kakao Developers)
- [ ] 애플리케이션 추가 → 플랫폼 Web 사이트 도메인 `<PUBLIC_ORIGIN>`
- [ ] 카카오 로그인 활성화, OpenID Connect 활성화
- [ ] Redirect URI `<PUBLIC_ORIGIN>/api/auth/kakao/callback`
- [ ] 동의항목: 닉네임·프로필 사진만(이메일 없음, 비즈 앱 불필요)
- [ ] 보안 → Client Secret 발급·활성화 → `KAKAO_CLIENT_SECRET`
- [ ] 앱 키 → REST API 키 = `KAKAO_CLIENT_ID`, Admin 키 = `KAKAO_ADMIN_KEY`
- [ ] 고급 → 연결 끊기 알림 웹훅 `<PUBLIC_ORIGIN>/api/auth/kakao/unlink-webhook` (서버는 `Authorization: KakaoAK <Admin 키>` 를 확인하고 200 응답)

확인: 로그인 화면에서 각 버튼 → 제공자 동의 → `#/account` 복귀, 관리자 대시보드 사용자 수 +1. 인앱 브라우저 실기기 체크리스트는 03 §3.2 A1~A7.

## 3. 일상 운영

| 주기 | 작업 |
|---|---|
| 매일 03:00 | `drilldown-backup` — `data/backups/app-YYYYMMDD.db`(14개, 평문·모드 600·디렉터리 700) → `age` → `rclone copyto <remote>/app-YYYYMMDD.db.age`(암호문은 외부본만, 로컬엔 남지 않음). 결과 `backup.json` → 대시보드 "마지막 백업" |
| 매일 04:00 | `drilldown-daily` — 만료 세션, 탈퇴 7일 purge(소명·피드백 글 포함), 톰스톤, 처리 신고·소명·게시중단·정보주체 요청 90일, 임시조치(30일) 만료 복원, daily_stats, 감사 로그 1년(맨 뒤), WAL checkpoint. 결과 `daily.json`. 게시중단 접수로 숨긴 트리는 30일 임시조치라 큐에서 **확정**하지 않으면 자동 복원된다 |
| 매월 | `npm audit`, OS 업데이트 확인, **복원 리허설**(아래 4를 노트북에서 끝까지) |
| 업데이트 | 빌드 기기에서 `git pull && npm ci && npm run build` → `rsync -a --delete dist/ drilldown@<pi>:/opt/drilldown/dist/`; 서버 코드가 바뀌었으면 Pi 에서 `cd /opt/drilldown && sudo -u drilldown git pull && sudo -u drilldown npm ci --omit=dev`(§1-3) → 재시작은 **관리자 → 시스템 → 서버 → [서버 재시작]**(exit 1 → systemd 가 5초 뒤 되살림) 또는 `sudo systemctl restart drilldown-server`. 빌드 뒤 재시작을 잊으면 같은 패널에 "재시작 필요" 가 빨갛게 뜬다(커밋·빌드 해시도 거기서 확인). 마이그레이션은 기동 시 자동, 직전에 `pre-migrate-NNN.db` 1개 보관 |

수동 실행: **관리자 → 시스템 → 서버 → [지금 백업] / [일일 작업 실행]**(타이머와 같은 스크립트를 자식 프로세스로 띄움, 끝나면 대시보드 카드가 갱신되고 오류 문구가 카드에 보인다). 서버 유닛에 `RCLONE_CONFIG=/etc/drilldown/rclone.conf` 가 있어야 외부 업로드까지 된다(`deploy/drilldown-server.service`). SSH 대안: `sudo systemctl start drilldown-daily`, 상세 로그는 `journalctl -u drilldown-daily`. WAL 이 커졌으면 같은 패널 [WAL checkpoint]. 로컬 백업 14개가 실제로 있는지는 시스템 → 복원 표에서 본다(다운로드는 없음).

## 4. 복원 런북 (03 §3.8 1~10, 목표 60분)

1. 복호화 키: `age` 비밀키는 운영자 2인이 각자 오프라인 보관. 서버에는 공개키만(`/etc/drilldown/backup.pub`). 리허설 기기에 임시 복사하고 끝나면 지운다.
2. 새 기기(Pi·Linux x64/ARM64·임시 VPS)에 위 1의 2~3 수행(`dist/` 는 빌드 기기에서 가져오고 Pi 는 `npm ci --omit=dev` 만).
3. 백업 원본은 두 종류다(리허설은 **둘 다** 끝까지):
   - **외부 암호문**(Pi 가 죽었을 때): `rclone copy <remote>/app-YYYYMMDD.db.age ./restore/` (가장 최근 날짜. `backup()` 결과라 WAL 이 합쳐진 단일 파일 — 옛 서버의 `-wal`·`-shm` 은 복사하지 않는다).
   - **로컬 평문 사본**(Pi 는 살았고 DB 만 망가졌을 때): `/var/lib/drilldown/backups/app-YYYYMMDD.db`(14개, 평문, 모드 600 — `age -d` 불필요). 복사한 뒤 원본 모드가 600·소유자 drilldown 인지 `ls -l` 로 확인한다.
4. 복호화·검증:
   - 외부: `age -d -i key.txt restore/app-YYYYMMDD.db.age > /var/lib/drilldown/app.db`
   - 로컬: `cp /var/lib/drilldown/backups/app-YYYYMMDD.db /var/lib/drilldown/app.db`
   두 경로 모두 `sqlite3 /var/lib/drilldown/app.db 'PRAGMA integrity_check'` = `ok` 를 확인한다(실험적 `node:sqlite` 의 `backup()` 이 조용히 깨지지 않았는지 보는 유일한 지점, S4 L2). `chown drilldown:` + `chmod 600`.
5. `PRAGMA user_version` 확인 — 코드의 `server/migrations/` 보다 낮으면 기동 시 자동 마이그레이션.
6. `/etc/drilldown/env`·`admins.json`·`rclone.conf` 복원 — 비밀값은 백업에 **없다**. 암호 관리자에서.
7. `sudo systemctl start drilldown-server` → `curl localhost:3000/api/health` = `{"ok":true}`.
8. Tunnel: 자격 증명 `/etc/cloudflared/<id>.json` 복원 → `cloudflared tunnel run drilldown`. 옛 Pi 가 살아 있으면 먼저 거기서 `systemctl stop cloudflared`(커넥터 2개 동시 연결 방지). 같은 터널 이름이면 DNS·Access 변경 없음.
9. 확인: 외부에서 `https://<도메인>/api/health`, 관리자 로그인 → 대시보드 `backup.at`·`users.total` 이 백업 시점과 일치, 공유 링크 1개 열기.
10. 관리자 → 시스템 → 공지 "HH:MM 이후 서버 저장분은 다음 동기화 때 다시 올라갑니다" 켜기 → 24시간 뒤 끔. 감사 로그는 **시스템 → 사건 대응 → 운영 기록(종류 "복원")** 으로 남긴다 — 대시보드 "복원 리허설 N일 전" 이 이 기록을 본다(45일 넘으면 빨강). 리허설도 같은 방법으로 기록.

## 5. 개인정보 유출 대응 (03 §3.7)

신고 기준: 1천 명 이상, 민감·고유식별정보, 또는 **외부 불법 접근(해킹)은 규모 무관** → 인지 후 **72시간 내** 개인정보보호위원회(또는 KISA) 신고 + 정보주체 통지. 우리 DB 에는 이메일·실명·IP 가 없지만 해킹이면 1명이라도 대상이다.

1. **차단**(즉시): `sudo systemctl stop cloudflared` (외부 차단) → 관리자 화면 접근이 되면 점검 모드 ON. 의심 키 폐기: OAuth 시크릿 재발급(Google·Kakao), Kakao Admin 키 재발급, B2 키 폐기, `cloudflared` 터널 자격 증명 재발급.
2. **세션 무효화**: **관리자 → 시스템 → 사건 대응 → [전 세션 폐기]**(관리자 본인도 로그아웃, 감사 `system.sessions_revoke_all`). 특정 계정만이면 사용자 탭 → 상세 → [세션 전부 폐기]. SSH 대안: `sqlite3 app.db 'DELETE FROM sessions'`.
3. **증거 보존**: `app.db` 사본, `journalctl -u drilldown-server --since <시각>` 저장, Cloudflare 대시보드 로그(24h 보관) 캡처. 원본은 건드리지 않는다.
4. **범위 파악**: 노출 가능 항목 = `provider_sub`·닉네임·제공자 프로필 URL(옵트인)·학습 트리·신고 메모. 영향 사용자 수·세션 수는 대시보드 카드(가입자·세션). 의심 기간의 관리자 동작은 시스템 → 감사 로그 필터(동작·대상·기간) → CSV 로 보존.
5. **신고·통지**(72시간 내): 유출 항목·시점·경위·대응·피해 최소화 방법·담당 부서 연락처(`PRIVACY_CONTACT`). 통지는 서비스 공지(`settings.notice`) + 처리방침 연락처.
6. **복구**: 패치 후 4 복원 런북(필요하면 침해 전 백업으로) → 재개. 사건은 시스템 → 운영 기록(종류 "사건") 으로 `system.incident` 를 남긴다.
7. **사후**: 원인·조치를 `docs/ops/incidents/YYYY-MM-DD.md` 에 남긴다.
