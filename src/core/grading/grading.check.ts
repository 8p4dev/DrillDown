// 자체 점검: npx tsx src/core/grading/grading.check.ts (plan §2 R3 완료 기준)
import type { TreeNode } from '../types'
import { gradeBlank, normalize, resolveGradeSource, similarity, splitIdeaUnits, THRESHOLDS, type NodeMatch, type UserNode } from './index'

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error('FAIL: ' + msg)
}
const eq = (a: unknown, b: unknown, msg: string) =>
  check(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)

let order = 0
const node = (id: string, parentId: string, title: string, aliases: string[] = []): TreeNode => ({
  id, treeId: 't', parentId, order: order++, title, aliases, updatedAt: 0,
})
const u = (tempId: string, parentTempId: string | null, text: string): UserNode => ({ tempId, parentTempId, text })
const by = (ms: NodeMatch[], id: string) => ms.find((m) => m.origNodeId === id)!

// ① 정규화: 공백·기호·번호·조사
eq(normalize('1. 근로기준법의'), '근로기준법', '번호+조사')
eq(normalize('  가) 부당 해고 (구제)  '), '부당해고구제', '번호+공백+괄호')
eq(normalize('① 행정소송에 대한'), '행정소송', '원문자+에 대한')
eq(normalize('(1) 임금은'), '임금', '(1)+은')
eq(normalize('국가'), '국가', '짧은 단어는 조사 제거 안 함')
eq(normalize('- ABC·Def!'), 'abcdef', '글머리+대소문자+기호')

// ③ 자모 유사도
check(similarity('근로기준법', '근로기쥰법') >= THRESHOLDS.accept, '한 글자 오타 ≥ accept')
check(similarity('행정소송', '근로계약') < THRESHOLDS.reject, '무관 단어 < reject')
eq(similarity('', ''), 1, '빈 문자열')

// ⑤ 의미 단위
eq(splitIdeaUnits('해고'), ['해고'], '짧으면 [title]')
eq(splitIdeaUnits('정당한 이유의 존재'), ['정당한', '이유', '존재'], '조사 제거 분해')
eq(splitIdeaUnits('요건 및 효과'), ['요건', '효과'], '및 제거')
eq(splitIdeaUnits('가 나 다 라 마 바').length, 3, '4개 초과 → 4묶음 이하')

// 원본: 루트 R
//  A 근로기준법 ─ A1 적용범위, A2 근로계약
//  B 해고 ─ B1 정당한 이유의 존재, B2 해고예고
//  C 부당해고 구제신청 (별칭: 구제신청)
const R = 'R'
const orig = [
  node('A', R, '근로기준법'), node('A1', 'A', '적용범위'), node('A2', 'A', '근로계약'),
  node('B', R, '해고'), node('B1', 'B', '정당한 이유의 존재'), node('B2', 'B', '해고예고'),
  node('C', R, '부당해고 구제신청', ['구제신청']),
]
const user = [
  u('u1', null, '1. 근로 기준법의'), //   A exact (공백·번호·조사)
  u('u2', 'u1', '근로계악'), //          A2 fuzzy (오타)
  u('u3', 'u1', '해고예고'), //          B2 exact, 그러나 A 밑 → misplaced
  u('u4', null, '해고'), //              B exact
  u('u5', 'u4', '정당한 이유'), //       B1 ambiguous
  u('u6', null, '구제신청'), //          C alias
  u('u7', 'u4', '행정소송'), //          무관 → A1 와 짝지어져 reject 또는 extra
]
const r = gradeBlank(orig, R, user)
eq(by(r.matches, 'A').autoClass, 'exact', 'exact')
eq(by(r.matches, 'A').structure, 'ok', 'A 구조 ok')
eq(by(r.matches, 'A2').autoClass, 'fuzzy', 'fuzzy')
eq(by(r.matches, 'A2').structure, 'ok', 'A2 구조 ok')
eq([by(r.matches, 'B2').autoClass, by(r.matches, 'B2').structure], ['exact', 'misplaced'], '다른 부모 → misplaced')
eq(by(r.matches, 'B1').autoClass, 'ambiguous', 'ambiguous')
eq(by(r.matches, 'B1').ideaUnits, ['정당한', '이유', '존재'], 'ambiguous ideaUnits')
eq(by(r.matches, 'C').autoClass, 'alias', 'alias')
eq([by(r.matches, 'A1').autoClass, by(r.matches, 'A1').userTempId, by(r.matches, 'A1').structure], ['reject', 'u7', null], '무관 → reject')
eq(r.extraUserNodes, [], 'extra 없음')
eq(r.nodeRecall, 6 / 7, 'nodeRecall')
eq(r.edgeAccuracy, 5 / 6, 'edgeAccuracy')

// 누락 + 남는 사용자 노드
const r2 = gradeBlank(orig, R, [u('x', null, '해고'), u('y', null, '노동조합'), u('z', null, '쟁의행위')])
eq(by(r2.matches, 'B').autoClass, 'exact', 'r2 B exact')
eq(r2.matches.filter((m) => m.autoClass === 'missing').length, 4, '누락 → missing')
check(r2.matches.filter((m) => m.autoClass === 'reject').length === 2, '남는 무관 노드는 reject 로 짝')
eq(r2.nodeRecall, 1 / 7, 'r2 recall')
const r3 = gradeBlank([node('P', R, '해고')], R, [u('a', null, '해고'), u('b', null, '임금')])
eq(r3.extraUserNodes.map((x) => x.tempId), ['b'], '할당 안 된 사용자 노드 → extra')
eq(gradeBlank([], R, []), { matches: [], extraUserNodes: [], nodeRecall: 0, edgeAccuracy: 0 }, '빈 입력')

// 순서 무관 최적 할당: 탐욕(u1 먼저)이면 u1→O2 를 가져가 u2 가 짝을 잃는다
const o2 = [node('O1', R, '근로계약'), node('O2', R, '근로계약서')]
const s1 = similarity(normalize('근로계약서류'), normalize('근로계약'))
const s2 = similarity(normalize('근로계약서류'), normalize('근로계약서'))
check(s2 > s1, '탐욕 함정 전제: u1 은 O2 를 더 선호')
for (const us of [
  [u('u1', null, '근로계약서류'), u('u2', null, '근로계약서')],
  [u('u2', null, '근로계약서'), u('u1', null, '근로계약서류')],
]) {
  const g = gradeBlank(o2, R, us)
  eq([by(g.matches, 'O1').userTempId, by(g.matches, 'O2').userTempId], ['u1', 'u2'], '최적 할당(순서 무관)')
  eq(by(g.matches, 'O2').autoClass, 'exact', 'O2 exact')
}

// 반복 제목: 같은 "요건" 이 두 부모 밑에 있어도 부모 기준으로 짝지어 모두 ok
const rep = [node('X', R, '해고'), node('X1', 'X', '요건'), node('Y', R, '징계'), node('Y1', 'Y', '요건')]
for (const us of [
  [u('a', null, '해고'), u('b', null, '징계'), u('c', 'b', '요건'), u('d', 'a', '요건')],
  [u('c', 'b', '요건'), u('d', 'a', '요건'), u('b', null, '징계'), u('a', null, '해고')],
]) {
  const g = gradeBlank(rep, R, us)
  eq([by(g.matches, 'X1').userTempId, by(g.matches, 'Y1').userTempId], ['d', 'c'], '반복 제목 부모 기준 할당')
  eq(g.edgeAccuracy, 1, '반복 제목 edgeAccuracy 1')
}

// resolveGradeSource
const amb = by(r.matches, 'B1') // ideaUnits 3개
eq(resolveGradeSource(by(r.matches, 'A')), 'exact', 'resolve exact')
eq(resolveGradeSource(by(r.matches, 'C')), 'alias', 'resolve alias')
eq(resolveGradeSource(by(r.matches, 'A2')), 'fuzzy', 'resolve fuzzy')
eq(resolveGradeSource(by(r.matches, 'A1')), 'auto_reject', 'resolve reject')
eq(resolveGradeSource(by(r2.matches, 'C')), 'auto_reject', 'resolve missing')
eq(resolveGradeSource(amb, 3), 'self_accept', 'resolve 전부 체크')
eq(resolveGradeSource(amb, 1), 'self_partial', 'resolve 일부 체크')
eq(resolveGradeSource(amb, 0), 'self_reject', 'resolve 0 체크')
eq(resolveGradeSource(amb), 'self_reject', 'resolve 미지정')

console.log('grading check OK')
