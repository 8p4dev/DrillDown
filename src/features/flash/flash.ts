// 플래시카드 순수 로직 (DOM·DB 없음). 점검: npx tsx src/features/flash/flash.check.ts
import { descendantsOf, getRoot } from '../../core/repo'
import type { ID, NodeSrs, TreeNode } from '../../core/types'

/** 트리 전체 전위 순서(루트 포함) */
export const preorder = (nodes: TreeNode[]): TreeNode[] => {
  const root = getRoot(nodes)
  return [root, ...descendantsOf(nodes, root.id)]
}

/** 전위 순서상 current 다음의 "자식 있는 노드" 중 scope 서브트리 안의 첫 노드. 없으면 null(=요약) */
export function nextConcept(nodes: TreeNode[], scopeId: ID, currentId: ID): ID | null {
  const inScope = new Set([scopeId, ...descendantsOf(nodes, scopeId).map((n) => n.id)])
  const hasKids = new Set(nodes.map((n) => n.parentId))
  const order = preorder(nodes)
  const at = order.findIndex((n) => n.id === currentId)
  return order.slice(at + 1).find((n) => inScope.has(n.id) && hasKids.has(n.id))?.id ?? null
}

/** 복습 큐: 기한 노드의 부모(루트면 자신)를 전위 순서로 중복 없이. 부모가 곧 플래시카드 개념 */
export function parentQueue(nodes: TreeNode[], due: NodeSrs[]): ID[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const want = new Set(due.flatMap((s) => { const n = byId.get(s.nodeId); return n ? [n.parentId ?? n.id] : [] }))
  return preorder(nodes).filter((n) => want.has(n.id)).map((n) => n.id)
}

/** 미니맵용: 접힘·마우스 offset 무시하고 전체 트리를 그린다 */
export const minimapNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes.map((n) => ({ ...n, collapsed: false, offset: undefined }))

/** 내용(note) 평문화: 형광펜 마커 ==p:텍스트== → 텍스트. 줄·불릿은 그대로 */
export const plainNote = (note = ''): string => note.replace(/==[pyb]:(.*?)==/g, '$1').trim()
