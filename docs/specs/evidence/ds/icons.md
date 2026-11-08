# 아이콘 측정 (Lucide, 2026-11-08)

- 세트: **lucide-static 1.70.0** (npm, jsDelivr `https://cdn.jsdelivr.net/npm/lucide-static@1.70.0/icons/<name>.svg`). 라이선스 원문: 패키지 `LICENSE` → "ISC License, Copyright (c) 2026 Lucide Icons and Contributors … Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies." (https://github.com/lucide-icons/lucide/blob/main/LICENSE 확인). 저작권 고지 1줄을 소스 주석에 두면 된다.
- 비교한 대안: Tabler Icons(MIT, https://github.com/tabler/tabler-icons/blob/main/LICENSE 확인 — "Copyright (c) 2020-2026 Paweł Kuna"), Phosphor(MIT, https://github.com/phosphor-icons/core/blob/main/LICENSE 확인 — "Copyright (c) 2023 Phosphor Icons"). 셋 다 상업 사용 가능. Lucide 를 고른 이유: 24 격자·stroke 2·round cap/join 이 단일 규격이라 16/20px 로 줄여도 획이 고르고(Tabler 는 1.5~2 혼재 옵션, Phosphor 는 6 굵기 패밀리라 선택 부담), 앱에 이미 있는 `tree-modes` SVG(viewBox 16, stroke 1.5, round) 와 가장 가깝다.
- 측정 방법: 65개 후보 SVG 를 받아 (a) 파일 원문 바이트 (b) `<svg>` 안쪽 path 만 남긴 바이트(인라인 JSX 로 넣을 때 실제로 늘어나는 양)를 합산.

| 항목 | 값 |
|---|---|
| 후보 아이콘 수 | 65 |
| 원문 SVG 합계 | 28,356 B |
| path 만(인라인 기준) 합계 | 22,889 B (평균 352 B/개) |
| 실제 채택 예정(§3.5 표, 신규 화면 포함) | 52개 ≈ **18.3 KB 비압축**, gzip 추정 ≈ 6 KB (path 문자열은 반복이 많아 1/3 수준으로 줄어든다 — [가정]) |

## path-only 바이트 (개별)

| 아이콘 | B | 아이콘 | B | 아이콘 | B |
|---|---|---|---|---|---|
| arrow-left | 263 | file | 368 | moon | 332 |
| arrow-right | 263 | globe | 324 | network | 434 |
| ban | 279 | grip-vertical | 405 | pencil | 374 |
| calendar-check | 354 | hard-drive | 454 | plus | 251 |
| check | 238 | highlighter | 319 | redo-2 | 305 |
| check-check | 277 | image | 351 | refresh-cw | 387 |
| chevron-down | 242 | info | 286 | rotate-ccw | 298 |
| chevron-up | 242 | keyboard | 439 | scissors | 361 |
| circle-alert | 332 | layers | 504 | search | 272 |
| clipboard-copy | 429 | link | 354 | settings | 585 |
| clipboard-paste | 432 | list | 336 | shield | 386 |
| cloud | 274 | list-checks | 329 | square-dashed | 506 |
| cloud-off | 382 | list-tree | 346 | sun | 458 |
| copy | 334 | loader-circle | 258 | sun-moon | 442 |
| corner-down-right | 285 | lock | 304 | trash-2 | 378 |
| crosshair | 403 | log-in | 313 | undo-2 | 306 |
| database | 325 | log-out | 312 | user | 294 |
| download | 314 | map | 507 | user-x | 373 |
| ellipsis | 308 | maximize | 359 | x | 252 |
| eraser | 380 | megaphone | 428 | zoom-in | 368 |
| expand | 389 | minimize-2 | 306 | zoom-out | 330 |
| eye | 354 | eye-off | 496 | | |

## 인라인 규격 (스펙 §3.5 와 동일)

```tsx
// src/ui/icons.tsx (구현 때 생성) — 각 아이콘은 path 문자열만 가진다. 라이선스: Lucide ISC, (c) Lucide Icons and Contributors
export const I = { check: 'M20 6 9 17l-5-5', x: 'M18 6 6 18M6 6l12 12', /* … */ }
export function Icon({ d, size = 16, label }: { d: string; size?: 16 | 20; label?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={size === 16 ? 2 : 1.75}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}><path d={d} /></svg>
}
```

원본 SVG 는 여러 `<path>`/`<circle>`/`<rect>` 자식을 가질 수 있어 실제 테이블은 "자식 요소 문자열"을 그대로 둔다(위 바이트 합산 기준이 그것). 16px 에서 stroke 2 는 2/24·16 ≈ 1.33px 로 렌더되어 가늘어지므로 2 를 유지하고, 20px 은 1.75 로 낮춰 시각 굵기를 맞춘다.
