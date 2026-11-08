// LM 측정 스크립트: 6개 화면 × 3폭 스크린샷 + 모바일 키보드 열림 시뮬레이션(두 모델) + 가려짐 측정
// 실행: node docs/specs/evidence/lm/shots.mjs <출력폴더>   (dev 서버 8022가 떠 있어야 함. e2e/ 와 무관한 독립 스크립트)
// 모델 A(resizes-content: Firefox Android, Chrome `interactive-widget=resizes-content`) = 뷰포트 높이를 844→508로 줄인다.
// 모델 B(resizes-visual: iOS Safari, Chrome Android 108+ 기본) = 뷰포트 844 그대로, 하단 336px 를 키보드로 간주해 그 영역에 들어간 요소를 가려진 것으로 센다.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:8022'
const OUT = process.argv[2] ?? 'shots'
const KB = 336 // 키보드 높이(px). 출처는 02_layout_mobile.md §7
const ONLY = process.env.CASES?.split(',') // 예: CASES=editor-card-title → 그 키보드 케이스만, 화면 스크린샷 생략
const JPEG = { type: 'jpeg', quality: 70 }
fs.mkdirSync(OUT, { recursive: true })

const OUTLINE = `근로계약
  근로조건명시
    서면명시사항
    위반시제재
  위약예정금지
  근로시간
해고
  정당한이유
  해고예고
    예고수당
  부당해고구제
임금
  통상임금
  평균임금
  임금지급원칙
    통화지급
    직접지급`

const FIXED = ['.topnav', '.zoom-tools', '.dnd-dock', '.dnd-bar', '.flash-nav', '.toasts', '.minimap', '.canvas', '.side', '.tree-header', '.dnd-canvas', '.flash-aside']
const result = { kb: KB, screens: [], keyboard: [] }

async function seed(page) {
  await page.goto(BASE + '/#/')
  await page.getByLabel('새 트리 제목').fill('노동법')
  await page.getByLabel('새 트리 제목').press('Enter')
  await page.getByRole('link', { name: '편집' }).first().click()
  await page.getByLabel('개요 텍스트').fill(OUTLINE)
  await page.getByRole('button', { name: '선택 노드의 자식으로 추가' }).click()
  await page.locator('.node-row[data-node-id]').nth(17).waitFor()
  const treeId = new URL(page.url()).hash.split('/')[2]
  await page.goto(`${BASE}/#/tree/${treeId}/flash`)
  await page.locator('button[data-concept-id]').click()
  await page.getByRole('list', { name: '하위 개념' }).locator('li[data-node-id]').first().getByRole('button', { name: '모름', exact: true }).click()
  await page.waitForTimeout(200)
  return treeId
}

const rects = (page, sels) => page.evaluate((sels) => {
  const o = { vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, scrollY, els: {} }
  for (const s of sels) {
    const el = document.querySelector(s)
    if (!el) continue
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    const cs = getComputedStyle(el)
    o.els[s] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), pos: cs.position }
  }
  const a = document.activeElement
  if (a && a !== document.body) {
    const r = a.getBoundingClientRect()
    o.active = { tag: a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : ''), label: a.getAttribute('aria-label'), y: Math.round(r.y), bottom: Math.round(r.bottom), h: Math.round(r.height), fontSize: getComputedStyle(a).fontSize }
  }
  return o
}, sels)

const screens = (id) => [
  ['trees', '#/'],
  ['editor', `#/tree/${id}`],
  ['flash', `#/tree/${id}/flash`],
  ['review', '#/review'],
  ['dnd', `#/tree/${id}/dnd`],
  ['blank', `#/tree/${id}/blank`],
]

async function open(page, name, hash) {
  await page.goto('about:blank') // 같은 URL 재방문도 상태(이름 변경 모드 등)를 버리고 새로 그린다
  await page.goto(BASE + '/' + hash)
  await page.waitForTimeout(500)
  if (name === 'flash') await page.locator('button[data-concept-id]').click()
  if (name === 'review') {
    await page.getByRole('button', { name: /복습 시작/ }).first().click()
    await page.waitForTimeout(300)
  }
  if (name === 'editor') await page.locator('.node-row[data-node-id]').nth(17).waitFor()
  await page.waitForTimeout(400)
}

async function shootAll(page, tag, w, h, treeId) {
  await page.setViewportSize({ width: w, height: h })
  for (const [name, hash] of screens(treeId)) {
    await open(page, name, hash)
    const m = await rects(page, FIXED)
    result.screens.push({ screen: name, width: w, height: h, ctx: tag, ...m })
    await page.screenshot({ path: path.join(OUT, `${name}-${w}.jpg`), ...JPEG })
  }
}

// 키보드 케이스: [이름, 화면, 포커스 동작]
const KB_CASES = [
  ['trees-new', 'trees', async (p) => p.getByLabel('새 트리 제목').focus()],
  ['trees-rename', 'trees', async (p) => { await p.locator('.tree-title').first().dblclick(); await p.locator('.tree-rename').waitFor() }],
  ['editor-card-title', 'editor', async (p) => { await p.locator('.outline').focus(); await p.keyboard.press('F2'); await p.locator('input.title-input').waitFor() }], // 선택 노드(루트) 제목 편집 = 더블클릭과 같은 경로
  ['editor-panel-title', 'editor', async (p) => p.locator('.detail-title').focus()],
  ['editor-panel-note', 'editor', async (p) => p.locator('.detail .note-edit').focus()],
  ['editor-outline', 'editor', async (p) => { await p.locator('details.io summary').click(); await p.getByLabel('개요 텍스트').focus() }],
  ['dnd-scope', 'dnd', async (p) => p.getByLabel('범위').focus()],
]

async function keyboardCases(page, treeId) {
  for (const [name, screen, act] of KB_CASES) {
    if (ONLY && !ONLY.includes(name)) continue
    const hash = screens(treeId).find(([n]) => n === screen)[1]
    try {
      // 모델 B: 뷰포트 844 유지 + 하단 336px 키보드 오버레이
      await page.setViewportSize({ width: 390, height: 844 })
      await open(page, screen, hash)
      await act(page)
      await page.waitForTimeout(300)
      const b = await rects(page, FIXED)
      const kbTop = 844 - KB
      b.hidden = hiddenIn(b, kbTop)
      await page.evaluate((kbTop) => {
        const d = document.createElement('div')
        d.id = '__kb'
        d.style.cssText = `position:fixed;left:0;right:0;top:${kbTop}px;bottom:0;z-index:9999;background:repeating-linear-gradient(135deg,#0003 0 8px,#0001 8px 16px);border-top:2px dashed #d64545;display:grid;place-items:center;font:600 14px system-ui;color:#d64545`
        d.textContent = '키보드 영역(시뮬레이션) 336px'
        document.body.append(d)
      }, kbTop)
      await page.screenshot({ path: path.join(OUT, `kb-B-${name}.jpg`), ...JPEG })
      await page.evaluate(() => document.getElementById('__kb')?.remove())
      result.keyboard.push({ case: name, model: 'B(resizes-visual, 844)', kbTop, ...b })

      // 모델 A: 뷰포트 높이 508
      await page.setViewportSize({ width: 390, height: 844 - KB })
      await open(page, screen, hash)
      await act(page)
      await page.waitForTimeout(300)
      const a = await rects(page, FIXED)
      a.hidden = hiddenIn(a, a.vh)
      await page.screenshot({ path: path.join(OUT, `kb-A-${name}.jpg`), ...JPEG })
      result.keyboard.push({ case: name, model: 'A(resizes-content, 508)', kbTop: a.vh, ...a })
    } catch (e) {
      result.keyboard.push({ case: name, error: String(e).slice(0, 200) })
    }
  }
}

/** kbTop 아래로 내려간(=키보드에 가려진) 요소와 입력칸 */
function hiddenIn(m, kbTop) {
  const out = {}
  if (m.active) out.activeInput = m.active.bottom > kbTop ? `가려짐 (bottom ${m.active.bottom} > ${kbTop})` : m.active.y < 0 ? `위로 스크롤돼 안 보임 (y ${m.active.y})` : '보임'
  for (const [s, r] of Object.entries(m.els)) {
    if (!['fixed', 'sticky'].includes(r.pos) && s !== '.zoom-tools') continue
    const bottom = r.y + r.h
    if (r.y >= kbTop) out[s] = `전부 가려짐 (y ${r.y} ≥ ${kbTop})`
    else if (bottom > kbTop) out[s] = `일부 가려짐 (${bottom - kbTop}px)`
  }
  return out
}

const browser = await chromium.launch({ channel: 'msedge' })
const ctxOpts = { reducedMotion: 'reduce', deviceScaleFactor: 1 }
// 모바일 390 (터치)
{
  const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const id = await seed(page)
  if (!ONLY) await shootAll(page, 'mobile', 390, 844, id)
  await keyboardCases(page, id)
  await ctx.close()
}
// 태블릿 768 (터치)
if (!ONLY) {
  const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const id = await seed(page)
  await shootAll(page, 'tablet', 768, 1024, id)
  await ctx.close()
}
// PC 1440 (마우스)
if (!ONLY) {
  const ctx = await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const id = await seed(page)
  await shootAll(page, 'desktop', 1440, 900, id)
  await ctx.close()
}
await browser.close()
fs.writeFileSync(path.join(OUT, ONLY ? `measure-${ONLY.join('_')}.json` : 'measure.json'), JSON.stringify(result, null, 1))
console.log('done', OUT, result.screens.length, 'screens,', result.keyboard.length, 'keyboard cases')
