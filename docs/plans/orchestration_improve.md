# 오케스트레이션: 전 분야 개선 (2026-11-10)

요구: "DrillDown 의 기술적·사용자적 개선 요소를 분야별로 모두 찾아 최적의 해결 방안을 정한 뒤 원스톱으로 구현하고, 끝나면 요약 문서를 쓴다. 사용자에게 묻지 않는다."
근거: 읽기 전용 감사 4건(서버·동기화 F, 편집기 E, 학습 S, 앱 셸·PWA·접근성 H). 모든 항목은 감사자가 코드에서 file:line 으로 확인했다. 오케스트레이터가 S1(재현 스크립트), F1, E1 을 직접 다시 확인했다.

## 1. 요구사항과 완료 기준

각 항목의 완료 기준: (1) 아래 "고침" 열대로 동작한다. (2) 순수 로직이면 `*.check.ts` 단언이 1개 이상 추가돼 있다. (3) typecheck·lint·check·build 가 통과한다. (4) 기존 E2E 20개가 그대로 통과한다(머지 후 오케스트레이터가 확인).

### 1.1 오케스트레이터 선행 작업 (분배 전 커밋)
| id | 문제 | 고침 |
|---|---|---|
| S1 | 서버에서 받은 학습 기록은 `card` 의 날짜가 문자열이라 색 판정·채점이 예외로 깨진다(다른 기기 쓰는 로그인 사용자 전원) | `srs/index.ts` `asCard()` 로 Date 복원 후 ts-fsrs 에 넘김. srs.check 왕복 단언 |
| E6·F8·S15 | 같은 `order` 형제를 화면마다 다르게 정렬 | `core/path.ts` `byOrder`(order, id) 를 모든 형제 정렬에 사용(repo·layout·dnd·kit·EditorPage) |
| S6·E12(일부) | `descendantsOf` O(n²) (5,000노드 240ms) | `core/path.ts` `childIndex()` 로 O(n) |

### 1.2 편집기 (WE) — E 감사
| id | 고침 |
|---|---|
| E1 | 실행 취소·다시 실행으로 되살린 노드에 새 `updatedAt` → 서버 LWW 에서 이기도록 |
| E2 | `dd:remote` 수신 시 undo/redo 스택 비움(다른 기기 변경을 되돌려 지우지 않게) |
| E3·F2 | 노드 삭제를 되돌리면 학습 기록도 돌아온다(삭제 시 srs 를 모듈 Map 에 보관, 되살릴 때 새 `updatedAt` + `track`) |
| E4·F5 | 내용 5,000자(`CAP.note`) 를 편집기에서 막음(초과 입력 시 토스트) + 개요 가져오기·루트 메모 합치기에서 잘라냄 |
| E5 | 새 트리·이름 변경 입력 `maxLength={CAP.title}` |
| E6 후속 | `orderAfter` 중간값이 이웃 사이에 엄밀히 들어가지 않으면 형제 0..n 재번호 |
| E7·E12 | `visibleRows`·`cloneBranch`·`nodesToOutline` 을 `childIndex` 로 O(n) |
| E8 | 끌기 시작 임계값을 화면 px 로(배율과 무관) |
| E10 | Backspace 도 삭제(맥), 단축키 시트에 `?`·Ctrl+Y |
| E11 | 개요 복사 토스트에 "여러 줄 내용 N개 제외" |
| E13 | Ctrl/⌘+K 로 검색 열기, 검색이 내용·별칭도 찾음 |
| E14 | 가져오기 패널에 "AI 프롬프트 복사"(들여쓰기 개요를 요청하는 고정 문구) |
| E15 | 낡은 별칭 주석 수정, 호출처 없는 `addAlias` 삭제 |
| E16 | `dd:remote` 때 학습 기록(색)도 다시 읽음 |
| E17 | 제목 없는 노드 토스트 `'제목 없음'` |
| E18 | 배율 버튼 `aria-label` |
| E19 | 한글 조합 중 Enter 판정 헬퍼 하나로(TreeListPage 이름 변경 포함) |
| E21 | 잘라낸 것이 없을 때 캔버스 Ctrl+V 는 클립보드 개요를 선택 노드 아래로 붙여넣기 |
| F11 | 로컬 `events` 180일 지난 행 정리(`purgeDeletedTrees` 에서) |

### 1.3 학습 (WS) — S 감사
| id | 고침 |
|---|---|
| S2 | 플래시 "다시 평가"가 복습을 두 번 기록하지 않음(첫 평가 전 상태를 기준으로 다시 계산) |
| S3 | 채점 저장 실패 시 토스트 + 화면 평가 되돌림(플래시·빈칸·백지) |
| S4 | '모름만 다시' 라운드도 새로고침 후 이어 하기 |
| S5 | '모름만 다시' 라운드에서 '더 깊이'가 1번 카드로 튀지 않음 |
| S7 | 지워진 노드는 채점 기록을 쓰지 않음(`recordGrade` 트랜잭션에서 노드 확인), 복습·플래시가 `dd:remote` 때 다시 읽음 |
| S8 | 복습 끝 요약(알음/모름 수, 모름 목록) |
| S9 | 약점 집중 세션: `miss>0` 인 개념만, 많이 틀린 순(플래시 헤더·요약에 버튼) |
| S10 | 오늘의 복습 한 번에 20개 + "더 하기" |
| S11 | 퀴즈 카드 `aria-pressed`, 채운 칸 `role="group"`, Esc 로 선택 해제 |
| S13 | 플래시 진행 수 분모 고정 |
| S14 | 채점하면 상단 복습 배지 갱신(계약 C3 `dd:due`) |
| S16 | 타이핑 설계 잔재 함수 삭제(`nextConcept`, `isBranchComplete`, recheck 분기). 저장 필드와 `GradeSource` 타입은 유지 |
| S17 | '더 깊이' 버튼 모바일 44px |
| S18 | 빈칸·백지 채점을 트랜잭션 1회로(`recordResults`) |
| S19 | 루트만 있는 트리는 빈 상태 안내(편집으로 링크), 복습 섞기 |
| H5(공유 보기)·H8 | SharedPage 링크 복사 실패 토스트, '더 보기' 메뉴 역할 제거 + Esc 닫기 |

### 1.4 서버·동기화 (WY) — F 감사
| id | 고침 |
|---|---|
| F1 | `/api/*` 요청 본문 상한(`hono/body-limit`, `LIMITS.bytes + 64KB`) — 익명 메모리 소진 차단 |
| F3 | pull `since > 현재 seq` 이면 410(전체 재동기화), SQLite `synchronous=FULL` |
| F4 | 410 재동기화 때 서버에 없는 로컬 트리는 최근 7일 안에 고쳤거나 outbox 에 있을 때만 다시 올림. 나머지는 로컬 휴지통으로(7일 복구 가능) |
| F7 | 트리 제목 = 루트 노드 제목: 서버 push 가 루트 노드 제목으로 트리 제목을 맞추고, 클라이언트 applyRemote 가 루트 노드 적용 시 로컬 트리 제목을 맞춤(track 없이) |
| F9 | 보안 헤더(`hono/secure-headers`, CSP 제외) |
| F10 | 요청 로그에서 공유 slug 가림 |
| F12 | 카카오 연결 해제 웹훅의 수 제한 분리 |
| F13 | 정지된 사용자의 공개 트리는 갤러리·`/t/` 에서 숨김 |
| F14 | 탈퇴 정리 때 `reports.reporter_id` 비움 |
| F15 | 일일 작업에서 사용자 하나 실패가 나머지를 막지 않음 |
| F16 | 외부 백업 설정이 있는데 도구가 없으면 `ok=false` |
| F17 | 다른 계정으로 새로 시작할 때 로컬 `events` 도 비움 |
| F18 | 백업 가져오기 행에 새 `updatedAt`(서버 톰스톤에 지지 않게) |
| H22(일부) | engine.ts `MAX_BYTES` 주석 2MB |

### 1.5 앱 셸·PWA·접근성·문서 (WH) — H 감사
| id | 고침 |
|---|---|
| H1 | `startViewport()` 를 App 에서 1회(모든 화면에서 모바일 키보드 높이 반영) |
| H2·F6 | 병합 시트는 닫을 수 없게(선택 강제) — 닫아서 동기화가 영영 안 도는 문제 |
| H3 | 앱 전체 오류 경계(새로 고침 버튼) |
| H4 | PWA 아이콘 PNG 192·512·maskable 512, manifest, `apple-touch-icon` |
| H5 | ShareSheet 링크 복사 실패 토스트 |
| H6 | 갤러리 첫 페이지 실패 시 다시 시도 버튼 |
| H7 | 시트 안 Tab 포커스 가두기 |
| H9 | 공지 배너 줄바꿈, 닫기 44px |
| H10 | 상단 링크 `aria-current="page"` |
| H11 | 공유 목록 버튼 44px |
| H12 | 첫 화면에서 `icons.all` 빼기(아이콘 3개를 `icons.ts` 로) |
| H13·H14·H15 | 관리자 쿼리 정리, 차트 role, 같은 이름 버튼에 대상 포함 라벨(계정 휴지통 포함) |
| H16 | e2e 를 typecheck 에 포함 |
| H17~H22 | README 교체, 안 쓰는 `public/icons.svg`·`ui/Hint.tsx`·`--accent*` 삭제, `me.ts` 호환 심 정리, 낡은 주석·문서(index.css·Banners·admin.css·specs README·00_overview) |
| S14 | App 이 `dd:due` 를 들으면 복습 배지 다시 셈 |

### 1.6 뺀 것 (이유)
| id | 이유 |
|---|---|
| E9 터치로 카드 끌기 → 길게 누르기 | 제스처 변경. 실기기 확인 없이 바꾸면 기존 사용감이 깨질 위험(중). 실기기 검증 때 |
| E20 EditorPage 분할 | 순수 이동 리팩터링. 이번 병렬 수정과 충돌만 키움. 다음 단계 |
| E22 트리 만들면 바로 열기 | 흐름 변경(E2E 가 목록 유지 가정). 효과 대비 위험 |
| S12 모바일 트레이 세로 스크롤 | 끌기 제스처와 충돌. 실기기 필요 |
| `attempts` 동기화 경로 삭제 | 서버 스키마·검증과 얽힘. 지금 해가 없음 |
| CSP | 인라인 테마 스크립트·Vite 산출물 해시 관리 필요. 보안 헤더만 먼저 |
| 편집기 가상화(보이는 카드만 DOM) | L. 보기 깊이 제한으로 대응 중 |

## 2. 가정
- 사용자 질문 금지 지시에 따라 정책 판단은 아래로 정했다.
  - F13: 정지된 사용자의 공개 트리는 숨긴다(운영 숨김과 같은 효과, 해제하면 복귀).
  - F4: 장기 오프라인 기기의 "서버에 없는 트리" 는 지우지 않고 로컬 휴지통으로(7일 복구). 최근 7일 안에 고친 트리는 다시 올린다.
  - H2: 병합 시트는 선택 전에는 닫히지 않는다(스펙 MergeDialog 머리 주석과 같은 의도).
  - S10: 복습 1회 20개(개념 단위). 설정 화면은 만들지 않는다.
  - H4: 아이콘은 기존 `public/favicon.svg` 를 래스터화해 만든다(새 디자인 없음).
- 워커 수 4. 메모리가 빠듯한 PC(여유 약 12GB)라 4개로 제한한다.

## 3. 분할 (배타 소유)
| 에이전트 | 담당 | 수정 소유 파일 | 읽기만 | 선행 |
|---|---|---|---|---|
| WE 편집기 | §1.2 | `src/features/editor/**`, `src/features/TreeHeader.tsx`·`tree-header.css`, `src/core/outline.ts`·`outline.check.ts`, `src/core/repo.ts`·`repo.check.ts` | `core/path.ts`, `core/db.ts`, `core/types.ts`, `core/srs/**` | 선행 커밋 |
| WS 학습 | §1.3 | `src/features/flash/**`, `src/features/dnd/**`, `src/core/srs/**`, `src/core/source.ts`, `src/features/share/SharedPage.tsx`·`share.css` | `core/repo.ts`, `core/path.ts`, `editor/graph/layout.ts` | 선행 커밋 |
| WY 서버·동기화 | §1.4 | `server/**`, `src/core/sync/**`, `src/core/sync.ts`, `src/core/backup.ts`·`backup.check.ts`, `src/core/events.ts` | `core/db.ts`, `core/types.ts`, `core/repo.ts` | 선행 커밋 |
| WH 셸·UI | §1.5 | `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html`, `vite.config.ts`, `public/**`, `src/ui/**`, `src/features/Toast.tsx`·`viewport.ts`·`feel.ts`, `src/features/account/**`, `src/features/admin/**`, `src/features/share/**`(SharedPage.tsx·share.css 제외), `src/core/me.ts`, `tsconfig*.json`, `README.md`, `docs/specs/**` | 나머지 | 선행 커밋 |
| 오케스트레이터 | 선행 작업, 머지, E2E, 문서 | `src/core/path.ts`·`types.ts`·`db.ts`·`api.ts`, `src/router.ts`, `e2e/**`, `package.json`, `docs/plans/**`, `docs/CODEBASE.md`, 요약 문서 | | |

## 4. 공유 계약
- **C1 형제 정렬**: 형제 순서는 어디서나 `byOrder`(core/path.ts, repo.ts 가 재수출). 직접 `a.order - b.order` 로 정렬하지 않는다. 자식 목록이 여러 번 필요하면 `childIndex(nodes)`.
- **C2 학습 기록 날짜**: `NodeSrs.card` 는 Date 일 수도 문자열일 수도 있다. ts-fsrs 에 넘길 때는 반드시 `asCard()`(core/srs).
- **C3 `dd:due` 이벤트**: 학습 기록을 쓴 뒤(`recordGrade`/`recordResults` 성공 후) WS 가 `dispatchEvent(new Event('dd:due'))`. WH 의 App 은 `dd:due`·`dd:remote` 에서 복습 수를 다시 센다.
- **C4 E2E 셀렉터**: `orchestration_p1.md` §3 C4 목록(라벨 '새 트리 제목'·'개요 텍스트'·'선택 노드의 자식으로 추가', `li[data-tree-id]`, '편집'·'플래시카드' 포함 링크, '더 보기', `.node-row[data-node-id]`, `.node-title`, `[data-drop="tray"]`, `[data-card]`, `.sync-status[data-kind]`)은 유지. 세로 보기 버튼 `aria-label="세로 보기"` 도 유지.
- **C5 학습 기록 API**(WS 소유, 다른 워커는 호출만): `recordGrade` 는 기존 호출 형태를 유지한다. 새 함수는 추가만 한다(예: `recordResults`, 다시 평가용 기준 인자). `StudySource` 를 바꾸면 SharedPage 의 메모리 소스도 WS 가 함께 고친다.
- **C6 되살린 노드**(WE 소유 repo.ts): `putNodes` 시그니처는 유지. 삭제 때 보관한 srs 복원은 repo.ts 내부에서 끝낸다.
- **C7 트리 제목 동기화**(WY): 루트 노드 행이 트리 제목의 기준. 로컬 `trees.title` 보정은 outbox 를 만들지 않는다.
- **C8 서버 정책 상수**: 본문 상한은 `server/sync/map.ts` `LIMITS.bytes` 기준.

## 5. 공통 규칙 (워커 spec 에 포함)
1. 자기 소유 파일만 수정. 다른 파일이 필요하면 `ask` 후 대기. 계약 C1~C8 준수.
2. 새 워크트리에서 먼저 `npm ci`. 지정 포트만 사용(WE 5361/4361, WS 5362/4362, WY 5363/4363, WH 5364/4364). 띄운 프로세스는 PID 로만 종료. 5173 은 사용자 프리뷰. **메모리가 부족한 PC 다**: 개발 서버·브라우저는 확인할 때만 띄우고 바로 끈다.
3. `npm run e2e` 금지(머지 후 오케스트레이터 1회). 필요하면 스크래치 Playwright(`channel:'msedge'`) 로 확인.
4. 완료 전 `npm run typecheck`·`npm run lint`(경고 0)·`npm run check`·`npm run build` 통과. 예산: precache ≤640 KiB, 첫 화면 gzip ≤120KB. 순수 로직은 기존 `*.check.ts` 에 단언 추가. 커밋 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
5. 과설계 금지: 표의 "고침" 범위까지만. 새 의존성 금지. 더 필요해 보이면 하지 말고 worker_done 에 제안.
6. `worker_done`: 커밋 해시, 항목별 확인 방법·수치, 기존 E2E 영향(셀렉터·흐름), 남은 위험.

## 6. 머지 순서와 통합 검증
1. WY(서버·동기화, 다른 워커와 파일 겹침 없음) → 2. WS → 3. WE → 4. WH(App·index.css 등 공용 셸, 마지막에 계약 C3 연결 확인).
- 각 머지 뒤 typecheck·lint·check·build.
- 마지막에 `npm run e2e` 1회(20개 전체: 편집·학습·공유·동기화·모바일 흐름이 모두 바뀌었으므로).
- 추가 확인(스크래치 Playwright): 다른 기기에서 받은 학습 기록으로 플래시 열기(S1), 노드 삭제 → 되돌리기 후 색 유지(E3), 병합 시트 Esc(H2), 본문 3MB POST → 413(F1).
- 결과는 §7 에, 사용자용 요약은 `docs/IMPROVEMENTS_2026-11-10.md`.

## 7. 진행 기록
- 2026-11-10 감사 4건 완료(F18·E22·S19·H22 = 81건). 선행 작업(S1·C1·S6) 커밋 → WE·WS·WY·WH 디스패치
- 선행 커밋 1a0519d. Run run_1fcc74119dbf. 디스패치: WY ctx_ff1831d76ad6 · WS ctx_ac14ca2a6691 · WE ctx_89a86ae088e2 · WH ctx_9fe23836e92a (새 워크트리 agent-W*-improve, base main)
- WH 완료(먼저 도착, 파일 겹침 없어 순서 바꿔 먼저 머지) 1b2a803: H1~H22·S14 25건. 첫 화면 gzip 85.7KB, precache 630.0 KiB(PNG 는 includeManifestIcons:false 로 제외), icons.all 첫 화면 제외. 남김: dismissMerge 는 다른 분기가 써서 유지(MergeDialog 만 닫기 금지), .c-misplaced 는 srs 가 사용 중이라 유지
