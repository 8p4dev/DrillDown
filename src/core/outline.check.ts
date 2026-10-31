// 실행: npx tsx src/core/outline.check.ts
import { nodesToOutline, outlineToNodes, parseOutline, serializeOutline, type OutlineItem } from './outline'

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
  ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'],
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
