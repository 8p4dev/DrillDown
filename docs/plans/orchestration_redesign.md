# 오케스트레이션 plan — 재설계 구체화 (흑백+초록/빨강, 계정·공유·관리자)

작성: 2026-11-08, 오케스트레이터. 이전 작업(`orchestration_liquid_glass.md`)은 사용자 지시로 **전부 폐기**했다(0차 커밋).

요구사항(사용자 원문):
> 리퀴드 디자인은 전부 폐기 / 흰색, 검은색, 초록, 빨강 위주의 색 사용 / 사각형 (최소한의 필렛) 위주 레이아웃 / 마이크로 인터렉티브, 최소한의 텍스트로 사용자가 직관적으로 이해할 수 있는 디자인 / 라이트/다크 모드 전환 기능 추가 / 리소스 최소한으로 사용하도록 / 모바일, pc 레이아웃 고려 (특히 모바일에서 키보드가 켜졌을 때 고려) / 상용 사용 가능한 무료 폰트 중 가독성 좋은 폰트 / 로그인, 계정 관련 기능(프로필 이미지, 등...) / 관리자 페이지 / 트리 저장, 프라이빗, 공개, 링크 기능 등
> /orchestration, 서브 에이전트 이용해서 스스로 아이디어를 구체화, 보강 하고 스스로 검증하도록 해서 아이디어 구체화, 보강해줘

## 0. 이번 작업의 산출물

**이번 오케스트레이션의 산출물은 코드가 아니라 설계 문서다**(가정 A1). 사용자가 요청한 것은 "아이디어 구체화·보강·검증"이다. 결과는 `docs/specs/0N_*.md` 5개 + 종합 `docs/specs/00_overview.md`이며, 구현은 사용자가 문서를 확인한 뒤 다음 오케스트레이션에서 한다. 0차에서 리퀴드 글래스 코드만 삭제했다.

## 1. 요구사항 구체화와 완료 기준

| # | 요구사항 | 담당 | 구체화 | 완료 기준(문서가 담아야 할 것) |
|---|---|---|---|---|
| R0 | 리퀴드 디자인 폐기 | 오케스트레이터 | `src/looks`, `tools/look`, 시안 선택기, SVG 필터, `LOOK` 시드, `--depth` 훅 삭제 | 0차 커밋. typecheck·lint·build·E2E 13개 통과 |
| R1 | 흰·검·초록·빨강 위주 색 | DS | 흰/검 = 바탕·글자·조작, 초록 = 정답·숙련·성공, 빨강 = 오답·위험·삭제. 파랑 accent 제거. 숙련도 4단계(초록·연두·없음·빨강)와 에디터 오답 농도(`--heat`)를 이 팔레트 안에서 표현 | 라이트·다크 토큰 표 전체(hex), 모든 글자/바탕 쌍의 대비 4.5:1(큰 글자 3:1) 계산값, 숙련도 단계의 색 아닌 두 번째 단서, 기존 토큰 이름과의 대응표 |
| R2 | 사각형, 최소 필렛 | DS | `--radius-*` ≤ 2px, 캡슐·원형 제거(아바타 포함). 선과 면으로 위계 | 컴포넌트별(버튼·입력·카드·탭·배지·토스트·메뉴·카드 노드) 형태 규칙과 상태(기본·호버·눌림·포커스·비활성) 표 |
| R3 | 마이크로 인터랙션, 최소 텍스트 | DS(언어) + LM(배치) | 글자 대신 아이콘+동작으로 뜻을 전달. 모든 아이콘은 `aria-label`과 길게 누르기/호버 툴팁. 인터랙션은 상태 변화를 알려 주는 것만(장식 금지), reduced-motion 대응 | 화면별 텍스트 인벤토리(현재 → 바꾼 뒤), 아이콘 목록(SVG 인라인, 개수·바이트), 인터랙션 카탈로그(트리거·변화·지속시간·이징·reduced-motion 대체) |
| R4 | 라이트/다크 전환 | DS | 시스템 자동 + 수동 3상태(자동·라이트·다크). `:root[data-theme]` + localStorage, FOUC 없는 부팅 스크립트, `theme-color`·`color-scheme` 동기화 | 상태 기계, 저장 키, 부팅 순서, 토글 위치·모양(LM과 합의), E2E로 확인할 항목 |
| R5 | 리소스 최소 | DS(폰트·아이콘·CSS) + LM(레이아웃) + AA(서버) | 첫 로드 바이트 예산, 폰트 전략(시스템 vs 서브셋 웹폰트 **측정 비교**), 아이콘 인라인 SVG, 애니메이션은 transform/opacity만, 서버는 Pi 1대 | 현재 번들 크기(`dist`) 기준선과 목표치, 폰트 후보별 실제 woff2 크기(서브셋 포함), 제외한 의존성 목록 |
| R6 | 모바일·PC, 키보드 열림 | LM | 6개 기존 화면 + 새 화면(로그인·계정·관리자·공유 보기)의 390/768/1440 레이아웃. 키보드가 열렸을 때 입력칸이 가려지지 않고 하단 바(`.dnd-dock`, `.flash-nav`, 에디터 도구)가 키보드 위로 올라오거나 숨는 규칙. `interactive-widget`, `visualViewport`, `dvh`, 16px 입력, iOS Safari 차이 | 화면×폭 와이어(ASCII 또는 표), 입력칸 인벤토리와 키보드 열림 시 동작, 브라우저별 전략표, 수동 기기 체크리스트, 자동화 가능한 검사 |
| R7 | 상용 무료·가독성 폰트 | DS | SIL OFL 등 상업 사용 허용 한글 폰트 후보(Pretendard, IBM Plex Sans KR, Noto Sans KR, SUIT, Wanted Sans 등) + 시스템 스택. 가독성 근거(x-height, 한글 자폭, 숫자 구분), 라이선스 원문 확인 | 후보 비교표(라이선스 출처 URL, 크기, 가독성 근거, 다크 모드 가중치), 결정과 fallback 스택, 서브셋 방법 |
| R8 | 로그인·계정(프로필 이미지 등) | AA | OAuth만(Google·Kakao), 비밀번호 없음. 저장 최소(제공자 sub·닉네임·아바타). 세션 = httpOnly 쿠키. 계정 화면: 닉네임·아바타(초기값은 제공자 이미지 또는 생성 아바타)·연결 계정·데이터 내보내기·탈퇴. 로그인 없이도 로컬 사용은 그대로 | 흐름도(로그인·로그아웃·탈퇴·재로그인 시 로컬 데이터 병합), 테이블·API, 개인정보 인벤토리, 위협·대응표, 비용 |
| R9 | 관리자 페이지 | AA | 운영자 1~2인용. 사용자 수·가입 추이, 사용자 검색·정지·삭제, 공개 트리 목록·숨김(신고 처리), 서버 상태(디스크·백업 최근 성공), 공지 1줄. `role=admin` 허용목록 | 화면 목록과 각 화면의 데이터 출처(테이블·쿼리), 권한 매트릭스, 감사 로그 |
| R10 | 트리 저장·비공개·공개·링크 | SH | 로컬 우선 유지. 로그인하면 트리가 서버에 저장·여러 기기 동기화. 공개 범위 `private / unlisted(링크) / public(갤러리)`. 공유 보기 `/t/<slug>`는 로그인 없이 열람·플래시·퀴즈 가능, "내 트리로 복제". 공동 편집 없음 | 동기화 모델(변경 큐, 노드 단위 LWW, 삭제·순서 충돌 시나리오표), 서버 스키마와 API, URL·slug 규칙, 권한 매트릭스, 복제 시 SRS 처리, 용량 추정 |
| R11 | 스스로 검증 | 전원 + RV | 각 문서에 "검증" 절(요구사항 대조표, 코드베이스 대조, 근거 출처, 직접 측정). 2차에 RV가 네 문서를 교차 검토해 충돌·누락·비용 초과를 찾고, 3차에 담당자가 고친다 | RV 보고서의 심각도별 발견 0건 미해결(또는 사용자 결정 사항으로 분류) |

## 2. 가정 및 미결

- **A1** 산출물은 설계 문서다(§0). 구현은 다음 오케스트레이션.
- **A2** 프롬프트 `{{N}}` 미기입 → 1차 4명 + 2차 검증 1명.
- **A3** 서버는 `drilldown-biz/brief/decisions.md` 6~9(수익화 목표 폐기, 자체 호스팅 라즈베리파이, LLM 채점 없음)와 `11_cost_recovery.md` §2(Pi 5 + Cloudflare Tunnel)를 따른다. 스택 세부(Postgres vs SQLite, 프레임워크)는 AA가 비교해 추천한다.
- **A4** 로그인은 OAuth만(Google·Kakao). 이메일·실명·전화번호를 저장하지 않는다(11 §6). 네이버·애플 로그인은 미결로 남긴다.
- **A5** 관리자는 운영자 1~2인 전용이다. 일반 사용자에게 보이는 관리 기능은 없다.
- **A6** 색은 4색 위주라는 뜻이지 4색만 쓴다는 뜻은 아니다. 회색 단계(흰·검의 혼합)는 허용한다. 초록·빨강 외의 유채색(파랑·노랑·보라)은 쓰지 않는다. `orchestration_modes.md` §0(에디터 노드는 오답 붉은 농도만, 숙련도 색은 플래시만) 유지.
- **A7** "리소스 최소"는 ① 클라이언트 첫 로드 바이트·런타임 CPU ② 서버 사양·월 비용 둘 다를 뜻한다. 웹폰트는 측정값으로 결정한다(DS).
- **A8** 문서 작업이라 E2E는 0차 코드 삭제 후 1회만 실행한다. 하위 에이전트는 E2E를 실행하지 않는다.
- **A9** "링크 기능" = unlisted 공유 + 읽기 전용 보기 + 복제. 공동 편집은 decisions 4에 따라 제외.
- **A10** 로컬(Dexie)이 기준이고 서버는 백업·공유·여러 기기용이다(R4 #13). 오프라인 학습은 계속 된다.
- **A11** 사용자가 지난 보고에 언급된 기존 버그 2건(접힌 가지 빈칸 누락, 모바일 배지 탭)은 이번 범위가 아니다.
- 미결(사용자 결정): 네이버·애플 로그인 여부, 공개 갤러리 운영 여부(신고·저작권 부담), Pi 보유 여부, 도메인.

## 3. 공유 계약

### 3.1 문서 형식 (모든 spec 공통)
파일: `docs/specs/01_design_system.md`(DS), `02_layout_mobile.md`(LM), `03_account_admin.md`(AA), `04_tree_sharing_sync.md`(SH), `05_review.md`(RV). 절 순서:
1. 목적과 범위 (담당 요구사항 번호)
2. 결정 요약표: | 항목 | 결정 | 대안 | 근거 |
3. 상세 설계 (하위 절은 자유)
4. 화면별 적용: 목록·에디터·플래시·복습·빈칸·백지·로그인·계정·관리자·공유 보기
5. 검증: (a) 요구사항 대조표 | 요구 | 어디서 충족 | 증거 | (b) 코드베이스 대조(현재 코드가 어떻게 바뀌어야 하는지, 파일 단위) (c) 직접 측정·계산 결과 (d) 스스로 찾은 약점과 보완
6. 미결·사용자 질문
7. 출처 (URL + 확인일)
문장마다 근거 등급을 붙인다: **[결정]** 이 문서가 정함 / **[제안]** 담당자 추천, 오케스트레이터 확인 필요 / **[가정]** 확인 안 됨 / **[출처 n]** 외부 근거 / **[코드]** 현재 코드 사실.
구현 공수는 S(반나절)·M(1~2일)·L(3일+)로 적는다.

### 3.2 용어와 이름
- 화면: `목록`(TreeListPage) `에디터` `플래시` `복습` `빈칸`(DndPage) `백지`(BlankDndPage) + 신규 `로그인` `계정` `관리자` `공유 보기`(`/t/<slug>`) `갤러리`(public 목록, 미결)
- 라우트: 해시 라우터(`src/router.ts`). 신규 라우트 이름은 `login` `account` `admin` `shared`로 제안하되 확정은 구현 때.
- 테마: `:root[data-theme='light'|'dark']`, 없으면 시스템. 저장 키 `theme`. DS가 정의하고 LM은 토글 배치만 정한다.
- 토큰: 기존 이름 유지(`--bg --surface --surface-2 --border --border-strong --text --text-2 --muted --ok --danger --radius-* --shadow-* --fs-* --nav-h --tap --t-* --ease-*`). `--accent`는 DS가 폐기 또는 재정의를 결정한다. `--warn`은 폐기 후보(노랑).
- 브레이크포인트: 모바일 ≤ 760px, 에디터 1단 ≤ 860px(현행 유지).
- 숙련도 단계: `green`(자동 정답 반복) `lightgreen`(알음·1회) `none` `red`(오답). 데이터 훅 `data-color`, `--heat`(0~1) 유지.

### 3.3 서버 모델 (AA·SH 공용 이름, 변경은 오케스트레이터만)
- 접두사 `/api/*`, JSON. 인증은 httpOnly·SameSite=Lax 세션 쿠키. 모든 ID는 UUID, 클라이언트 생성 허용(현재 `crypto.randomUUID()`).
- `users(id, provider 'google'|'kakao', provider_sub, nickname, avatar_url NULL, role 'user'|'admin', created_at, last_seen_at, suspended_at NULL, deleted_at NULL)` — **AA 소유**
- `sessions(id, user_id, created_at, expires_at, ua)` — AA 소유
- `trees(id, owner_id, title, visibility 'private'|'unlisted'|'public', slug NULL UNIQUE, updated_at, deleted_at NULL)` / `nodes(id, tree_id, parent_id, order, title, note, aliases JSON, collapsed, offset JSON, width, updated_at, deleted_at NULL)` — **SH 소유**. 클라이언트 `TreeNode`(`src/core/types.ts`)와 필드 이름을 맞춘다.
- `srs`, `attempts`, `events`의 서버 저장 여부와 형태는 SH가 정한다(사용자별, 공유 대상 아님).
- 관리자용 집계·감사(`audit_log`)는 AA 소유. SH의 "공개 트리 숨김"은 `trees.hidden_by_admin_at`을 AA가 요청해 SH 스키마에 넣는 식으로, **상대 소유 테이블에 필드가 필요하면 자기 문서에 "요청" 표로 적고 오케스트레이터가 통합 때 반영한다.**
- 권한 역할: `anon`(비로그인) `owner` `user`(로그인한 타인) `admin`. 두 문서 모두 같은 역할명으로 매트릭스를 쓴다.

### 3.4 코드베이스 사실 (읽기 전용)
- 로컬 저장: Dexie 5 테이블(`src/core/db.ts`), 타입 `src/core/types.ts`, 저장소 함수 `src/core/repo.ts`.
- 화면 CSS: `src/index.css`(토큰·공통) + 기능별 lazy CSS(`editor.css` `treelist.css` `flash.css` `dnd.css` `tree-header.css`). 폰트는 시스템 스택, 웹폰트 없음. PWA(`vite-plugin-pwa`), 아이콘 없음.
- 입력칸: 에디터 노드 제목 `input.title-input`, 내용 `textarea`(EditorPage 558·631), 목록 새 트리·이름 변경 `input`. 하단 고정 UI: `.dnd-dock`(sticky, 38dvh) `.flash-nav` 에디터 `.side`.
- 이전 사용자 결정: `orchestration_modes.md` §0. 사업 전제: `../drilldown-biz/brief/decisions.md`, `../drilldown-biz/reports/11_cost_recovery.md`, `04_tech.md` §4(데이터 모델 초안), 연구 `docs/research/R4_platform.md`(#9 #10 #13), `feature_backlog.md`.

## 4. 작업 분할

| 에이전트 | 담당 요구사항 | 수정 소유 파일 | 읽기만 하는 파일 | 선행 의존성 |
|---|---|---|---|---|
| (오케스트레이터) | R0, plan, 통합, `00_overview.md` | 0차 삭제 파일들, 이 문서, `docs/specs/00_overview.md`, `docs/specs/README.md` | 전부 | — |
| DS | R1 R2 R3(언어) R4 R5(클라이언트) R7 | `docs/specs/01_design_system.md`, `docs/specs/evidence/ds/**`, `docs/plans/agent_DS_design.md` | `src/**`, `docs/**`, `../drilldown-biz/**` | 0차 커밋 |
| LM | R3(배치) R6 R5(레이아웃) | `docs/specs/02_layout_mobile.md`, `docs/specs/evidence/lm/**`, `docs/plans/agent_LM_layout.md` | 같음 | 0차 커밋 |
| AA | R8 R9 R5(서버) | `docs/specs/03_account_admin.md`, `docs/specs/evidence/aa/**`, `docs/plans/agent_AA_account.md` | 같음 | 0차 커밋 |
| SH | R10 | `docs/specs/04_tree_sharing_sync.md`, `docs/specs/evidence/sh/**`, `docs/plans/agent_SH_sharing.md` | 같음 | 0차 커밋 |
| RV | R11 | `docs/specs/05_review.md`, `docs/plans/agent_RV_review.md` | 전부 | 1차 머지 |

웨이브: 0차 오케스트레이터(폐기+plan 커밋) → 1차 DS·LM·AA·SH 병렬 → 머지 → 2차 RV 교차 검증 → 3차 담당자 수정(`send`로 전달, 같은 워크트리) → 머지 → 4차 오케스트레이터 종합·보고.

작업 규칙(공통):
- `src/**`·설정·의존성은 **수정하지 않는다**. 측정용 임시 코드는 자기 워크트리에서 실행만 하고 커밋하지 않는다(필요한 스크립트·스크린샷은 `docs/specs/evidence/<id>/`에 200KB 이하로).
- dev 서버가 필요하면 자기 포트를 쓴다: DS 8021, LM 8022, AA 8023, SH 8024, RV 8025 (`npm run dev -- --port <p> --strictPort`). Playwright 스크린샷은 `npx playwright screenshot` 또는 임시 spec으로 찍되 `e2e/`는 건드리지 않는다.
- 외부 자료는 URL과 확인일을 적는다. 라이선스는 원문(LICENSE 파일·공식 페이지)을 확인한다.
- 웹 검색은 담당 주제에 한한다.

## 5. 머지 순서와 통합 검증

1. 1차: 완료 순서대로 머지(파일 겹침 없음). 머지마다 `npm run typecheck && npm run lint && npm run build`(코드 무변경 확인용) + 문서 링크 확인(`grep`으로 상대 경로 존재 확인).
2. 2차: RV 머지 후 발견 사항을 심각도(높음·중간·낮음)로 분류. 높음·중간은 담당자에게 `send`, 낮음은 오케스트레이터가 `00_overview.md`에 적는다.
3. 3차: 수정 머지. RV 발견 사항 표에 처리 결과를 적는다.
4. 4차: `00_overview.md`(결정 요약, 화면 지도, 구현 단계 제안, 사용자 질문) 작성 → 사용자 보고.
5. E2E: 0차 커밋 직후 1회(13개). 이후 코드 변경 없음(A8).

## 6. 결과

(통합 후 기록)

### 진행 기록
- 0차 커밋 e52f5b0 (2026-11-08). typecheck·lint·build 통과. E2E 13/13 통과(16.5s, Edge).
- 1차 분배 (Orca run `run_b6832e7652c4`, 워커 포트 8021~8024):

| 에이전트 | 워크트리 | dispatch |
|---|---|---|
| DS | `C:/Users/User/orca/workspaces/app/agent-DS-design` | `ctx_e635df9c7786` |
| LM | `C:/Users/User/orca/workspaces/app/agent-LM-layout` | `ctx_5325d3cc93a6` |
| AA | `C:/Users/User/orca/workspaces/app/agent-AA-account` | `ctx_671bd72d2d0e` |
| SH | `C:/Users/User/orca/workspaces/app/agent-SH-sharing` | `ctx_31aedc7369af` |
