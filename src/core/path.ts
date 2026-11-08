// 노드 경로(루트 → 노드) — 경로 표시 공용(T2): 복습·에디터·범위 라벨·검색 결과·백지 채점 키
import type { ID, TreeNode } from './types'

/** 루트부터 id 까지(자기 포함). 부모가 없거나 순환이면 거기서 멈춘다 */
export function ancestorsOf(byId: ReadonlyMap<ID, TreeNode>, id: ID): TreeNode[] {
  const p: TreeNode[] = []
  const seen = new Set<ID>()
  for (let n = byId.get(id); n && !seen.has(n.id); n = n.parentId ? byId.get(n.parentId) : undefined) {
    seen.add(n.id)
    p.unshift(n)
  }
  return p
}

/** 한 줄 라벨: '방법 — TCP SYN Flooding'(가까운 조상 1개). 조상이 없으면 제목만 */
export const withParent = (byId: ReadonlyMap<ID, TreeNode>, n: TreeNode): string => {
  const parent = n.parentId ? byId.get(n.parentId) : undefined
  return parent && parent.parentId ? `${n.title} — ${parent.title}` : n.title
}
