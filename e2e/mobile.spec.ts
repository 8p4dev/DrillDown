import { expect, test, type Page } from '@playwright/test'

// 모바일 스모크 (docs/plans/orchestration_visual_polish.md §4 A4): 390×844 터치 — 맞춤 · 탭 평가 · 탭 놓기
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const OUTLINE = `근로계약
  근로조건명시
  위약예정금지
해고
  정당한이유
  해고예고
임금
  통상임금
  평균임금`

const noSideScroll = (page: Page) =>
  expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)

test('모바일: 목록 → 개요 가져오기 → 트리가 화면 안 → 플래시 탭 평가 → 빈칸 퀴즈 탭 놓기·채점', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await noSideScroll(page)
  await page.getByRole('link', { name: '편집' }).first().tap()
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).tap()
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(10)
  const treeId = new URL(page.url()).hash.split('/')[2]

  // 진입 맞춤: 다시 들어오면 루트와 1단계 카드가 모두 캔버스 안에 보인다
  await page.goto(`/#/tree/${treeId}/flash`)
  await page.goto(`/#/tree/${treeId}`)
  const canvas = page.getByRole('tree')
  await expect(canvas).toBeInViewport()
  for (const t of ['노동법', '근로계약', '해고', '임금'])
    await expect(page.locator('.node-row[data-node-id]').filter({ has: page.locator('.node-title', { hasText: new RegExp(`^${t}$`) }) })).toBeInViewport({ ratio: 0.95 })
  await noSideScroll(page)

  // 플래시카드: 탭으로 펼치고 평가
  await page.goto(`/#/tree/${treeId}/flash`)
  await page.locator('button[data-concept-id]').tap()
  const kid = page.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]').first()
  await kid.getByRole('button', { name: '알음', exact: true }).tap()
  await expect(kid).toHaveAttribute('data-rated', 'known')
  await expect(page.getByLabel('평가 집계')).toContainText('알음 1')
  await noSideScroll(page)

  // 빈칸 퀴즈: 카드 탭 → 빈칸 탭 (탭 놓기) → 채점
  await page.goto(`/#/tree/${treeId}/dnd`)
  const tray = page.locator('[data-drop="tray"]')
  await expect(tray.locator('[data-card]')).toHaveCount(6)
  await tray.locator('[data-card]', { hasText: '근로조건명시' }).tap()
  await page.getByLabel('근로계약 아래 빈칸').first().tap()
  await expect(tray.locator('[data-card]')).toHaveCount(5)
  await page.getByRole('button', { name: '채점' }).tap()
  const score = page.locator('p[role="status"][data-total]')
  await expect(score).toHaveAttribute('data-total', '6')
  await expect(score).toHaveAttribute('data-correct', '1')
  await noSideScroll(page)
})
