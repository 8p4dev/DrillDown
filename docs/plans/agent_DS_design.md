# 에이전트 DS plan — 디자인 시스템 설계 문서

작성: 2026-11-08. 상위: `orchestration_redesign.md` §1 R1·R2·R3(언어)·R4·R5(클라이언트)·R7, §3 공유 계약, §4 작업 규칙.
산출물은 **문서와 증거**다. `src/**`·설정·의존성은 건드리지 않는다.

## 접근 방식

- **색**: 무채색 회색 단계 + 초록·빨강 두 유채색. 파랑 `--accent`는 폐기하고 "강조 = 전경색(검정/흰색)"으로 재정의한다. 대안: 파랑을 남기고 채도만 낮추기 → 요구사항 R1("파랑 accent 제거")에 어긋나 기각. 초록·빨강은 WCAG 대비를 먼저 만족하도록 Node 스크립트로 hex를 탐색해 정한다(감각이 아니라 계산으로).
- **색각 보조**: 숙련도 4단계는 색 + **테두리 패턴/마크**(실선·점선·없음·X 표식)로 이중 부호화. 적록 색각 시뮬레이션은 Machado 2009 행렬(deuteranopia)을 Node 스크립트로 적용해 색 사이 거리(ΔE)를 계산한다. 스크린샷 변환 대신 계산을 택한 이유: 의존성 0, 재현 가능.
- **형태**: 반경 0/2px, 그림자 전부 삭제 → 1px 선(`--border`/`--border-strong`)과 면 단계(`--bg`/`--surface`/`--surface-2`)로 위계.
- **폰트**: 후보 woff2를 공식 배포(GitHub 릴리스·jsDelivr·Google Fonts CSS API)에서 scratch로 직접 받아 바이트를 잰다. 서브셋 추정은 KS X 1001 2,350자 기준 + 다이나믹 서브셋 청크 수를 CSS에서 센다. 결론은 바이트와 캐시 전략으로.
- **아이콘**: Lucide(ISC) 중 필요한 것만 인라인 SVG로 복사(의존성 0). 라이선스 원문은 GitHub LICENSE를 직접 확인.
- **목업**: 단일 정적 HTML, 토큰을 CSS 변수로 선언, `data-theme` 토글 포함. Playwright `screenshot` CLI로 라이트·다크 PNG(150KB 이하, 필요하면 뷰포트/스케일 조정).
- **대비 계산**: Node 단일 파일 스크립트(`contrast.mjs`)가 토큰 표에서 쌍을 전부 생성해 WCAG 2.x 상대 휘도 대비를 출력(markdown 표). 같은 스크립트가 색각 시뮬레이션도 담당.

## 수정/생성 파일

- `docs/plans/agent_DS_design.md` (이 파일)
- `docs/specs/01_design_system.md`
- `docs/specs/evidence/ds/contrast.mjs` — 대비·색각 계산 스크립트
- `docs/specs/evidence/ds/contrast.md` — 스크립트 출력(표)
- `docs/specs/evidence/ds/fonts.md` — 폰트 바이트 측정표(명령·URL·바이트)
- `docs/specs/evidence/ds/mock.html` — 정적 목업(≤200KB, 외부 요청 0)
- `docs/specs/evidence/ds/mock-light.png`, `mock-dark.png` (각 ≤150KB)
- `docs/specs/evidence/ds/icons.md` — 아이콘 목록·바이트
- `docs/specs/evidence/ds/bundle.md` — `npm run build` 출력 요약(기준선)
- 소유 밖 파일 필요 없음. 폰트 파일은 scratch에만 둔다.

## 단계별 작업

- [x] P0 plan 작성(이 파일)
- [x] P1 현재 코드 읽기: `index.css`·기능 CSS 5개·TSX 라벨 인벤토리·`feel.ts`·`index.html`·`vite.config.ts`
- [x] P2 기준선: `npm run build` → dist JS/CSS/precache 바이트 기록(`bundle.md`)
- [x] P3 팔레트 결정 + `contrast.mjs` 작성·실행 → 위반 0건까지 hex 조정(`contrast.md`)
- [x] P4 색각 시뮬레이션(deuteranopia/protanopia 행렬) → 숙련도 4단계 색 거리 + 비색 단서 확정
- [x] P5 폰트: 후보 6종 라이선스 원문 URL 확인, woff2 다운로드·바이트 측정, 다이나믹 서브셋 청크 추정(`fonts.md`)
- [x] P6 아이콘: Lucide LICENSE 확인, 필요한 아이콘 목록 확정, SVG 바이트 합산(`icons.md`)
- [x] P7 `mock.html` 작성(토큰·카드·노드 heat 3단계·플래시 4단계·버튼 5종·입력·탭·토스트·토글) → Playwright 스크린샷 2장
- [x] P8 `01_design_system.md` 본문: §1~§4 (팔레트·형태표·폰트·아이콘/텍스트 인벤토리·인터랙션 카탈로그·테마 상태 기계·리소스 예산·화면별 적용)
- [x] P9 `01_design_system.md` §5 검증(요구 대조·코드 대조 파일/줄·측정값·약점) §6 질문 §7 출처
- [x] P10 `npm run typecheck && npm run lint && npm run build` 통과 확인(코드 무변경), 파일 크기 확인(200KB/150KB), 커밋

## 검증 방법

| 단계 | 확인 |
|---|---|
| P2·P10 | 빌드 출력의 바이트 수치를 그대로 `bundle.md`에 붙임 |
| P3 | `node contrast.mjs` 출력에서 `FAIL` 0건 |
| P4 | 시뮬레이션 색 사이 ΔE(CIE76) ≥ 20 또는 비색 단서가 있는지 표로 |
| P5 | `curl -sL -o` 후 파일 바이트(`stat`)를 표에 기록; 라이선스는 LICENSE 원문 URL |
| P7 | 스크린샷 파일 존재·크기, 목업 내 외부 URL 0건(`grep -c "http"`) |
| P8·P9 | 문서 내 §5(a) 표에서 R1·R2·R3·R4·R5·R7 완료 기준 열 항목마다 증거 파일 링크 |
| P10 | typecheck·lint·build 종료 코드 0, `git status`에 src 변경 없음 |

## 변경 사항

- P4: 색각 시뮬레이션은 스크린샷 변환 대신 **계산**(Machado 2009 행렬)으로 했다. 브라우저 확장이나 ImageMagick 의존 없이 재현 가능하고, 숫자(ΔE)로 비교할 수 있어서다.
- P5: 폰트 바이트는 일부 후보(IBM Plex Sans KR·Noto Sans KR 정적)를 Google Fonts CSS API의 다이나믹 서브셋 청크로 측정했다. 공식 GitHub 릴리스는 zip 수십 MB라 받지 않고, 실제 서비스가 받는 단위(청크)를 쟀다.
