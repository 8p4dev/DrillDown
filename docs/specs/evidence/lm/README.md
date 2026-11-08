# evidence/lm — 레이아웃·키보드 측정 증거 (2026-11-08)

문서: `docs/specs/02_layout_mobile.md` §5(c). 모두 라이트 모드, deviceScaleFactor 1, Edge 채널 Playwright 1.65, dev 서버 `http://127.0.0.1:8022`.

## 파일

| 파일 | 내용 |
|---|---|
| `shots.mjs` | 측정 스크립트. 시드(개요 붙여넣기 18노드 + 플래시 `모름` 1회) → 6화면 × 3폭 스크린샷 + `getBoundingClientRect` 기록 → 키보드 7케이스 × 2모델. `e2e/`와 무관한 독립 스크립트 |
| `measure.json` | `screens[]`(화면×폭: 뷰포트·문서 크기·주요 요소 rect·position) + `keyboard[]`(케이스×모델: 활성 입력칸 rect·font-size, 가려진 요소 `hidden`) |
| `<화면>-<폭>.jpg` × 18 | 목록·에디터·플래시·복습(세션)·빈칸·백지 × 390·768·1440 |
| `kb-B-<케이스>.jpg` × 7 | 모델 B(뷰포트 844 유지 + 하단 336px 키보드 오버레이 = iOS Safari·Chrome Android 기본 `resizes-visual`) |
| `kb-A-editor-<케이스>.jpg` × 4 | 모델 A(뷰포트 844→508 = Firefox Android·`resizes-content`). 에디터 4케이스만 보관(목록·범위 select는 차이 없음) |

## 재현

```sh
npm ci
npm run dev -- --port 8022 --strictPort --host 127.0.0.1
node docs/specs/evidence/lm/shots.mjs <출력폴더>            # 전체
CASES=editor-card-title node docs/specs/evidence/lm/shots.mjs <출력폴더>   # 키보드 케이스 1개만
```

## 한계

- 시각 뷰포트 축소·브라우저의 포커스 스크롤·iOS 확대 판정은 에뮬레이션되지 않는다. 모델 B의 "가려짐"은 브라우저가 스크롤하지 않았을 때의 위치다.
- 키보드 높이 336px 한 값만 썼다(근거는 문서 §3.4).
