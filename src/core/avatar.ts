// 생성 아바타 — 공유 계약 orchestration_ui_first.md §3.2 (DS 소유). 01 §4 목록 행: 정사각 이니셜 + 무채색 6톤.
// 트리 카드(TreeListPage)와 계정 아바타(AA)가 공용. 톤별 색은 CSS `.avatar[data-tone]`(DS, index.css).

/** 문자열 → 톤 0..5 (같은 입력은 언제나 같은 톤) */
export const toneOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 6

/** 첫 글자(한글 1음절·영문은 대문자). 빈 문자열이면 '?' */
export const initialOf = (s: string) => ([...s.trim()][0] ?? '?').toUpperCase()
