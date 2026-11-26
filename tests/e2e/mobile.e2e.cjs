// Phone layout test (iPhone 15 + Pixel 7 emulation). Run: SHOTS=shots node mobile.e2e.cjs
const { chromium, devices } = require('playwright')
const path = require('path')
const E = __dirname
const BASE = 'http://localhost:4173'
const SHOTS = process.env.SHOTS ? path.join(E, process.env.SHOTS) : null

let step = 0
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`)
const expect = (cond, msg) => {
  if (!cond) throw new Error('FAILED: ' + msg)
  ok(msg)
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const watch = (p) => {
    p.on('pageerror', (e) => errors.push(e.message))
    p.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|jsdelivr|403/.test(m.text()) && errors.push(m.text()))
  }
  const ctx = await browser.newContext({ ...devices['iPhone 15'], timezoneId: 'Asia/Seoul' })
  const page = await ctx.newPage()
  watch(page)
  const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)
  const row = (i) => page.locator(`[role="listitem"][data-slot="${i}"]`)
  const sheet = page.getByRole('dialog', { name: '30-min entry' })

  // data: master sheet (from the phone, Projects page)
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()
  expect(await noHScroll(), 'Projects works on the phone without sideways scrolling')

  // ── shell ─────────────────────────────────────────────────────────────────
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await row(15).waitFor()
  const tabbar = page.getByRole('navigation', { name: 'Mobile navigation' })
  expect((await tabbar.isVisible()) && (await tabbar.getByRole('link').count()) === 4 && !(await page.locator('nav.sticky').isVisible()), 'bottom tab bar (Home · Timesheets · Admin · Settings) instead of the side menu')
  expect(await noHScroll(), 'Daily Log fits the phone width (no sideways scrolling)')
  const tabsNav = page.getByRole('link', { name: 'Leave' }).locator('..')
  expect((await tabsNav.evaluate((el) => getComputedStyle(el).overflowX)) === 'auto', 'Timesheets tabs are one swipeable row')
  expect((await page.locator('[role="grid"]').count()) === 0 && (await page.locator('[role="listitem"]').count()) === 18, 'phone shows a tap list of 18 half hours (07:30–16:00) instead of the spreadsheet')
  expect((await row(24).innerText()).includes('점심') && (await row(24).innerText()).includes('(기본)'), 'lunch rows show 점심 (기본)')

  // ── entry sheet: category + task + 업무내용, two slots, then next ─────────
  await row(16).tap()
  await sheet.waitFor()
  expect((await sheet.getByRole('heading', { level: 2 }).innerText()).includes('08:00') && (await sheet.getByRole('heading', { level: 2 }).innerText()).includes('08:30'), 'tapping 08:00 opens the entry sheet for 08:00–08:30')
  const sb = await sheet.evaluate((el) => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), vh: innerHeight, inBody: el.parentElement.parentElement === document.body } })
  expect(sb.inBody && Math.abs(sb.bottom - sb.vh) <= 1, `the sheet sits at the bottom of the screen above everything (bottom ${sb.bottom} / ${sb.vh})`)
  await sheet.getByLabel('Search category').fill('회의')
  await sheet.getByRole('option', { name: /회의\(개발/ }).tap()
  await sheet.getByLabel('Task').fill('INT | Daily_Scrum')
  await sheet.getByLabel('업무내용').fill('스프린트 일정 조율')
  await sheet.getByLabel('More slots').tap()
  expect((await sheet.getByTestId('span').innerText()).trim() === '2칸' && (await sheet.getByRole('heading', { level: 2 }).innerText()).includes('09:00'), '"+" covers two half hours (08:00–09:00)')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm_02_sheet.png') })
  await sheet.getByRole('button', { name: '저장 후 다음 칸' }).tap()
  await page.waitForFunction(() => document.querySelector('[role="dialog"] h2')?.textContent.startsWith('09:00'))
  ok('"저장 후 다음 칸" saves and moves straight on to 09:00')
  await sheet.getByLabel('Close').tap()
  await sheet.waitFor({ state: 'detached' })
  for (const i of [16, 17]) {
    const t = await row(i).innerText()
    if (!(t.includes('회의') && t.includes('INT | Daily_Scrum') && t.includes('스프린트 일정 조율'))) throw new Error(`row ${i}: ${t}`)
  }
  ok('both rows show category, task and 업무내용')
  await page.getByTestId('today-total').filter({ hasText: '1h 00m' }).waitFor()
  ok('Today total updates (1h 00m)')

  // repeated task created on the desktop layout, applied from the phone sheet
  const desk = await ctx.newPage()
  await desk.setViewportSize({ width: 1440, height: 900 })
  await desk.goto(BASE + '/timesheets?date=2026-11-16')
  await desk.locator('[data-slot="16"] > div').nth(1).click()
  await desk.getByRole('button', { name: '선택한 행 저장' }).click()
  await desk.getByTestId('templates').locator('[data-testid="template-row"]').first().waitFor()
  await desk.close()
  await page.reload()
  await row(20).tap()
  await sheet.getByTestId('sheet-templates').getByRole('button', { name: 'INT | Daily_Scrum' }).tap()
  expect((await sheet.getByLabel('Task').inputValue()) === 'INT | Daily_Scrum' && (await sheet.getByRole('heading', { level: 3 }).first().isVisible()), 'repeated-task chip fills category and task in one tap')
  await sheet.getByRole('button', { name: '저장', exact: true }).tap()
  await sheet.waitFor({ state: 'detached' })
  expect((await row(20).innerText()).includes('회의'), 'saved to 10:00')

  // unmapped category from the search box, then clear
  await row(21).tap()
  await sheet.getByLabel('Search category').fill('플루드')
  await sheet.getByRole('button', { name: /“플루드” 사용/ }).tap()
  await sheet.getByRole('button', { name: '저장', exact: true }).tap()
  await sheet.waitFor({ state: 'detached' })
  expect((await row(21).innerText()).includes('⚠ 플루드'), 'a new name is saved as an unmapped category (⚠)')
  await row(17).tap()
  await sheet.getByRole('button', { name: '지우기' }).tap()
  await sheet.waitFor({ state: 'detached' })
  expect((await row(17).innerText()).includes('—'), '"지우기" empties the half hour')

  await page.reload()
  await row(16).waitFor()
  expect((await row(16).innerText()).includes('스프린트 일정 조율') && (await row(17).innerText()).includes('—') && (await row(20).innerText()).includes('회의'), 'everything is kept after reload')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm_01_daily.png') })

  // ── other pages via the tab bar ──────────────────────────────────────────
  await tabbar.getByRole('link', { name: 'Settings' }).tap()
  await page.getByRole('heading', { name: 'Settings' }).waitFor()
  expect(await noHScroll(), 'Settings fits the phone width')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'm_03_settings.png') })
  for (const [tab, url] of [['Weekly Plan', 'weekly'], ['Group Timesheet', 'group'], ['Leave', 'leave']]) {
    await page.goto(`${BASE}/timesheets/${url}?date=2026-11-16`)
    await page.waitForTimeout(400)
    if (!(await noHScroll())) throw new Error(tab + ' overflows')
  }
  ok('Weekly Plan, Group Timesheet and Leave fit the phone width (wide tables scroll inside their card)')
  await tabbar.getByRole('link', { name: 'Home' }).tap()
  await page.waitForURL(BASE + '/')
  ok('tab bar navigates (Home)')
  await ctx.close()

  // ── today on the phone: current half hour highlighted and in view ────────
  const c2 = await browser.newContext({ ...devices['iPhone 15'], timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' })
  const p2 = await c2.newPage()
  watch(p2)
  await p2.clock.install({ time: new Date('2026-11-20T14:47:00+09:00') })
  await p2.goto(BASE + '/timesheets')
  const nowRow = p2.locator('[role="listitem"][data-slot="29"]')
  await nowRow.waitFor()
  const inView = await nowRow.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight })
  expect((await nowRow.innerText()).includes('14:47') && inView, 'today: the current half hour (14:30) is marked "14:47" and scrolled into view')
  if (SHOTS) await p2.screenshot({ path: path.join(SHOTS, 'm_04_now.png') })
  await c2.close()

  // ── Android size ─────────────────────────────────────────────────────────
  const c3 = await browser.newContext({ ...devices['Pixel 7'] })
  const p3 = await c3.newPage()
  watch(p3)
  await p3.goto(BASE + '/timesheets?date=2026-11-16')
  await p3.locator('[role="listitem"]').first().waitFor()
  expect(await p3.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'Pixel 7: Daily Log fits too')
  await c3.close()

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('MOBILE E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
