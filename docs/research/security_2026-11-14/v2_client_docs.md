# V2 재검토 — 클라이언트(CSP 실동작)·문서 1:1·테스트 단언 유효성 (2026-11-14, main ba4a374)

읽기 전용. 서버는 `npm run build` 뒤 `node server/index.ts`(PORT 4384, HOST 127.0.0.1, AUTH_FAKE=1, DATA_DIR=.v2-data, http origin) 로 dist 를 서빙. Edge(Playwright msedge, headless) 로 전 화면 순회, `securitypolicyviolation` 이벤트 + `console.error` + `pageerror` + 동일 출처 4xx 를 화면마다 수집. 단언 검증은 소스를 임시로 깨뜨린 뒤 `git checkout` 으로 원복(끝난 뒤 `git status` 깨끗함, dist 재빌드 완료).

## 0. 한 줄 결론

**CSP 는 전 화면에서 위반 0 으로 동작하고(양성 대조로 집행 확인), 새 단언 3종은 전부 해당 결함을 잡는다.** 우회·회귀는 없다. 남은 것은 문서 ≠ 코드 5줄(처리방침 ⑧ `theme` 쿠키, 런북 HOST "비우거나", 런북 §3 일일 작업 행 누락, 런북 CSP 해시 기동 시 계산 미기재, 백업 디렉터리 기존 모드 미변경)과 단언 2곳의 사각(content.check 정규식 허용목록·security.spec dialog 단언이 CSP 아래서 무의미) 이다.

## 1. 항목표

| # | 항목 | 판정 | 요청·재현 예시 |
|---|---|---|---|
| 9-a | CSP 헤더가 모든 응답에 붙고 해시가 dist/index.html 과 일치 | 막힘 ✔ | `curl -I /`, `/api/health`, `/sw.js`, `/manifest.webmanifest`, `/t/<slug>` 전부 `content-security-policy: default-src 'self'; script-src 'self' 'sha256-Go150…' 'sha256-l0IH…'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'`. dist/index.html 인라인 2개(테마 스크립트 CRLF→LF 정규화 뒤, PWA inline register)를 직접 sha256 하면 같은 두 값. http origin 이라 HSTS 없음 ✔ |
| 9-b | CSP 가 실제로 집행되는가(양성 대조) | 막힘 ✔ | 첫 화면에서 `document.body.appendChild(<script>window.__ran=1</script>)` → `__ran` 0, `script-src-elem inline` 위반; `<div onclick=…>` click → `script-src-attr inline` 위반; `<img src=http://example.com/x.png>` → `img-src` 위반. 콘솔에 "Executing inline script violates…" 3건 |
| 9-c | 첫 진입(비로그인·다크) — 테마 인라인 스크립트 실행 | 막힘 ✔(동작) | `localStorage.theme=dark` 로 진입 → `html[data-theme=dark]`, `meta[theme-color]=#121212`, body 배경 `rgb(18,18,18)`. 라이트 재진입 → `#f4f4f4`. 위반 0 |
| 9-d | PWA SW 등록·manifest·아이콘 | 막힘 ✔(동작) | `navigator.serviceWorker.ready` → active, scope `/`, script `/sw.js`. `link[rel=manifest]` 200, 아이콘 3개(pwa-192/512/maskable-512) 200 image/png, favicon.svg·apple-touch-icon 200. 위반 0 |
| 9-e | 외부 아바타(https) | 막힘 ✔(동작) | DB `users.avatar_url=https://www.gravatar.com/…`, `use_provider_avatar=1` 뒤 reload → `#/account` 의 `.avatar img` 2개 `complete, naturalWidth 64, referrerPolicy no-referrer`; `/t/<slug>` 소유자 아바타도 로드. 위반 0. (주의: fake 로그인은 `signIn` 이 `avatar_url` 을 `a.picture=null` 로 덮으므로 로그인 뒤에 심어야 재현된다) |
| 9-f | 공지 링크(새 탭) | 막힘 ✔(동작) | 관리자 `PUT /api/admin/settings {notices:[{text,url:'https://example.com/notice',audience:'all'}]}` 200 → 비로그인 `/` 배너 `a[href=https://example.com/notice][rel=noreferrer][target=_blank]` 보임, 클릭 → 새 탭 `https://example.com/notice`. 위반 0. (`/api/notices` 가 `Cache-Control: private, max-age=60` 이라 같은 컨텍스트에서는 60초 뒤에 보인다 — 버그 아님) |
| 9-g | 편집기(노드 행 인라인 style·노트 innerHTML)·내 트리 플래시·DnD·백지 | 막힘 ✔(동작) | `.node-row` `style="left: 236px; top: 32px; width: 180px; --heat: 0;"` 가 계산값 `left 236px` 로 적용. 노트 `==p:…== <b>굵게</b>` → `mark.hl-p` 렌더. 4 화면 위반 0·콘솔 오류 0 |
| 9-h | 공유 시트·공개 → `/t/<slug>`·`?m=flash`(개념 클릭)·`?m=dnd`·`?m=blank` | 막힘 ✔(동작) | 공유 시트 `.share-url` 생성, 비로그인 방문 200 + CSP 헤더. 4 화면 위반 0 |
| 9-i | 갤러리·미리보기 | 막힘 ✔(동작) | `#/gallery` → 카드 [미리보기] → `.share-sheet h2`. 위반 0 |
| 9-j | 관리자 탭 7개(dashboard·users·trees·requests·metrics·feedback·system) | 막힘 ✔(동작) | 전부 위반 0·콘솔 오류 0. dashboard `.bar` `style="height: 4%"` → 계산 `2.875px`(인라인 style 적용) |
| 9-k | 인라인 `style` 속성 | 막힘 ✔(동작) | `div.setAttribute('style','width:123px')` → 계산 `123px`, 위반 0 (`style-src 'unsafe-inline'`) |
| 9-l | 계정 내보내기(blob: 다운로드)·처리방침·약관·게시중단 폼·로그인·접수 상태 404 | 막힘 ✔(동작) | `download` 이벤트 `drilldown-export.json`(CSP 는 다운로드 내비게이션을 막지 않음). 나머지 화면 위반 0 |
| — | 콘솔 오류 | 회귀 없음 | 전 화면 콘솔 오류는 비로그인 `/api/me` 401 "Failed to load resource" 6건만 — 수정 전부터 있던 비로그인 동작(CSP 와 무관) |
| 테스트-1 | `content.check` `toHtml escapes tags` | 잡음 ✔(단, 사각 있음) | M1 `esc` 에서 `<` 치환 제거 → **기존** 단언(`'- <b>&'` 기대값) 이 먼저 실패. M2 `mark` 안 텍스트만 `esc` 생략(기존 단언 통과) → **새** 단언만 `toHtml escapes tags: ==p:<script>alert(1)</script>== ["<","<"] !== null` 로 실패 ✔. M3 사각: 정규식 `/<(?!div\|mark\|br\|\/div\|\/mark)/` 는 `<div onclick=…>`·`<mark onmouseover=…>`·`<br onload=…>` 로 시작하는 주입을 **통과**시킨다(아래 §3) |
| 테스트-2 | `backup.check` `prototype not polluted` | 잡음 ✔ | M4b `planImport` 를 `for-in` 재귀 병합으로 바꿔 `__proto__` 경로 오염 → `Error: prototype not polluted by __proto__/constructor keys` ✔. (M4 `constructor.prototype` 까지 병합하는 변형은 단언 전에 `TypeError: Cannot assign to read only property 'prototype'` 로 죽음 — 역시 check 실패지만 단언이 아닌 크래시) |
| 테스트-3 | `e2e/security.spec.ts` | 잡음 ✔(단, dialog 단언은 CSP 아래서 무의미) | M5 `format.ts esc` 에서 `<`·`>` 치환 제거 → 빌드 → 스펙 실패: 64행 `toHaveText('<script>alert(4)</script>') Received ""`(소유자 편집기 단계에서 조기 실패). M6 `share.ts esc` 를 `&` 만 치환 → 88행 `expect(shell).not.toMatch(/<script>alert\|<img \|<svg /)` 실패(`<title>"><img src=x onerror=alert(1)>…`) ✔. 두 변형 모두 `dialogs` 는 빈 배열 — CSP 가 `onerror=` 인라인 핸들러를 막기 때문에 **dialog 0 단언은 더 이상 이스케이프 회귀를 감지하지 못한다**(스펙 주석 "한 글자라도 새면 dialog 가 뜬다" 는 이제 틀림). 실제 감지는 `injected()` DOM 카운트·`toHaveText`·셸 정규식 |

## 2. 문서 ↔ 코드 1:1 대조

✔ 일치(코드 근거):
- 보존 — 피드백 처리 후 90일(`server/account/product.ts:86`), 신고·소명 90일(`daily.ts:33-34`), 게시중단·요청 처리 90일·미처리 180일·고아(`legal.ts:15-16,36-37`, `daily.ts:35` 호출), 감사 1년(`daily.ts:38` 365일), 세션 180일(`session.ts:12`), 탈퇴 7일(`http.ts GRACE_MS`), 백업 14개(`backup.ts KEEP=14`). PrivacyPage ITEMS·④·⑩, TermsPage 5항, CODEBASE "보존 주기" 와 일치.
- 파일 권한 — `backup.ts:23` `mkdirSync(mode 0o700)`·`:29` `chmodSync(file,0o600)`, `db.ts:35` pre-migrate 600. 처리방침 ②·⑩·런북 §3·§4·CODEBASE 와 일치(단 아래 ✘5).
- AUTH_FAKE 기동 조건 — `index.ts:22` `authFake && (secure || host ∉ {127.0.0.1,::1,localhost})` throw. 런북 §1-9·CODEBASE·`.env.example` 주석·유닛 3개 `Environment=AUTH_FAKE=0`(EnvironmentFile 뒤) 일치. `PUBLIC_ORIGIN` 비우면 `http://localhost:3000`(`env.ts:12`) 런북 일치.
- 세션 20개 — `oauth.ts:84` `LIMIT 20`, CODEBASE 일치. auto_days 상한 — `map.ts:7 autoDays 3660`, `push.ts:126 slice(-LIMITS.autoDays)`, CODEBASE "3,660개 상한" 일치.
- CSP 해시 — CODEBASE "기동 시 dist/index.html 인라인 `<script>` sha256" = `index.ts:30-32`; `style-src 'unsafe-inline'`·`frame-ancestors 'none'` 일치. XFF 미신뢰 — `http.ts:48` `cf-connecting-ip ?? 'local'`, CODEBASE "x-forwarded-for 폴백 없음·직접 접속은 local 한 키" 일치.
- 처리방침 ⑧ `oauth` 쿠키 10분 = `oauth.ts:113 maxAge: 600` ✔.

✘ 틀린 줄(파일:줄 → 최소 diff):

| # | 위치 | 문제 | 최소 diff |
|---|---|---|---|
| ✘1 | `src/features/account/PrivacyPage.tsx:72` ⑧ "`theme`(화면 테마)" 을 쿠키로 적음 | 테마는 `localStorage 'theme'`(`src/ui/theme.ts:7`, `index.html` 인라인 스크립트). 서버·클라이언트 어디에도 `theme` 쿠키 없음(src 전체 `cookie` 0건, 서버 setCookie 는 `sid`·`oauth` 만) | `<code>sid</code>(로그인 유지), <code>oauth</code>(로그인 중 10분). 화면 테마는 쿠키가 아닌 브라우저 저장소(localStorage)에만 둡니다.` |
| ✘2 | `docs/ops/runbook.md:44` "HOST 는 **비우거나** `127.0.0.1`(터널만 들어온다)" | `env.ts:9` 는 `e.HOST ?? '127.0.0.1'` — env 파일에 `HOST=`(빈 값) 줄이 있으면 `''` 가 그대로 넘어가 Node 가 **모든 인터페이스(`::`)** 에 바인딩한다(`http.createServer().listen(0,'')` → `{"address":"::"}` 확인). AUTH_FAKE 가드는 `''` 를 거부하므로 #1 우회는 아니지만, AUTH_FAKE=0 운영에서 "터널만 들어온다" 는 문구가 거짓이 됨 | `server/env.ts:9` `host: e.HOST || '127.0.0.1',` + 런북 "HOST 줄은 **쓰지 않거나**(빈 `HOST=` 도 금지) `127.0.0.1`" |
| ✘3 | `docs/ops/runbook.md:74` 매일 04:00 행 | 코드가 하는 "처리된 피드백 90일"(`product.ts:86`)·"미처리 게시중단·정보주체 요청 180일 또는 대상 트리 소멸 시 삭제"(`legal.ts:36-37`) 가 빠짐(CODEBASE §8 에는 있음) | "…처리 신고·소명·게시중단·정보주체 요청·**피드백** 90일, **미처리 게시중단·요청 180일(또는 트리 소멸)**, 임시조치…" |
| ✘4 | `docs/ops/runbook.md:76` 업데이트 행 | CSP 해시가 **기동 시 한 번** `dist/index.html` 에서 계산된다(`index.ts:30`)는 사실이 없다. `index.html` 인라인 스크립트(테마·PWA register)가 바뀐 dist 를 rsync 만 하면 재시작까지 테마 스크립트가 CSP 에 막힌다 | "…빌드 뒤 재시작을 잊으면 "재시작 필요" 가 뜬다 — **CSP 인라인 스크립트 해시도 기동 시 dist/index.html 에서 읽으므로 dist 교체 뒤 반드시 재시작**" |
| ✘5 | `docs/ops/runbook.md:73`·`docs/CODEBASE.md:921` "디렉터리 700" / `server/account/backup.ts:23` | `mkdirSync(dir,{recursive:true,mode:0o700})` 은 **새로 만들 때만** 모드를 준다. 이미 755 로 있는 운영 Pi 의 `backups/` 는 그대로 755 — 문서 문구가 기존 배포에는 거짓 | `backup.ts:23` 뒤에 `try { chmodSync(dir, 0o700) } catch {}` 1줄 |

정보(틀림은 아님): TermsPage 9 변경 이력이 "최초 시행" 한 줄(시행일이 오늘이라 허용). PrivacyPage "로그인 기기 — 로그아웃·세션 만료 시" 에 "사용자당 최신 20개 초과 시" 는 없음(보존 상한을 더 짧게 적은 쪽이라 무해). 미처리 피드백은 보존 상한 없음(탈퇴 purge 에 포함, 처리방침은 "처리 후 90일" 만 약속). `X-Frame-Options: SAMEORIGIN`(hono 기본) 과 `frame-ancestors 'none'` 이 다름 — 최신 브라우저는 CSP 우선이라 무해, 통일하려면 `xFrameOptions: 'DENY'`.

## 3. 단언 사각 — 최소 diff

**content.check 정규식 허용목록** (`src/features/editor/content/content.check.ts:42`): `esc` 가 `<` 를 안 바꾸는 상태에서 `<div onclick=alert(1)>x`·`<mark onmouseover=alert(1)>`·`<br onload=alert(1)>` 는 `match(...) === null` 로 **통과**(M3 실측, `<marquee`·`<img` 만 잡힘). 지금 evil 목록에 `<img`·`<script`·`<svg` 가 있어 전면 회귀는 잡지만, 허용 접두 기반 lookahead 는 원리상 느슨하다. 정확한 태그만 벗겨내고 `<` 가 남지 않게:

```ts
const ALLOWED = /<div class="ln(?: b)?">|<\/div>|<mark class="hl-[a-z]+">|<\/mark>|<br>/g
for (const evil of [..., '<div onclick=alert(1)>', '<mark onmouseover=alert(1)>', '<br onload=alert(1)>'])
  assert.equal(toHtml(parse(evil)).replace(ALLOWED, '').includes('<'), false, `toHtml escapes tags: ${evil}`)
```

**security.spec 의 dialog 단언** (`e2e/security.spec.ts:3-4` 주석, `:53`·`:107`): CSP 가 인라인 핸들러를 막아 이스케이프가 새도 dialog 는 0 — 단언은 남겨도 되지만 주석을 고치고, CSP 위반 콘솔 메시지를 감지기로 추가하면 "새는 즉시 실패" 가 복원된다(새는 `onerror=` 는 브라우저가 "Executing inline event handler violates…" 를 찍는다):

```ts
const cspv: string[] = []
const watch = (p: Page) => p.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/.test(m.text())) cspv.push(m.text()) })
watch(po); watch(pa)
// 끝에서
expect(cspv).toEqual([])
```

## 4. 검증 흔적

- 스크립트: `C:\Users\User\AppData\Local\Temp\claude\64920e0e45c0e441\a5d72058-01b5-4edb-a7e2-873c4471dc50\scratchpad\csp.mjs`(전 화면 순회, 결과 `csp_result.json`), `csp2.mjs`(공지 링크), `csp3.mjs`(아바타), `m3.ts`(정규식 사각).
- 변형 테스트는 `sed`/node 로 소스 수정 → `npx tsx <check>` 또는 `npx playwright test e2e/security.spec.ts`(단일 스펙, 자체 webServer 4173) → `git checkout -- <file>`. 마지막에 서버 종료·`.v2-data` 삭제·`npm run build` 재실행, `git status --porcelain` 0건.
- 기존 `npm run check` 전부 ok(기준선).
