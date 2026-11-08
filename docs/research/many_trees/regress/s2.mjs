import { chromium } from 'playwright'
const B = process.env.BASE || 'http://127.0.0.1:4310'
const browser = await chromium.launch({ channel: 'msedge' })
const c = await browser.newContext(); const p = await c.newPage()
await p.goto(`${B}/api/auth/fake/start?as=user&name=E2s2&return_to=%23%2F`); await p.waitForTimeout(800)
const slug = await p.evaluate(async () => {
  const u = () => crypto.randomUUID(); const T = u(), R = u(), A = u(), Bn = u(); const t0 = Date.now() - 1000
  const n = (id, pid, t, o) => ({ id, treeId: T, parentId: pid, order: o, title: t, aliases: [], updatedAt: t0 })
  await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trees: [{ id: T, title: 'S2', createdAt: t0, updatedAt: t0 }], nodes: [n(R, null, 'root', 0), n(A, R, 'A', 0), n(u(), A, 'a1', 0), n(u(), A, 'a2', 0), n(Bn, R, 'B', 1), n(u(), Bn, 'b1', 0)], srs: [], attempts: [], deleted: { trees: [], nodes: [] } }) })
  const r = await fetch(`/api/trees/${T}/visibility`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'unlisted' }) })
  return (await r.json()).slug
})
console.log('slug', slug)
await p.goto(`${B}/t/${slug}?m=dnd`); await p.waitForTimeout(2500)
const sel = p.locator('select[aria-label="범위"]')
console.log('scope select count', await sel.count(), 'tray before', await p.locator('.dnd-tray [data-card], .tray .card, [class*=tray] [class*=card]').count())
if (await sel.count()) {
  const v = await sel.locator('option').nth(1).getAttribute('value')
  await sel.selectOption(v); await p.waitForTimeout(2000)
  console.log('after select url', p.url(), 'body:', (await p.locator('main, body').first().innerText()).slice(0, 200).replace(/\n/g, ' | '))
}
await browser.close()
