// 300노드 트리의 바이트 측정. 실행: node docs/specs/evidence/sh/measure_size.mjs
// 가정: 노무사 2차 목차 수준의 한글 제목(평균 9자), 노드 30%에 별칭 1~2개, 15%에 note(평균 60자), 15%에 offset, 10%에 width
import { gzipSync, deflateRawSync, brotliCompressSync } from 'node:zlib'
import { randomUUID } from 'node:crypto'

const WORDS = ['근로기준법','해고','부당해고','구제절차','노동위원회','단체교섭','쟁의행위','임금','퇴직금','연차유급휴가','취업규칙','근로계약','징계','전직','휴직','산업재해','보상','사용자','근로자','노동조합','교섭창구','단일화','조정','중재','직장폐쇄','대체근로','부당노동행위','지배개입','해고예고','정리해고','요건','절차','효과','판례','학설','쟁점','의의','요건사실','입증책임','구제명령']
const pick = (i) => WORDS[(i * 7 + 3) % WORDS.length]
const title = (i) => `${pick(i)}의 ${pick(i + 11)}`.slice(0, 9 + (i % 5))

function makeTree(n = 300) {
  const now = Date.now()
  const treeId = randomUUID()
  const nodes = []
  const root = { id: randomUUID(), treeId, parentId: null, order: 0, title: '근로기준법 해고', aliases: [], updatedAt: now }
  nodes.push(root)
  const parents = [root]
  for (let i = 1; i < n; i++) {
    const parent = parents[Math.floor(Math.log2(i + 1))] ?? parents[parents.length - 1]
    const node = { id: randomUUID(), treeId, parentId: parent.id, order: i % 7, title: title(i), aliases: [], updatedAt: now - i * 1000 }
    if (i % 10 < 3) node.aliases = i % 2 ? [pick(i + 1)] : [pick(i + 1), pick(i + 2) + ' 약어']
    if (i % 20 < 3) node.note = `- ${pick(i)}은 ${pick(i + 5)}을 전제로 한다\n- ==y:${pick(i + 9)}== 가 핵심 쟁점`
    if (i % 20 === 7) node.collapsed = true
    if (i % 20 < 3) node.offset = { x: (i * 37) % 400 - 200, y: (i * 53) % 300 - 150 }
    if (i % 10 === 4) node.width = 2
    nodes.push(node)
    if (nodes.length % 3 === 0) parents.push(node)
  }
  const tree = { id: treeId, title: root.title, createdAt: now - 86400000, updatedAt: now }
  return { tree, nodes }
}

const fmt = (b) => `${b.toLocaleString()} B (${(b / 1024).toFixed(1)} KB)`
const b64url = (buf) => buf.toString('base64url')

for (const n of [30, 100, 300, 1000]) {
  const t = makeTree(n)
  const json = Buffer.from(JSON.stringify(t), 'utf8')
  const gz = gzipSync(json, { level: 9 })
  const dfl = deflateRawSync(json, { level: 9 })
  const br = brotliCompressSync(json)
  // 해시 공유용 축약 형식: id 제거, 전위 순회 [depth, title, aliases?]
  const compact = JSON.stringify({ t: t.tree.title, n: t.nodes.slice(1).map((x) => [x.parentId === t.nodes[0].id ? 1 : 2, x.title, ...(x.aliases.length ? [x.aliases] : [])]) })
  const cdfl = deflateRawSync(Buffer.from(compact, 'utf8'), { level: 9 })
  console.log(`\n# 노드 ${n}개`)
  console.log(`JSON(전체, id 포함)      : ${fmt(json.length)}  (노드당 ${(json.length / n).toFixed(0)} B)`)
  console.log(`gzip -9                  : ${fmt(gz.length)}`)
  console.log(`brotli                   : ${fmt(br.length)}`)
  console.log(`deflate-raw → base64url  : ${dfl.length} B → URL 해시 ${b64url(dfl).length} 글자`)
  console.log(`축약(id 없음) → deflate → base64url: 원문 ${Buffer.byteLength(compact)} B → ${cdfl.length} B → URL 해시 ${b64url(cdfl).length} 글자`)
}

// 서버 행 크기 추정 (Postgres, 노드 1행): uuid 16×3 + order 8 + title ~40 + note 평균 + aliases jsonb + collapsed 1 + offset jsonb + width 2 + updated_at 8 + deleted_at 8 + 튜플 헤더 24 + 인덱스(pk 16+8, tree_id+updated_at 16+8+8)
const t300 = makeTree(300)
const avgTitle = t300.nodes.reduce((s, x) => s + Buffer.byteLength(x.title), 0) / 300
const avgNote = t300.nodes.reduce((s, x) => s + Buffer.byteLength(x.note ?? ''), 0) / 300
const avgAlias = t300.nodes.reduce((s, x) => s + Buffer.byteLength(JSON.stringify(x.aliases)), 0) / 300
const row = 24 + 16 * 3 + 8 + (avgTitle + 4) + (avgNote + 4) + (avgAlias + 4) + 1 + 20 + 2 + 8 + 8
const idx = (16 + 8) + (16 + 8 + 8 + 8)
console.log(`\n# Postgres 노드 1행 추정: 본문 ${row.toFixed(0)} B + 인덱스 ${idx} B ≈ ${(row + idx).toFixed(0)} B  (평균 title ${avgTitle.toFixed(0)} B, note ${avgNote.toFixed(0)} B, aliases ${avgAlias.toFixed(0)} B)`)
console.log(`# 트리 300노드 DB 점유 ≈ ${((row + idx) * 300 / 1024).toFixed(0)} KB`)
// srs 1행: node_id 16 + user_id 16 + tree_id 16 + card jsonb(~220) + due 8 + last_grade_source 12 + last_structure 10 + auto_correct_days jsonb(~40) + pending 1 + miss 2 + updated_at 8 + 헤더 24 + pk 인덱스 32 + due 인덱스 24
console.log(`# srs 1행 추정 ≈ ${24 + 16 * 3 + 220 + 8 + 12 + 10 + 40 + 1 + 2 + 8 + 32 + 24} B`)

// 편향 보정: 위 어휘는 40단어라 압축이 과하게 잘 된다. 무작위 한글 음절 제목(엔트로피 상한)으로 다시 잰다
const syl = (i) => String.fromCharCode(0xac00 + ((i * 2654435761) >>> 0) % 11172)
const randTitle = (i, len) => Array.from({ length: len }, (_, k) => syl(i * 31 + k)).join('')
for (const n of [100, 300]) {
  const rows = Array.from({ length: n }, (_, i) => [1 + (i % 3), randTitle(i, 9), ...(i % 10 < 3 ? [[randTitle(i + 7, 5)]] : [])])
  const compact = JSON.stringify({ t: randTitle(0, 8), n: rows })
  const d = deflateRawSync(Buffer.from(compact, 'utf8'), { level: 9 })
  console.log(`# 무작위 음절 ${n}노드 축약: 원문 ${Buffer.byteLength(compact)} B → deflate ${d.length} B → base64url ${b64url(d).length} 글자 (상한)`)
}
