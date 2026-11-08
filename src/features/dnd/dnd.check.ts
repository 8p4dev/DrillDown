// npx tsx src/features/dnd/dnd.check.ts
import type { TreeNode } from '../../core/types'
import { attach, detach, gradeBlank, gradeDnd, leavesOf, moveCard, placedTree, scopeOf, shuffle, sideLayout, type Links } from './dnd'

// node:assert 대신 (앱 tsconfig 에 node 타입 없음)
function assert(ok: unknown, msg = '점검 실패'): asserts ok {
  if (!ok) throw new Error(msg)
}
assert.equal = (a: unknown, b: unknown) => assert(a === b, `${String(a)} !== ${String(b)}`)
assert.deepEqual = (a: unknown, b: unknown) => assert(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} !== ${JSON.stringify(b)}`)

let o = 0
const N = (id: string, parentId: string | null, title = id): TreeNode => ({ id, treeId: 't', parentId, order: o++, title, aliases: [], updatedAt: 0 })
// R ─ A ─ a1, a2(X)
//   └ B ─ b1(X), b2
//   └ c
const nodes = [N('R', null), N('A', 'R'), N('a1', 'A'), N('a2', 'A', 'X'), N('B', 'R'), N('b1', 'B', 'X'), N('b2', 'B'), N('c', 'R')]

// 셔플: 원소 보존
const s = shuffle([1, 2, 3, 4, 5])
assert.deepEqual([...s].sort(), [1, 2, 3, 4, 5])
assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1])

// 범위
assert.deepEqual(scopeOf(nodes, 'R').map((n) => n.id), ['R', 'A', 'a1', 'a2', 'B', 'b1', 'b2', 'c'])
const sb = scopeOf(nodes, 'B')
assert.deepEqual(sb.map((n) => n.id), ['B', 'b1', 'b2'])
assert.equal(sb[0].parentId, null)
const scope = scopeOf(nodes, 'R')
assert.deepEqual(leavesOf(scope).map((n) => n.id), ['a1', 'a2', 'b1', 'b2', 'c'])
assert.deepEqual(leavesOf(scopeOf(nodes, 'c')), []) // 리프 범위 → 빈칸 없음

// moveCard: 이동·교환·트레이
let p = moveCard({}, 'a1', 'a2')
assert.deepEqual(p, { a2: 'a1' })
p = moveCard(p, 'b2', 'a1')
p = moveCard(p, 'a1', 'a1') // 찬 슬롯으로 슬롯 간 이동 → 교환
assert.deepEqual(p, { a1: 'a1', a2: 'b2' })
p = moveCard(p, 'c', 'a1') // 트레이에서 찬 슬롯 → 기존 카드 트레이로
assert.deepEqual(p, { a1: 'c', a2: 'b2' })
assert.deepEqual(moveCard(p, 'c', 'tray'), { a2: 'b2' })

// gradeDnd: 같은 부모 순서 무관, 동명 교환 가능, 미배치 오답
let g = gradeDnd(scope, { a1: 'a2', a2: 'a1', b1: 'b2', b2: 'b1', c: 'c' })
assert.equal(g.correct, 5)
g = gradeDnd(scope, { a1: 'a1', a2: 'b1', b1: 'a2', b2: 'b2' }) // b1·a2 둘 다 제목 X → 교환해도 정답, c 미배치
assert.deepEqual(g, { ok: { a1: true, b1: true, a2: true, b2: true, c: false }, correct: 4, total: 5, placed: ['a1', 'b1', 'a2', 'b2'] })
assert.deepEqual(gradeDnd(scope, {}).placed, []) // U35: 아무것도 안 놓으면 기록 0
g = gradeDnd(scope, { a1: 'b2', b1: 'a1' })
assert.equal(g.correct, 0)
// 같은 제목 둘이 한 부모의 X 자리 하나를 이중으로 맞히지 않음
g = gradeDnd(scope, { a1: 'a2', a2: 'b1' })
assert.equal(g.correct, 1)

// attach / detach
let L: Links = new Map()
L = attach(L, 'A', 'R', 'R')
L = attach(L, 'a1', 'A', 'R')
assert.equal(attach(L, 'B', 'b1', 'R'), L) // 미배치 대상
assert.equal(attach(L, 'A', 'a1', 'R'), L) // 자기 자손 아래 금지
assert.equal(attach(L, 'A', 'A', 'R'), L)
assert.equal(attach(L, 'R', 'A', 'R'), L) // 루트 이동 금지
L = attach(L, 'B', 'a1', 'R')
L = attach(L, 'b1', 'B', 'R')
L = attach(L, 'B', 'R', 'R') // 자손 함께 이동
assert.equal(L.get('b1'), 'B')
assert.equal(L.get('B'), 'R')
assert.deepEqual([...detach(L, 'A').keys()], ['b1', 'B']) // A·a1 트레이로
assert.deepEqual([...detach(L, 'B').keys()], ['A', 'a1'])
const t = placedTree(scope, L)
assert.deepEqual(t.map((n) => [n.id, n.parentId]), [['R', null], ['A', 'R'], ['a1', 'A'], ['b1', 'B'], ['B', 'R']])

// gradeBlank: 부모 일치, 트레이 잔여 오답, 동명 교환
g = gradeBlank(scope, L)
assert.equal(g.total, 7)
assert.equal(g.correct, 4)
assert.equal(g.ok.a2, false)
assert.deepEqual(g.placed.sort(), ['A', 'B', 'a1', 'b1']) // 놓은 카드
assert.deepEqual(gradeBlank(scope, new Map()).placed, [])
let full: Links = new Map()
for (const n of scope.slice(1)) full = attach(full, n.id, n.parentId!, 'R')
assert.equal(gradeBlank(scope, full).correct, 7)
full = attach(attach(full, 'a2', 'B', 'R'), 'b1', 'A', 'R') // 제목 X 둘 교환 → 여전히 정답
assert.equal(gradeBlank(scope, full).correct, 7)
full = attach(full, 'c', 'A', 'R')
assert.equal(gradeBlank(scope, full).ok.c, false)

// sideLayout: 깊이 = 열, 폭 안에 들어감, 칸 겹침 없음, 최소 카드 폭 유지
const side = sideLayout(scope, 'R', 360)
assert(side.width <= 360, `side width ${side.width}`)
const sb2 = [...side.boxes.values()]
assert.equal(sb2.length, scope.length)
assert(side.boxes.get('R')!.x < side.boxes.get('A')!.x && side.boxes.get('A')!.x < side.boxes.get('a1')!.x, '열 순서')
assert(sb2.every((a, i) => sb2.slice(i + 1).every((b) => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y)), '겹침')
assert(sb2.every((b) => b.x >= 0 && b.y >= 0 && b.x + b.w <= side.width && b.y + b.h <= side.height), '경계')
assert.equal(sideLayout(scope, 'R', 100).boxes.get('R')!.w, 96)
assert.equal(sideLayout([nodes[0]], 'R', 360).boxes.get('R')!.w, 148)

console.log('dnd.check ok')
