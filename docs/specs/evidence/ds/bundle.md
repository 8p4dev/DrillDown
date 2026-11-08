# 번들 기준선 (`npm run build`, 2026-11-08, 코드 변경 없음 — 0차 커밋 e52f5b0)

측정: 이 워크트리에서 `npm ci && npm run build`. 아래는 vite 출력 원문(크기는 비압축 / gzip).

```
vite v8.3.5 building client environment for production...
transforming...
✓ 78 modules transformed.
rendering chunks...
computing gzip size...
dist/registerSW.js                            0.13 kB
dist/manifest.webmanifest                     0.17 kB
dist/index.html                               1.43 kB │ gzip:  0.58 kB
dist/assets/layout-pxRzImAR.css               1.42 kB │ gzip:  0.63 kB
dist/assets/TreeListPage-BmmYtOCr.css         5.58 kB │ gzip:  1.65 kB
dist/assets/useDragDrop-CpqQ5jvX.css          8.60 kB │ gzip:  2.32 kB
dist/assets/index-ByAG9FYf.css               10.31 kB │ gzip:  3.16 kB
dist/assets/EditorPage-MbhifXW9.css          11.38 kB │ gzip:  3.16 kB
dist/assets/flash-Deb7ry6N.css               12.30 kB │ gzip:  3.07 kB
dist/assets/fsrs-6-Cg10IKD8.js                0.08 kB │ gzip:  0.10 kB
dist/assets/schema-D7q2J7dh-ZgELwGIg.js       0.22 kB │ gzip:  0.18 kB
dist/assets/constants-YU7EeO-L-DlrzGcdf.js    0.44 kB │ gzip:  0.26 kB
dist/assets/Toast-C0u5ksXw.js                 0.59 kB │ gzip:  0.40 kB
dist/assets/rolldown-runtime-WkwZ5CU-.js      0.59 kB │ gzip:  0.36 kB
dist/assets/preload-helper-BLdHbfdN.js        1.51 kB │ gzip:  0.79 kB
dist/assets/format-DAeu4WaM.js                1.63 kB │ gzip:  0.80 kB
dist/assets/layout-Dp4YyG6L.js                2.06 kB │ gzip:  1.10 kB
dist/assets/ReviewPage-Me00DZSc.js            2.67 kB │ gzip:  1.25 kB
dist/assets/BlankDndPage-lJ36HSH8.js          3.23 kB │ gzip:  1.54 kB
dist/assets/DndPage-B-TrcPol.js               3.36 kB │ gzip:  1.59 kB
dist/assets/fsrs-3-DPz3ODz5.js                3.37 kB │ gzip:  1.57 kB
dist/assets/fsrs-4-CBG_yOz7.js                3.44 kB │ gzip:  1.61 kB
dist/assets/fsrs-4dot5-2fa8HU1a.js            3.52 kB │ gzip:  1.67 kB
dist/assets/error-DwLpsZPe.js                 3.86 kB │ gzip:  1.55 kB
dist/assets/fsrs-5-BX-DZqNu.js                4.10 kB │ gzip:  1.82 kB
dist/assets/flash-BE6TdTVq.js                 4.17 kB │ gzip:  1.85 kB
dist/assets/TreeListPage-BFdc0msO.js          4.97 kB │ gzip:  2.23 kB
dist/assets/fsrs-6-Bt0f3F6X-CutOtfCW.js       5.61 kB │ gzip:  2.43 kB
dist/assets/FlashPage-bhidBAYo.js             5.90 kB │ gzip:  2.46 kB
dist/assets/fsrs-7-BF0JGJN3.js                6.23 kB │ gzip:  2.71 kB
dist/assets/useDragDrop-DR-KFwqA.js           7.25 kB │ gzip:  3.11 kB
dist/assets/jsx-runtime-CreH4FBI.js          13.01 kB │ gzip:  4.64 kB
dist/assets/EditorPage-CzGl3irU.js           27.04 kB │ gzip: 10.53 kB
dist/assets/srs-CZa71C2z.js                  30.89 kB │ gzip:  9.39 kB
dist/assets/feel-T4HkbxLQ.js                100.26 kB │ gzip: 32.11 kB
dist/assets/index-Y5Qo1M9D.js               210.30 kB │ gzip: 66.29 kB

✓ built in 135ms

PWA v2.0.0
mode      generateSW
precache  36 entries (489.88 KiB)
files generated
  dist/sw.js
  dist/workbox-9c191d2f.js
```

## 집계 (node 로 dist 합산)

| 항목 | 바이트 |
|---|---|
| JS 합계 (assets/*.js, 27개) | 450,448 |
| CSS 합계 (assets/*.css, 4개) | 49,623 |
| sw.js | 2,679 |
| workbox-9c191d2f.js | 15,112 |
| registerSW.js | 134 |
| index.html | 1,436 |
| manifest.webmanifest | 174 |

첫 화면(목록) 전송 분: index.html + index-*.js + feel-*.js(React 런타임 포함) + jsx-runtime + index-*.css + TreeListPage-*.js(+공통 청크) — gzip 기준 ≈ 66.3 + 32.1 + 4.6 + 3.2 + 2.2 ≈ **108 KB**, 비압축 ≈ 339 KB. 웹폰트 0, 아이콘 0(인라인 SVG 3개), 이미지 0.
