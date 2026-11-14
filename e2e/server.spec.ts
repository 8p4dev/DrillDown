import { expect, test, type BrowserContext, type Page } from '@playwright/test'

// 서버 단계 통합 흐름 (docs/plans/orchestration_server.md §5): 가짜 로그인(AUTH_FAKE=1)·실제 Node 서버·SQLite
// 각 테스트는 사용자 이름을 달리해 서로 데이터가 섞이지 않는다(DB 는 실행마다 새로)

/** settle=true: 로컬 트리가 없는 기기에서 로그인 직후의 첫 pull 까지 기다린다(그 전에 트리를 만들면 병합 대화가 뜬다) */
const login = async (page: Page, name: string, as: 'user' | 'admin' = 'user', settle = true) => {
  const pulled = settle ? page.waitForResponse((r) => r.url().includes('/api/sync?since=') && r.ok()) : null
  await page.goto(`/api/auth/fake/start?as=${as}&name=${name}&return_to=%23%2F`)
  await expect(page.getByRole('link', { name: '계정' })).toBeVisible()
  await pulled
}

/** 목록에서 트리를 만들고 개요로 자식 노드를 붙인다 */
async function makeTree(page: Page, title: string, outline: string) {
  await page.goto('/#/')
  await page.getByLabel('새 트리 제목').fill(title)
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.locator('li[data-tree-id]', { hasText: title }).getByRole('link', { name: '편집' }).click()
  await page.getByLabel('개요 텍스트').fill(outline)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(outline.split('\n').length + 1)
}

/** 서버에 그 제목의(삭제 안 된) 트리가 올라갈 때까지 — 같은 컨텍스트 쿠키로 /api/trees 조회 */
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

test('두 기기 동기화: A 에서 만든 트리와 노드가 B 에 보인다', async ({ browser }) => {
  const a = await browser.newContext()
  const pa = await a.newPage()
  await login(pa, 'alice')
  await makeTree(pa, '민법 총칙', '권리능력\n행위능력\n의사표시')
  await waitOnServer(a, '민법 총칙')

  const b = await browser.newContext()
  const pb = await b.newPage()
  await login(pb, 'alice')
  await expect(pb.locator('li[data-tree-id]', { hasText: '민법 총칙' })).toBeVisible({ timeout: 15_000 })
  await pb.locator('li[data-tree-id]', { hasText: '민법 총칙' }).getByRole('link', { name: '편집' }).click()
  await expect(pb.locator('.node-row[data-node-id]')).toHaveCount(4)
  await expect(pb.locator('.node-title', { hasText: '의사표시' })).toBeVisible()
  await a.close()
  await b.close()
})

test('첫 로그인 병합: 비로그인 때 만든 트리를 저장하면 다른 기기에서 보인다', async ({ browser }) => {
  const a = await browser.newContext()
  const pa = await a.newPage()
  await makeTree(pa, '형법 총론', '구성요건\n위법성')
  await login(pa, 'bob', 'user', false)
  await pa.getByRole('button', { name: '저장', exact: true }).click()
  await waitOnServer(a, '형법 총론')

  const b = await browser.newContext()
  const pb = await b.newPage()
  await login(pb, 'bob')
  await expect(pb.locator('li[data-tree-id]', { hasText: '형법 총론' })).toBeVisible({ timeout: 15_000 })
  await a.close()
  await b.close()
})

test('공유 링크: 비로그인이 보기·플래시로 학습하고 복제한다 → 관리자가 숨기면 403 화면', async ({ browser }) => {
  const owner = await browser.newContext()
  const po = await owner.newPage()
  await login(po, 'carol')
  await makeTree(po, '노동법 해고', '해고예고\n부당해고\n구제절차')
  await waitOnServer(owner, '노동법 해고')
  await po.goto('/#/')
  const card = po.locator('li[data-tree-id]', { hasText: '노동법 해고' })
  await card.getByLabel('더 보기').click()
  await card.getByRole('button', { name: '공유…' }).click()
  await po.getByRole('group', { name: '공개 범위' }).getByRole('button', { name: '공개', exact: true }).click()
  await po.getByRole('button', { name: '확인' }).click() // 첫 공개 고지 1회
  const url = (await po.locator('.share-url').textContent())!.trim()
  const path = new URL(url).pathname
  expect(path).toMatch(/^\/t\/[1-9A-HJ-NP-Za-km-z]{11}$/)

  // 비로그인 방문자
  const anon = await browser.newContext()
  const pa = await anon.newPage()
  const res = await pa.goto(path)
  expect(res?.status()).toBe(200)
  expect(await pa.locator('meta[property="og:title"]').getAttribute('content')).toBe('노동법 해고')
  await expect(pa.getByRole('heading', { name: '노동법 해고' })).toBeVisible()
  await expect(pa.getByText('부당해고')).toBeVisible()
  await pa.getByRole('link', { name: '플래시카드' }).click()
  await expect(pa).toHaveURL(/\?m=flash/)
  await pa.locator('button[data-concept-id]').first().click()
  await pa.getByRole('button', { name: '알음', exact: true }).first().click()
  await pa.getByRole('button', { name: '내 트리로 복제' }).first().click()
  await pa.goto('/#/')
  await expect(pa.locator('li[data-tree-id]', { hasText: '노동법 해고' })).toBeVisible()

  // 관리자 숨김
  const adm = await browser.newContext()
  const pm = await adm.newPage()
  await login(pm, 'root', 'admin', false)
  await pm.goto('/#/admin/trees')
  const row = pm.locator('tr', { hasText: '노동법 해고' })
  await row.getByRole('button', { name: '숨김', exact: true }).click()
  await row.getByRole('button', { name: '정말 숨김' }).click()
  await expect(row.getByRole('button', { name: '해제', exact: true })).toBeVisible()

  // 같은 방문자: HTML 은 60초 캐시될 수 있지만(04 §3.3) 데이터 API 는 no-store 라 내용은 즉시 막힌다
  const p2 = await anon.newPage()
  await p2.goto(path)
  await expect(p2.getByText('운영 정책으로 숨김')).toBeVisible()
  // 새 방문자: 상태 코드도 403
  const fresh = await browser.newContext()
  expect((await (await fresh.newPage()).goto(path))?.status()).toBe(403)
  for (const c of [owner, anon, adm, fresh]) await c.close()
})

test('탈퇴 2단계 → 로그아웃 → 7일 안 재로그인이면 계정·트리 복구', async ({ browser }) => {
  const ctx = await browser.newContext()
  const p = await ctx.newPage()
  await login(p, 'dave')
  await makeTree(p, '상법 회사', '주식회사\n유한회사')
  await waitOnServer(ctx, '상법 회사')
  await p.goto('/#/account')
  await p.getByRole('button', { name: '탈퇴', exact: true }).click()
  await p.getByRole('button', { name: '정말 탈퇴' }).click()
  await expect.poll(async () => (await ctx.request.get('/api/me')).status()).toBe(401)

  await login(p, 'dave')
  expect((await ctx.request.get('/api/me')).status()).toBe(200)
  await waitOnServer(ctx, '상법 회사')
  await ctx.close()
})

test('비로그인은 서버에 아무것도 보내지 않는다(sync 엔진 청크 미로드)', async ({ page }) => {
  const api: string[] = []
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && !['/api/me', '/api/auth/providers', '/api/notices'].includes(u.pathname)) api.push(u.pathname) })
  await makeTree(page, '헌법', '기본권')
  await page.goto('/#/')
  await page.waitForTimeout(2500)
  expect(api).toEqual([])
  const engine = await page.evaluate(() => performance.getEntriesByType('resource').some((e) => /engine-/.test(e.name)))
  expect(engine).toBe(false)
})

// r4-08 회귀: #/gallery 로 직접 들어와도 미리보기 시트 CSS(share-list.css)가 실려 닫기 버튼이 터치 표적(44px) 이다
test('갤러리 직접 진입: 미리보기 시트 닫기 버튼 44px', async ({ browser }) => {
  const owner = await browser.newContext()
  const po = await owner.newPage()
  await login(po, 'gale')
  await makeTree(po, '갤러리 진입 검증', '하나\n둘')
  await waitOnServer(owner, '갤러리 진입 검증')
  await po.goto('/#/')
  const card = po.locator('li[data-tree-id]', { hasText: '갤러리 진입 검증' })
  await card.getByLabel('더 보기').click()
  await card.getByRole('button', { name: '공유…' }).click()
  await po.getByRole('group', { name: '공개 범위' }).getByRole('button', { name: '공개', exact: true }).click()
  await po.getByRole('button', { name: '확인' }).click()
  await expect(po.locator('.share-url')).toBeVisible()

  const anon = await browser.newContext({ hasTouch: true }) // (pointer: coarse) → --tap 44px
  const pa = await anon.newPage()
  await pa.goto('/#/gallery')
  await pa.locator('li.card', { hasText: '갤러리 진입 검증' }).getByRole('button', { name: '미리보기' }).click()
  const x = pa.locator('.sheet-head .sheet-x')
  await expect(x).toBeVisible()
  await expect(pa.locator('.share-sheet')).toHaveCSS('display', 'grid') // share-list.css 가 실렸다는 직접 신호
  const box = (await x.boundingBox())!
  expect(box.width).toBeGreaterThanOrEqual(44)
  expect(box.height).toBeGreaterThanOrEqual(44)
  await owner.close(); await anon.close()
})
