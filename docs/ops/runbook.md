# 운영 런북 — Drill Down 서버 (Pi 1대)

근거: `docs/specs/03_account_admin.md` §3.1·§3.7·§3.8, 배포 파일 `deploy/`. 경로 규칙: 앱 `/opt/drilldown`, 데이터 `/var/lib/drilldown`, 설정·비밀 `/etc/drilldown/`.

## 1. 설치 (새 Pi)

1. Raspberry Pi OS Lite 64-bit, `unattended-upgrades`, SSH 키 전용(Tailscale 또는 Access 뒤).
2. Node 24 LTS(NodeSource 24.x), `age`, `rclone`, `cloudflared` 설치. `node -v` ≥ 24.19, < 25.
3. 사용자·디렉터리:
   ```sh
   sudo useradd --system --home /var/lib/drilldown --shell /usr/sbin/nologin drilldown
   sudo mkdir -p /var/lib/drilldown /etc/drilldown && sudo chown drilldown: /var/lib/drilldown
   sudo git clone <repo> /opt/drilldown && cd /opt/drilldown && sudo npm ci && sudo npm run build
   ```
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
5. `/etc/drilldown/admins.json`: `["google:<sub>", "kakao:<회원번호>"]` — 매 로그인마다 역할 동기화(빼면 다음 로그인 때 강등). sub 는 처음 로그인 뒤 관리자 화면 대신 `sqlite3 app.db "select provider, provider_sub from users"` 로 확인.
6. `/etc/drilldown/rclone.conf`: B2 **쓰기 전용** 앱 키(목록·삭제 불가). 버킷 수명주기 14일.
7. 유닛 설치:
   ```sh
   sudo cp deploy/drilldown-*.service deploy/drilldown-*.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now drilldown-server drilldown-backup.timer drilldown-daily.timer
   curl -s localhost:3000/api/health   # {"ok":true}
   ```
8. Tunnel·Access: `deploy/cloudflared.md`.
9. 기동 로그에 `AUTH_FAKE` 가 보이면 즉시 끈다(가짜 로그인이 열린 상태).

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
| 매일 03:00 | `drilldown-backup` — `data/backups/app-YYYYMMDD.db`(14개) → `age` → `rclone copyto <remote>/app-YYYYMMDD.db.age`. 결과 `backup.json` → 대시보드 "마지막 백업" |
| 매일 04:00 | `drilldown-daily` — 만료 세션, 탈퇴 7일 purge, 톰스톤, 감사 로그 1년, 처리 신고 90일, WAL checkpoint. 결과 `daily.json` |
| 매월 | `npm audit`, OS 업데이트 확인, **복원 리허설**(아래 4를 노트북에서 끝까지) |
| 업데이트 | `git pull && npm ci && npm run build && sudo systemctl restart drilldown-server` (마이그레이션은 기동 시 자동, 직전에 `pre-migrate-NNN.db` 1개 보관) |

수동 실행: `sudo -u drilldown env $(sudo cat /etc/drilldown/env | xargs) DATA_DIR=/var/lib/drilldown node server/account/daily.ts` 또는 `sudo systemctl start drilldown-daily`. 실패는 `journalctl -u drilldown-daily`.

## 4. 복원 런북 (03 §3.8 1~10, 목표 60분)

1. 복호화 키: `age` 비밀키는 운영자 2인이 각자 오프라인 보관. 서버에는 공개키만(`/etc/drilldown/backup.pub`). 리허설 기기에 임시 복사하고 끝나면 지운다.
2. 새 기기(Pi·Linux x64/ARM64·임시 VPS)에 위 1의 2~3 수행(`npm ci && npm run build`).
3. 백업 내려받기: `rclone copy <remote>/app-YYYYMMDD.db.age ./restore/` (가장 최근 날짜. `backup()` 결과라 WAL 이 합쳐진 단일 파일 — 옛 서버의 `-wal`·`-shm` 은 복사하지 않는다).
4. `age -d -i key.txt restore/app-YYYYMMDD.db.age > /var/lib/drilldown/app.db` → `sqlite3 /var/lib/drilldown/app.db 'PRAGMA integrity_check'` = `ok`. `chown drilldown:`.
5. `PRAGMA user_version` 확인 — 코드의 `server/migrations/` 보다 낮으면 기동 시 자동 마이그레이션.
6. `/etc/drilldown/env`·`admins.json`·`rclone.conf` 복원 — 비밀값은 백업에 **없다**. 암호 관리자에서.
7. `sudo systemctl start drilldown-server` → `curl localhost:3000/api/health` = `{"ok":true}`.
8. Tunnel: 자격 증명 `/etc/cloudflared/<id>.json` 복원 → `cloudflared tunnel run drilldown`. 옛 Pi 가 살아 있으면 먼저 거기서 `systemctl stop cloudflared`(커넥터 2개 동시 연결 방지). 같은 터널 이름이면 DNS·Access 변경 없음.
9. 확인: 외부에서 `https://<도메인>/api/health`, 관리자 로그인 → 대시보드 `backup.at`·`users.total` 이 백업 시점과 일치, 공유 링크 1개 열기.
10. 관리자 → 시스템 → 공지 "HH:MM 이후 서버 저장분은 다음 동기화 때 다시 올라갑니다" 켜기 → 24시간 뒤 끔. 감사 로그에 남긴다: `sqlite3 app.db "INSERT INTO audit_log(ts,action,target_type) VALUES(strftime('%s','now')*1000,'system.restore','settings')"`.

## 5. 개인정보 유출 대응 (03 §3.7)

신고 기준: 1천 명 이상, 민감·고유식별정보, 또는 **외부 불법 접근(해킹)은 규모 무관** → 인지 후 **72시간 내** 개인정보보호위원회(또는 KISA) 신고 + 정보주체 통지. 우리 DB 에는 이메일·실명·IP 가 없지만 해킹이면 1명이라도 대상이다.

1. **차단**(즉시): `sudo systemctl stop cloudflared` (외부 차단) → 관리자 화면 접근이 되면 점검 모드 ON. 의심 키 폐기: OAuth 시크릿 재발급(Google·Kakao), Kakao Admin 키 재발급, B2 키 폐기, `cloudflared` 터널 자격 증명 재발급.
2. **세션 무효화**: `sqlite3 app.db 'DELETE FROM sessions'` (세션은 해시라 재사용은 어렵지만 전부 끊는다).
3. **증거 보존**: `app.db` 사본, `journalctl -u drilldown-server --since <시각>` 저장, Cloudflare 대시보드 로그(24h 보관) 캡처. 원본은 건드리지 않는다.
4. **범위 파악**: 노출 가능 항목 = `provider_sub`·닉네임·제공자 프로필 URL(옵트인)·학습 트리·신고 메모. 영향 사용자 수 = `SELECT COUNT(*) FROM users`.
5. **신고·통지**(72시간 내): 유출 항목·시점·경위·대응·피해 최소화 방법·담당 부서 연락처(`PRIVACY_CONTACT`). 통지는 서비스 공지(`settings.notice`) + 처리방침 연락처.
6. **복구**: 패치 후 4 복원 런북(필요하면 침해 전 백업으로) → 재개. `audit_log` 에 `system.incident` 기록.
7. **사후**: 원인·조치를 `docs/ops/incidents/YYYY-MM-DD.md` 에 남긴다.
