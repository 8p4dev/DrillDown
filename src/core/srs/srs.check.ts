// plan §2 R4 점검 — 순수 함수만 (DB 미사용). 실행: npx tsx src/core/srs/srs.check.ts
import { Rating } from 'ts-fsrs'
import type { GradeSource, NodeSrs, Structure, TreeNode } from '../types'
import { applyGrade, colorClass, colorMap, gradeToRating, isAutoCorrect, missHeat, nodeColor, retrievability } from './index'

// node:assert 대신 최소 assert — 앱 tsconfig 에 node 타입이 없음
const assert = {
  ok(c: unknown, msg = 'assert failed') {
    if (!c) throw new Error(msg)
  },
  equal(a: unknown, b: unknown, msg?: string) {
    assert.deepEqual(a, b, msg)
  },
  notEqual(a: unknown, b: unknown, msg?: string) {
    assert.ok(JSON.stringify(a) !== JSON.stringify(b), msg ?? `${JSON.stringify(a)} == ${JSON.stringify(b)}`)
  },
  deepEqual(a: unknown, b: unknown, msg?: string) {
    assert.ok(JSON.stringify(a) === JSON.stringify(b), `${msg ?? ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  },
}

const DAY = 864e5
const t0 = new Date(2026, 0, 1, 9)
const at = (days: number) => new Date(+t0 + days * DAY)
const grade = (prev: NodeSrs | undefined, src: GradeSource, now: Date, st: Structure = 'ok', id = 'n') =>
  applyGrade(prev, id, 'T', src, st, now)

// 1. 등급 매핑
assert.equal(gradeToRating('exact', 'ok'), Rating.Good)
assert.equal(gradeToRating('alias', 'ok'), Rating.Good)
assert.equal(gradeToRating('fuzzy', null), Rating.Good)
assert.equal(gradeToRating('exact', 'misplaced'), Rating.Hard)
assert.equal(gradeToRating('self_accept', 'ok'), Rating.Hard)
for (const s of ['self_partial', 'self_reject', 'auto_reject'] as const) assert.equal(gradeToRating(s, null), Rating.Again)
assert.ok(isAutoCorrect('fuzzy', 'ok') && !isAutoCorrect('exact', 'misplaced') && !isAutoCorrect('self_accept', 'ok'))

// 2. Hard 간격 < Good 간격 (첫 회, 2회차 모두)
const good1 = grade(undefined, 'exact', t0)
const hard1 = grade(undefined, 'self_accept', t0)
assert.ok(hard1.due < good1.due, 'Hard < Good (1회)')
const good2 = grade(good1, 'exact', at(5))
const hard2 = grade(good1, 'self_accept', at(5))
assert.ok(hard2.due < good2.due, 'Hard < Good (2회)')
assert.equal(good1.due, +(good1.card as { dueAt: Date }).dueAt)

// 3. 색: 자동 정답 직후 green, 시간이 지나면 lightgreen → none 으로 바램
assert.equal(nodeColor(undefined, t0).color, 'none')
assert.equal(nodeColor(good1, t0).color, 'green')
assert.ok(retrievability(good1, at(60)) < retrievability(good1, at(1)))
const faded = [0, 3, 10, 30, 120].map((d) => nodeColor(good1, at(d)).color)
assert.equal(faded[0], 'green')
assert.equal(faded.at(-1), 'none')
assert.ok(faded.includes('lightgreen'), `바램 단계에 lightgreen: ${faded}`)
assert.equal(nodeColor(grade(undefined, 'auto_reject', t0), t0).color, 'red')

// 4. self_accept → green 금지, pendingRecheck. 다음 자동 정답에서 해소
const sa = grade(undefined, 'self_accept', t0)
assert.equal(sa.pendingRecheck, true)
assert.equal(nodeColor(sa, t0).color, 'lightgreen')
assert.deepEqual(sa.autoCorrectDays, [], 'self_accept 는 자동 정답 날짜에 산입하지 않음')
// 자동 정답 후 재확인 대기 중인 노드(이전 회차 정답 → self_accept)도 green 금지
const saAfterGood = grade(good1, 'self_accept', at(5))
assert.notEqual(nodeColor(saAfterGood, at(5)).color, 'green')
// 위치 오류: Hard, green 금지 + misplaced 표시
const mis = grade(undefined, 'exact', t0, 'misplaced')
assert.deepEqual(nodeColor(mis, t0), { color: 'lightgreen', misplaced: true })
assert.equal(colorClass(nodeColor(mis, t0)), 'c-lightgreen c-misplaced')
assert.deepEqual(mis.autoCorrectDays, [])
// 재확인 대기 중 Again → 대기 유지
const saAgain = grade(sa, 'self_reject', at(1))
assert.equal(saAgain.pendingRecheck, true)
// 자동 정답 → 해소
const rechecked = grade(saAgain, 'exact', at(2))
assert.equal(rechecked.pendingRecheck, false)
assert.equal(nodeColor(rechecked, at(2)).color, 'green')

// 5. autoCorrectDays: 서로 다른 날만 쌓인다(저장 필드 유지)
const nodes: TreeNode[] = [
  { id: 'r', treeId: 'T', parentId: null, order: 0, title: 'R', aliases: [], updatedAt: 0 },
  { id: 'a', treeId: 'T', parentId: 'r', order: 0, title: 'A', aliases: [], updatedAt: 0 },
  { id: 'b', treeId: 'T', parentId: 'r', order: 1, title: 'B', aliases: [], updatedAt: 0 },
  { id: 'a1', treeId: 'T', parentId: 'a', order: 0, title: 'A1', aliases: [], updatedAt: 0 },
]
const twice = (id: string, d2: number) => grade(grade(undefined, 'exact', t0, 'ok', id), 'exact', at(d2), 'ok', id)
const srs = new Map(nodes.map((n) => [n.id, twice(n.id, 1)]))
assert.equal(srs.get('a')!.autoCorrectDays.length, 2)
assert.equal(twice('a1', 0.1).autoCorrectDays.length, 1, '같은 날 2회는 하루')

// 6. 부모 집계
const g = () => grade(undefined, 'exact', t0)
const set = (m: Record<string, NodeSrs | undefined>) =>
  colorMap(nodes, new Map(Object.entries(m).filter((e): e is [string, NodeSrs] => !!e[1])), t0)
let cm = set({ r: g(), a: g(), b: g(), a1: g() })
assert.equal(cm.get('r')!.color, 'green', '자식 모두 green → 부모 green')
cm = set({ r: g(), a: g(), b: g(), a1: sa })
assert.equal(cm.get('a')!.color, 'lightgreen', '손자 lightgreen → 부모 lightgreen')
assert.equal(cm.get('r')!.color, 'lightgreen', '집계가 위로 전파')
assert.equal(cm.get('a1')!.color, 'lightgreen')
cm = set({ r: g(), a: g(), b: grade(undefined, 'auto_reject', t0), a1: g() })
assert.equal(cm.get('r')!.color, 'lightgreen', 'red 자식 → 부모 green 아님')
assert.equal(cm.get('b')!.color, 'red')
cm = set({ r: undefined, a: g(), b: grade(undefined, 'auto_reject', t0), a1: g() })
assert.equal(cm.get('r')!.color, 'none', 'red 자식이 있어도 부모는 자기 상태(A5)')
cm = set({ r: g(), a: g(), b: undefined, a1: g() })
assert.equal(cm.get('r')!.color, 'lightgreen', '미학습 자식 → 부모 green 아님')
assert.equal(cm.size, nodes.length)

// miss: 틀리면 +1, 맞히면 -1, 0 미만 없음 → 붉은 농도
{
  const t0 = new Date('2026-01-01T00:00:00Z')
  let m = applyGrade(undefined, 'm', 't', 'auto_reject', null, t0)
  m = applyGrade(m, 'm', 't', 'auto_reject', null, t0)
  assert.equal(m.miss, 2)
  assert.equal(missHeat(m), 0.5)
  m = applyGrade(m, 'm', 't', 'exact', 'ok', t0)
  m = applyGrade(m, 'm', 't', 'exact', 'ok', t0)
  m = applyGrade(m, 'm', 't', 'exact', 'ok', t0)
  assert.equal(m.miss, 0)
  assert.equal(missHeat(undefined), 0)
}

// U33: fuzz — 같은 시각 첫 Good 100개의 기한이 하루에 다 몰리지 않는다(fuzz 끄면 100개 같은 날)
{
  const days = new Map<number, number>()
  for (let i = 0; i < 100; i++) {
    const d = Math.floor(grade(undefined, 'exact', t0, 'ok', `f${i}`).due / DAY)
    days.set(d, (days.get(d) ?? 0) + 1)
  }
  assert.ok(days.size >= 2 && Math.max(...days.values()) < 60, `fuzz 분포 ${JSON.stringify([...days])}`)
}

console.log('srs.check: ok')

// 서버에서 받은 행(JSON 직렬화된 card)도 채점·색 판정이 된다
{
  const t0 = new Date('2026-01-01T00:00:00Z')
  const first = applyGrade(undefined, 'n', 't', 'exact', 'ok', t0)
  const wire = JSON.parse(JSON.stringify(first)) as typeof first
  const later = new Date(+t0 + 3 * 864e5)
  assert.ok(retrievability(wire, later) > 0, 'wire card retrievability')
  assert.ok(applyGrade(wire, 'n', 't', 'exact', 'ok', later).due > +later, 'wire card regrade')
}

// S2 다시 평가: 첫 평가 전 기록(base=없음)을 기준으로 다시 계산하면 "처음부터 모름 1회" 와 같다. 이어서 기록하면 복습 2회가 된다
{
  const reps = (s: NodeSrs) => (s.card as { reps: number }).reps
  const known = applyGrade(undefined, 'n', 't', 'exact', 'ok', t0)
  const regraded = applyGrade(undefined, 'n', 't', 'auto_reject', null, t0) // base = undefined
  const fresh = applyGrade(undefined, 'n', 't', 'auto_reject', null, t0)
  assert.equal([regraded.miss, reps(regraded), regraded.lastGradeSource], [fresh.miss, reps(fresh), fresh.lastGradeSource], '다시 평가 = 처음 모름 1회')
  assert.equal(reps(applyGrade(known, 'n', 't', 'auto_reject', null, t0)), 2, '이어서 기록하면 2회')
}
