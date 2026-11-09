// 개요 텍스트 ↔ 트리 — 공유 계약 §4.2 (에이전트 A 소유). 순수 함수
import { childrenOf } from './repo'
import { CAP, type ID, type TreeNode } from './types'

export interface OutlineItem {
  text: string
  /** 한 줄 메모 `제목 :: 메모` (계약 C6) */
  note?: string
  children: OutlineItem[]
}

// 줄머리 기호·번호: - * • · ◦ ▪ ‣ / 1. 1) 1.2. / 가. 가) / (1) (가) / ①~⑳ / Ⅰ. ⅰ) / - [ ] - [x] / >
// 뒤에 공백(또는 줄 끝)이 있어야 기호로 본다 — '-5도', '1.5배', 'Ⅳ호', '*args' 는 본문(R4-A9)
const BULLET =
  /^(?:[-*•·◦▪‣]+(?:\s+\[[ xX]\])?|\d+(?:\.\d+)+[.)]?|\d+[.)]|[가-힣][.)]|\(\s*(?:\d+|[가-힣])\s*\)|[①-⑳]|[Ⅰ-ⅿ]+[.)]?|>+)(?=\s|$)\s*/
const HEADING = /^(#{1,6})\s+/
const MEMO = /\s+::\s+/

/** 탭 너비 = 문서에서 가장 얕은 공백 들여쓰기(2칸 이상, 없으면 4) — 2칸 문서의 탭이 한 단계가 된다(R4-A10) */
function tabWidth(lines: string[]): number {
  let unit = Infinity
  for (const l of lines) {
    const ws = /^[ 　]*/.exec(l)![0].replace(/　/g, '  ').length
    if (ws >= 2 && /\S/.test(l) && !/^[ 　]*\t/.test(l)) unit = Math.min(unit, ws)
  }
  return unit === Infinity ? 4 : unit
}

export function parseOutline(text: string): OutlineItem[] {
  const lines = text.split(/\r?\n/)
  const tab = tabWidth(lines)
  const top: OutlineItem[] = []
  // level: 마크다운 헤딩 = 1~6, 그 외 줄 = 100 + 들여쓰기 → 헤딩 아래 줄은 들여쓰기와 무관하게 그 헤딩의 자식
  const stack: { level: number; item: OutlineItem }[] = []
  for (const line of lines) {
    const m = /^([ \t　]*)(.*)$/.exec(line)!
    const h = HEADING.exec(m[2])
    let t = (h ? m[2].slice(h[0].length) : m[2].replace(BULLET, '')).trim()
    if (!t) continue
    const level = h ? h[1].length : 100 + [...m[1].replace(/　/g, '  ')].reduce((w, c) => w + (c === '\t' ? tab : 1), 0)
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
    const memo = MEMO.exec(t)
    const note = memo && t.slice(memo.index + memo[0].length)
    if (note) t = t.slice(0, memo.index) // t 는 trim 됐으므로 memo.index > 0
    t = t.replace(/\\::/g, '::') // 제목 속 ' :: ' 는 ' \:: ' 로 적는다(내보내기가 이렇게 쓴다)
    const item: OutlineItem = note ? { text: t, note, children: [] } : { text: t, children: [] }
    ;(stack.length ? stack[stack.length - 1].item.children : top).push(item)
    stack.push({ level, item })
  }
  return top
}

export function serializeOutline(items: OutlineItem[]): string {
  const lines: string[] = []
  const walk = (xs: OutlineItem[], depth: number) => {
    for (const x of xs) {
      lines.push('  '.repeat(depth) + x.text.replace(/(\s)::(?=\s)/g, '$1\\::') + (x.note ? ` :: ${x.note}` : ''))
      walk(x.children, depth + 1)
    }
  }
  walk(items, 0)
  return lines.join('\n')
}

/** CAP.title 초과 제목은 잘라서 나머지를 note 로 (계약 C5). 서버가 긴 제목 행을 거부하지 않게 */
export const splitTitle = (text: string): { title: string; note?: string } =>
  text.length > CAP.title ? { title: text.slice(0, CAP.title), note: text.slice(CAP.title).trim() } : { title: text }

/** 전위 순서로 새 노드 생성. 최상위 항목은 parentId 아래 startOrder, startOrder+1, ... 긴 제목은 splitTitle */
export function outlineToNodes(items: OutlineItem[], treeId: ID, parentId: ID | null, startOrder = 0): TreeNode[] {
  const now = Date.now()
  const out: TreeNode[] = []
  const walk = (xs: OutlineItem[], pid: ID | null, base: number) =>
    xs.forEach((x, i) => {
      const id = crypto.randomUUID()
      const { title, note } = splitTitle(x.text)
      const memo = [note, x.note?.slice(0, CAP.note)].filter(Boolean).join('\n')
      out.push({ id, treeId, parentId: pid, order: base + i, title, ...(memo ? { note: memo } : {}), aliases: [], updatedAt: now })
      walk(x.children, id, 0)
    })
  walk(items, parentId, startOrder)
  return out
}

/** 한 줄 메모만 `제목 :: 메모` 로 내보낸다(C6). 여러 줄 메모는 빠진다 */
const toItem = (n: TreeNode, children: OutlineItem[]): OutlineItem =>
  n.note?.trim() && !n.note.includes('\n') ? { text: n.title, note: n.note.trim(), children } : { text: n.title, children }

export function nodesToOutline(nodes: TreeNode[], rootId: ID, includeRoot = false): OutlineItem[] {
  const build = (id: ID): OutlineItem[] => childrenOf(nodes, id).map((c) => toItem(c, build(c.id)))
  if (!includeRoot) return build(rootId)
  const root = nodes.find((n) => n.id === rootId)
  return root ? [toItem(root, build(rootId))] : []
}

/** 가지 복제(U26): id 의 서브트리 사본(새 id), 원본 바로 뒤 형제 자리(order). 학습 기록은 따라가지 않는다 */
export function cloneBranch(nodes: TreeNode[], id: ID, order: number): TreeNode[] {
  const src = nodes.find((n) => n.id === id)
  if (!src) return []
  const now = Date.now()
  const out: TreeNode[] = []
  const walk = (n: TreeNode, parentId: ID | null, o: number) => {
    const nid = crypto.randomUUID()
    out.push({ ...n, id: nid, parentId, order: o, updatedAt: now })
    for (const c of childrenOf(nodes, n.id)) walk(c, nid, c.order)
  }
  walk(src, src.parentId, order)
  return out
}
