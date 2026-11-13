import { devices, test, type Page } from '@playwright/test'

// README 용 스크린샷. 로그인한 사용자가 트리를 만들고 각 화면을 찍는다 → docs/screenshots/
const OUT = 'docs/screenshots/'
const OUTLINE = `근로계약\n  근로조건 명시\n  위약 예정 금지\n  근로계약 기간\n해고\n  정당한 이유\n  해고 예고\n  부당해고 구제\n임금\n  통상임금\n  평균임금\n  최저임금\n근로시간\n  법정 근로시간\n  연장근로\n  휴게시간`

/** 토스트는 CSS 로만 숨긴다(DOM 을 지우면 React 가 깨진다). 마우스는 구석으로 */
async function shot(page: Page, name: string) {
  await page.mouse.move(5, 5)
  await page.evaluate(() => {
    if (document.getElementById('shot-css')) return
    const st = document.createElement('style'); st.id = 'shot-css'; st.textContent = '.toasts{display:none!important}'; document.head.appendChild(st)
  })
  await page.waitForTimeout(300)
  await page.screenshot({ path: OUT + name + '.png' })
}
const login = async (page: Page, name: string) => {
  const pulled = page.waitForResponse((r) => r.url().includes('/api/sync?since=') && r.ok())
  await page.goto(`/api/auth/fake/start?as=user&name=${name}&return_to=%23%2F`)
  await pulled
}

test('README 스크린샷', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page, 'minsu')
  for (const t of ['노동법', '민법 총칙', '헌법 기본권']) {
    await page.getByLabel('새 트리 제목').fill(t); await page.getByLabel('새 트리 제목').press('Enter'); await page.waitForTimeout(400)
  }
  await page.locator('li[data-tree-id]', { hasText: '노동법' }).getByRole('link', { name: '편집' }).click()
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await page.waitForTimeout(1000)
  const id = new URL(page.url()).hash.split('/')[2]
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '확대', exact: true }).click()
  await page.waitForTimeout(500)
  await shot(page, '02-editor')
  await page.locator('.node-row[data-node-id]').filter({ hasText: /^해고$/ }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '03-editor-detail')
  const theme = page.getByRole('group', { name: '테마' })
  await theme.getByRole('button', { name: /다크|어둡/ }).click()
  await page.waitForTimeout(500)
  await shot(page, '04-editor-dark')
  await theme.getByRole('button', { name: /라이트|밝/ }).click()

  // 플래시: 한 문제 채점해서 색이 보이게
  await page.goto(`/#/tree/${id}/flash`); await page.waitForTimeout(800)
  await page.locator('button[data-concept-id]').first().click(); await page.waitForTimeout(500)
  const answers = page.locator('li[data-node-id]')
  const n = await answers.count()
  for (let i = 0; i < n; i++) await answers.nth(i).getByRole('button', { name: i === 1 ? '모름' : '알음', exact: true }).click()
  await page.waitForTimeout(500)
  await shot(page, '05-flash')
  await page.goto(`/#/tree/${id}/dnd`); await page.waitForTimeout(800)
  await shot(page, '06-dnd')
  await page.goto(`/#/tree/${id}/blank`); await page.waitForTimeout(800)
  await shot(page, '07-blank')

  // 목록 → 공개로 바꾸고 공유 보기·공개 트리
  await page.goto('/#/'); await page.waitForTimeout(800)
  await shot(page, '01-trees')
  const card = page.locator('li[data-tree-id]', { hasText: '노동법' }).first()
  await card.getByLabel('더 보기').click()
  await card.getByRole('button', { name: '공유…' }).click()
  await page.getByRole('group', { name: '공개 범위' }).getByRole('button', { name: '공개', exact: true }).click()
  await page.getByRole('button', { name: '확인' }).click().catch(() => {})
  await page.waitForTimeout(800)
  await shot(page, '08-share-sheet')
  const path = new URL((await page.locator('.share-url').textContent())!.trim()).pathname
  await ctx.close()

  const anon = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const pa = await anon.newPage()
  await pa.goto(path); await pa.waitForTimeout(1200)
  await shot(pa, '09-shared')
  await pa.goto('/#/gallery'); await pa.waitForTimeout(1200)
  await shot(pa, '10-gallery')
  await anon.close()

  const m = await browser.newContext({ ...devices['Pixel 7'] })
  const pm = await m.newPage()
  await login(pm, 'minsu'); await pm.waitForTimeout(1500)
  await pm.goto(`/#/tree/${id}`); await pm.waitForTimeout(1500)
  await shot(pm, '11-mobile-editor')
  await pm.goto(`/#/tree/${id}/flash`); await pm.waitForTimeout(1200)
  await pm.locator('button[data-concept-id]').first().click(); await pm.waitForTimeout(500)
  await shot(pm, '12-mobile-flash')
  await m.close()
})
