// npx tsx src/features/study/study.check.ts — 학습 화면 판정 규칙 점검
import { gradeBlank } from '../../core/grading'
import { parseOutline } from '../../core/outline'
import { isAutoCorrect } from '../../core/srs'
import type { TreeNode } from '../../core/types'
import { finalSource, linesToUserNodes, outlineToUserNodes, summarize } from './grade'

// node:assert 대신 최소 assert — 앱 tsconfig 에 node 타입이 없음
const assert = {
  ok(c: unknown, msg = 'assert failed') {
    if (!c) throw new Error(msg)
  },
  equal(a: unknown, b: unknown, msg = '') {
    assert.ok(JSON.stringify(a) === JSON.stringify(b), `${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  },
}

const n = (id: string, parentId: string | null, title: string, order = 0): TreeNode =>
  ({ id, treeId: 't', parentId, order, title, aliases: [], updatedAt: 0 })
const nodes = [n('r', null, '노동법'), n('a', 'r', '근로계약', 0), n('b', 'r', '해고', 1), n('c', 'r', '임금', 2), n('a1', 'a', '근로계약의 성립', 0)]
const orig = nodes.filter((x) => x.parentId !== null)

// 입력 변환
assert.equal(linesToUserNodes('근로계약\n\n 모름 \n해고').map((u) => u.text), ['근로계약', '해고'])
const un = outlineToUserNodes(parseOutline('노동법\n  근로계약\n    근로계약의 성립\n  임금'), '노동법')
assert.equal(un.map((u) => [u.text, u.parentTempId]), [['근로계약', null], ['근로계약의 성립', 'u0'], ['임금', null]])

// 채점 → 최종 판정
const r = gradeBlank(orig, 'r', un)
const m = (id: string) => r.matches.find((x) => x.origNodeId === id)!
assert.equal(m('b').autoClass, 'missing')
assert.equal(finalSource(m('a'), 0, false), 'exact')
assert.equal(finalSource(m('b'), 0, false), 'auto_reject')
assert.equal(finalSource(m('b'), 0, true), 'auto_reject', '누락은 뒤집기 불가')
assert.equal(finalSource(m('a'), 0, true), 'self_reject')
const rej = gradeBlank([n('z', 'r', '근로계약')], 'r', [{ tempId: 'u', parentTempId: null, text: '휴일근로' }]).matches[0]
assert.equal(rej.autoClass, 'reject')
assert.equal(finalSource(rej, 0, true), 'self_accept')
const amb = { ...m('a'), autoClass: 'ambiguous' as const, ideaUnits: ['근로', '계약'] }
assert.equal(finalSource(amb, 2, false), 'self_accept')
assert.equal(finalSource(amb, 1, false), 'self_partial')
assert.equal(finalSource(amb, 0, true), 'self_reject', '애매는 뒤집기 무시')

// 자기 판정은 green 대상(자동 정답)이 될 수 없다
for (const [mm, c, o] of [[amb, 2, false], [rej, 0, true], [m('a'), 0, true]] as const)
  assert.ok(!isAutoCorrect(finalSource(mm, c, o), 'ok'))

// 요약 = 채점 결과
const s = summarize({ ...r, matches: [...r.matches, amb] }, new Set(['a', 'b']))
assert.equal(s.ambiguous, 1)
assert.equal(s.overridden, 1, 'b(누락)는 뒤집기 집계 제외')
assert.equal(s.auto + s.self, r.matches.length + 1)
assert.equal(s.recall, r.nodeRecall)
assert.equal(s.edge, r.edgeAccuracy)
console.log('study.check OK')
