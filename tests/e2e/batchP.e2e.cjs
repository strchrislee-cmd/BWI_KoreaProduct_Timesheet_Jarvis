// 2026-11-26 (7): the grid dropdown was cut off at the top when it opened upwards; Type options can
// be reordered, sorted and coloured per user like Project and Task.
// REPORT=1 writes docs/test-reports/<date>-type-prefs/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const PINK = '#C14C8A' // 분홍색

const report = createReport({
  id: 'type-prefs',
  title: '드롭다운 잘림 수정 · Type 순서·색 (개인)',
  suite: 'tests/e2e/batchP.e2e.cjs',
  request: '(버그) 아래쪽 행에서 Type 드롭다운을 열면 위쪽 컨트롤이 안 보임. Type도 Project·Task처럼 순서와 색상을 바꿀 수 있게.',
  criteria: [
    '드롭다운이 위로 열리든 아래로 열리든 표의 보이는 영역 안에 다 들어가고, 맨 위 안내 줄과 정렬 버튼이 보인다.',
    'Type 드롭다운에도 끌기 손잡이, 정렬 메뉴, 항목별 … 메뉴가 있다.',
    '끌어서 바꾼 순서와 고른 정렬이 사람마다 저장된다(새로 고쳐도 유지).',
    '… 메뉴에서 고른 색이 드롭다운과 표의 Type 칩, Weekly Result에 보이고, 관리자의 팀 색(Projects)은 그대로다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 760 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  report.env(`Chromium ${browser.version()}`, '1440×760')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const pop = page.locator('[data-drop]')
  const menu = page.getByRole('dialog', { name: 'Option menu' })
  const sameBg = (locator, cssExpr) =>
    locator.evaluate((el, expr) => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = expr
      document.body.appendChild(probe)
      const want = getComputedStyle(probe).backgroundColor
      probe.remove()
      return getComputedStyle(el).backgroundColor === want
    }, cssExpr)
  const chipBg = (hex) => `color-mix(in srgb, ${hex} 42%, white)`
  const openType = async (slot) => {
    await cell(slot, 'mid').click()
    await page.keyboard.press('Enter')
    await pop.waitFor()
  }
  const typeNames = async () => (await pop.getByRole('option').allInnerTexts()).map((t) => t.trim()).filter((t) => t && t !== '— 비우기')
  const fits = () =>
    pop.evaluate((el) => {
      let sc = el.parentElement
      while (sc && !/(auto|scroll)/.test(getComputedStyle(sc).overflowY)) sc = sc.parentElement
      const a = el.getBoundingClientRect()
      const s = sc.getBoundingClientRect()
      return { drop: el.dataset.drop, top: Math.round(a.top), bottom: Math.round(a.bottom), areaTop: Math.round(s.top), areaBottom: Math.round(s.bottom) }
    })

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(22, 'mid').waitFor()
  await page.mouse.move(700, 120)

  // ── dropdown inside the table ────────────────────────────────────────────
  const seen = []
  for (const slot of [20, 22, 24]) {
    await openType(slot)
    seen.push({ slot, ...(await fits()), header: await pop.getByText('Type 선택', { exact: false }).isVisible() })
    if (slot === 24) break
    await page.keyboard.press('Escape')
  }
  const allFit = seen.every((r) => r.top >= r.areaTop && r.bottom <= r.areaBottom && r.header)
  const c1 = report.check({
    name: '드롭다운이 표 안에 다 들어가고 맨 위 안내 줄이 보임(위로·아래로 열 때 모두)',
    expected: '세 행 모두 top ≥ 표 위쪽, bottom ≤ 표 아래쪽, "Type 선택" 줄 보임',
    actual: seen.map((r) => `${r.slot}:${r.drop} ${r.top}~${r.bottom} (표 ${r.areaTop}~${r.areaBottom})${r.header ? '' : ' 안내 안 보임'}`).join(' / '),
    how: 'popover rect ⊂ scroll area rect && header visible',
    pass: allFit,
  })
  await report.shot(page, { caption: '아래쪽 행(12:00)에서 위로 연 Type 드롭다운: 위쪽까지 다 보임', marks: [{ target: pop, n: c1, label: '잘리지 않음' }] })

  // ── reorder / sort / colour controls ─────────────────────────────────────
  const handles = await pop.getByLabel(/^Drag /).count()
  const menus = await pop.getByLabel(/^Options for /).count()
  const sortBtn = await pop.getByLabel('Sort options').isVisible()
  const c2 = report.check({ name: 'Type에도 끌기 손잡이·정렬 버튼·… 메뉴', expected: '손잡이 12개, … 12개, 정렬 버튼 보임', actual: `손잡이 ${handles}개, … ${menus}개, 정렬 버튼 ${sortBtn ? '보임' : '없음'}`, how: 'Drag/Options for 12개씩 && Sort options visible', pass: handles === 12 && menus === 12 && sortBtn })
  const before = await typeNames()
  const from = pop.getByRole('option', { name: /회의-INT/ }).getByLabel(/^Drag /)
  const to = pop.getByRole('option').first()
  // the list is short here (it fits the table): scroll so both ends of the drag are on screen
  await pop.getByRole('option', { name: /회의-INT/ }).scrollIntoViewIfNeeded()
  await page.mouse.move(700, 120)
  const fb = await from.boundingBox()
  const tb = await to.boundingBox()
  await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
  await page.mouse.down()
  await page.mouse.move(tb.x + 20, tb.y + 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const dragged = await typeNames()
  const c3 = report.check({ name: '끌어서 회의-INT를 맨 위로', expected: `첫 항목 '회의-INT' (전: '${before[0]}')`, actual: `첫 항목 '${dragged[0]}'`, how: "options[0] === '회의-INT'", pass: dragged[0] === '회의-INT' && before[0] !== '회의-INT' })
  await report.shot(page, { caption: '순서를 바꾼 Type 드롭다운(손잡이·… 메뉴·정렬 버튼)', marks: [{ target: pop.getByRole('option').first(), n: c3, label: '맨 위로' }, { target: pop.getByLabel('Sort options'), n: c2, label: '정렬' }] })
  await page.keyboard.press('Escape')
  await page.reload()
  await openType(24)
  const kept = await typeNames()
  report.check({ name: '새로 고쳐도 순서 유지', expected: "첫 항목 '회의-INT'", actual: `'${kept[0]}'`, how: "새로 고친 뒤 options[0] === '회의-INT'", pass: kept[0] === '회의-INT' })

  // sort by name
  await pop.getByLabel('Sort options').click()
  await page.getByRole('menuitemradio', { name: /이름순/ }).click()
  await page.waitForTimeout(200)
  const byName = await typeNames()
  const sorted = [...byName].sort((a, b) => a.localeCompare(b, 'ko'))
  report.check({ name: '정렬: 이름순', expected: sorted.slice(0, 3).join(', ') + ' …', actual: byName.slice(0, 3).join(', ') + ' …', how: '옵션 순서 === ko 이름순', pass: byName.join('|') === sorted.join('|') })
  await pop.getByLabel('Sort options').click()
  await page.getByRole('menuitemradio', { name: /수동/ }).click()

  // ── personal colour ──────────────────────────────────────────────────────
  await pop.getByRole('option', { name: /지원-8D/ }).hover()
  await pop.getByRole('option', { name: /지원-8D/ }).getByLabel('Options for 지원-8D').click()
  await menu.waitFor()
  const menuTitle = (await menu.innerText()).split('\n')[0].trim()
  await menu.getByRole('button', { name: '분홍색' }).click()
  await page.waitForTimeout(250)
  const optChip = pop.getByRole('option', { name: /지원-8D/ }).locator('span.rounded-chip').first()
  const pinkInList = await sameBg(optChip, chipBg(PINK))
  const c6 = report.check({ name: '… 메뉴에서 고른 색이 드롭다운에 바로 보임', expected: "메뉴 제목 '지원-8D', 칩 분홍색", actual: `제목 '${menuTitle}', 칩 ${pinkInList ? '분홍색' : '다른 색'}`, how: "menu 첫 줄 === '지원-8D' && chip bg === chipBg(분홍)", pass: menuTitle === '지원-8D' && pinkInList })
  await report.shot(page, { caption: 'Type … 메뉴에서 색 고르기(나에게만 적용)', marks: [{ target: menu, n: c6, label: '개인 색' }] })
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  // put it in a row, check the grid chip, then reload
  // a whole work row (Project · Type · Task) so it also shows up in the Weekly Result
  await cell(24, 'category').click()
  await page.evaluate((t) => navigator.clipboard.writeText(t), '품질\t지원-8D\t8D 보고')
  await page.keyboard.press('Control+V')
  await cell(24, 'mid').filter({ hasText: '지원-8D' }).waitFor()
  await page.reload()
  const gridChip = cell(24, 'mid').locator('span.rounded-chip').first()
  await gridChip.waitFor()
  const pinkInGrid = await sameBg(gridChip, chipBg(PINK))
  const c7 = report.check({ name: '표의 Type 칩도 고른 색, 새로 고쳐도 유지', expected: '12:00 행 지원-8D 칩 분홍색', actual: pinkInGrid ? '분홍색' : '다른 색', how: 'cell(24, mid) chip bg === chipBg(분홍)', pass: pinkInGrid })
  await page.mouse.move(700, 120)
  await report.shot(page, { caption: '표의 Type 칩에 개인 색', marks: [{ target: cell(24, 'mid'), n: c7, label: '분홍색' }] })

  // Weekly Result uses it; the team colour in Projects stays
  await page.getByRole('link', { name: 'Weekly Result' }).click()
  const workChip = page.getByTestId('work-mid').filter({ hasText: '지원-8D' }).first()
  await workChip.waitFor()
  const pinkWeekly = await sameBg(workChip, chipBg(PINK))
  await page.getByRole('link', { name: 'Projects' }).click()
  const teamSwatch = page.getByRole('table', { name: 'Type list' }).getByLabel('Color of 지원-8D')
  await teamSwatch.waitFor()
  const teamPink = await sameBg(teamSwatch, PINK)
  report.check({ name: 'Weekly Result도 개인 색, Projects의 팀 색은 그대로', expected: 'Weekly Result 칩 분홍색, Projects 팀 색은 분홍색 아님', actual: `Weekly ${pinkWeekly ? '분홍색' : '다른 색'}, 팀 색 ${teamPink ? '분홍색(바뀜)' : '그대로'}`, how: 'work-mid bg === chipBg(분홍) && Projects swatch ≠ 분홍', pass: pinkWeekly && !teamPink })

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchP: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
