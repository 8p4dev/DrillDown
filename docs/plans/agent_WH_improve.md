# 워커 WH — 앱 셸·PWA·접근성·문서 개선 (2026-11-10)

plan: `orchestration_improve.md` §1.5. 포트 5364/4364. 선행 커밋 1a0519d 위에서 작업.

## 접근 방식
- 새 의존성 0, 새 파일은 PNG 아이콘 4개뿐. 각 항목은 "고침" 열의 범위까지만.
- H2: `Sheet` 의 `onClose` 를 선택 사항으로 만들어 없으면 Esc·바깥 탭이 닫지 않는다(MergeDialog 가 그대로 씀). 대안(MergeDialog 가 빈 함수를 넘김)은 "닫을 수 없다"는 의도가 코드에 안 드러나 버림. `dismissMerge` 는 NavUser 의 무음·토스트 분기(L=0)가 계속 써서 **유지**.
- H3: `App.tsx` 안에 클래스 `ErrorBoundary`(getDerivedStateFromError + 새로 고침 버튼) 로 `<Suspense>` 를 감싼다. lazy import 실패(배포 직후 청크 404)는 렌더 중 throw 라 같은 경계에 잡힌다.
- H4: `public/favicon.svg`(16 칸 중 12 칸 검은 사각형) 를 스크래치 Playwright(msedge) 로 래스터화. 일반 아이콘은 배경 `#f4f4f4` + 사각형 75%, maskable 은 사각형 50%(안전 영역 지름 80% 원 안). vite-plugin-pwa 기본 glob 은 js/css/html 이라 PNG 는 precache 밖 — 빌드 후 sw.js 로 확인.
- H12: `undo2`·`x`·`megaphone` 을 `icons.ts` 의 `I` 에 넣고 `icons.all.ts` 는 `I` 에서 가져와 같은 이름으로 re-export(다른 소유자의 import 가 그대로 동작). 내 소유 파일(Toast·Banners·ShareSheet·AccountPage·AdminPage)은 `I.*` 로 바꾼다.
- S14: `countDue` effect 가 `dd:due`·`dd:remote` 리스너를 같이 건다(계약 C3).
- 측정: 스크래치 `first.mjs` — dist/index.html 의 script+modulepreload+css gzip 합, sw.js precache 합.

## 수정/생성 파일
`src/App.tsx`, `src/features/viewport.ts`(변경 없음 예정), `src/ui/Sheet.tsx`, `src/ui/icons.ts`, `src/ui/icons.all.ts`, `src/ui/Hint.tsx`(삭제), `src/features/Toast.tsx`, `src/features/account/NavUser.tsx`·`MergeDialog.tsx`·`Banners.tsx`·`nav-user.css`·`AccountPage.tsx`, `src/features/admin/AdminPage.tsx`·`admin.css`, `src/features/share/ShareSheet.tsx`·`GalleryPage.tsx`·`share-list.css`, `src/core/me.ts`, `src/index.css`, `index.html`, `vite.config.ts`, `public/pwa-192.png`·`pwa-512.png`·`pwa-maskable-512.png`·`apple-touch-icon.png`(생성), `public/icons.svg`(삭제), `tsconfig.server.json`, `README.md`, `docs/specs/README.md`·`00_overview.md`.

## 단계
- [x] 0 `npm ci`, 기준 측정: 첫 화면 gzip 85.98 KB(modulepreload 16개 + index.css), precache 70개 629.4 KiB
- [x] 1 H1 App 최상위 `startViewport()` 1회 / H10 `aria-current="page"` + index.css 선택자 / S14 `dd:due`·`dd:remote` 재계산 / H3 ErrorBoundary
- [x] 2 H2 Sheet `onClose?` + MergeDialog onClose 제거 + NavUser 수정 / H7 Tab 포커스 가두기
- [x] 3 H12 아이콘 3개 이동 + re-export, Toast·Banners·ShareSheet·AccountPage·AdminPage import 수정
- [x] 4 H5 복사 try/catch 토스트 / H6 갤러리 다시 시도 / H11 share-list min-height 삭제 / H9 배너 CSS
- [x] 5 H13·H14·H15 AdminPage·AccountPage / H21 me.ts 심 정리
- [x] 6 H4 아이콘 PNG 생성(스크래치 Playwright) + manifest + apple-touch-icon 링크
- [x] 7 H16 tsconfig.server.json include / H18·H19·H20 삭제 / H22 주석·문서 / H17 README
- [x] 8 typecheck·lint·check·build 통과. 첫 화면 gzip 85.98 → **85.68 KB**(icons.all −1.28, viewport +0.83, Toast −0.07, icons +0.13), precache 70개 629.4 → **630.0 KiB**(아이콘 PNG 는 `includeManifestIcons: false` 로 밖). dist/index.html 에 icons.all modulepreload 0건. 스크래치 Playwright(msedge, preview 4364): aria-current='내 트리', 공유 시트 Tab 순환(닫기→로그인→닫기, Shift+Tab 역방향)·Esc 닫힘, GalleryPage 청크 404 → '새로 고침' 경계, 갤러리 첫 페이지 실패 → '다시 시도', manifest·PNG 4개 200
- [ ] 9 커밋, worker_done

## 검증 방법
- 1~5·7: `npm run typecheck`·`npm run lint`·`npm run check`·`npm run build`.
- 6: `file`/크기 확인, 빌드 후 `dist/manifest.webmanifest` 의 icons, sw.js precache 목록에 png 없음.
- 8: 스크래치 Playwright(msedge, `vite preview --port 4364`): (a) 공유 시트에서 Tab 을 끝까지 눌러 첫 요소로 돌아오는지, (b) 병합 시트는 로그인이 필요해 단위 확인 대신 Sheet 에 onClose 없을 때 Esc 가 무시되는지 코드 경로로 확인(E2E 는 오케스트레이터), (c) 존재하지 않는 청크를 흉내 내 경계가 뜨는지는 `route` 로 lazy 청크 요청을 404 로 막아 확인.

## 변경 사항
- `dismissMerge` 는 삭제하지 않음(위 접근 방식). `startViewport()` 기존 호출 2곳은 다른 소유자 파일이라 그대로(가드가 1회만 동작시킴).
- `.c-misplaced` 는 `src/core/srs/index.ts:104`·`srs.check.ts:68` 이 사용 → 삭제하지 않음(WS 가 정리 중이면 그쪽에서).
- H12: `icons.all.ts` 머리 주석의 "손으로 고치지 말고 다시 생성" 과 달리 손으로 고쳤다(생성 스크립트는 저장소에 없음). 주석에 한 줄 적어 둠.
- H4: 아이콘 PNG 는 `page.setContent` 로 그린 사각형을 스크린샷(SVG 자체를 로드하면 투명 배경·다크 미디어 쿼리 영향). 모양은 favicon 과 같다.
- H4: vite-plugin-pwa 는 manifest icons 를 기본으로 precache 에 넣는다(`includeManifestIcons`) → false 로 껐다. PNG 4개 합 4.9 KB.
- H16: `e2e/**`·`playwright.config.ts` 를 `tsconfig.server.json` 에 넣었다. e2e 가 `tsconfig.server.json` 의 `lib: DOM` 을 쓰므로 `page.evaluate` 안 코드도 검사된다 → 0 오류 확인.
