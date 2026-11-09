// 에디터 검색(U16) — 제목·내용·별칭 부분 일치, 대소문자 무시. 제목 일치가 위, 그다음 내용·별칭(E13). 배열 순서, 상한 limit
import type { TreeNode } from '../../core/types'

export const SEARCH_LIMIT = 50
export function searchNodes(nodes: readonly TreeNode[], q: string, limit = SEARCH_LIMIT): TreeNode[] {
  const k = q.trim().toLocaleLowerCase()
  if (!k) return []
  const hit = (s: string | undefined) => !!s && s.toLocaleLowerCase().includes(k)
  const byTitle: TreeNode[] = []
  const byRest: TreeNode[] = []
  for (const n of nodes) {
    if (hit(n.title)) byTitle.push(n)
    else if (byTitle.length + byRest.length < limit && (hit(n.note) || n.aliases.some(hit))) byRest.push(n)
    if (byTitle.length >= limit) break
  }
  return [...byTitle, ...byRest].slice(0, limit)
}
