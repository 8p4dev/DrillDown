import { expect, test, type Page } from '@playwright/test'

// plan §5: 모드별 핵심 흐름 — 플래시카드 / D&D 퀴즈 / 백지 D&D / 에디터 붉은 농도
const OUTLINE = `근로계약
  근로조건명시
  위약예정금지
해고
  정당한이유
  해고예고
임금
  통상임금
  평균임금`

async function seed(page: Page): Promise<string> {
  await page.goto('/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(10)
  return new URL(page.url()).hash.split('/')[2]
}

async function drag(page: Page, from: ReturnType<Page['locator']>, to: ReturnType<Page['locator']>) {
  const a = (await from.boundingBox())!
  const b = (await to.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 3 })
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 })
  await page.mouse.up()
}

test('플래시카드: 펼침 → 알음/모름 → 색 → 다음 개념 → 미니맵', async ({ page }) => {
  const treeId = await seed(page)
  await page.goto(`/#/tree/${treeId}/flash`)
  const concept = page.locator('button[data-concept-id]')
  await expect(concept).toContainText('하위 3개')
  const kids = page.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]')
  await expect(kids).toHaveCount(0)
  await concept.click()
  await expect(kids).toHaveCount(3)
  const kid = (t: string) => kids.filter({ hasText: t })
  await kid('근로계약').getByRole('button', { name: '알음', exact: true }).click()
  await kid('해고').getByRole('button', { name: '알음', exact: true }).click()
  await kid('임금').getByRole('button', { name: '모름', exact: true }).click()
  await expect(kid('근로계약')).toHaveAttribute('data-color', /green/) // 자식 미학습이면 부모 집계로 연두
  await expect(kid('임금')).toHaveAttribute('data-color', 'red')
  await expect(kid('임금')).toHaveAttribute('data-rated', 'unknown')

  const current = page.locator('figure[aria-label="미니맵"] g.mm-node[aria-current="location"]')
  const rootMini = await current.getAttribute('data-node-id')
  await page.getByRole('button', { name: '다음 개념 →' }).click()
  await expect(page.locator('.flash-concept-title')).toHaveText('근로계약')
  await expect(current).not.toHaveAttribute('data-node-id', rootMini!)

  // 새로고침 → 보던 개념(근로계약)에서 이어짐, 루트로 돌아가면 색 유지
  await page.reload()
  await expect(page.locator('.flash-concept-title')).toHaveText('근로계약')
  await page.getByRole('navigation', { name: '현재 위치' }).getByRole('button', { name: '노동법' }).click()
  await page.locator('button[data-concept-id]').click()
  await expect(kid('임금')).toHaveAttribute('data-color', 'red')
})

test('D&D 퀴즈: 빈칸에 끌어 놓기 → 채점', async ({ page }) => {
  const treeId = await seed(page)
  await page.goto(`/#/tree/${treeId}/dnd`)
  const tray = page.locator('[data-drop="tray"]')
  await expect(tray.locator('[data-card]')).toHaveCount(6)
  // 정답 1 (근로조건명시 → 근로계약), 오답 1 (통상임금 → 해고)
  await drag(page, tray.locator('[data-card]', { hasText: '근로조건명시' }), page.getByLabel('근로계약 아래 빈칸').first())
  await drag(page, tray.locator('[data-card]', { hasText: '통상임금' }), page.getByLabel('해고 아래 빈칸').first())
  await expect(tray.locator('[data-card]')).toHaveCount(4)
  await page.getByRole('button', { name: '채점' }).click()
  const score = page.locator('p[role="status"][data-total]')
  await expect(score).toHaveAttribute('data-total', '6')
  await expect(score).toHaveAttribute('data-correct', '1')
})

test('백지 D&D: 노드를 끌어 트리 만들기 → 채점 → 에디터 붉은 농도', async ({ page }) => {
  const treeId = await seed(page)
  await page.goto(`/#/tree/${treeId}/blank`)
  const tray = page.locator('[data-drop="tray"]')
  await expect(tray.locator('[data-card]')).toHaveCount(9)
  await drag(page, tray.locator('[data-card]', { hasText: /^해고$/ }), page.locator('.dnd-canvas button.dnd-node.root'))
  await drag(page, tray.locator('[data-card]', { hasText: '정당한이유' }), page.locator('.dnd-canvas [data-card]', { hasText: /^해고$/ }))
  await expect(page.locator('.dnd-canvas [data-card]')).toHaveCount(2)
  await page.getByRole('button', { name: '채점' }).click()
  const score = page.locator('p[role="status"][data-total]')
  await expect(score).toHaveAttribute('data-total', '9')
  await expect(score).toHaveAttribute('data-correct', '2')
  await expect(page.getByLabel('원본 트리')).toBeVisible()

  // 트레이에 남은 7개 = 오답 → 에디터에서 붉은 농도(miss > 0)
  await page.goto(`/#/tree/${treeId}`)
  const row = (t: RegExp) => page.locator('.node-row[data-node-id]').filter({ has: page.locator('.node-title', { hasText: t }) })
  await expect(row(/^임금$/)).toHaveAttribute('data-miss', '0.25') // missHeat = miss 1 / MISS_MAX 4
  await expect(row(/^해고$/)).toHaveAttribute('data-miss', '0')
})

// r4-02 회귀: 하위 범위로 바꿨다가 루트로 돌아와도 루트 진행(알음 2)이 덮어써지지 않는다(flash:<tree>:<scope> 저장본 분리)
test('플래시카드: 범위 전환 뒤 루트 진행 보존', async ({ page }) => {
  const treeId = await seed(page)
  await page.goto(`/#/tree/${treeId}/flash`)
  await page.locator('button[data-concept-id]').click()
  const kids = page.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]')
  await kids.filter({ hasText: '근로계약' }).getByRole('button', { name: '알음', exact: true }).click()
  await kids.filter({ hasText: '해고' }).getByRole('button', { name: '알음', exact: true }).click()
  const known = page.getByLabel('평가 집계').locator('b').first()
  await expect(known).toHaveText('2')

  const scope = page.getByLabel('범위')
  const sub = (await scope.locator('option', { hasText: '근로계약' }).getAttribute('value'))!
  await scope.selectOption(sub)
  await expect(page).toHaveURL(/root=/)
  await expect(known).toHaveText('0') // 하위 범위는 새 세션
  await page.goto(`/#/tree/${treeId}/flash`)
  await expect(known).toHaveText('2') // 루트 저장본 그대로
})
