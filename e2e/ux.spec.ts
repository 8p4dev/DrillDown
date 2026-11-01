import { expect, test, type Page } from '@playwright/test'

// UX 다듬기 검증 (docs/plans/orchestration_ux_polish.md §6): 삭제→실행 취소, 인라인 이름 변경, 배율 클릭=100%

async function seed(page: Page, outline: string) {
  await page.goto('/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  await page.getByLabel('개요 텍스트').fill(outline)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
}
const card = (page: Page, t: RegExp) =>
  page.locator('.node-row[data-node-id]').filter({ has: page.locator('.node-title', { hasText: t }) })

test('Delete 는 확인 없이 지우고 토스트 [실행 취소] 로 복원', async ({ page }) => {
  await seed(page, '해고\n  해고예고\n임금')
  page.on('dialog', () => {
    throw new Error('confirm 이 뜨면 안 됨')
  })
  await card(page, /^해고$/).click()
  await page.getByRole('tree').press('Delete')
  await expect(card(page, /^해고/)).toHaveCount(0)
  await page.locator('.toast').getByRole('button', { name: '실행 취소' }).click()
  await expect(card(page, /^해고$/)).toHaveCount(1)
  await expect(card(page, /^해고예고$/)).toHaveCount(1)
})

test('배율 숫자를 누르면 100%', async ({ page }) => {
  await seed(page, '해고')
  await page.getByRole('button', { name: '확대' }).click()
  const out = page.getByLabel('배율')
  await expect(out).toHaveText('120%')
  await out.click()
  await expect(out).toHaveText('100%')
})

test('트리 목록: 제목 더블클릭 → 인라인 이름 변경 → 새로고침 유지', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  const li = page.locator('li[data-tree-id]')
  await li.getByText('노동법').dblclick()
  await page.getByLabel('트리 이름').fill('민법')
  await page.getByLabel('트리 이름').press('Enter')
  await expect(li.getByText('민법')).toBeVisible()
  await page.reload()
  await expect(page.locator('li[data-tree-id]').getByText('민법')).toBeVisible()
})
