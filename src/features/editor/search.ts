// 에디터 검색(U16) — 제목 부분 일치, 대소문자 무시, 트리 순서(order)와 무관하게 배열 순서, 상한 limit
import type { TreeNode } from '../../core/types'

export const SEARCH_LIMIT = 50
export function searchNodes(nodes: readonly TreeNode[], q: string, limit = SEARCH_LIMIT): TreeNode[] {
  const k = q.trim().toLocaleLowerCase()
  if (!k) return []
  const out: TreeNode[] = []
  for (const n of nodes) {
    if (n.title.toLocaleLowerCase().includes(k)) out.push(n)
    if (out.length >= limit) break
  }
  return out
}
