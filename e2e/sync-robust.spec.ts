import { expect, test, type Page } from '@playwright/test'

// 동기화 P0 회귀 (docs/plans/orchestration_p0_fix.md #1 D1·#2 D2). 시드는 같은 쿠키로 /api/sync 직접 push.
// 회귀 스크립트 docs/research/many_trees/regress/p1.mjs·tl.mjs 의 E2E 판

const login = async (page: Page, name: string) => {
  const pulled = page.waitForResponse((r) => r.url().includes('/api/sync?since=') && r.ok())
  await page.goto(`/api/auth/fake/start?as=user&name=${name}&return_to=%23%2F`)
  await expect(page.getByRole('link', { name: '계정' })).toBeVisible()
  await pulled
}

type Seed = { trees?: unknown[]; nodes?: unknown[] }
const push = (page: Page, b: Seed) =>
  page.evaluate(async (b) => {
    const r = await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trees: [], nodes: [], srs: [], attempts: [], deleted: { trees: [], nodes: [] }, ...b }) })
    return r.status
  }, b)

test('D1: 새 기기 첫 pull 이 여러 페이지여도 고아 복구로 구조가 바뀌지 않는다', async ({ browser }) => {
  const a = await browser.newContext()
  const pa = await a.newPage()
  await login(pa, 'robust-d1')
  const t0 = Date.now() - 60_000
  const T = crypto.randomUUID(), R = crypto.randomUUID()
  const mids = Array.from({ length: 300 }, (_, i) => ({ id: crypto.randomUUID(), treeId: T, parentId: R, order: i, title: 'mid' + i, aliases: [], updatedAt: t0 }))
  const leaves = mids.map((m, i) => ({ id: crypto.randomUUID(), treeId: T, parentId: m.id, order: 0, title: 'leaf' + i, aliases: [], updatedAt: t0 }))
  expect(await push(pa, { trees: [{ id: T, title: 'D1', createdAt: t0, updatedAt: t0 }], nodes: [{ id: R, treeId: T, parentId: null, order: 0, title: 'root', aliases: [], updatedAt: t0 }, ...mids] })).toBe(200)
  expect(await push(pa, { nodes: leaves })).toBe(200)
  // 부모만 나중에 고침 → 부모 seq 가 자식보다 뒤 = pull 뒤 페이지
  expect(await push(pa, { nodes: mids.map((m) => ({ ...m, title: m.title + '*', updatedAt: t0 + 1000 })) })).toBe(200)

  const b = await browser.newContext()
  const pb = await b.newPage()
  await login(pb, 'robust-d1')
  await expect(pb.locator('li[data-tree-id]', { hasText: 'D1' })).toBeVisible()
  await expect(pb.locator('.sync-status[data-kind="saved"]')).toBeVisible({ timeout: 15_000 })
  const { nodes } = (await (await b.request.get(`/api/trees/${T}`)).json()) as { nodes: { id: string; parentId: string | null; title: string }[] }
  const leafNodes = nodes.filter((n) => n.title.startsWith('leaf'))
  expect(leafNodes.filter((n) => n.parentId === R)).toHaveLength(0)
  expect(leafNodes.filter((n) => mids.some((m) => m.id === n.parentId))).toHaveLength(300)
  await a.close()
  await b.close()
})

test('D2: 201번째 트리는 보류되고 나머지는 올라가며, 트리를 지우면 보류가 풀린다', async ({ browser }) => {
  const a = await browser.newContext()
  const pa = await a.newPage()
  await login(pa, 'robust-d2')
  const t0 = Date.now() - 60_000
  const trees = Array.from({ length: 200 }, (_, i) => ({ id: crypto.randomUUID(), title: 'seed' + i, createdAt: t0, updatedAt: t0 }))
  const nodes = trees.map((t) => ({ id: crypto.randomUUID(), treeId: t.id, parentId: null, order: 0, title: t.title, aliases: [], updatedAt: t0 }))
  expect(await push(pa, { trees, nodes })).toBe(200)
  await a.close()

  const b = await browser.newContext()
  const p = await b.newPage()
  await login(p, 'robust-d2')
  await expect(p.locator('li[data-tree-id]')).toHaveCount(200, { timeout: 15_000 })
  await p.getByLabel('새 트리 제목').fill('201번째')
  await p.getByLabel('새 트리 제목').press('Enter')
  await expect(p.locator('.sync-status[data-kind="error"]')).toBeVisible({ timeout: 15_000 })
  await p.locator('.sync-status[data-kind="error"]').click()
  await expect(p.getByText('트리는 200개까지 저장할 수 있습니다 — 1개 보류')).toBeVisible()

  const onServer = async (title: string) => {
    const { trees } = (await (await b.request.get('/api/trees')).json()) as { trees: { title: string; deletedAt?: number | null }[] }
    return trees.some((t) => t.title === title && !t.deletedAt)
  }
  expect(await onServer('201번째')).toBe(false)

  // 다른 트리 삭제(이 tree del 행은 보류와 무관하게 올라간다) → 자리가 나서 보류 트리가 올라간다
  const card = p.locator('li[data-tree-id]').filter({ hasText: 'seed0' }).first()
  await card.getByLabel('더 보기').click()
  await card.getByRole('button', { name: '삭제' }).click()
  await expect.poll(() => onServer('seed0'), { timeout: 15_000 }).toBe(false)
  await expect.poll(() => onServer('201번째'), { timeout: 15_000 }).toBe(true)
  await expect(p.locator('.sync-status[data-kind="saved"]')).toBeVisible({ timeout: 15_000 })
  await b.close()
})
