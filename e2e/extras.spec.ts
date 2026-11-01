import { expect, test, type Page } from '@playwright/test'

// 미해결 항목 보완 검증: 빈 카드 내용 추가 · 패널 제목 실시간 · 확대/축소·패닝 · 플래시카드 집계 유지 · IME 조합 입력(CDP)

async function seed(page: Page, outline: string): Promise<string> {
  await page.goto('/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  await page.getByLabel('개요 텍스트').fill(outline)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  return new URL(page.url()).hash.split('/')[2]
}
const card = (page: Page, t: RegExp) =>
  page.locator('.node-row[data-node-id]').filter({ has: page.locator('.node-title', { hasText: t }) })

test('빈 카드에 + 내용 → 카드에서 내용 입력', async ({ page }) => {
  await seed(page, '해고\n임금')
  const row = card(page, /^해고$/)
  await row.click()
  await row.getByRole('button', { name: '+ 내용' }).click()
  const editor = row.getByRole('textbox', { name: '노드 내용' })
  await expect(editor).toBeFocused()
  await page.keyboard.type('서면 통지')
  await page.keyboard.press('Escape')
  await expect(row.locator('.node-note')).toHaveText('서면 통지')
  await page.waitForTimeout(300) // 입력 직후 수 ms 안의 새로고침은 진행 중 IndexedDB 트랜잭션이 브라우저에 의해 중단될 수 있음
  await page.reload()
  await expect(card(page, /^해고$/).locator('.node-note')).toHaveText('서면 통지')
})

test('카드에서 제목 편집 중 패널 제목이 실시간으로 바뀜', async ({ page }) => {
  await seed(page, '해고')
  await card(page, /^해고$/).dblclick()
  const input = page.getByLabel('노드 제목', { exact: true })
  await input.fill('해고제한')
  await expect(page.getByLabel('패널 제목')).toHaveValue('해고제한') // 확정 전
  await input.press('Escape')
  await expect(card(page, /^해고제한$/)).toHaveCount(1)
})

test('확대·축소와 확대 상태에서의 드래그·패닝', async ({ page }) => {
  await seed(page, '근로계약\n  근로조건명시\n해고\n  해고예고\n임금\n  통상임금')
  const out = page.getByLabel('배율')
  await expect(out).toHaveText('100%')
  await page.getByRole('button', { name: '확대' }).click()
  await expect(out).toHaveText('120%')
  await page.getByRole('tree').focus()
  await page.keyboard.press('Minus')
  await expect(out).toHaveText('100%')
  await page.keyboard.press('Minus')
  await expect(out).toHaveText('83%')

  // 83% 에서 화면상 83px 끌면 배치상 100px 이동 → 새로고침(100%) 후 실제 100px
  const row = card(page, /^해고$/)
  const id = (await row.getAttribute('data-node-id'))!
  const before = await row.evaluate((el) => (el as HTMLElement).offsetTop)
  const b = (await row.boundingBox())!
  await page.mouse.move(b.x + 20, b.y + 10)
  await page.mouse.down()
  await page.mouse.move(b.x + 20, b.y + 10 + 83 / 2, { steps: 4 })
  await page.mouse.move(b.x + 20, b.y + 10 + 83, { steps: 4 })
  await page.mouse.up()
  await page.reload()
  const after = await page.locator(`.node-row[data-node-id="${id}"]`).evaluate((el) => (el as HTMLElement).offsetTop)
  expect(Math.abs(after - before - 100)).toBeLessThanOrEqual(2)

  // 화면 맞춤: 전체가 보이도록 100% 이하
  await page.getByRole('button', { name: '화면 맞춤' }).click()
  expect(parseInt((await out.textContent())!)).toBeLessThanOrEqual(100)
})

test('플래시카드 집계가 새로고침 후에도 유지', async ({ page }) => {
  const treeId = await seed(page, '근로계약\n해고\n임금')
  await page.goto(`/#/tree/${treeId}/flash`)
  await page.locator('button[data-concept-id]').click()
  const kids = page.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]')
  await kids.filter({ hasText: '근로계약' }).getByRole('button', { name: '알음', exact: true }).click()
  await kids.filter({ hasText: '임금' }).getByRole('button', { name: '모름', exact: true }).click()
  const tally = page.getByLabel('평가 집계')
  await expect(tally).toHaveText('알음 1 · 모름 1')
  await page.reload()
  await expect(tally).toHaveText('알음 1 · 모름 1')
  await page.locator('button[data-concept-id]').click()
  await expect(kids.filter({ hasText: '임금' })).toHaveAttribute('data-rated', 'unknown')
  await page.getByRole('button', { name: '요약' }).click()
  await page.getByRole('button', { name: '처음부터 다시' }).click()
  await expect(tally).toHaveText('알음 0 · 모름 0')
})

test('한글 IME 조합 입력(CDP) → Enter 확정 시 글자 중복·유실 없음', async ({ page }) => {
  await seed(page, '해고')
  const cdp = await page.context().newCDPSession(page)
  // 실제 OS 입력기 대신 Chromium 의 IME 조합 이벤트(compositionstart/update/end)를 그대로 발생시킨다
  const compose = async (steps: string[], commit: string) => {
    for (const s of steps) await cdp.send('Input.imeSetComposition', { text: s, selectionStart: s.length, selectionEnd: s.length })
    await cdp.send('Input.insertText', { text: commit })
  }
  // 1) 카드 제목: '해고' 선택 → Enter(형제 추가) → '퇴직금' 조합 입력 → Enter
  await card(page, /^해고$/).click()
  await page.getByRole('tree').press('Enter')
  const title = page.getByLabel('노드 제목', { exact: true })
  await expect(title).toBeFocused()
  await compose(['ㅌ', '퇴'], '퇴')
  await compose(['ㅈ', '지', '직'], '직')
  await compose(['ㄱ', '그', '금'], '금')
  await expect(title).toHaveValue('퇴직금')
  await title.press('Enter')
  await title.press('Escape') // Enter 로 생긴 빈 형제는 Esc 로 제거
  await expect(card(page, /^퇴직금$/)).toHaveCount(1)

  // 2) 내용 편집기(contentEditable): 조합 중 재렌더 금지 → 결과 텍스트 그대로
  const row = card(page, /^퇴직금$/)
  await row.click()
  await row.getByRole('button', { name: '+ 내용' }).click()
  await compose(['ㅅ', '서'], '서')
  await compose(['ㅁ', '머', '면'], '면')
  await page.keyboard.press('Escape')
  await expect(row.locator('.node-note')).toHaveText('서면')
  await page.waitForTimeout(300)
  await page.reload()
  await expect(card(page, /^퇴직금$/).locator('.node-note')).toHaveText('서면')
})
