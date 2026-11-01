// 노드 내용(note) 형식 — 순수 함수. 계약: docs/plans/orchestration_modes.md §3.2
// 줄 단위 평문. 줄머리 '- ' = 불릿(입력 '+ ', '* ' 도 불릿, 저장은 '- '). 형광펜 ==p:..== 분홍, ==y:..== 노랑, ==b:..== 하늘

export type Color = 'p' | 'y' | 'b'
export interface Seg { text: string; c?: Color }
export interface Line { bullet: boolean; segs: Seg[] }
export interface Pos { line: number; col: number }

const BULLET = /^[-+*] /
const MARK = /==([pyb]):(.+?)==/g

export const lineText = (l: Line) => l.segs.map((s) => s.text).join('')

/** 빈 조각 제거 + 같은 색 이웃 병합 */
function normalize(segs: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    if (!s.text) continue
    const last = out[out.length - 1]
    if (last && last.c === s.c) last.text += s.text
    else out.push(s.c ? { text: s.text, c: s.c } : { text: s.text })
  }
  return out
}

/** 줄 안 [from, to) 문자 범위의 조각들 */
function slice(segs: Seg[], from: number, to: number): Seg[] {
  const out: Seg[] = []
  let at = 0
  for (const s of segs) {
    const a = Math.max(from - at, 0)
    const b = Math.min(to - at, s.text.length)
    if (a < b) out.push({ ...s, text: s.text.slice(a, b) })
    at += s.text.length
  }
  return out
}

function parseSegs(text: string): Seg[] {
  const segs: Seg[] = []
  let at = 0
  for (const m of text.matchAll(MARK)) {
    segs.push({ text: text.slice(at, m.index) }, { text: m[2], c: m[1] as Color })
    at = m.index + m[0].length
  }
  segs.push({ text: text.slice(at) })
  return normalize(segs)
}

export function parse(note: string | undefined): Line[] {
  return (note ?? '').split('\n').map((raw) => {
    const bullet = BULLET.test(raw)
    return { bullet, segs: parseSegs(bullet ? raw.slice(2) : raw) }
  })
}

/** 내용이 공백뿐이면 '' (카드 내용 영역 숨김) */
export function serialize(lines: Line[]): string {
  const s = lines
    .map((l) => (l.bullet ? '- ' : '') + l.segs.map((g) => (g.c ? `==${g.c}:${g.text}==` : g.text)).join(''))
    .join('\n')
  return s.trim() ? s : ''
}

/** start..end 범위에 형광펜 c 적용 (null = 지우기). start <= end 가정 */
export function highlight(lines: Line[], start: Pos, end: Pos, c: Color | null): Line[] {
  return lines.map((l, i) => {
    if (i < start.line || i > end.line) return l
    const len = lineText(l).length
    const a = i === start.line ? start.col : 0
    const b = i === end.line ? end.col : len
    const mid = slice(l.segs, a, b).map((s) => (c ? { text: s.text, c } : { text: s.text }))
    return { ...l, segs: normalize([...slice(l.segs, 0, a), ...mid, ...slice(l.segs, b, len)]) }
  })
}

/** from..to 줄이 전부 불릿이면 해제, 아니면 전부 불릿 */
export function toggleBullet(lines: Line[], from: number, to: number): Line[] {
  const on = !lines.slice(from, to + 1).every((l) => l.bullet)
  return lines.map((l, i) => (i >= from && i <= to ? { ...l, bullet: on } : l))
}

/** 줄머리에 '- ', '+ ', '* ' 를 친 일반 줄을 불릿으로. 바뀐 줄 번호도 돌려준다 (커서 2칸 보정용) */
export function autoBullet(lines: Line[]): { lines: Line[]; changed: number[] } {
  const changed: number[] = []
  const out = lines.map((l, i) => {
    if (l.bullet || !BULLET.test(lineText(l))) return l
    changed.push(i)
    return { bullet: true, segs: normalize(slice(l.segs, 2, Infinity)) }
  })
  return { lines: out, changed }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 표시·편집 공용 HTML. 브라우저 innerHTML 직렬화와 같은 모양이라 문자열 비교로 정규형 여부를 판단할 수 있다 */
export function toHtml(lines: Line[]): string {
  return lines
    .map((l) => {
      const inner = l.segs.map((s) => (s.c ? `<mark class="hl-${s.c}">${esc(s.text)}</mark>` : esc(s.text))).join('')
      return `<div class="ln${l.bullet ? ' b' : ''}">${inner || '<br>'}</div>`
    })
    .join('')
}
