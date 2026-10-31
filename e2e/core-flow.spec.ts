import { expect, test, type Page } from '@playwright/test'

// plan §6 핵심 학습 흐름: 생성 → 개요 가져오기 → 키보드 편집(한글) → 새로고침 유지
// → 드릴다운 → 백지 퀴즈(정확·오타·애매·위치 오류·누락) → 자기채점 → 확정 → 색칠 → 복습 → 이벤트

const OUTLINE = `근로계약
  근로조건명시
  위약예정금지
해고
  정당한이유
  해고예고
임금
  통상임금
  평균임금`

async function eventTypes(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open('drilldown')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const all = req.result.transaction('events').objectStore('events').getAll()
          all.onsuccess = () => resolve((all.result as { type: string }[]).map((e) => e.type))
        }
      }),
  )
}

async function checkAllIdeaUnits(page: Page) {
  const boxes = page.getByRole('group', { name: '자기채점' }).getByRole('checkbox')
  for (const box of await boxes.all()) await box.check()
}

test('핵심 학습 흐름', async ({ page }) => {
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
  const treeHash = new URL(page.url()).hash // #/tree/<id>
  const treeId = treeHash.split('/')[2]

  // 5. 드릴다운: 루트 하위 항목 입력(정확 2 + 오타 1) → 공개 → 판정 기록
  await page.goto(`/#/tree/${treeId}/study`)
  await expect(page.getByLabel('브레드크럼')).toContainText('노동법')
  await page.getByLabel('하위 항목 입력').fill('근로계약\n해고\n임굼')
  await page.getByRole('button', { name: '공개' }).click()
  await expect(page.locator('.drill-child[data-node-id]')).toHaveCount(4)
  await expect(page.locator('.drill-child[data-grade="exact"]')).toHaveCount(2)
  await checkAllIdeaUnits(page)
  await page.getByRole('button', { name: '판정 기록' }).click()
  await expect(page.getByRole('status')).toContainText('판정을 기록했습니다')

  // 6. 백지 퀴즈: 정확 / 2글자 오타(애매) / 위치 오류 / 4글자 오타 / 누락(해고예고, 근로시간)
  await page.goto(`/#/tree/${treeId}/quiz`)
  await page.getByLabel('백지 목차 입력').fill(`근로계약
  근로조건명시
  위약예정금지
해구
  정당한이유
  통상임금
임금
  평균임굼`)
  await page.getByRole('button', { name: '제출' }).click()
  const result = page.getByLabel('채점 결과')
  await expect(result).toBeVisible()
  await expect(result.locator('tr[data-orig-id]').filter({ hasText: '(위치 오류)' })).toHaveCount(1)
  await checkAllIdeaUnits(page)

  // 요약 수치 = 표의 판정 수
  const grades = await result.locator('tr[data-orig-id]').evaluateAll((trs) =>
    trs.map((tr) => ({ id: tr.getAttribute('data-orig-id')!, grade: tr.getAttribute('data-grade')!, text: tr.textContent ?? '' })),
  )
  const summary = page.getByLabel('채점 요약')
  const selfCount = grades.filter((g) => g.grade.startsWith('self_')).length
  await expect(summary).toHaveAttribute('data-self', String(selfCount))
  expect(selfCount).toBeGreaterThan(0)

  await page.getByRole('button', { name: '확정' }).click()
  await expect(page.getByRole('status')).toContainText('기록했습니다')

  // 7. 에디터 색칠
  await page.goto(`/#/tree/${treeId}`)
  await expect(rows).toHaveCount(11)
  const rowOf = (id: string) => page.locator(`.node-row[data-node-id="${id}"]`)
  const leafExact = grades.find((g) => g.grade === 'exact' && g.text.includes('근로조건명시'))!
  await expect(rowOf(leafExact.id)).toHaveClass(/c-green/)
  for (const g of grades.filter((x) => x.grade === 'self_accept')) await expect(rowOf(g.id)).not.toHaveClass(/c-green/)
  const misplaced = grades.find((g) => g.text.includes('(위치 오류)'))!
  await expect(rowOf(misplaced.id)).toHaveClass(/c-misplaced/)

  // 8. 오늘의 복습에 트리 표시
  await page.goto('/#/review')
  await expect(page.getByLabel('복습 대상 트리').locator(`li[data-tree-id="${treeId}"]`)).toBeVisible()

  // 9. 계측 이벤트
  const types = await eventTypes(page)
  for (const t of ['tree_created', 'outline_imported', 'drilldown_retrieval_submitted', 'blank_node_graded', 'blank_attempt_completed'])
    expect(types, t).toContain(t)
})
