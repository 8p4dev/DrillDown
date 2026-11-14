import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// 보안 회귀(S3): 악성 제목·내용·별칭을 가진 트리를 공개해도 공유 보기·갤러리 미리보기·플래시 탭 어디서도 스크립트가 돌지 않는다
// (dangerouslySetInnerHTML 3곳 + OG 셸 치환 + React 텍스트 — 한 글자라도 이스케이프가 새면 여기서 dialog 가 뜬다). 헬퍼는 server.spec.ts 와 같다

const login = async (page: Page, name: string) => {
  const pulled = page.waitForResponse((r) => r.url().includes('/api/sync?since=') && r.ok())
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
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(outline.split('\n').length + 1)
}

async function waitOnServer(ctx: BrowserContext, title: string) {
  await expect
    .poll(async () => {
      const r = await ctx.request.get('/api/trees')
      if (!r.ok()) return `HTTP ${r.status()}`
      const { trees } = (await r.json()) as { trees: { title: string; deletedAt?: number | null }[] }
      return trees.some((t) => t.title === title && !t.deletedAt)
    }, { timeout: 15_000 })
    .toBe(true)
}

const TITLE = '"><img src=x onerror=alert(1)><script>alert(2)</script>'
const NODE = '<svg onload=alert(3)>해고'
const NOTE = '==p:<script>alert(4)</script>== <img src=x onerror=alert(5)>'
const ALIAS = '<img src=x onerror=alert(6)>'

/** 주입된 요소 수: 앱 번들·테마 스크립트가 아닌 <script>, 그리고 src=x 인 <img>·<svg onload> */
const injected = (page: Page) =>
  page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script')].filter((s) => !s.src.includes('/assets/') && (s.textContent ?? '').includes('alert('))
    const imgs = [...document.querySelectorAll('img[src="x"], svg[onload]')]
    return scripts.length + imgs.length
  })

test('악성 제목·내용·별칭 트리 공개 → 공유 보기·갤러리 미리보기·플래시 탭에서 dialog 0·주입 태그 0', async ({ browser }) => {
  const owner = await browser.newContext()
  const po = await owner.newPage()
  const dialogs: string[] = []
  // CSP 가 인라인 핸들러를 막으면 dialog 는 안 뜨고 콘솔에 'Content Security Policy' 거부가 찍힌다 — 그것도 이스케이프 회귀 신호로 센다(v2 사각)
  const cspv: string[] = []
  const watch = (pg: typeof po) => { pg.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss() }); pg.on('console', (m) => { if (/Content Security Policy/.test(m.text())) cspv.push(m.text()) }) }
  watch(po)
  await login(po, 'mallory')
  await makeTree(po, TITLE, `${NODE}\n임금`)
  // 내용(노트)과 별칭은 편집기 패널에서
  const row = po.locator('.node-row[data-node-id]').filter({ has: po.locator('.node-title', { hasText: '해고' }) })
  await row.click()
  const panel = po.getByRole('textbox', { name: '패널 내용' })
  await panel.click()
  await panel.fill(NOTE)
  await po.getByRole('textbox', { name: '별칭 추가' }).fill(ALIAS)
  await po.getByRole('textbox', { name: '별칭 추가' }).press('Enter')
  await expect(po.getByRole('group', { name: '별칭' })).toContainText(ALIAS)
  await po.getByRole('tree').click({ position: { x: 5, y: 5 } })
  await expect(row.locator('.node-note mark.hl-p')).toHaveText('<script>alert(4)</script>')
  await waitOnServer(owner, TITLE)

  // 공개
  await po.goto('/#/')
  const card = po.locator('li[data-tree-id]', { hasText: 'alert(2)' })
  await card.getByLabel('더 보기').click()
  await card.getByRole('button', { name: '공유…' }).click()
  await po.getByRole('group', { name: '공개 범위' }).getByRole('button', { name: '공개', exact: true }).click()
  await po.getByRole('button', { name: '확인' }).click()
  const url = (await po.locator('.share-url').textContent())!.trim()
  const path = new URL(url).pathname
  expect(dialogs).toEqual([]); expect(cspv).toEqual([])
  // 내용·별칭까지 서버에 닿은 뒤에 방문(제목만 보는 waitOnServer 와 달리 노드 본문을 본다)
  await expect.poll(async () => (await (await owner.request.get(`/api${path}`)).text()).includes('alert(4)') ? 'synced' : 'pending', { timeout: 15_000 }).toBe('synced')

  // 비로그인 방문자: 공유 보기(OG 셸 + React) → 플래시 탭 → 갤러리 미리보기
  const anon = await browser.newContext()
  const pa = await anon.newPage()
  watch(pa)
  const res = await pa.goto(path)
  expect(res?.status()).toBe(200)
  const shell = await res!.text()
  expect(shell).not.toMatch(/<script>alert|<img |<svg /) // OG 셸 <title>·content= 두 컨텍스트 모두 엔티티(raw 태그 0)
  expect(await pa.locator('meta[property="og:title"]').getAttribute('content')).toBe(TITLE)
  await expect(pa.getByRole('heading', { name: TITLE })).toBeVisible()
  await expect(pa.locator('.node-note mark.hl-p')).toHaveText('<script>alert(4)</script>')
  expect(await injected(pa)).toBe(0)

  await pa.getByRole('link', { name: '플래시카드' }).click()
  await expect(pa).toHaveURL(/\?m=flash/)
  await pa.locator('button[data-concept-id]').first().click()
  await expect(pa.locator('.flash-note mark.hl-p').first()).toHaveText('<script>alert(4)</script>')
  expect(await injected(pa)).toBe(0)

  await pa.goto('/#/gallery')
  await pa.locator('li.card', { hasText: 'alert(2)' }).getByRole('button', { name: '미리보기' }).click()
  await expect(pa.locator('.share-sheet h2')).toHaveText(TITLE)
  await expect(pa.locator('.gallery-outline')).toContainText(NODE)
  expect(await injected(pa)).toBe(0)

  expect(dialogs).toEqual([]); expect(cspv).toEqual([])
  await owner.close(); await anon.close()
})
