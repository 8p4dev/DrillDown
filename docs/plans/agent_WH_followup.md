# 워커 WH — 빌드 후속: precache 예산 F3 (2026-11-12)

plan: `orchestration_editor_share_followup.md` §1.3. 포트 vite 5361 / 서버 4361. 기준 `main` `aa96323`.

## 접근 방식
- 네트워크가 있어야만 쓸 수 있는 화면 두 개(공유 보기 `/t/<slug>` SharedPage, 공개 트리 목록 `#/gallery` GalleryPage)와 둘이 같이 쓰는 `share.css` 를 `workbox.globIgnores` 에 보탠다. 기존 관리자 청크 제외와 같은 방식이라 새 장치 없음.
- 대안(검토·버림): manualChunks 로 청크를 쪼개거나 폰트 런타임 캐시 — 범위 밖(plan 에서 금지). precache 예산 상한을 올리는 것 — 문제를 미룰 뿐.
- 오프라인에서 그 화면을 열면 lazy 청크 404 → `App.tsx` ErrorBoundary('새로 고침'). 관리자 청크와 같은 동작(plan A2).
- `docs/CODEBASE.md` 에는 §11 "PWA 설정" 단락에 "관리자 화면 코드와 폰트는 미리 저장하는 대상에서 뺐다" 문장이 있다(§13 에는 precache 언급 없음) → 그 문장만 고친다.

## 수정 파일
- `vite.config.ts` — `globIgnores` 3개 추가 + 주석 한 줄
- `docs/CODEBASE.md` — §11 PWA 설정 문장 1개
- `docs/plans/agent_WH_followup.md` — 이 파일

## 단계
- [x] 0 `npm ci`, 기준 빌드: precache 71 entries 640.00 KiB. sw.js 에 SharedPage(15.1 KiB)·GalleryPage(5.6 KiB)·share css(7.9 KiB)·share-list css(1.3 KiB) 모두 있음
- [x] 1 `vite.config.ts` `globIgnores` 에 `**/SharedPage-*.js`, `**/GalleryPage-*.js`, `**/share-????????.css` 추가, 주석 갱신(아래 변경 사항)
- [x] 2 `docs/CODEBASE.md` §11 문장 갱신
- [x] 3 typecheck 0·lint 0·check 통과. build: precache **68 entries (611.35 KiB)**. `dist/sw.js` 에 SharedPage·GalleryPage·share-<해시>.css 0건, share-list css 는 남음
- [x] 4 서버 4361(DATA_DIR 스크래치) + 헤드리스 msedge: `#/gallery` → '공개 트리 / 아직 공개된 트리가 없습니다'(청크 200, ErrorBoundary 0), `/t/abcdefghijk` → 서버 404 + '링크를 찾을 수 없습니다'(ErrorBoundary 0). curl: GalleryPage·SharedPage·share css 청크 200, `/api/gallery` 200. PID 로 종료, 포트 닫힘 확인
- [x] 5 커밋, worker_done

## 검증 방법
- 0·3: `npm run build` 출력의 `precache N entries (X KiB)`; `grep -c "SharedPage\|GalleryPage\|share-" dist/sw.js` 가 0.
- 4: `PORT=4361 node --env-file-if-exists=.env server/index.ts` 백그라운드 → curl 로 `/t/nope`(404 HTML), `/`(200), `dist/assets/GalleryPage-*.js`(200), `dist/assets/SharedPage-*.js`(200). 그래프·화면 렌더는 E2E(오케스트레이터) 몫.
- typecheck·lint(경고 0)·check.

## 변경 사항
- plan 의 `**/share-*.css` 대신 `**/share-????????.css`(해시 8자만). `**/share-*.css` 는 `share-list-<해시>.css` 도 잡는데, 그 파일은 `ShareSheet`·`SyncStatus`·`VisibilityBadge`(내 트리·편집기 등 오프라인 화면)가 import 한다. 오프라인 스타일이 빠지지 않도록 공유 보기·공개 트리 목록 전용 `share.css` 만 제외. Vite 해시 길이(8)가 바뀌면 glob 도 같이 고쳐야 한다(주석에 적음).
- `docs/CODEBASE.md` 에 "관리자 청크·웹폰트는 precache 밖" 류 문장은 §11 'PWA 설정' 단락에만 있어 그 문장만 고쳤다. §13 은 손대지 않음.
- 첫 확인에서 `/t/nope-slug` 를 썼더니 클라이언트 `SLUG_RE`(base58 11자)에 걸려 해시 라우트(내 트리)로 떨어졌다. 유효 형식 `abcdefghijk` 로 다시 확인. 기존 동작이고 이 작업과 무관.

## 남은 위험
- 오프라인 첫 진입에서 공유 보기·공개 트리 목록을 열면 lazy 청크 404 → ErrorBoundary '새로 고침'(plan A2, 관리자와 같음). 네트워크가 돌아오면 정상.
- 예산 여유 28.65 KiB. 다음에 또 닿으면 폰트 런타임 캐시·청크 분리 등 별도 작업.
