// 시안 점검 도구 (E2E 아님): 화면별 스크린샷 + 가드레일 측정. 사용법은 docs/plans/orchestration_liquid_glass.md §6
//   BASE=http://localhost:8011 LOOK=lens OUT=<폴더> npx playwright test -c tools/look/pw.config.ts look.spec.ts -g <grep>
// 가드레일(모드·폭·화면별): 글자 대비 4.5/3, backdrop-filter ≤ 8개·콘텐츠 카드 0개, 무한 애니메이션 0, 투명도 줄이기에서 유리 0
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const BASE = process.env.BASE ?? 'http://localhost:8001'
const LOOK = process.env.LOOK ?? ''
const OUT = process.env.OUT ?? 'test-results/look'
const MAX_GLASS = 8
const OUTLINE = '근로계약\n  근로조건명시\n  위약예정금지\n해고\n  정당한이유\n  해고예고\n임금\n  통상임금\n  평균임금'
const CONTENT = '.node-row, .dnd-node, .dnd-card, .dnd-slot, .flash-concept, .flash-kid, .tree-cards li'
const TEXT = [
  '.topnav a', '.tree-header h1', '.mode-tabs a', '.muted', 'h1', 'h2',
  '.tree-title', '.tree-modes a', '.tree-menu-list button', '.trees-form button',
  '.node-title', '.node-note', '.zoom-tools output', '.zoom-tools button', '.detail-title', '.side summary', '.io-actions button',
  '.flash-path', '.flash-concept-title', '.flash-note', '.flash-count', '.flash-kid strong', '.flash-rate button', '.flash-nav button', '.flash-tally',
  '.flash-summary-nums', '.flash-missed li',
  '.dnd-node span', '.dnd-card span', '.dnd-progress', '.dnd-bar button', '.dnd-score', '.dnd-scope',
  '.review-list strong', '.review-head', '.toast', '.keys dd',
].join(', ')

async function seed(page: Page) {
  await page.goto(`${BASE}/?look=${LOOK}#/`)
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(10)
  await card(page, '근로계약').click()
  await page.getByLabel('패널 내용').fill('- 근로기준법 제2조\n- 사용자와 근로자의 합의')
  await card(page, '해고').click() // 내용 칸 blur → 저장
  return new URL(page.url()).hash.split('/')[2]
}
const card = (page: Page, t: string) => page.locator('.node-row[data-node-id]').filter({ has: page.locator('.node-title', { hasText: new RegExp(`^${t}$`) }) })
const go = async (page: Page, hash: string) => {
  await page.evaluate((h) => { location.hash = h }, hash)
  await page.waitForTimeout(350)
}
const rate = (page: Page, t: string, label: '알음' | '모름') =>
  page.locator('li[data-node-id]').filter({ hasText: t }).getByRole('button', { name: label, exact: true }).click()

/** 네 상태를 만든다: 오래전에 맞힘(바램) · 방금 맞힘 · 방금 틀림 · 안 봄. FSRS 곡선 때문에 며칠 전 값은 실측으로 맞췄다 */
async function rateAll(page: Page, id: string) {
  await go(page, `#/tree/${id}/flash`)
  await page.locator('button[data-concept-id]').click()
  await page.clock.setFixedTime(Date.now() - 40 * 86400_000)
  await rate(page, '임금', '알음')
  await page.clock.setFixedTime(Date.now())
  await rate(page, '근로계약', '알음')
  await rate(page, '해고', '모름')
  await page.waitForTimeout(150)
}

/** 뷰포트 안 글자의 최악 대비. 글자를 지우고 찍은 화면의 실제 배경 픽셀과 비교한다(유리·그라데이션 포함). 모서리 잡음을 빼려고 하위 5% 값을 쓴다 */
async function contrastFails(page: Page) {
  const targets = await page.evaluate((sel) => {
    const out: { sel: string; text: string; color: string; large: boolean; r: number[] }[] = []
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      // 첫 글자 노드만 잰다: 요소 전체 범위에는 아이콘·배지가 섞여 대비를 잘못 낮춘다
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) })
      const node = walker.nextNode()
      if (!node?.parentElement) continue
      const text = node.textContent!.trim()
      const cs = getComputedStyle(node.parentElement)
      if (cs.visibility === 'hidden' || +cs.opacity === 0) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      const b = range.getBoundingClientRect()
      const x0 = Math.max(b.left, 0), y0 = Math.max(b.top, 0), x1 = Math.min(b.right, innerWidth), y1 = Math.min(b.bottom, innerHeight)
      if (x1 - x0 < 2 || y1 - y0 < 2) continue
      if (!el.contains(document.elementFromPoint((x0 + x1) / 2, (y0 + y1) / 2))) continue // 다른 요소에 가려짐
      const px = parseFloat(cs.fontSize)
      out.push({ sel: el.className || el.tagName, text: text.slice(0, 16), color: cs.color, large: px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700), r: [x0, y0, x1, y1].map(Math.round) })
    }
    return out
  }, TEXT)
  const hide = await page.addStyleTag({ content: '*, *::before, *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; caret-color: transparent !important; text-shadow: none !important; }' })
  const png = (await page.screenshot({ animations: 'disabled' })).toString('base64')
  await hide.evaluate((s) => s.remove())
  return page.evaluate(async ({ png, targets }) => {
    const img = new Image()
    img.src = `data:image/png;base64,${png}`
    await img.decode()
    const c = new OffscreenCanvas(img.width, img.height)
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0)
    const lum = (r: number, gn: number, b: number) => {
      const f = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(gn) + 0.0722 * f(b)
    }
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
    const rgba = (color: string) => {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = color
      probe.fillRect(0, 0, 1, 1)
      const d = probe.getImageData(0, 0, 1, 1).data
      return d[3] ? [d[0] * 255 / d[3], d[1] * 255 / d[3], d[2] * 255 / d[3], d[3] / 255] : [0, 0, 0, 0]
    }
    const fails: string[] = []
    for (const t of targets) {
      const [x0, y0, x1, y1] = t.r
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data
      const [r, gn, b, a] = rgba(t.color)
      const vals: number[] = []
      for (let i = 0; i < d.length; i += 16) {
        const l1 = lum(r * a + d[i] * (1 - a), gn * a + d[i + 1] * (1 - a), b * a + d[i + 2] * (1 - a))
        const l2 = lum(d[i], d[i + 1], d[i + 2])
        vals.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))
      }
      vals.sort((p, q) => p - q)
      const worst = vals[Math.floor(vals.length * 0.05)] ?? 21
      if (worst < (t.large ? 3 : 4.5)) fails.push(`대비 ${worst.toFixed(2)} ${t.sel} "${t.text}"`)
    }
    return [...new Set(fails)]
  }, { png, targets })
}

async function glassFails(page: Page) {
  return page.evaluate(([max, content]) => {
    const all = [...document.querySelectorAll('body *')]
    const glass = all.filter((e) => [undefined, '::before', '::after'].some((p) => getComputedStyle(e, p).backdropFilter !== 'none'))
    const f: string[] = []
    if (glass.length > +max) f.push(`유리 ${glass.length}개 (한도 ${max}): ${glass.map((e) => e.className).slice(0, 12).join(' | ')}`)
    const onContent = glass.filter((e) => e.matches(content))
    if (onContent.length) f.push(`콘텐츠 카드에 backdrop-filter ${onContent.length}개`)
    return f
  }, [MAX_GLASS, CONTENT] as const)
}

async function motionAndA11yFails(page: Page) {
  const f: string[] = []
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const inf = await page.evaluate(() => document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity && (a as CSSAnimation).animationName !== 'spin').map((a) => (a as CSSAnimation).animationName))
  if (inf.length) f.push(`무한 애니메이션: ${inf.join(', ')}`)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] })
  const n = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => getComputedStyle(e).backdropFilter !== 'none').length)
  if (n) f.push(`투명도 줄이기에서 유리 ${n}개`)
  const a11y = await contrastFails(page)
  f.push(...a11y.map((s) => `투명도 줄이기: ${s}`))
  await cdp.send('Emulation.setEmulatedMedia', { features: [] })
  await cdp.detach()
  return f
}

for (const scheme of ['light', 'dark'] as const) {
  for (const [vp, opts] of [
    ['desktop', { viewport: { width: 1440, height: 900 } }],
    ['mobile', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ] as const) {
    test.describe(() => {
      test.use({ colorScheme: scheme, ...opts })
      test(`${scheme} ${vp}`, async ({ page }) => {
        mkdirSync(OUT, { recursive: true })
        const fails: string[] = []
        const errors: string[] = []
        page.on('pageerror', (e) => errors.push(String(e)))
        let n = 0
        const shot = async (name: string) => {
          const at = `${String(++n).padStart(2, '0')}-${name}`
          await page.screenshot({ path: `${OUT}/${scheme}-${vp}-${at}.png` })
          const a = [...await contrastFails(page), ...await glassFails(page), ...await motionAndA11yFails(page)]
          fails.push(...a.map((s) => `[${at}] ${s}`))
        }
        const id = await seed(page)
        await page.waitForTimeout(3500) // 가져오기 토스트가 사라지길 기다린다
        await shot('editor')
        await page.keyboard.press('Shift+Slash')
        await page.waitForTimeout(150)
        await shot('editor-keys')
        await page.keyboard.press('Escape')
        await card(page, '평균임금').click()
        await page.getByRole('tree').press('Delete')
        await page.waitForTimeout(150)
        await shot('editor-toast')
        await page.locator('.toast').getByRole('button', { name: '실행 취소' }).click()
        await go(page, '#/')
        await shot('list')
        await page.locator('.tree-menu summary').first().click()
        await shot('list-menu')
        await page.locator('.tree-menu summary').first().click()
        await go(page, `#/tree/${id}/flash`)
        await shot('flash')
        await rateAll(page, id)
        await shot('flash-open')
        const colors = await page.locator('li[data-node-id]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.color))
        console.log(`${scheme} ${vp} 하위 카드 색: ${colors.join(', ')}`)
        await page.getByRole('button', { name: '요약', exact: true }).click()
        await page.waitForTimeout(150)
        await shot('flash-summary')
        await go(page, `#/tree/${id}/dnd`)
        await shot('dnd')
        const c = page.locator('.dnd-tray [data-card]').first()
        const slot = page.locator('[data-slot][data-drop]').first()
        await slot.scrollIntoViewIfNeeded()
        const [cb, sb] = [await c.boundingBox(), await slot.boundingBox()]
        if (cb && sb) {
          await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2)
          await page.mouse.down()
          await page.mouse.move(sb.x + sb.width / 2 - 20, sb.y + sb.height / 2, { steps: 4 })
          await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 2 })
          await page.waitForTimeout(120)
          await page.screenshot({ path: `${OUT}/${scheme}-${vp}-dnd-drag.png` })
          await page.mouse.up()
        }
        await shot('dnd-placed')
        await page.getByRole('button', { name: '채점' }).click()
        await page.waitForTimeout(150)
        await shot('dnd-graded')
        await go(page, `#/tree/${id}/blank`)
        await shot('blank')
        await go(page, '#/review')
        await shot('review')
        writeFileSync(`${OUT}/${scheme}-${vp}.report.json`, JSON.stringify({ look: LOOK, fails, errors }, null, 1))
        expect.soft(errors, '페이지 오류').toEqual([])
        expect(fails).toEqual([])
      })
    })
  }
}

/** 큰 트리 스크롤 fps (CPU 6배 감속). 측정값만 출력하고 시안끼리 비교한다 */
test('perf', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${BASE}/?look=${LOOK}#/`)
  await page.getByLabel('새 트리 제목').fill('큰 트리')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  const big = Array.from({ length: 30 }, (_, i) => `단원${i}\n${Array.from({ length: 9 }, (_, j) => `  항목${i}-${j}`).join('\n')}`).join('\n')
  await page.getByLabel('개요 텍스트').fill(big)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await expect(page.locator('.node-row[data-node-id]')).toHaveCount(301)
  await page.waitForTimeout(800)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  const fps = await page.evaluate(() => new Promise<number>((done) => {
    const el = document.querySelector('.outline')!
    const t0 = performance.now()
    let frames = 0
    const tick = () => {
      frames++
      const t = performance.now() - t0
      el.scrollTop = (t / 2000) * 400
      el.scrollLeft = (t / 2000) * 800
      if (t < 3000) requestAnimationFrame(tick)
      else done(Math.round(frames / 3))
    }
    requestAnimationFrame(tick)
  }))
  console.log(`perf look=${LOOK || '기존'} fps=${fps}`)
})
