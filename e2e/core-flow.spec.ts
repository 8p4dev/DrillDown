import { expect, test } from '@playwright/test'

// 에디터 흐름: 생성 → 개요 가져오기 → 키보드 편집(한글) → 새로고침 유지. 모드별 흐름은 docs/plans/orchestration_modes.md §6 에서 추가

const OUTLINE = `근로계약
  근로조건명시
  위약예정금지
해고
  정당한이유
  해고예고
임금
  통상임금
  평균임금`

test('에디터 흐름', async ({ page }) => {
  await page.goto('/')

  // 1. 트리 생성
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  const rows = page.locator('.node-row[data-node-id]')
  await expect(rows).toHaveCount(1)

  // 2. 개요 붙여넣기 (루트 선택 상태에서 자식으로)
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await expect(rows).toHaveCount(10)

  // 3. 키보드로 형제 추가(한글): '임금' 선택 → Enter → 입력 → Esc
  await rows.filter({ has: page.locator('.node-title', { hasText: /^임금$/ }) }).click()
  await page.getByRole('tree').press('Enter')
  await page.getByLabel('노드 제목').fill('근로시간')
  await page.getByLabel('노드 제목').press('Escape')
  await expect(rows).toHaveCount(11)

  // 4. 새로고침 후 유지
  await page.reload()
  await expect(rows).toHaveCount(11)
  await expect(rows.filter({ hasText: '근로시간' })).toHaveCount(1)

  // 5. 내용(불릿) + 형광펜 + 너비 단계 → 새로고침 유지
  const row = rows.filter({ has: page.locator('.node-title', { hasText: /^해고$/ }) })
  await row.click()
  const panel = page.getByRole('textbox', { name: '패널 내용' })
  await panel.click()
  await panel.fill('- 정당한 이유 필요\n+ 30일 전 예고\n서면 통지')
  await page.keyboard.press('Shift+Home')
  await page.getByRole('button', { name: '형광펜 분홍' }).click()
  await page.getByRole('tree').click({ position: { x: 5, y: 5 } })
  await expect(row.locator('.node-note .ln.b')).toHaveCount(2)
  await expect(row.locator('.node-note mark.hl-p')).toHaveCount(1)
  const h = (await row.locator('.w-handle.r').boundingBox())!
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2)
  await page.mouse.down()
  await page.mouse.move(h.x + 100, h.y + h.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(row).toHaveAttribute('data-width', '3')
  await page.reload()
  await expect(row).toHaveAttribute('data-width', '3')
  await expect(row.locator('.node-note .ln.b')).toHaveCount(2)
  await expect(row.locator('.node-note mark.hl-p')).toHaveCount(1)
})
