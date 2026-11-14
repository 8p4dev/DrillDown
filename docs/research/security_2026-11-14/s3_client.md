# S3 — 클라이언트·브라우저 측 보안 검토 (Drill Down)

기준: 2026-11-14 작업 트리, 읽기 전용. 저장소 무수정. 포트 4373 에 `AUTH_FAKE=1` 서버를 띄워(별도 DATA_DIR) curl·node·Playgright(msedge) 로 실제 요청을 조작했다. 서버 측 OG 셸은 메모리 셸 문자열 + `renderShare()` 직접 호출로, 노트 렌더러는 `toHtml(parse())` 직접 호출로, 전 경로는 공개 트리를 실제로 띄워 확인했다.

## 핵심 5줄

1. **실제로 뚫리는 XSS 는 없다.** 제목·노드제목·노트·별칭·닉네임·공지·사유·신고·소명·게시중단 주장 — 렌더되는 모든 사용자 입력이 (a) 서버 OG 셸에서 `esc()` 로 `& < > " '` 전부 수치 엔티티화, (b) 노트는 `toHtml` 이 `< > &` 를 이스케이프한 뒤 고정 enum 클래스(`hl-p/y/b`)로만 삽입, (c) 그 외는 React 텍스트 자식으로 렌더된다. Playwright(Edge)에서 악성 트리 공개 후 **다이얼로그 0건**, 주입 `<script>`·`<img>` 0건으로 재현 실패를 확인(✔).
2. **유일한 실질 결함은 CSP 부재(Low, 심층방어).** `dangerouslySetInnerHTML` 싱크가 4곳(노트 3곳·아이콘 1곳) 있는데 2차 방어선인 CSP 가 전혀 없어, `toHtml`/`esc` 에 향후 회귀가 한 번이라도 생기면 곧바로 전면 XSS 가 된다. clickjacking 은 `X-Frame-Options: SAMEORIGIN` 로 막혀 있다(✔ 응답 헤더).
3. **정적 경로 탐색 안전(✔).** `/..%2f.env`, `/assets/..%2f..%2fpackage.json`, `/%2e%2e/package.json`, `/../server/env.ts` 등 9종 모두 2609바이트 SPA 셸(=`dist/index.html`)만 반환 — 파일 누출 없음.
4. **서비스 워커가 `/api`·관리자 청크를 캐시하지 않는다(✔).** 라우트는 네비게이션 폴백 1개뿐이고 denylist `[/^\/api/, /^\/t\//]`. `AdminPage`·`SharedPage`·`GalleryPage` 는 precache 밖(`globIgnores`). `/api` 런타임 캐싱 없음.
5. **백업 가져오기 프로토타입 오염 안전(✔).** `__proto__` 키를 넣은 백업 JSON 2종을 `parseBackup`→`planImport` 통과시켜도 `Object.prototype` 오염 0. 외부 아바타는 `<img referrerPolicy="no-referrer">`, 공지 링크는 서버에서 `http(s)` 강제 + `rel="noreferrer"`.

## 위협 모델

| 자산 | 공격자 | 진입점 |
|---|---|---|
| 뷰어 세션 쿠키(`sid`, HttpOnly) · 열람 중인 공유 트리 | 악성 트리 작성자(로그인 사용자, 자기 트리 제목·노드·노트·별칭을 완전 제어) | 공개/링크 공유 → 피해자가 `/t/<slug>` 열람 |
| 운영자 세션·관리자 화면 | 신고자·게시중단 요구자·피드백 작성자(비로그인 포함) | 관리자가 큐(신고·소명·게시중단·피드백·요청)에서 자유 텍스트 열람 |
| 뷰어 브라우저(DOM·클립보드·네비게이션) | 링크를 심는 제3자 | 로그인 `#/login?r=`·`?e=`, 공지 `url`, 복제 토스트, intent 링크 |
| 로컬 IndexedDB 데이터 | 악의적 백업 파일을 들고 온 자신/타인 | 계정 화면 백업 가져오기(JSON) |
| 서버 파일 시스템 | 임의 원격 | 정적 서버 경로(`serveStatic`), `/t/:slug` |

렌더되는 사용자 입력 목록과 싱크(실측):
- **제목/노드 제목** → OG 셸 `<title>`·`og:title`(`esc`), 공유 카드 `.node-title`(React 텍스트), `document.title`(텍스트 대입).
- **노트** → `dangerouslySetInnerHTML={{__html: toHtml(parse(note))}}` (NodeRow:157, ShareCard:53, FlashCard:17).
- **별칭** → 채점 비교용 문자열로만 사용, HTML 렌더 경로 없음.
- **닉네임** → `Avatar` `aria-label`·공유 소유자·갤러리(React 텍스트).
- **공지 text/url** → `Banners.tsx:36` `{n.text}` 텍스트 + `<a href={n.url} target="_blank" rel="noreferrer">`.
- **정지 사유 `?r=`** → `LoginPage.tsx:43` `{r}` 텍스트(router 200자 절단).
- **신고 note·소명 text·게시중단 claim/contact·피드백 text** → 관리자 탭 React 텍스트.

## 발견 표

| ID | 심각도 | OWASP | 파일:줄 | 공격 시나리오(구체적 요청) | 영향 | 재현 | 고치는 법(최소 diff) | 공수 |
|---|---|---|---|---|---|---|---|---|
| S3-1 | **Low** | A05 Security Misconfiguration | `server/index.ts:28-29` (`app.use(secureHeaders())`, CSP 인자 없음) | `/` 와 `/t/<slug>` 응답에 `Content-Security-Policy` 헤더 부재(✔ curl 헤더 — HSTS·XFO·nosniff 는 있으나 CSP 없음). 지금은 전 싱크가 이스케이프되어 **당장 터지지 않음**. 그러나 `toHtml`/`format.esc`(`src/features/editor/content/format.ts:94`) 또는 `share.ts:146 esc` 가 한 글자라도 누락되도록 회귀하면 즉시 저장형 XSS 로 전환되고 막을 2차 방어선이 없다. | 심층방어 공백(회귀 시 세션 탈취로 확대) | 헤더 부재 ✔ / 현 상태 악용은 재현 안 됨 ✔ | `secureHeaders({ contentSecurityPolicy: { defaultSrc:["'self'"], scriptSrc:["'self'"], styleSrc:["'self'","'unsafe-inline'"], imgSrc:["'self'","https:","data:"], connectSrc:["'self'"], frameAncestors:["'none'"], baseUri:["'self'"], objectSrc:["'none'"] }})`. 인라인 테마 스크립트(`index.html`)는 nonce 또는 해시 필요 — 빌드에서 해시 주입. `og.png` 는 self. | M |
| S3-2 | Info | A05 | `server/http.ts` / `secureHeaders` 기본값 | http(개발) origin 에서도 `Strict-Transport-Security: max-age=15552000` 를 보낸다(✔). 운영은 https(Cloudflare) 라 영향 없음. 로컬 http 로 접속한 기기가 이후 http 로 못 가는 혼란만. | 무시 가능 | ✔ | 운영 http 노출이 없으므로 조치 불필요. 굳이면 `env.secure` 일 때만 HSTS. | S |

**Critical/High: 없음.**

## 검토했으나 안전 (근거 파일:줄, 전부 실측)

- **OG 셸 치환 XSS** — `server/sync/share.ts:146 esc` 가 `& < > " '` 를 모두 `&#NN;` 로. `renderShare`(`:149-165`) 는 `<title>` 과 `og:title`·`og:description`·`og:url`·`canonical` 에 `esc()` 값만 넣는다. 함수형 `replace(() => ...)` 라 치환 패턴(`$&`) 해석도 없음. 페이로드 6종(`</title><script>alert(1)</script>`, `"><img onerror>`, `A</script><script>`, U+2028, `&<b>`, `'; --`) 직접 호출 → raw `<script>`·live `onerror` 0건(✔). 라이브 공개 트리 `/t/<slug>` 도 동일(✔ raw `<script>alert` 0).
- **노트 렌더 XSS** — `format.ts:94 esc`(`& < >`), `toHtml`(`:97-104`)는 텍스트를 요소 내용 위치에만 넣고 `<mark class="hl-${c}">` 의 `c` 는 `MARK=/==([pyb]):/`(`:10`)로 제한된 enum. 속성 탈출·따옴표 무의미(텍스트 노드). `<img onerror>`·`==p:<script>==`·`"onmouseover=`·`== ==" onclick="` 5종 → raw 태그·속성주입 0건(✔). 렌더러 3곳 모두 같은 `toHtml`: `NodeRow.tsx:157`, `ShareCard.tsx:53`, `FlashCard.tsx:17`.
- **라이브 브라우저 실행(Playwright/msedge)** — 악성 제목(`<img onerror>`)·노트(`==p:<script>==`)·별칭(`<svg onload>`) 트리를 공개 후 `/t/<slug>?m=view` 로드: 다이얼로그 0, `.node-note` innerHTML = `<mark class="hl-p">&lt;script&gt;bad&lt;/script&gt;</mark>`(이스케이프됨), outline/head 주입 `<img>` 0, 전체 `<script>` 3개는 앱 번들뿐(✔).
- **`Icon` `dangerouslySetInnerHTML`** — `src/ui/Icon.tsx:11` 의 `d` 는 `icons.ts`/`icons.all.ts` 의 정적 아이콘 path 뿐. 전 호출부(`grep`)가 `I.*` 또는 모듈 상수. 사용자 입력 유입 경로 없음.
- **정적 경로 탐색** — `server/index.ts:75 serveStatic({root})` + `:76 app.get('*')` SPA 폴백. `/..%2f.env`·`/assets/..%2f..%2fpackage.json`·`/%2e%2e/package.json`·`/..\..\package.json`·`/../server/env.ts`·`/t/%2e%2e/` 모두 2609B 셸만(✔). 민감 파일 누출 없음.
- **서비스 워커 캐시 범위** — `dist/sw.js`: 라우트 1개(`NavigationRoute`→`createHandlerBoundToURL("index.html")`, `denylist:[/^\/api/,/^\/t\//]`). `/api` 런타임 캐싱 없음, `AdminPage`·`SharedPage`·`GalleryPage` precache 제외(`vite.config.ts:globIgnores`). 오프라인에서 `/t/` 는 네트워크로(셸 미대체) — 온라인 전용 설계와 일치.
- **공지 링크 스킴** — `server/account/admin.ts:47` 가 `url && !/^https?:\/\//` 이면 400. 저장 전 거부라 `javascript:`·`data:` 공지 불가. 렌더(`Banners.tsx:36`)는 `rel="noreferrer"`(→ noopener 포함) `target="_blank"`.
- **로그인 `?r=`·`?e=` 주입** — `router.ts:33` `r` 200자 절단, `LoginPage.tsx:43` `{r}` 텍스트. `e` 는 `ERR` 사전 매핑(`:12`)으로만 토스트. 오픈 리디렉트는 `me.ts:85 safeReturn`(`#/` 접두·`#/login` 제외) + 서버 `oauth.ts:23 safeReturn`(공백·역슬래시·제어문자·200자) 이중 차단.
- **백업 가져오기** — `src/core/backup.ts`: `parseBackup` 는 `Array.isArray` 확인·필드 `filter`·CAP(트리 200·노드 5000·제목·노트 길이) 검사. `planImport` 는 명시 필드 재구성. `__proto__` 키 백업 2종으로 `Object.prototype` 오염 0(✔). 거대 파일은 `JSON.parse` 전 FileReader 전체 로드(메모리 한도는 브라우저) + CAP 로 쓰기 차단 — 로컬 전용이라 서버 영향 없음.
- **외부 아바타 누출** — `src/ui/Avatar.tsx:50` `<img referrerPolicy="no-referrer">`, 깨지면 이니셜 폴백. `avatar_url` 은 OAuth `picture`(서버 `oauth.ts:26 safeUrl` 가 `https://` 강제)뿐이고 `use_provider_avatar` 켤 때만 공유 JSON 에 포함. `<img src>` 라 js 실행 불가.
- **clickjacking** — 전 응답 `X-Frame-Options: SAMEORIGIN`(✔ `/`·`/t/<slug>`). CSP `frame-ancestors` 는 없으나 XFO 로 커버.
- **client-error 보고** — `main.tsx:11` 는 `message`(200자)·`version`(번들 파일명)만 전송, `credentials:'same-origin'`. 서버 `ops.ts:91` 가 제어문자 제거·200자·분당 10건·메모리 저장. 관리자 `Dashboard.tsx:63` 가 `{e.message}` 텍스트 렌더. 개인정보·토큰 유입 경로 없음.
- **postMessage·window.opener** — `src/**` 에 `postMessage`/`.opener`/`window.open` 사용 0(`grep`). 네비게이션은 `history.pushState`(`router.ts:145`)·`location.assign('/' + href.*)`(href.* 는 고정 해시·검증된 id)뿐.
- **인앱 intent 링크** — `core/inapp.ts:29 chromeIntentHref` 는 `location.host`(공격자 비제어)만 삽입. 고정 scheme/package.
- **CSRF** — 상태 변경 요청은 `sec-fetch-site` + `origin` + `application/json` 3중(`index.ts:49-60`), 세션 쿠키 `SameSite=Lax`. 공유·OG 는 안전한 GET.
- **갤러리 미리보기** — `GalleryPage.tsx:158 <pre>{preview.text}</pre>` 텍스트 노드. `previewText` 는 제목 개요만(내용 제외), React 이스케이프.

## 테스트 공백

- **CSP 회귀 가드 없음** — `toHtml`/`esc` 가 한 글자라도 누락되면 즉시 XSS 인데 이를 잡는 테스트·CSP 가 둘 다 없다. `content.check.ts` 는 왕복 정규형만 보고 "이스케이프 결과에 `<`/`>` 가 남지 않는지"를 단언하지 않는다. 권장: `toHtml(parse('<img onerror=x>==p:</mark>==')).match(/<(?!div|mark|\/|br)/)===null` 단언 1줄.
- **라이브 XSS 자동화 부재** — Playwright 로 악성 트리 공개→`/t/<slug>`·갤러리 미리보기·플래시/빈칸 탭·관리자 신고/소명/피드백 화면에서 `page.on('dialog')` 0건을 상시 검증하는 e2e 가 없다(이번에 수동 1회 통과 ✔). `e2e/` 8스펙 중 XSS 전용 없음.
- **OG 셸 이스케이프 회귀** — `renderShare` 가 `<title>`·`content="..."` 두 컨텍스트 모두 수치 엔티티로 막는지 보는 서버 테스트 없음. `account.check.ts`·`sync.check.ts` 에 제목 `"><script>` 공개 후 셸에 raw `<script>` 미포함 단언 권장.
- **백업 프로토타입 오염 회귀** — `backup.check.ts` 에 `__proto__`/`constructor` 키 백업 통과 후 `Object.prototype` 미오염 단언 없음.

재현 자료: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\d62408f3-b5c8-451e-9005-141135d411f0\scratchpad\sec\` (`xss.mjs` OG, `pw.mjs` Playwright, `server.log`; 저장소 변경 없음).
