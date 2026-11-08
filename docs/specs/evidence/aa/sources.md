# AA 참고 자료 발췌 (확인일 2026-11-08)

WebFetch로 원문을 읽고 요지를 옮겼다. 인용은 원문 표현, 그 외는 요약. 번호는 `../../03_account_admin.md` §7과 같다.

## Google

- **[S1] OpenID Connect 가이드** https://developers.google.com/identity/openid-connect/openid-connect
  - `sub`: "unique among all Google Accounts and never reused" → "Use `sub` within your application as the unique-identifier key for the user."
  - email: "you shouldn't use the `email` field in the ID token as a unique identifier for a user."
  - `name` `picture`: profile 스코프일 때 "might be provided" — "never guaranteed to be present".
  - `state`: "Optional, but strongly recommended" (CSRF). `nonce`: ID 토큰 재생 방지.
  - picture URL의 만료·변경 여부는 문서에 없음 → 매 로그인 때 갱신 [가정].
- **[S2] Discovery 문서** https://accounts.google.com/.well-known/openid-configuration
  - `authorization_endpoint` https://accounts.google.com/o/oauth2/v2/auth · `token_endpoint` https://oauth2.googleapis.com/token · `userinfo_endpoint` https://openidconnect.googleapis.com/v1/userinfo · `revocation_endpoint` https://oauth2.googleapis.com/revoke
  - `code_challenge_methods_supported: ["plain","S256"]` · `scopes_supported: ["openid","email","profile"]`
- **[S3] OAuth 스코프 표** https://developers.google.com/identity/protocols/oauth2/scopes — `openid` / `userinfo.profile` / `userinfo.email` 설명. 표 자체는 민감 여부를 표시하지 않음.
- **[S4] 앱 검증(verification) 도움말** https://support.google.com/cloud/answer/13463073 — 민감·제한 스코프를 요청하는 앱만 검증 필수. 그 외는 "it is not mandatory for your app to complete the app verification process." 이름·로고를 동의 화면에 띄우려면 brand verification.
- **[S5] 게시 상태(Audience)** https://support.google.com/cloud/answer/15549945 — Testing: "limited to up to 100 test users", 테스트 사용자 동의는 7일 만료. In production: "available to any user with a Google Account". 민감·제한 스코프를 미검증 상태로 요청하면 'Unverified apps' 경고 + 평생 100명 신규 사용자 상한. **기본 신원 스코프(openid·profile·email)만 쓰면 이 상한·경고 대상이 아니라고 읽힘** [추론; 문서는 "basic identity scopes can be used without verification"이라고만 함].
- **[S6] 브랜딩** https://support.google.com/cloud/answer/10311615 — 외부 프로덕션 앱은 홈페이지·개인정보처리방침·약관 링크 필수: "These links are required for all external production apps." 검증 전에는 "only your application domain will be visible to users."

## Kakao

- **[S7] 카카오 로그인 설정(prerequisite)** http://developers.kakao.com/docs/ko/kakaologin/prerequisite
  - "카카오 로그인을 사용하려면 리다이렉트 URI를 반드시 등록해야 합니다." · "[상태]가 [OFF]인 경우, 카카오 로그인 요청 시 KOE004 에러가 발생합니다."
  - REST API 키는 클라이언트 시크릿이 기본 활성화 → 토큰 요청에 `client_secret` 포함.
  - "일부 동의항목은 추가 기능 사용 권한이 있어야 설정할 수 있습니다." (비즈 앱 전환 → 자격 확인 → 비즈니스 정보 심사. 심사 3~5영업일)
  - 2022-05-12부터 `nickname` `profile_image` `thumbnail_image`는 실시간 카카오계정 프로필 값.
  - 카카오 로그인 자체에 검수 절차는 없음(개인정보 동의항목 추가 신청과 간편가입만 심사).
- **[S8] 동의항목 표(utilize)** http://developers.kakao.com/docs/ko/kakaologin/utilize
  - 닉네임(`profile_nickname`)·프로필 사진(`profile_image`): "[필수, 선택, 이용 중 동의]: 기본 제공"
  - 카카오계정(이메일)(`account_email`): "비즈 앱, 테스트 앱"
  - 이름·성별·연령대·생일·출생연도·전화번호·배송지·CI: 동의 단계 설정 권한(추가 기능 신청) 필요.
  - → **우리 수집 항목(닉네임·프로필 사진)은 비즈 앱 전환·사업자 등록 없이 가능.**
- **[S9] REST API** http://developers.kakao.com/docs/ko/kakaologin/rest-api
  - `GET https://kauth.kakao.com/oauth/authorize` — `state`(CSRF), `nonce`, `prompt=login|none|create|select_account`, `scope`(쉼표 구분, OIDC면 `openid` 포함).
  - `POST https://kauth.kakao.com/oauth/token` · `GET/POST https://kapi.kakao.com/v2/user/me` — `kakao_account.profile.nickname` `profile_image_url`(640×640 또는 480×480) `thumbnail_image_url`(110×110 또는 100×100) `is_default_image`.
  - 로그아웃 `POST /v1/user/logout` · 연결 끊기 `POST /v1/user/unlink`(액세스 토큰 또는 어드민 키+target_id).
  - PKCE 파라미터는 REST 문서에 없음 → Discovery로 확인([S10]).
- **[S10] Kakao OIDC Discovery** https://kauth.kakao.com/.well-known/openid-configuration
  - `issuer` https://kauth.kakao.com · `userinfo_endpoint` https://kapi.kakao.com/v1/oidc/userinfo · `jwks_uri` https://kauth.kakao.com/.well-known/jwks.json
  - **`code_challenge_methods_supported: ["S256"]`** → PKCE S256 지원 확인.
- **[S11] 카카오 로그인 이해하기(common)** http://developers.kakao.com/docs/ko/kakaologin/common
  - 토큰 유효기간: 액세스 토큰 REST 6시간(Android/iOS 12시간, JS 2시간), 리프레시 토큰 2개월, "토큰 갱신 요청 시 새로운 리프레시 토큰을 발급하고 기존 리프레시 토큰은 폐기됨". ID 토큰은 액세스 토큰과 동일.
  - 연결 끊기: "연결 해제는 사용자가 연결 시 동의한 서비스 이용 동의를 철회하고, 서비스에 발급된 액세스 토큰과 리프레시 토큰을 모두 폐기(Token revocation)합니다."
  - 사용자 정보 "값이 변경되거나 삭제될 수 있습니다" → 로그인마다 사용자 정보 API로 갱신 권장.
- **[S12] 연결 끊기 알림(callback)** http://developers.kakao.com/docs/ko/kakaologin/callback
  - 서비스 외부(카카오계정 페이지·카카오톡 설정·계정 탈퇴·고객센터)에서 끊으면 웹훅. 필드 `app_id` `user_id` `referrer_type`(`ACCOUNT_DELETE` `FORCED_ACCOUNT_DELETE` `UNLINK_FROM_ADMIN` `UNLINK_FROM_APPS` `INCOMPLETE_SIGN_UP`). 어드민 키 `KakaoAK` 헤더로 인증. **3초 내 200 OK** 응답. 서비스가 직접 unlink API를 호출한 경우는 웹훅 없음.
- **[S13] 카카오 디벨로퍼스 운영정책** http://developers.kakao.com/terms/ko/site-policies
  - "사용자가 최종 가입하지 않거나 24시간 내에 가입하지 않는 경우 사용자의 모든 개인정보 파기"
  - "사용자 탈퇴 시 사용자의 모든 개인정보 파기" (탈퇴 메뉴 필수)
  - 캐시 제한: "앱에서 사용자 환경을 개선하기 위한 목적 외 다른 목적으로 카카오에서 받은 데이터를 캐시하거나 …" 금지, 캐시는 최신 유지.
  - 동의항목 설정은 "회원의 프로그램 등 실제 서비스 내용과 일치하도록 항목 입력". 위반 시 "서비스 이용을 제한하거나 이용계약을 해지할 수 있습니다".
- **[S14] 비즈 앱 전환 관련 개발자 포럼** https://devtalk.kakao.com/t/topic/151342 , https://devtalk.kakao.com/t/how-can-i-switch-to-a-biz-app-if-i-do-not-have-any-business-registration-number/71983 — 사업자 번호 없는 개인 개발자도 "개인 개발자 비즈 앱 전환" 가능(이메일 필수 동의 목적). 커뮤니티 답변이라 [가정] 등급.

## Naver (평가만; developers.naver.com은 이 환경에서 직접 fetch 불가)

- **[S15] 채널톡 연동 안내(2차 출처)** https://docs.channel.io/clickn/ko/articles/네이버-아이디로-로그인-261c8aeb — "애플리케이션을 생성 / 연동한 후 네이버 검수를 꼭 진행해 주세요." 검수 전에는 "개발중 상태" 메시지. 로그인 버튼부터 완료까지 모든 화면 캡처 제출, 테스터 아이디 등록. "네이버 검수를 진행하지 않으면 네이버 로그인 기능을 사용할 수 없어요."
  - → 네이버는 **검수 필수**. 개인정보처리방침 URL 요구 여부·테스트 사용자 수 제한은 미확인 [가정].

## Apple (평가만)

- **[S16] App Store 심사 지침 4.8** https://developer.apple.com/app-store/review/guidelines/ — 서드파티 로그인을 쓰는 **App Store 앱**은 동등한 프라이버시 조건의 다른 로그인을 함께 제공해야 함. 웹(PWA)에는 적용 문구 없음. TWA/Play 등록(R4 #15)은 Google이라 무관.
- **[S17] Apple Developer Program** https://developer.apple.com/programs/ — "$99 annual membership". Sign in with Apple(웹: Services ID + 키)은 유료 멤버십 전제 [S17 + 2차 출처 Akamai 가이드].

## 서버 스택

- **[S18] SQLite 적합성** https://www.sqlite.org/whentouse.html — "any site that gets fewer than 100K hits/day should work fine with SQLite … demonstrated to work with 10 times that amount of traffic." 단일 writer: "no lock lasts for more than a few dozen milliseconds."
- **[S19] node:sqlite** https://nodejs.org/api/sqlite.html — Stability 1.2 Release candidate(v25.7.0). v22.13/v23.4부터 플래그 불필요. `sqlite.backup(sourceDb, path)`: "The backed-up database can be used normally during the backup process." → 온라인 백업.
- **[S20] Pi 5 가격(Phoronix 2026-10-01)** https://www.phoronix.com/news/Raspberry-Pi-5-2GB-Price-77.50 — 2GB $77.5 / 4GB $110 / 8GB $180 / 16GB $305. Tom's Hardware 표는 4GB $85·8GB $130로 상충.
- **[S21] Pi 5 공식 페이지** https://www.raspberrypi.com/products/raspberry-pi-5/ — 16GB $305만 표시. 27W PSU 권장.
- **[S22] .com 가격** https://costgoat.com/pricing/cloudflare-domains (3자) — 2026-11-01부터 $11.17. Verisign 도매 $10.26→$10.97.
- **[S23] Cloudflare Zero Trust Free** https://blog.cloudflare.com/teams-plans — "Cloudflare for Teams Free plan, which protects up to 50 users at no cost" / "up to 50 seats of Access and Gateway". 제품 페이지 https://www.cloudflare.com/sase/products/access/ — Free $0 "Best for teams under 50 users".
- **[S24] Backblaze B2** https://www.backblaze.com/cloud-storage/pricing — $6.95/TB·월, 처음 10GB 무료, 송신 저장량 3배까지 무료.
- **[S25] Pi 4B 1GB 웹 서버 사례** https://deepakness.com/blog/pi-website-stack/ — Caddy + 로그 수집기 + cloudflared 합계 약 250 MB. cloudflared 단독 유휴 수치는 공개 자료 못 찾음.
- **[S26] Postgres 150MB 미만 운용** https://stevenpg.com/posts/postgres-on-less-than-150mb-of-memory/ — Postgres 18.3(aarch64 alpine), `shared_buffers=32MB` `max_connections=25` `work_mem=2MB`, 유휴 약 22 MB, 최대 부하 58.7 MB, 컨테이너 상한 140 MB.
- **[S27] Supabase 셀프 호스팅 요구사양** https://supabase.com/docs/guides/self-hosting/docker — RAM 4GB 최소·8GB 권장, CPU 2코어 최소·4코어 권장, 디스크 40GB. 서비스 제거로 축소 가능. ARM64 언급 없음. 3자(DreamHost) arm64 측정: 11개 컨테이너 유휴 약 960 MiB~1,450 MiB.
- **[S28] PocketBase FAQ·문서** https://pocketbase.io/faq/ , https://pocketbase.io/docs/authentication/ — SQLite WAL 고정, 수직 확장만, "personal open source project … no promises for maintenance", v0.41.1. OAuth2 15개+ (Apple·Google·GitHub…). **Kakao는 문서에 없음**(v0.22+ 제공자 목록에 Kakao가 있다는 기억이 있으나 이번 확인 페이지에 없음 → [가정]). 3자 블로그 유휴 15~30 MB.
- **[S29] Litestream** https://litestream.io/guides/backblaze/ , https://litestream.io/guides/s3-advanced/ — B2는 S3 호환 엔드포인트로 지원(v0.5+ 자동 감지). 메모리는 업로드 동시성에 비례, 제한 환경은 동시성 2 권장. 절대 수치 없음.
- **[S30] Caddy 유휴 메모리(3자 벤치)** https://markaicode.com/benchmarks/celery-vs-nginx-benchmark/ 등 — Caddy 2.11 유휴 약 59 MB(다른 측정 32~114 MB), nginx 약 7 MB. 이 문서는 Caddy를 쓰지 않음.

## 보안·개인정보

- **[S31] OWASP Session Management Cheat Sheet** https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html — 세션 ID 엔트로피 최소 64비트, CSPRNG 128비트 이상 권장. 로그인 시 세션 ID 교체(고정 공격 방지).
- **[S32] OWASP SameSite** https://community.owasp.org/SameSite — Lax는 외부 링크 top-level 내비게이션에는 쿠키 전송, "CSRF-prone request methods (e.g. POST)"에는 차단. 보호는 부분적 → 브라우저별 기본값이 달라 명시 설정 권장.
- **[S33] 개인정보 보호법 제30조(처리방침)** https://itwiki.kr/w/개인정보_보호법_제30조 (법제처 원문 페이지는 본문 fetch 실패) — 1항 각 호: 처리 목적 / 처리 및 보유 기간 / 제3자 제공(해당 시) / 파기절차 및 파기방법 / 민감정보 공개 가능성(해당 시) / 처리위탁(해당 시) / 가명정보(해당 시) / 정보주체·법정대리인 권리·의무·행사방법 / 보호책임자 성명 또는 부서·연락처 / 자동수집장치 설치·운영·거부(해당 시) / 그 밖에 대통령령.
- **[S34] 개인정보처리자 정의·판례** 대법원 2026-04-16 선고(검색 요지) https://www.scourt.go.kr/sjudge/1776736872554_110112.pdf — "업무를 목적으로 개인정보파일을 운용하기 위하여 … 개인정보를 처리하는 자는 특별한 사정이 없는 한 … '개인정보처리자'에 해당". 영리 여부와 무관하게 개인도 포함 [추론].
- **[S35] 처리방침 작성지침 2025·2026 개정 보도** https://newsseoul.co.kr/news/view/1065585619471455 , https://mobile.newsis.com/view/NISX20260424_0003604909 — 2025-04-21 개정본: 필수·권장 구분, 공개 위치(로그인·회원가입 영역 등) 확대. 2026-04 개정: 이용자 입력 데이터의 AI 학습 활용 여부·거부 절차 안내(우리는 "학습에 쓰지 않음" 한 줄로 해당).
- **[S36] 안전성 확보조치 기준 제8조(접속기록)** https://itwiki.kr/w/개인정보의_안전성_확보조치_기준_제8조 — 접속기록 1년 이상 보관(5만 명 이상·고유식별·민감정보는 2년). 1만 명 미만 소상공인·개인은 내부 관리계획 생략 가능. → `audit_log`·관리자 접속기록 보관 1년의 근거.
- **[S37] 유출 신고 72시간** — 11_cost_recovery [S17] 재인용(개인정보보호위원회 https://pipc.go.kr/np/default/page.do?mCode=D030040000 , KISA https://www.kisa.or.kr/1030402).
- **[S38] Cloudflare 영상·대용량 약관** https://blog.cloudflare.com/updated-tos/ , https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/ — Tunnel 공개 호스트 트래픽도 Free·Pro·Business 플랜에서 영상 전송 약관 적용. 이 서비스는 JSON·정적 HTML/JS만 → 해당 없음 [추론].
