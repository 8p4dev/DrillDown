// 실행: npx tsx src/features/flash/flash.check.ts
import type { NodeSrs, TreeNode } from '../../core/types'
import { byOverdue, conceptsIn, minimapNodes, missedConcepts, parentQueue, plainNote, PROGRESS_TTL, readProgress, requeueMissed, weakQueue } from './flash'

const ok = (c: unknown, msg: string) => { if (!c) throw new Error(msg) }
const eq = (a: unknown, b: unknown, msg: string) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)

// r ─ a ─ a1 ─ a1x
//   │   └ a2
//   ├ b
//   └ c ─ c1
const n = (id: string, parentId: string | null, order: number): TreeNode =>
  ({ id, treeId: 't', parentId, order, title: id, aliases: [], updatedAt: 0 })
const nodes = [n('c1', 'c', 0), n('r', null, 0), n('c', 'r', 2), n('a', 'r', 0), n('b', 'r', 1), n('a2', 'a', 1), n('a1', 'a', 0), n('a1x', 'a1', 0)]

eq(conceptsIn(nodes, 'r'), ['r', 'a', 'a1', 'c'], '범위 개념: 전위·리프 제외')
eq(conceptsIn(nodes, 'a'), ['a', 'a1'], '범위 개념: 서브트리만')

const due = (nodeId: string) => ({ nodeId }) as NodeSrs
eq(parentQueue(nodes, [due('c1'), due('a2'), due('a1'), due('r'), due('zz')]), ['r', 'a', 'c'], '부모 큐: 전위 순서·중복 제거·루트는 자신·없는 노드 무시')

const d = (n: number) => ({ due: n }) as NodeSrs
eq(byOverdue([{ id: 'x', due: [d(5), d(9)] }, { id: 'y', due: [d(7), d(2)] }]).map((r) => r.id), ['y', 'x'], '복습 목록: 가장 오래 밀린 트리부터')

ok(minimapNodes([{ ...n('x', null, 0), collapsed: true, offset: { x: 5, y: 5 } }]).every((m) => !m.collapsed && !m.offset), '미니맵은 접힘·offset 무시')
eq(plainNote('- 하나 ==y:형광== 끝\n둘 ==p:a==b==b:c== '), '- 하나 형광 끝\n둘 abc', '형광펜 마커 제거')
eq(plainNote(undefined), '', '내용 없음')

// U38 진행 저장: 7일 만료·바뀐 트리·깨진 값은 버림
const prog = (at: number, queue = ['r', 'a', 'a1', 'c'], pos = 1, sub?: boolean) => JSON.stringify({ queue, base: queue.length, pos, tally: [['b', false]], shuffled: false, at, sub })
const concepts = conceptsIn(nodes, 'r')
eq(readProgress(prog(1000), concepts, 1000 + PROGRESS_TTL - 1)?.pos, 1, '7일 안 → 이어서')
eq(readProgress(prog(1000), concepts, 1000 + PROGRESS_TTL), null, '7일 지남 → 버림')
eq(readProgress(prog(0, ['r', 'a', 'a1', 'gone']), concepts, 0), null, '없는 개념 → 버림')
eq(readProgress(prog(0, ['r', 'a']), concepts, 0), null, '개념이 늘었음 → 버림')
eq(readProgress(prog(0, ['r', 'a'], 1, true), concepts, 0)?.queue, ['r', 'a'], 'S4 부분 큐(모름만 다시)는 개념 수 검사 없이 이어서')
eq(readProgress(prog(0, ['r', 'gone'], 1, true), concepts, 0), null, '부분 큐도 없는 개념은 버림')
eq(readProgress(prog(0, ['c', 'a1', 'a', 'r', 'a']), concepts, 0)?.queue.length, 5, '섞인 순서·재출제 꼬리 허용')
eq(readProgress(prog(0, undefined, 4), concepts, 0), null, 'pos 범위 밖 → 버림')
eq(readProgress('{', concepts, 0), null, '깨진 값 → 버림')
eq(readProgress(null, concepts, 0), null, '없음')
// U40 모름 재출제: 끝에 한 번만, 큐 순서대로
const byId = new Map(nodes.map((x) => [x.id, x]))
const missed = missedConcepts(byId, [['a2', false], ['b', false], ['a1', true], ['c1', false]])
eq([...missed], ['a', 'r', 'c'], '모름 하위의 부모')
eq(requeueMissed(['r', 'a', 'a1', 'c'], 4, 3, missed), ['r', 'a', 'a1', 'c', 'r', 'a', 'c'], '모름 개념을 끝에 큐 순서로')
eq(requeueMissed(['r', 'a', 'c', 'a'], 3, 3, new Set(['r'])), ['r', 'a', 'c', 'a'], '이미 붙였으면 다시 안 붙임')
eq(requeueMissed(['r', 'a'], 2, 1, new Set()), ['r', 'a'], '모름 없음 → 그대로')
eq(requeueMissed(['r', 'a', 'a1', 'c'], 4, 2, missed), ['r', 'a', 'a1', 'c'], '끝이 아니면 아직 안 붙임')

// S9 약점 집중: 자식 miss 합 > 0 인 개념만, 많이 틀린 순
{
  const m = (nodeId: string, miss: number) => [nodeId, { nodeId, miss } as NodeSrs] as const
  const srs = new Map([m('a2', 1), m('c1', 3), m('a1x', 0), m('r', 9)]) // r 자신의 miss 는 부모(없음)에만 쌓인다
  eq(weakQueue(nodes, srs, 'r'), ['c', 'a'], '많이 틀린 순(c=3, a=1), a1·r 제외')
  eq(weakQueue(nodes, srs, 'a'), ['a'], '범위 안만')
  eq(weakQueue(nodes, new Map(), 'r'), [], '대상 없음 → 빈 큐')
}

console.log('flash.check ok')
