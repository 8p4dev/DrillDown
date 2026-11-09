// 실행: npx tsx src/core/outline.check.ts
import { cloneBranch, nodesToOutline, outlineToNodes, parseOutline, serializeOutline, splitTitle, type OutlineItem } from './outline'

function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${msg}\n  actual:   ${a}\n  expected: ${e}`)
}
const I = (text: string, ...children: OutlineItem[]): OutlineItem => ({ text, children })

// 혼합 들여쓰기: 탭 / 2칸 / 4칸 / 전각 공백
eq(
  parseOutline('노동법\n\t개별적 근로관계법\n\t    근로계약\n    집단적 노사관계법\n      노동조합\n    　쟁의행위'),
  [I('노동법', I('개별적 근로관계법', I('근로계약')), I('집단적 노사관계법', I('노동조합'), I('쟁의행위')))],
  'mixed indentation',
)

// 번호·기호 제거
eq(
  parseOutline(
    ['- 가', '* 나', '• 다', '1. 라', '2) 마', '가. 바', '나) 사', '(1) 아', '(가) 자', '① 차', 'Ⅱ. 카', '1.2. 타', '1.2 파', '1.하'].join('\n'),
  ).map((x) => x.text),
  ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '1.하'], // U12: 공백 없는 번호는 남긴다(R4-A9)
  'bullet/number stripping',
)
// 번호처럼 보이지만 본문인 것은 남긴다
eq(parseOutline('가.나다\n근로기준법 제2조').map((x) => x.text), ['가.나다', '근로기준법 제2조'], 'keep non-bullets')

// 빈 줄·기호만 있는 줄 무시
eq(parseOutline('\nA\n\n   \n  B\n  -\n\n  C\n'), [I('A', I('B'), I('C'))], 'blank lines ignored')

// 왕복 parse(serialize(x)) == x
const sample = [I('노동법', I('근로계약', I('성립'), I('해지')), I('노동조합', I('설립'))), I('부록')]
eq(parseOutline(serializeOutline(sample)), sample, 'roundtrip')
eq(serializeOutline([I('a', I('b', I('c')))]), 'a\n  b\n    c', 'serialize 2-space')

// 노드 변환 왕복
const nodes = outlineToNodes(sample[0].children, 't1', 'R', 5)
eq(nodes.length, 5, 'node count')
eq(nodes.filter((n) => n.parentId === 'R').map((n) => n.order), [5, 6], 'startOrder')
const all = [{ id: 'R', treeId: 't1', parentId: null, order: 0, title: '노동법', aliases: [], updatedAt: 0 }, ...nodes]
eq(nodesToOutline(all, 'R'), sample[0].children, 'nodesToOutline')
eq(nodesToOutline(all, 'R', true), [sample[0]], 'nodesToOutline includeRoot')

console.log('outline ok')

// C5: 200자 초과 제목은 200자에서 자르고 나머지는 note
{
  const long = '가'.repeat(200) + ' 나머지'
  const [n] = outlineToNodes(parseOutline(long), 't', null)
  eq([n.title.length, n.note], [200, '나머지'], 'long title split into note')
  eq(splitTitle('짧은 제목'), { title: '짧은 제목' }, 'short title untouched')
  eq(splitTitle('a'.repeat(200)), { title: 'a'.repeat(200) }, 'exactly CAP.title untouched')
}

// U12(R4-A9 실패 예): 기호·번호 뒤 공백이 없으면 본문. 체크박스·인용 접두 제거
eq(
  parseOutline(['1.5배 증가', 'Ⅳ호 차량', '-5V 전원', '-5도 이상', 'TCP-SYN', '*args', '**굵게** 강조', '- [ ] 체크박스', '- [x] 완료', '> 인용', '- 5도 이상'].join('\n')).map((x) => x.text),
  ['1.5배 증가', 'Ⅳ호 차량', '-5V 전원', '-5도 이상', 'TCP-SYN', '*args', '**굵게** 강조', '체크박스', '완료', '인용', '5도 이상'],
  'bullet needs trailing space',
)
// 마크다운 헤딩 = 깊이, 헤딩 아래 불릿은 그 헤딩의 자식
eq(parseOutline('# 제목 헤더\n## 소제목\n- 불릿\n  - 하위\n## 둘\n# 다음'), [I('제목 헤더', I('소제목', I('불릿', I('하위'))), I('둘')), I('다음')], 'markdown headings')
// R4-A10: 2칸 문서의 탭은 한 단계(형제), 4칸 기본
eq(parseOutline('위\n  - 불릿 하나\n  - 불릿 둘\n\t탭'), [I('위', I('불릿 하나'), I('불릿 둘'), I('탭'))], 'tab = doc indent unit')
eq(parseOutline('위\n\t탭\n    넷'), [I('위', I('탭'), I('넷'))], 'tab default 4')

// U27(C6): `제목 :: 메모` 한 줄 메모, 내보내기 왕복(한 줄 메모만)
{
  const [it] = parseOutline('SYN Flood :: 대책: SYN Cookie\nC::D')
  eq([it.text, it.note], ['SYN Flood', '대책: SYN Cookie'], 'memo parsed')
  eq(parseOutline('C::D')[0], I('C::D'), 'no-space :: kept in title')
  eq(parseOutline('A \\:: B :: 메모')[0], { text: 'A :: B', note: '메모', children: [] }, 'escaped :: stays in title')
  eq(parseOutline(serializeOutline([I('A :: B')]))[0], I('A :: B'), 'title with :: roundtrips')
  const ns = [
    { id: 'R', treeId: 't', parentId: null, order: 0, title: 'R', aliases: [], updatedAt: 0 },
    ...outlineToNodes(parseOutline('A :: 한 줄\n  B'), 't', 'R'),
  ]
  eq(ns[1].note, '한 줄', 'memo → note')
  eq(serializeOutline(nodesToOutline(ns, 'R')), 'A :: 한 줄\n  B', 'memo roundtrip')
  eq(serializeOutline(nodesToOutline([...ns.slice(0, 1), { ...ns[1], note: '둘\n줄' }, ns[2]], 'R')), 'A\n  B', 'multi-line note not exported')

  // U26: 가지 복제 — 새 id, 같은 부모, 구조·메모 유지
  const copy = cloneBranch(ns, ns[1].id, 0.5)
  eq(copy.map((n) => [n.title, n.note ?? null]), [['A', '한 줄'], ['B', null]], 'clone titles')
  eq([copy[0].parentId, copy[0].order, copy[1].parentId === copy[0].id, copy.some((c) => ns.some((n) => n.id === c.id))], ['R', 0.5, true, false], 'clone ids/parents')
}
console.log('outline U12/U26/U27 ok')
