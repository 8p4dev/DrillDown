// contentEditable DOM ↔ 내용 모델. 정규형 = 루트 직속 <div class="ln[ b]"> 줄 + <mark class="hl-x"> (format.toHtml)
import type { Color, Line, Pos } from './format'

/** 브라우저가 만든 비정규 DOM(최상위 텍스트, br, span 등)도 관대하게 읽는다 */
export function fromDom(root: HTMLElement): Line[] {
  const lines: Line[] = []
  let cur: Line | null = null
  const push = () => {
    cur = { bullet: false, segs: [] }
    lines.push(cur)
    return cur
  }
  const inline = (n: Node, c?: Color) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = (n as Text).data.replace(/ /g, ' ').replace(/\n/g, '')
      if (text) (cur ?? push()).segs.push(c ? { text, c } : { text })
    } else if (n instanceof HTMLElement) {
      if (n.tagName === 'BR') {
        if (n.nextSibling) push() // 줄 끝의 br 은 빈 줄 자리 표시일 뿐
        return
      }
      const own = n.tagName === 'MARK' ? (/hl-([pyb])/.exec(n.className)?.[1] as Color | undefined) : undefined
      n.childNodes.forEach((k) => inline(k, own ?? c))
    }
  }
  root.childNodes.forEach((n) => {
    if (n instanceof HTMLElement && (n.tagName === 'DIV' || n.tagName === 'P')) {
      push().bullet = n.classList.contains('b')
      n.childNodes.forEach((k) => inline(k))
      cur = null
    } else if (n instanceof HTMLElement && n.tagName === 'BR') {
      if (!cur) push()
      cur = null
    } else inline(n)
  })
  return lines.length ? lines : [{ bullet: false, segs: [] }]
}

function posOf(root: HTMLElement, node: Node, off: number): Pos | null {
  if (node === root) {
    const line = Math.min(off, root.childNodes.length - 1)
    return { line: Math.max(line, 0), col: off > line ? (root.childNodes[line]?.textContent?.length ?? 0) : 0 }
  }
  let top = node
  while (top.parentNode !== root) {
    if (!top.parentNode) return null
    top = top.parentNode
  }
  const r = document.createRange()
  r.setStart(top, 0)
  r.setEnd(node, off)
  return { line: Array.prototype.indexOf.call(root.childNodes, top), col: r.toString().length }
}

/** 정규형 DOM 기준 선택 범위 (줄 번호, 줄 안 글자 위치). 루트 밖이면 null */
export function getSel(root: HTMLElement): { start: Pos; end: Pos } | null {
  const s = getSelection()
  if (!s?.rangeCount) return null
  const r = s.getRangeAt(0)
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
  const start = posOf(root, r.startContainer, r.startOffset)
  const end = posOf(root, r.endContainer, r.endOffset)
  return start && end ? { start, end } : null
}

function pointAt(root: HTMLElement, p: Pos): [Node, number] {
  const el = root.childNodes[Math.min(p.line, root.childNodes.length - 1)]
  if (!el) return [root, 0]
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let left = p.col
  let last: Text | null = null
  for (let t = w.nextNode() as Text | null; t; t = w.nextNode() as Text | null) {
    if (left <= t.data.length) return [t, left]
    left -= t.data.length
    last = t
  }
  return last ? [last, last.data.length] : [el, 0]
}

export function setSel(root: HTMLElement, start: Pos, end = start) {
  const r = document.createRange()
  r.setStart(...pointAt(root, start))
  r.setEnd(...pointAt(root, end))
  const s = getSelection()
  s?.removeAllRanges()
  s?.addRange(r)
}
