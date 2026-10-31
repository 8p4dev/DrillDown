// 개요 텍스트 ↔ 트리 — 공유 계약 §4.2 (에이전트 A 소유). 순수 함수
import { childrenOf } from './repo'
import type { ID, TreeNode } from './types'

export interface OutlineItem {
  text: string
  children: OutlineItem[]
}

// 줄머리 기호·번호: - * • · ◦ ▪ ‣ / 1. 1) 1.2. / 가. 가) / (1) (가) / ①~⑳ / Ⅰ. ⅰ)
const BULLET =
  /^(?:[-*•·◦▪‣]+|\d+(?:\.\d+)+[.)]?|\d+[.)]|[가-힣][.)](?=\s)|\(\s*(?:\d+|[가-힣])\s*\)|[①-⑳]|[Ⅰ-ⅿ]+[.)]?)\s*/

const indentWidth = (ws: string) => [...ws].reduce((w, c) => w + (c === '\t' ? 4 : 1), 0)

export function parseOutline(text: string): OutlineItem[] {
  const top: OutlineItem[] = []
  const stack: { indent: number; item: OutlineItem }[] = []
  for (const line of text.split(/\r?\n/)) {
    const m = /^([ \t　]*)(.*)$/.exec(line)!
    const t = m[2].replace(BULLET, '').trim()
    if (!t) continue
    const indent = indentWidth(m[1].replace(/　/g, '  '))
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    const item: OutlineItem = { text: t, children: [] }
    ;(stack.length ? stack[stack.length - 1].item.children : top).push(item)
    stack.push({ indent, item })
  }
  return top
}

export function serializeOutline(items: OutlineItem[]): string {
  const lines: string[] = []
  const walk = (xs: OutlineItem[], depth: number) => {
    for (const x of xs) {
      lines.push('  '.repeat(depth) + x.text)
      walk(x.children, depth + 1)
    }
  }
  walk(items, 0)
  return lines.join('\n')
}

/** 전위 순서로 새 노드 생성. 최상위 항목은 parentId 아래 startOrder, startOrder+1, ... */
export function outlineToNodes(items: OutlineItem[], treeId: ID, parentId: ID | null, startOrder = 0): TreeNode[] {
  const now = Date.now()
  const out: TreeNode[] = []
  const walk = (xs: OutlineItem[], pid: ID | null, base: number) =>
    xs.forEach((x, i) => {
      const id = crypto.randomUUID()
      out.push({ id, treeId, parentId: pid, order: base + i, title: x.text, aliases: [], updatedAt: now })
      walk(x.children, id, 0)
    })
  walk(items, parentId, startOrder)
  return out
}

export function nodesToOutline(nodes: TreeNode[], rootId: ID, includeRoot = false): OutlineItem[] {
  const build = (id: ID): OutlineItem[] => childrenOf(nodes, id).map((c) => ({ text: c.title, children: build(c.id) }))
  if (!includeRoot) return build(rootId)
  const root = nodes.find((n) => n.id === rootId)
  return root ? [{ text: root.title, children: build(rootId) }] : []
}
