import type { ID, TreeNode } from '../../core/types'

/** 한글 IME 조합 중인 키 입력 — Enter 등을 가로채면 글자가 중복·유실된다. keyCode 229 = 일부 브라우저가 isComposing 을 안 주는 경우 */
export const isComposing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229

/** 접기(collapsed)·시각만 다르면 같은 노드 — 접기는 실행 취소 대상이 아니라 '바뀐 곳'이 아니다 */
const key = (n: TreeNode) => JSON.stringify({ ...n, collapsed: undefined, updatedAt: undefined })

/**
 * 실행 취소·다시 실행이 바꾼 곳(U09): prev → next 에서 바뀌거나 되살아난 노드 중 가장 위.
 * 지우기만 했으면 지워진 노드의 남은 부모. 노드는 불변으로 다루므로 먼저 객체 동일성으로 거른다
 */
export function changedNode(prev: readonly TreeNode[], next: readonly TreeNode[]): ID | undefined {
  const before = new Map(prev.map((n) => [n.id, n]))
  const ids = new Set(next.map((n) => n.id))
  const changed = new Set(next.filter((n) => { const o = before.get(n.id); return o !== n && (!o || key(o) !== key(n)) }).map((n) => n.id))
  const top = next.find((n) => changed.has(n.id) && (n.parentId === null || !changed.has(n.parentId)))
  if (top) return top.id
  return prev.find((n) => !ids.has(n.id) && n.parentId !== null && ids.has(n.parentId))?.parentId ?? undefined
}
