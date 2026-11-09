// 노드 경로(루트 → 노드) — 경로 표시 공용(T2): 복습·에디터·범위 라벨·검색 결과·백지 채점 키
import type { ID, TreeNode } from './types'

/** 형제 정렬 기준 (order, id) — 기기 간 동기화 뒤에도 모든 화면이 같은 순서 (04 §5(b)). 형제 정렬은 전부 이걸 쓴다 */
export const byOrder = (a: TreeNode, b: TreeNode) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** parentId → 정렬된 자식 목록. 노드마다 childrenOf 를 부르면 O(n²) 이라 한 번에 만든다 */
export function childIndex(nodes: TreeNode[]): Map<ID | null, TreeNode[]> {
  const m = new Map<ID | null, TreeNode[]>()
  for (const n of nodes) {
    const k = m.get(n.parentId)
    if (k) k.push(n)
    else m.set(n.parentId, [n])
  }
  for (const k of m.values()) k.sort(byOrder)
  return m
}


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
