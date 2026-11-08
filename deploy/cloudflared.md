# Cloudflare Tunnel·Access (03 §2 외부 공개, §3.4 관리자 인증 2)

포트포워딩 0. 서버는 `127.0.0.1:3000` 에만 열리고(`HOST` 기본값), 같은 Pi 의 `cloudflared` 가 바깥으로 연결한다.

## Tunnel

```sh
cloudflared tunnel login
cloudflared tunnel create drilldown            # 자격 증명 ~/.cloudflared/<id>.json → 암호 관리자에도 보관(복원 런북 8)
cloudflared tunnel route dns drilldown <도메인>
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: drilldown
credentials-file: /etc/cloudflared/<id>.json
ingress:
  - hostname: <도메인>
    service: http://127.0.0.1:3000
  - service: http_status:404
```

```sh
sudo cloudflared service install && sudo systemctl enable --now cloudflared
```

- 서버는 `CF-Connecting-IP` 만 클라이언트 IP 로 믿는다(레이트 리밋 키, 저장·로그 없음). 3000 포트를 외부에 직접 열지 않는다.
- `.env` 의 `PUBLIC_ORIGIN=https://<도메인>` → 쿠키 `Secure` 자동, OAuth redirect URI 기준.

## Access (관리자 API 2차 인증)

Zero Trust → Access → Applications → Self-hosted:

- Application domain: `<도메인>`, **Path: `api/admin/`** (이 경로만. `#/admin` 화면은 해시라 서버에 도달하지 않으므로 가리지 않는다 — 03 §3.4).
- Policy: Allow, Include → Emails: 운영자 이메일 1~2개, 로그인 방법 One-time PIN 또는 Google.
- Session duration 24h (관리자 세션 절대 상한과 같게).
- 확인: 시크릿 창에서 `https://<도메인>/api/admin/stats` → Access 로그인 화면. 통과 후 앱 세션이 없으면 404.

## 하지 않는 것

- `Cf-Access-Jwt-Assertion` 검증은 생략(Tunnel 뒤에만 노출되므로). 필요해지면 `server/account/admin.ts` 의 `requireAdmin` 앞에 추가.
- 정적 캐시 규칙은 기본값(해시 파일 `immutable`, `index.html` `no-cache` 를 서버가 보낸다).
