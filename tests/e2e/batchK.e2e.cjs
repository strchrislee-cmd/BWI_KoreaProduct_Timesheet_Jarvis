// 11-24 (7): long text wraps in Daily Log cells; Today button; Weekly Result names + colors like Daily Log.
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4173'
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)

  // 1) long pasted text wraps inside the cell and the row grows
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const long = '고객 요청 사항을 정리하고 도면 변경 범위를 검토한 뒤, 금형 업체와 일정 및 비용을 협의하여 다음 주 회의 자료로 정리함'
  await cell(20, 'category').click()
  await page.evaluate((t) => navigator.clipboard.writeText(t), `회의\t주간 회의 및 후속 조치 정리\t${long}`)
  await page.keyboard.press('Control+V')
  await cell(20, 'details').filter({ hasText: '다음 주 회의 자료로 정리함' }).waitFor()
  const tall = (await cell(20, 'details').boundingBox()).height
  const normal = (await cell(21, 'details').boundingBox()).height
  expect(tall > normal + 10, `the row with long text grows (${Math.round(tall)}px vs ${Math.round(normal)}px)`)
  const clipped = await cell(20, 'details').locator('span').first().evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(!clipped && (await cell(20, 'details').innerText()).includes(long), 'the whole text is shown, wrapped, nothing cut off')
  const rowBox = await page.locator('[data-slot="20"]').boundingBox()
  const catBox = await cell(20, 'category').boundingBox()
  expect(Math.abs(catBox.height - rowBox.height) < 2, 'every cell of that row grows together')

  // 2) Today button
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })
  const todayBtn = page.getByRole('button', { name: 'Go to today' })
  expect(await todayBtn.isEnabled(), 'Today button is on while another day is shown')
  await todayBtn.click()
  await page.waitForURL((u) => new URL(u).searchParams.get('date') === today)
  await page.getByRole('button', { name: 'Go to today', disabled: true }).waitFor()
  expect(await page.getByLabel('Date', { exact: true }).inputValue() === today && await todayBtn.isDisabled(), 'Today jumps to today and then turns off')
  await page.goto(BASE + '/timesheets/weekly?date=2026-11-16')
  await page.getByRole('button', { name: 'Go to today' }).click()
  await page.waitForURL((u) => new URL(u).pathname === '/timesheets/weekly' && new URL(u).searchParams.get('date') === today)
  ok('Today works on the other tabs too (stays on Weekly Result)')

  // 3) Weekly Result: name, Local Project text = Daily Log category, colors
  await page.goto(BASE + '/timesheets?date=2026-11-17')
  await cell(18, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Enter')
  await cell(18, 'category').filter({ hasText: '회의' }).waitFor()
  const dailyText = (await cell(18, 'category').innerText()).trim()
  const dailyRowColor = await page.locator('[data-slot="18"]').evaluate((el) => getComputedStyle(el).backgroundColor)
  await page.getByRole('link', { name: 'Weekly Result' }).click()
  await page.getByText('Weekly Task Result').waitFor()
  expect((await page.getByRole('link', { name: 'Weekly Plan' }).count()) === 0, 'tab and title renamed to Weekly Result')
  const pills = page.getByTestId('local-project')
  const texts = (await pills.allInnerTexts()).map((t) => t.trim())
  expect(texts.includes(dailyText) && !texts.includes('일반업무'), `Local Project shows the Daily Log category name (${dailyText})`)
  const weeklyRow = page.locator('table.sheet tbody tr', { hasText: '11-17' }).first()
  const rowColor = await weeklyRow.evaluate((el) => getComputedStyle(el).backgroundColor)
  const pillColor = await weeklyRow.getByTestId('local-project').evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(rowColor === dailyRowColor && pillColor !== rowColor && pillColor !== 'rgba(0, 0, 0, 0)', `the row has the same category color as in Daily Log, the pill a stronger shade (${rowColor})`)
  await page.screenshot({ path: __dirname + '/shots/weekly-result.png' })

  // Korean screen language: 주간 결과
  await page.goto(BASE + '/settings')
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('한국어').check()
  await page.goto(BASE + '/timesheets/weekly?date=2026-11-16')
  await page.getByRole('link', { name: '주간 결과' }).waitFor()
  expect((await page.getByText('주간 업무 결과').count()) === 1 && (await page.getByRole('button', { name: 'Go to today' }).innerText()).trim() === '오늘', 'Korean: 주간 결과 / 주간 업무 결과 / 오늘')
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(20, 'details').filter({ hasText: '다음 주 회의 자료로 정리함' }).waitFor()
  await page.screenshot({ path: __dirname + '/shots/wrap-grid.png' })
  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await browser.close()
  console.log('batchK: all checks passed')
})().catch((e) => { console.error(e); process.exit(1) })
