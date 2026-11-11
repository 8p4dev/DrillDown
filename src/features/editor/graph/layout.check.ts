// 레이아웃 점검 (npx tsx src/features/editor/graph/layout.check.ts) — plan G2 완료 기준
import type { TreeNode } from '../../../core/types'
import { HGAP, isOpen, layout, type Box } from './layout'
import { searchNodes } from '../search'
import { changedNode } from '../edit'

// node:assert 대신 (앱 tsconfig 에 node 타입 없음)
function assert(ok: unknown, msg = '점검 실패'): asserts ok {
  if (!ok) throw new Error(msg)
}
assert.equal = (a: unknown, b: unknown, msg?: string) => assert(a === b, `${msg ?? ''} ${String(a)} !== ${String(b)}`)

// 가짜 측정: 글자당 8px + 여백 24, 64~240px, 넘치면 줄바꿈(줄당 20px)
const measure = (n: TreeNode) => {
  const raw = n.title.length * 8 + 24
  return { w: Math.min(240, Math.max(64, raw)), h: 12 + 20 * Math.ceil(raw / 240) }
}
let seq = 0
const mk = (title: string, parentId: string | null, extra: Partial<TreeNode> = {}): TreeNode => ({
  id: title, treeId: 't', parentId, order: seq++, title, aliases: [], updatedAt: 0, ...extra,
})
const base = [
  mk('노동법', null),
  mk('근로계약', '노동법'),
  mk('근로조건명시', '근로계약'),
  mk('위약예정금지', '근로계약'),
  mk('해고', '노동법'),
  mk('정당한 이유가 있어야 하며 그 판단 기준은 사회통념상 고용관계를 계속할 수 없을 정도의 귀책사유', '해고'),
  mk('해고예고', '해고'),
  mk('부당해고 구제', '해고예고'),
  mk('임금', '노동법'),
]
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
const center = (b: Box) => b.x + b.w / 2

// 겹침 없음 (모든 쌍)
const g = layout(base, '노동법', measure)
assert.equal(g.boxes.size, base.length)
const all = [...g.boxes.entries()]
for (let i = 0; i < all.length; i++)
  for (let j = i + 1; j < all.length; j++) assert(!overlap(all[i][1], all[j][1]), `겹침: ${all[i][0]} / ${all[j][0]}`)

// 위→아래: 자식은 부모보다 아래, 간선 = 부모-자식 관계 그대로
const box = (id: string) => g.boxes.get(id)!
for (const [p, c] of g.edges) {
  assert.equal(base.find((n) => n.id === c)!.parentId, p)
  assert(box(c).y >= box(p).y + box(p).h, `${c} 가 ${p} 아래가 아님`)
}
assert.equal(g.edges.length, base.length - 1)

// 같은 깊이는 같은 행, 형제는 order 순 왼→오른쪽, 간격 이상
assert.equal(box('근로계약').y, box('임금').y)
assert(box('근로계약').x + box('근로계약').w + HGAP <= box('해고').x)
assert(box('해고').x + box('해고').w + HGAP <= box('임금').x)

// 부모가 자식들 가운데 (첫·마지막 자식 중심의 중간)
for (const p of ['노동법', '근로계약', '해고']) {
  const kids = g.edges.filter(([a]) => a === p).map(([, c]) => box(c))
  assert.equal(center(box(p)), (center(kids[0]) + center(kids[kids.length - 1])) / 2, `${p} 가 가운데가 아님`)
}

// 긴 제목 노드가 더 넓고(최대 240) 줄바꿈으로 높다, 그 행 아래가 밀려난다
const long = box(base[5].id)
assert(long.w > box('해고예고').w && long.w === 240 && long.h > box('해고예고').h)
assert(box('부당해고 구제').y >= long.y + long.h)

// 접힌 하위 제외
const folded = layout(base.map((n) => (n.id === '해고' ? { ...n, collapsed: true } : n)), '노동법', measure)
assert(folded.boxes.has('해고') && !folded.boxes.has('해고예고') && !folded.boxes.has('부당해고 구제'))
assert(!folded.edges.some(([p]) => p === '해고'))

// offset: 노드와 서브트리가 함께 이동, 나머지는 그대로
const moved = layout(base.map((n) => (n.id === '해고' ? { ...n, offset: { x: 50, y: 30 } } : n)), '노동법', measure)
for (const id of ['해고', '해고예고', '부당해고 구제']) {
  assert.equal(moved.boxes.get(id)!.x, box(id).x + 50)
  assert.equal(moved.boxes.get(id)!.y, box(id).y + 30)
}
assert.equal(moved.boxes.get('임금')!.x, box('임금').x)
// 음수 offset 은 전체를 여백 안으로 평행이동
const neg = layout(base.map((n) => (n.id === '근로계약' ? { ...n, offset: { x: -500, y: 0 } } : n)), '노동법', measure)
assert(Math.min(...[...neg.boxes.values()].map((b) => b.x)) === 32)

// 부모가 자식 묶음보다 넓으면 자식들이 부모 아래 가운데
const wide = layout([mk('아주 긴 루트 제목입니다 정말로 깁니다', null), mk('a', '아주 긴 루트 제목입니다 정말로 깁니다')], '아주 긴 루트 제목입니다 정말로 깁니다', measure)
const [r, a] = [...wide.boxes.values()]
assert.equal(center(r), center(a))

// 보기 깊이(C3): 깊이 2(루트=0) 이상의 자식은 그리지 않는다, 포커스(rootId = 가지)는 그 가지만
const d2 = layout(base, '노동법', measure, (n, d) => isOpen(n) && d + 1 < 2)
assert(d2.boxes.has('해고') && !d2.boxes.has('해고예고') && d2.boxes.size === 4)
const focus = layout(base, '해고', measure)
assert(focus.boxes.size === 4 && !focus.boxes.has('노동법') && focus.boxes.get('해고')!.depth === 0)

// 검색(U16): 부분 일치·대소문자 무시·상한
assert.equal(searchNodes(base, ' 해고 ').map((n) => n.id).join(','), ['해고', '해고예고', '부당해고 구제'].join(','))
assert.equal(searchNodes(base, '해고', 2).length, 2)
assert.equal(searchNodes([mk('TCP SYN', null)], 'syn').length, 1)
assert.equal(searchNodes(base, '  ').length, 0)

// U09: 실행 취소가 바꾼 곳 — 가져오기(대상 패치 + 하위 추가)는 대상, 지우기만 했으면 남은 부모, 되살린 가지는 그 꼭대기
{
  const r = mk('R', null), a = mk('A', 'R'), b = mk('B', 'A'), c = mk('C', 'A')
  const before = [r, a, b, c]
  const ra = { ...r, title: 'R2' }
  assert.equal(changedNode(before, [ra, a, b, c, mk('X', 'R'), mk('Y', 'X')]), 'R', '가져오기 다시 실행')
  assert.equal(changedNode([ra, a, b, c, mk('X', 'R')], before), 'R', '가져오기 되돌림')
  assert.equal(changedNode([{ ...r, collapsed: true }], before), 'A', '접은 뒤 실행 취소 → 접기는 바뀐 곳이 아님')
  assert.equal(changedNode([r], before), 'A', '삭제 되돌림 → 가지 꼭대기')
  assert.equal(changedNode(before, [r]), 'R', '삭제 다시 실행 → 남은 부모')
  assert.equal(changedNode(before, before), undefined)
}

// U21: 형제 수천 개(자식 묶기 O(n)) — 입력 순서와 무관하게 order 순으로 왼쪽부터
{
  const r = mk('W', null)
  const kids = Array.from({ length: 3000 }, (_, i) => ({ ...mk(`w${i}`, 'W'), order: 3000 - i }))
  const g = layout([r, ...kids], 'W', () => ({ w: 10, h: 10 }))
  assert.equal(g.boxes.size, 3001)
  assert(g.boxes.get('w2999')!.x < g.boxes.get('w0')!.x, '형제는 order 순')
}

// 세로 보기(dir right): 깊이 = 열(x 증가), 형제는 세로로 쌓임, 겹침 없음, 실제 크기 유지
{
  const r = layout(base, '노동법', measure, isOpen, 'right')
  const all = [...r.boxes.values()]
  for (const [a, b] of r.edges) assert(r.boxes.get(b)!.x > r.boxes.get(a)!.x + r.boxes.get(a)!.w - 1, 'child right of parent')
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert(!overlap(all[i], all[j]), 'right: no overlap')
  for (const n of base) if (r.boxes.has(n.id)) assert(r.boxes.get(n.id)!.w === measure(n).w, 'right keeps size')
  // 방향별 위치(C1): right 는 vx·vy 만 쓰고 x·y 는 무시, down 은 반대
  const both = base.map((n) => (n.id === '해고' ? { ...n, offset: { x: 50, y: 30, vx: 70, vy: 40 } } : n))
  const rv = layout(both, '노동법', measure, isOpen, 'right')
  for (const id of ['해고', '해고예고', '부당해고 구제']) {
    assert.equal(rv.boxes.get(id)!.x, r.boxes.get(id)!.x + 70, 'right: vx → 화면 x')
    assert.equal(rv.boxes.get(id)!.y, r.boxes.get(id)!.y + 40, 'right: vy → 화면 y')
  }
  assert.equal(rv.boxes.get('임금')!.x, r.boxes.get('임금')!.x)
  const onlyXY = layout(base.map((n) => (n.id === '해고' ? { ...n, offset: { x: 50, y: 30 } } : n)), '노동법', measure, isOpen, 'right')
  for (const [id, b] of onlyXY.boxes) assert(b.x === r.boxes.get(id)!.x && b.y === r.boxes.get(id)!.y, 'right ignores x·y')
  const dv = layout(both, '노동법', measure)
  for (const id of ['해고', '해고예고', '부당해고 구제']) assert(dv.boxes.get(id)!.x === box(id).x + 50 && dv.boxes.get(id)!.y === box(id).y + 30, 'down: x·y')
  const onlyV = layout(base.map((n) => (n.id === '해고' ? { ...n, offset: { x: 0, y: 0, vx: 70, vy: 40 } } : n)), '노동법', measure)
  for (const [id, b] of onlyV.boxes) assert(b.x === box(id).x && b.y === box(id).y, 'down ignores vx·vy')
}
console.log('layout.check: ok')
