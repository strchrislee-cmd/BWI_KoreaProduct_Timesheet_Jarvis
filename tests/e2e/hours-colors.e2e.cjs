// Browser test: per-day work hours and user colors (demo mode). Run: node hours-colors.e2e.cjs
const { chromium } = require('playwright')
const path = require('path')
const E = __dirname
const BASE = 'http://localhost:4173'
const SHOTS = process.env.SHOTS

let step = 0
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`)
const expect = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg)
  ok(msg)
}

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text()) && errors.push(m.text()))

  const start = page.getByLabel('Start time')
  const end = page.getByLabel('End time')
  const slotRows = () => page.locator('[role="row"][data-slot]').evaluateAll((els) => els.map((e) => Number(e.dataset.slot)))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  /** Computed background of an element vs. the same CSS expression on a probe element. */
  const sameBg = (locator, cssExpr) =>
    locator.evaluate((el, expr) => {
      const probe = document.createElement('div')
      probe.style.backgroundColor = expr
      document.body.appendChild(probe)
      const want = getComputedStyle(probe).backgroundColor
      probe.remove()
      return getComputedStyle(el).backgroundColor === want
    }, cssExpr)
  const rowBg = (hex) => `color-mix(in srgb, ${hex} 28%, white)`
  const chipBg = (hex) => `color-mix(in srgb, ${hex} 42%, white)`

  // setup: master sheet so there are projects
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()

  // ── work hours ────────────────────────────────────────────────────────────
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(15, 'category').waitFor()
  let rows = await slotRows()
  expect((await start.inputValue()) === '07:30' && (await end.inputValue()) === '16:30' && rows[0] === 15 && rows.at(-1) === 32, 'default day 07:30 → 16:30 (rows 07:30–16:00)')
  expect((await page.getByTestId('hours-note').innerText()) === '근무 8h + 점심 1h', 'note explains 8h work + 1h lunch')

  await start.selectOption('08:00')
  await page.waitForFunction(() => document.querySelector('[aria-label="End time"]').value === '17:00')
  rows = await slotRows()
  expect(rows[0] === 16 && rows.at(-1) === 33, 'start 08:00 → end follows to 17:00, rows 08:00–16:30')

  await end.selectOption('18:30')
  await page.getByTestId('hours-note').filter({ hasText: '+1h 30m 연장' }).waitFor()
  rows = await slotRows()
  expect(rows.at(-1) === 36, 'end extended to 18:30 (+1h 30m), rows through 18:00')
  const endOptions = await end.locator('option').allTextContents()
  expect(endOptions[0] === '08:30' && endOptions.at(-1) === '24:00', 'end options run from start+30m to 24:00')

  await page.reload()
  await cell(16, 'category').waitFor()
  expect((await start.inputValue()) === '08:00' && (await end.inputValue()) === '18:30', 'day hours persist after reload')

  await page.getByLabel('Next day').click()
  await page.waitForFunction(() => document.querySelector('[aria-label="Start time"]').value === '07:30')
  expect((await end.inputValue()) === '16:30', 'other days keep the default hours')

  // Settings default
  await page.goto(BASE + '/settings')
  await start.selectOption('09:00')
  expect((await end.inputValue()) === '18:00', 'Settings: default start 09:00 → end 18:00')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.getByRole('status').filter({ hasText: 'Profile saved' }).waitFor()
  await page.goto(BASE + '/timesheets?date=2026-11-20')
  await page.waitForFunction(() => document.querySelector('[aria-label="Start time"]').value === '09:00')
  expect((await end.inputValue()) === '18:00', 'new days use the saved default 09:00 → 18:00')
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.waitForFunction(() => document.querySelector('[aria-label="Start time"]').value === '08:00')
  ok('a day with its own hours keeps them after the default changes')

  // ── category colors ──────────────────────────────────────────────────────
  await cell(16, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('INT | Daily_Scrum')
  await page.keyboard.press('Enter')
  const row16 = page.locator('[role="row"][data-slot="16"]')
  expect(await sameBg(row16, rowBg('#F0B429')), 'meeting row uses the default meeting color')

  const menu = page.getByRole('dialog', { name: 'Option menu' })
  const closeMenu = async () => {
    await page.mouse.click(5, 995)
    await menu.waitFor({ state: 'detached' })
    if (await page.getByRole('listbox').count()) await page.keyboard.press('Escape')
  }
  // B1: no color dot in the cell any more — colors are changed from the dropdown option's … menu
  const openMeetingMenu = async () => {
    await cell(16, 'category').click()
    await page.keyboard.press('Enter')
    const opt = page.getByRole('listbox').getByRole('option', { name: /회의\(개발/ })
    await opt.hover()
    await opt.getByLabel(/^Options for 회의/).click()
    await menu.waitFor()
  }
  await openMeetingMenu()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'colors_01_picker.png') })
  await menu.getByRole('button', { name: '보라색' }).click()
  await page.waitForTimeout(150)
  expect(await sameBg(row16, rowBg('#9065B0')), 'named color applied to the category row')
  await closeMenu()

  // custom RGB + save to presets
  await openMeetingMenu()
  await menu.getByRole('button', { name: /직접 지정/ }).click()
  await menu.getByLabel('Color R').fill('10')
  await menu.getByLabel('Color G').fill('120')
  await menu.getByLabel('Color B').fill('200')
  expect((await menu.getByLabel('Hex').inputValue()) === '#0A78C8', 'RGB inputs update the hex value (#0A78C8)')
  await menu.getByRole('button', { name: '프리셋에 저장' }).click()
  await page.waitForTimeout(150)
  expect(await sameBg(row16, rowBg('#0A78C8')), 'custom RGB color applied')
  await menu.getByLabel('Color #0A78C8', { exact: true }).waitFor()
  ok('custom color kept in "내 색상" presets')
  await closeMenu()

  // the dropdown chip uses the same color
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  const opt = page.getByRole('listbox').getByRole('option', { name: /회의\(개발/ }).locator('span.truncate').first()
  expect(await sameBg(opt, chipBg('#0A78C8')), 'category dropdown chip shows the chosen color')
  await page.keyboard.press('Escape')

  // ── template color ───────────────────────────────────────────────────────
  await page.locator('[data-slot="16"] > div').nth(1).click() // the time cell (after the + column)
  await page.getByRole('button', { name: '선택한 행 저장' }).click()
  const chip = page.getByTestId('templates').locator('li').first()
  await chip.waitFor()
  expect(await sameBg(chip, chipBg('#0A78C8')), 'new repeated task inherits the category color')
  await page.getByTestId('templates').getByLabel('Options for INT | Daily_Scrum').click()
  await menu.getByRole('button', { name: '분홍색' }).click()
  await page.waitForTimeout(250)
  expect(await sameBg(chip, chipBg('#C14C8A')), 'repeated task color changed to 분홍색')
  await closeMenu()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'colors_02_daily.png') })

  // persistence
  await page.reload()
  await cell(16, 'category').waitFor()
  expect(
    (await sameBg(row16, rowBg('#0A78C8'))) && (await sameBg(page.getByTestId('templates').locator('li').first(), chipBg('#C14C8A'))),
    'category and template colors persist after reload',
  )

  // ── Settings colors card ─────────────────────────────────────────────────
  await page.goto(BASE + '/settings')
  const meetingRow = page.locator('li', { hasText: '회의(개발, 품질, Gemba walk, etc..)' })
  await meetingRow.getByText('사용자 지정').waitFor()
  expect(await meetingRow.getByText('사용자 지정').isVisible(), 'Settings lists the custom category color')
  expect(await page.getByTestId('saved-palette').getByText('#0A78C8').isVisible(), 'Settings shows the saved palette')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'colors_03_settings.png'), fullPage: true })
  await meetingRow.getByLabel(/Color of/).click()
  await menu.getByRole('button', { name: '기본', exact: true }).click()
  await meetingRow.getByText('사용자 지정').waitFor({ state: 'detached' })
  ok('기본 resets the category to its default color')
  await closeMenu()
  await page.getByTestId('saved-palette').getByLabel('Remove saved color #0A78C8').click()
  await page.getByTestId('saved-palette').waitFor({ state: 'detached' })
  ok('saved color removed from presets')

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('HOURS/COLORS E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
