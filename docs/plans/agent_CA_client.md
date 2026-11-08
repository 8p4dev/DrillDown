# 에이전트 CA — 클라이언트 계정·관리자 실연결 (S4)

작성 2026-11-08. 상위 `orchestration_server.md` §1 S4·§3.4·§4 CA 행. 설계 `03_account_admin.md` §3.2·§3.3·§3.4·§3.6·§3.7·§4. 시작 커밋 8947541. dev 포트 5181 + 서버 3021.

## 접근 방식

- **`src/core/me.ts` = 모듈 스토어 1개**(`useSyncExternalStore`, mock 과 같은 패턴). 모듈 로드 시 `GET /api/me` 1회(401 → null), `focus`·`visibilitychange` 복귀 시 60초 간격으로 재확인. 상태: `me`, `mergePlan`, `sessions`(계정 화면 진입 시 `loadSessions()`), `providers`(1회 캐시).
- **로그인 확인 훅**: `/api/me` 200 이고 `user.id` 가 직전과 다르면 `import('./sync')` 동적 → `onLogin(id)` → `MergePlan` 을 스토어에 보관 → `useMergePlan()`. `applyMerge(choice)` 도 동적 import. 엔진은 첫 화면 청크 밖(§3.5).
  - `sync.ts` 는 CS 가 아직 `onLogin`·`applyMerge`·`onLogout` 를 내보내지 않는다 → 동적 import 결과를 `Partial<SyncContract>` 로 보고 **함수가 있을 때만** 부른다(없으면 MergePlan = null, 무음). CS 머지 후 그대로 동작. 타입은 me.ts 안 `MergePlan` 로컬 정의(계약 §3.5 모양 그대로).
- **"로그인됨" 토스트·rise**: `return_to` 302 로 돌아온 첫 `/api/me` 200 = 이 탭에서 이전에 me 가 null 이었거나 앱 시작인데 `sessionStorage 'login:seen'` 이 다른 id → `justLoggedIn` 플래그(세션당 1회). 로그인 버튼 클릭 때 `sessionStorage 'login:pending'=1` 을 두고 돌아와 200 이면 토스트 — 앱 시작마다 토스트가 뜨지 않게.
- **api 오류 공통 처리**: `api.ts` 에 `onApiError` 훅 1개(setter). me.ts 가 설치: 503 `maintenance` → `me.maintenance = true`, 429 → 토스트 1회(10초 안 중복 무시). 대안(각 호출부 try/catch) 은 중복이 많아 기각.
- **관리자**: mock 스토어 대신 컴포넌트 로컬 상태 + `api()`. 목록은 `{items, next}` → "더 보기" 버튼. 변경 후엔 응답의 `{user}`/`{tree}`/`{report}` 로 행만 교체. 404 → `#/`. 공지·점검 저장 후 `refreshMe()`.
- **계정 화면**: 아바타 파일 업로드 제거(03 §3.3 서버 이미지 미저장). 내보내기 = `{ local: JSON.parse(exportEvents()), server: GET /api/me/export }` 1파일. 휴지통 복구 = 로컬 `restoreTree` + 서버 `POST /api/trees/:id/restore`(실패는 무시: 로컬-only·미동기화 트리 404 가능) + `sync.retrySync()`(pull 요청 대용 — 기존 계약 이름).
- 대안 검토: 관리자 데이터를 전역 스토어(react-query 류)로 → 의존성 금지·화면 1개라 로컬 상태로 충분.

## 수정/생성 파일

| 파일 | 작업 |
|---|---|
| `docs/plans/agent_CA_client.md` | 이 문서 |
| `src/core/api.ts` | `onApiError` 훅, `Provider` 에 `'fake'`, `User.use_provider_avatar?`, `Providers`·`Page<T>`·`AdminUserDetail`·`MeExport`·`PatchMeRes` 타입 |
| `src/core/me.ts` | 실구현 (mock 재수출 제거) |
| `src/core/mock/me.ts` `src/core/mock/admin.ts` | 삭제 |
| `src/features/account/{LoginPage,AccountPage,NavUser,MergeDialog,PrivacyPage,providers}.tsx` `account.css` | 실연결 |
| `src/features/admin/AdminPage.tsx` | `api()` 로 교체 |

소유 범위 밖: `src/core/mock/sync.ts`(CS) 가 `./me`(= mock/me.ts) 를 import → mock/me.ts 삭제 시 빌드 깨짐. **오케스트레이터에게 `ask`**(아래 변경 사항).

## 단계별 작업

- [x] 0. plan 작성
- [x] 1. `api.ts` 타입·훅
- [x] 2. `me.ts` 실구현 (useMe/getMe/refreshMe/logout/loginUrl/patchMe/sessions/deleteAccount/exportServer/useProviders/useMergePlan/applyMerge/justLoggedIn)
- [x] 3. `LoginPage` (providers 비활성·툴팁, fake 2버튼, 처리방침 링크)
- [x] 4. `NavUser`·`MergeDialog` (MergePlan, 계정 전환 M3)
- [x] 5. `AccountPage` (닉네임 400 field, 사진 토글 relogin, 세션, 휴지통 서버 복구, 내보내기, 탈퇴)
- [x] 6. `AdminPage` (4탭 api, 더 보기, 404 → #/)
- [x] 7. `PrivacyPage` ①~⑩
- [x] 8. mock/me.ts·mock/admin.ts 삭제 (mock/sync.ts 의 import 는 오케스트레이터 승인 받아 `../me` 로)
- [x] 9. typecheck·lint·check·build, grep mock/fetch
- [x] 10. 임시 Playwright(page.route 가짜 응답) — 로그인→계정→닉네임 400→탈퇴 2단계, 관리자 4탭·정지
- [x] 11. 커밋 → worker_done

## 검증 방법

| 단계 | 확인 |
|---|---|
| 1~8 | `npm run typecheck`, `npm run lint` |
| 9 | 4개 스크립트 0 종료·경고 0, `grep -rn mock src/features/account src/features/admin src/core/me.ts` 0, `grep -rn "fetch(" src` = api.ts 만 |
| 10 | Vite 5181 + scratch Playwright(Edge), `/api/**` route 로 03 §3.6 모양. **실서버 계정 API 는 SA 머지 후 확인** |

## 변경 사항

1. **아바타 파일 업로드 제거** (03 §3.3: 서버는 이미지 저장 안 함). 계정 화면의 [변경] 버튼과 숨은 file input 삭제 → 그 줄은 제공자 사진 토글만.
2. **`sync` 계약 함수 부재**: 지금 `sync.ts`(mock) 에 `onLogin`·`applyMerge`·`onLogout` 가 없어 me.ts 는 동적 import 후 존재 확인으로 부른다. CS 머지 후 실동작.
3. **`User.use_provider_avatar?`** 를 api.ts 에 선택 필드로 추가 — 토글 초기값. SA 가 `/api/me` user 에 실어 주면 정확, 없으면 `avatar_url != null` 로 추정.
4. **`Provider` 에 `'fake'`** 추가(가짜 로그인 사용자 표시용). 라벨 "개발용", 로고 없음.
5. **휴지통 서버 복구 후 pull**: 새 이름 대신 기존 계약 `retrySync()` 를 부른다(CS 가 retry = push+pull 로 구현한다는 가정).
6. **"약관" 링크 제거**: 약관 화면이 없어 `#/` 로 가던 죽은 링크였다. 로그인 하단 = "개인정보 처리방침" + (fake 면) "개발용 로그인: 사용자 / 관리자".
7. **탈퇴 시 "이 기기의 트리도 지우기"** 는 `repo.deleteTree`(하드 삭제)로 지운다 — `markTreeDeleted` 는 outbox 에 삭제를 남겨 7일 내 재로그인 때 서버 트리까지 지울 수 있어서. CS: `deleteTree` 는 outbox 를 쓰지 않아야 한다.
8. **관리자 "삭제된 트리(7일)"** 는 `/api/admin/trees?visibility=public` 응답에서 `deleted_at` 있는 항목으로 거른다(03 §3.6 에 별도 목록 경로 없음). SA/SS 가 유예 중 트리를 그 목록에 `deleted_at` 과 함께 넣어 줘야 보인다.
9. **mock/sync.ts·mock/shared.ts 1줄씩**(오케스트레이터 허용, 커밋 f6dfda0 "임시, CS 삭제 예정").
10. 06 QA #8 #17 #18 #20 #22 처리(admin.css·account.css·감사 로그 최신순 정렬).

## 결과 (2026-11-08)

- typecheck 0 / lint 0 경고 / check ok / build ok. `grep mock` (account·admin·me.ts) 0건, `fetch(` = `src/core/api.ts` 만.
- 임시 Playwright(Edge, `page.route('/api/**')` 03 §3.6 모양, Vite 5181) 27개 단언: 데스크톱 26 PASS + coarse(390·hasTouch) 실행에서 2단계 버튼 44px PASS. (데스크톱 실행의 44px 은 `--tap: auto` 라 해당 없음, coarse 실행의 상단 닉네임은 ≤760 숨김이라 해당 없음.)
  - providers 비활성·툴팁·fake 2버튼·`return_to` → "로그인됨" 토스트 → 세션 2개 → 닉네임 400 field 1줄 → 변경 상단 반영 → 탈퇴 2단계 POST `/api/me/delete` → 비로그인 / 비관리자 `#/admin`→`#/` / 관리자 대시보드 8카드·14막대, 사용자 50 → 더 보기 52, 정지 2단계 POST suspend 반영, 공개 트리 2 + 삭제 1 분리, 신고 기각, 삭제 트리 복구, 감사 최신순, 공지 저장 → PUT settings + refreshMe, `.dot` 반경 0, 처리방침 "운영자 설정 필요".
- **SA 머지 후 확인**: 실서버 `/api/auth/fake/start` 왕복·`/api/me`·세션·관리자 응답 실제 모양.
