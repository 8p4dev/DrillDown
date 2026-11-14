// 내용 형식 자기 점검: npx tsx src/features/editor/content/content.check.ts
import { autoBullet, highlight, parse, serialize, toggleBullet, toHtml } from './format'

// node:assert 대신 (앱 tsconfig 에 node 타입 없음)
const eq = (a: unknown, b: unknown, msg = '') => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)
}
const assert = { equal: eq, deepEqual: eq }

const round = (s: string) => serialize(parse(s))

// 왕복
for (const s of ['', '평문 메모', '- 불릿\n- 두번째', '앞 ==y:노랑== 뒤 ==p:분홍====b:하늘==', '- ==b:전부==\n\n끝', 'a==b 는 그냥 텍스트'])
  assert.equal(round(s), s, s)
assert.equal(round('+ 플러스\n* 별'), '- 플러스\n- 별') // 입력 불릿은 '- ' 로 통일
assert.equal(round('\n  \n'), '') // 공백뿐이면 빈 내용

// 형광펜: 줄 걸침, 덮어쓰기, 지우기, 병합
const L = parse('가나다라\n마바사')
assert.equal(serialize(highlight(L, { line: 0, col: 1 }, { line: 0, col: 3 }, 'y')), '가==y:나다==라\n마바사')
assert.equal(serialize(highlight(L, { line: 0, col: 2 }, { line: 1, col: 1 }, 'p')), '가나==p:다라==\n==p:마==바사')
const H = parse('==y:가나다==')
assert.equal(serialize(highlight(H, { line: 0, col: 1 }, { line: 0, col: 2 }, 'b')), '==y:가====b:나====y:다==')
assert.equal(serialize(highlight(H, { line: 0, col: 0 }, { line: 0, col: 3 }, null)), '가나다')
assert.equal(serialize(highlight(parse('==y:가==나'), { line: 0, col: 1 }, { line: 0, col: 2 }, 'y')), '==y:가나==')

// 불릿 토글: 섞여 있으면 전부 켬, 전부면 끔
const B = parse('- a\nb')
assert.equal(serialize(toggleBullet(B, 0, 1)), '- a\n- b')
assert.equal(serialize(toggleBullet(parse('- a\n- b'), 0, 1)), 'a\nb')

// 자동 불릿: '- ', '+ ', '* ' 줄머리 → 불릿, 접두 2글자 제거
const A = autoBullet([{ bullet: false, segs: [{ text: '* ' }, { text: '강조', c: 'y' }] }, { bullet: false, segs: [{ text: '-x' }] }])
assert.deepEqual(A.changed, [0])
assert.equal(serialize(A.lines), '- ==y:강조==\n-x')

// HTML: 이스케이프, 빈 줄 <br>
assert.equal(toHtml(parse('- <b>&\n==p:x==')), '<div class="ln b">&lt;b&gt;&amp;</div><div class="ln"><mark class="hl-p">x</mark></div>')
assert.equal(toHtml(parse('')), '<div class="ln"><br></div>')
// 보안(S3): 사용자 텍스트의 < > 는 전부 엔티티로 — 결과에 남는 태그는 div·mark·br 뿐이어야 한다(dangerouslySetInnerHTML 3곳의 유일한 방어선)
// 허용 태그(정확한 형태)를 벗겨낸 뒤 '<' 가 하나도 남지 않아야 한다 — 접두 lookahead 는 `<div onclick=` 을 통과시켰다(v2 사각)
const ALLOWED = /<\/?div(?: class="ln(?: b)?")?>|<\/?mark(?: class="hl-[pyb]")?>|<br>/g
for (const evil of ['<img onerror=x>==p:</mark>==', '==p:<script>alert(1)</script>==', '" onmouseover=alert(1) x="', '<svg onload=alert(1)>', '== ==" onclick="x', '<div onclick=alert(1)>x', '==p:<mark onmouseover=alert(1)>==', '<br onload=alert(1)>'])
  assert.equal(toHtml(parse(evil)).replace(ALLOWED, '').includes('<'), false, `toHtml escapes tags: ${evil}`)

console.log('content.check ok')
