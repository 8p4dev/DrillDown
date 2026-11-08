import { chromium } from 'playwright'
const B = process.env.BASE || 'http://127.0.0.1:4310'
const login = (n) => `${B}/api/auth/fake/start?as=user&name=${n}&return_to=%23%2F`
const browser = await chromium.launch({ channel: 'msedge' })
const name = 'E2tl3'
const a = await browser.newContext(); const pa = await a.newPage()
await pa.goto(login(name)); await pa.waitForTimeout(1000)
const ids = await pa.evaluate(async () => {
  const t0 = Date.now() - 60000; const trees = [], nodes = []
  for (let i = 0; i < 200; i++) { const T = crypto.randomUUID(); trees.push({ id: T, title: 't' + i, createdAt: t0, updatedAt: t0 }); nodes.push({ id: crypto.randomUUID(), treeId: T, parentId: null, order: 0, title: 't' + i, aliases: [], updatedAt: t0 }) }
  const st = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trees, nodes, srs: [], attempts: [], deleted: { trees: [], nodes: [] } }) }).then(r => r.status)
  return { st, first: trees[0].id }
})
console.log('seed', ids.st)
await a.close()
const b = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await b.newPage()
await p.goto(login(name)); await p.waitForTimeout(6000)
console.log('cards', await p.locator('.tree-cards > li').count())
await p.fill('input[aria-label="새 트리 제목"]', '201번째'); await p.press('input[aria-label="새 트리 제목"]', 'Enter')
await p.waitForTimeout(4000)
// 기존 트리 t0 에 자식 추가
await p.goto(`${B}/#/tree/${ids.first}`); await p.waitForTimeout(1500)
const url = p.url(); await p.waitForTimeout(500)
await p.getByLabel('개요 텍스트').fill('child'); await p.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
await p.waitForTimeout(5000)
const srv = await p.evaluate(async (id) => (await (await fetch('/api/trees/' + id)).json()).nodes.length, ids.first)
console.log({ localTreeItems: await p.locator('[role=treeitem]').count(), url, serverNodesOfT0: srv, status: await p.locator('[class*=sync]').first().getAttribute('aria-label').catch(() => null) })
// M1: Tab 10번 후 포커스 위치
for (let i = 0; i < 10; i++) await p.keyboard.press('Tab')
console.log('M1 focus after 10 Tab:', await p.evaluate(() => { const e = document.activeElement; return e.tagName + ' ' + (e.getAttribute('aria-label') || e.className) }))
await browser.close()
