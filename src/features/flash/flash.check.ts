// 실행: npx tsx src/features/flash/flash.check.ts
import type { NodeSrs, TreeNode } from '../../core/types'
import { minimapNodes, nextConcept, parentQueue, plainNote } from './flash'

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

// r ─ a ─ a1 ─ a1x
//   │   └ a2
//   ├ b
//   └ c ─ c1
const n = (id: string, parentId: string | null, order: number): TreeNode =>
  ({ id, treeId: 't', parentId, order, title: id, aliases: [], updatedAt: 0 })
const nodes = [n('c1', 'c', 0), n('r', null, 0), n('c', 'r', 2), n('a', 'r', 0), n('b', 'r', 1), n('a2', 'a', 1), n('a1', 'a', 0), n('a1x', 'a1', 0)]

eq(nextConcept(nodes, 'r', 'r'), 'a', '루트 다음 = a')
eq(nextConcept(nodes, 'r', 'a'), 'a1', 'a 다음 = a1 (전위)')
eq(nextConcept(nodes, 'r', 'a1'), 'c', 'a1 다음은 리프 a2·b 건너뛰고 c')
eq(nextConcept(nodes, 'r', 'c'), null, '마지막 → 요약')
eq(nextConcept(nodes, 'a', 'a1'), null, '시작 개념 a 범위 밖(c)으로 나가지 않음')
eq(nextConcept(nodes, 'a', 'c'), null, '범위 밖에서 다음 = 범위 안 다음 없음')

const due = (nodeId: string) => ({ nodeId }) as NodeSrs
eq(parentQueue(nodes, [due('c1'), due('a2'), due('a1'), due('r'), due('zz')]), ['r', 'a', 'c'], '부모 큐: 전위 순서·중복 제거·루트는 자신·없는 노드 무시')

ok(minimapNodes([{ ...n('x', null, 0), collapsed: true, offset: { x: 5, y: 5 } }]).every((m) => !m.collapsed && !m.offset), '미니맵은 접힘·offset 무시')
eq(plainNote('- 하나 ==y:형광== 끝\n둘 ==p:a==b==b:c== '), '- 하나 형광 끝\n둘 abc', '형광펜 마커 제거')
eq(plainNote(undefined), '', '내용 없음')

console.log('flash.check ok')
