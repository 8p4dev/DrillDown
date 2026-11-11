import { expect, test, type Page } from '@playwright/test'
// 개선 오케스트레이션 회귀 (docs/plans/orchestration_improve.md §6): S1 다른 기기 학습 기록, H2 병합 시트 Esc
const login = async (page: Page, name: string, settle = true) => {
  const pulled = settle ? page.waitForResponse((r) => r.url().includes('/api/sync?since=') && r.ok()) : null
  await page.goto(`/api/auth/fake/start?as=user&name=${name}&return_to=%23%2F`)
  await expect(page.getByRole('link', { name: '계정' })).toBeVisible()
  await pulled
}
async function makeTree(page: Page, title: string, outline: string) {
  await page.goto('/#/')
  await page.getByLabel('새 트리 제목').fill(title)
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.locator('li[data-tree-id]', { hasText: title }).getByRole('link', { name: '편집' }).click()
  await page.getByLabel('개요 텍스트').fill(outline)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
}
test('S1: 다른 기기에서 받은 학습 기록으로 플래시가 깨지지 않는다', async ({ browser }) => {
  const a = await browser.newContext(); const pa = await a.newPage()
  await login(pa, 'srs1')
  await makeTree(pa, '헌법', '기본권\n  자유권\n  평등권')
  const id = pa.url().match(/tree\/([^/?]+)/)![1]
  await pa.goto(`/#/tree/${id}/flash`)
  await pa.locator('button[data-concept-id]').first().click()
  const kids = pa.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]')
  await kids.first().getByRole('button', { name: '모름', exact: true }).click()
  await expect.poll(async () => (await (await a.request.get(`/api/sync?since=0`)).json()).srs?.length ?? 0, { timeout: 15000 }).toBeGreaterThan(0)
  const b = await browser.newContext(); const pb = await b.newPage()
  const errs: string[] = []
  pb.on('pageerror', (e) => errs.push(e.message))
  await login(pb, 'srs1')
  await expect(pb.locator('li[data-tree-id]', { hasText: '헌법' })).toBeVisible({ timeout: 15000 })
  await pb.waitForTimeout(1500)
  await pb.goto(`/#/tree/${id}/flash`)
  await pb.locator('button[data-concept-id]').first().click()
  const kb = pb.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]')
  await kb.first().getByRole('button', { name: '알음', exact: true }).click()
  await pb.goto(`/#/tree/${id}`); await pb.waitForTimeout(800)
  expect(errs).toEqual([])
  await a.close(); await b.close()
})
test('H2: 병합 시트는 Esc 로 닫히지 않는다', async ({ browser }) => {
  const a = await browser.newContext(); const pa = await a.newPage()
  await makeTree(pa, '병합', 'x')
  await login(pa, 'merge1', false)
  const save = pa.getByRole('button', { name: '저장', exact: true })
  await expect(save).toBeVisible()
  await pa.keyboard.press('Escape')
  await expect(save).toBeVisible()
  await a.close()
})
