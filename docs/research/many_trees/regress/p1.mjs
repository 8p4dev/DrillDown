import { chromium } from 'playwright'
const B = process.env.BASE || 'http://127.0.0.1:4310'
const login = (n) => `${B}/api/auth/fake/start?as=user&name=${n}&return_to=%23%2F`
const browser = await chromium.launch({ channel: 'msedge' })
const name = process.argv[2] || 'E2p1'
// device A: API only
const a = await browser.newContext(); const pa = await a.newPage()
await pa.goto(login(name)); await pa.waitForTimeout(1500)
const r = await pa.evaluate(async () => {
  const u = () => crypto.randomUUID(); const T = u(), R = u(); const t0 = Date.now() - 60000
  const push = (b) => fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trees: [], nodes: [], srs: [], attempts: [], deleted: { trees: [], nodes: [] }, ...b }) }).then(r => r.status)
  const mids = Array.from({ length: 300 }, (_, i) => ({ id: u(), treeId: T, parentId: R, order: i, title: 'mid' + i, aliases: [], updatedAt: t0 }))
  const leaves = mids.map((m, i) => ({ id: u(), treeId: T, parentId: m.id, order: 0, title: 'leaf' + i, aliases: [], updatedAt: t0 }))
  const s = []
  s.push(await push({ trees: [{ id: T, title: 'P1 repro', createdAt: t0, updatedAt: t0 }], nodes: [{ id: R, treeId: T, parentId: null, order: 0, title: 'root', aliases: [], updatedAt: t0 }, ...mids] }))
  s.push(await push({ nodes: leaves }))
  // 부모(mid) 제목만 고침 → mid seq 가 leaf 보다 뒤로
  s.push(await push({ nodes: mids.map(m => ({ ...m, title: m.title + '*', updatedAt: t0 + 1000 })) }))
  return { T, R, s }
})
console.log('A pushes', r.s)
// device B: 새 브라우저 프로필, 앱 열기 → 첫 pull
const b = await browser.newContext(); const pb = await b.newPage()
await pb.goto(login(name)); await pb.waitForTimeout(12000)
const chk = await pb.evaluate(async ({ T, R }) => {
  const j = await (await fetch('/api/trees/' + T)).json()
  const byId = new Map(j.nodes.map(n => [n.id, n]))
  const leavesUnderRoot = j.nodes.filter(n => n.title.startsWith('leaf') && n.parentId === R).length
  const leavesOk = j.nodes.filter(n => n.title.startsWith('leaf') && byId.get(n.parentId)?.title.startsWith('mid')).length
  return { total: j.nodes.length, leavesUnderRoot, leavesOk }
}, r)
console.log('server after B', chk)
// device A 앱으로 다시 열어 반영 확인
await pa.goto(B + '/#/'); await pa.waitForTimeout(8000)
await browser.close()
