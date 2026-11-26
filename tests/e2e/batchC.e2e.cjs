// Browser test for the 11-22 fixes (layout, fonts, dropdown position, 업무내용, row height, page height).
// Run: SHOTS=shots node batchC.e2e.cjs
const { chromium } = require('playwright')
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, timezoneId: 'Asia/Seoul' })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|fonts|jsdelivr|403/.test(m.text()) && errors.push(m.text()))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const rect = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, height: r.height } })

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(15, 'category').waitFor()
  await page.evaluate(() => document.fonts.ready)

  // ── 1 + 6: one header line, equal control heights ─────────────────────────
  const title = page.getByRole('heading', { name: 'Timesheets' })
  const dateChip = page.getByLabel('Date').locator('..')
  const tab = page.getByRole('link', { name: 'Daily Log' })
  const other = page.getByRole('link', { name: 'Weekly Result' })
  const eng = page.getByLabel('Engineer')
  const [t, d, a, b, e] = await Promise.all([title, dateChip, tab, other, eng].map(rect))
  expect([d, a, b, e].every((r) => Math.round(r.height) === 36), `date chip, tabs and engineer picker all 36px high (${[d, a, b, e].map((r) => Math.round(r.height)).join('/')})`)
  const mid = (r) => r.top + r.height / 2
  expect([d, a, e].every((r) => Math.abs(mid(r) - mid(t)) < 4) && d.left > t.left, 'date and tabs sit on the title line, to the right of "Timesheets"')

  // ── 2: fonts ──────────────────────────────────────────────────────────────
  const fam = (loc) => loc.evaluate((el) => getComputedStyle(el).fontFamily)
  const loaded = await page.evaluate(() => [document.fonts.check('700 36px "Bricolage Grotesque Variable"'), document.fonts.check('600 13px "JetBrains Mono Variable"')])
  expect((await fam(title)).startsWith('"Bricolage Grotesque Variable"') && loaded[0], 'titles use Bricolage Grotesque (bundled, loaded)')
  expect((await fam(page.locator('[data-slot="15"] > div').nth(1))).startsWith('"JetBrains Mono Variable"') && loaded[1], 'times in the 30-min log use JetBrains Mono (bundled, loaded)')
  expect((await fam(page.locator('body'))).includes('Pretendard'), 'body text stays Pretendard (Korean)')

  // ── 5: 업무내용 column ─────────────────────────────────────────────────────
  const headers = await page.locator('[role="grid"] > div').first().innerText()
  // English labels are Time / Project / Type / Task / Content (Korean: … / 업무내용)
  expect(headers.includes('Content') && !headers.includes('Focus'), 'last column is "Content" (업무내용 in Korean; Focus removed)')
  await cell(16, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('INT | Daily_Scrum')
  await page.keyboard.press('Tab')
  await page.keyboard.type('스프린트 일정 조율, 리스크 공유')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-cell="16:details"]').textContent.includes('스프린트'))
  await page.reload()
  await cell(16, 'details').filter({ hasText: '스프린트 일정 조율, 리스크 공유' }).waitFor()
  ok('업무내용 is free text, saved with the row and kept after reload')

  // ── 6: row height 좁게 by default; a working day fits without scrolling ──
  expect((await cell(15, 'task').evaluate((el) => el.offsetHeight)) === 30, 'default row height is 좁게 (30px)')
  const sc = await page.getByTestId('grid-scroll').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }))
  expect(sc.sh <= sc.ch + 1, `the whole 07:30–16:30 day fits on one screen at 1440×900 (content ${sc.sh}px, box ${sc.ch}px)`)

  // ── 7: Daily Log ends 16px above the window bottom (the menu is a dock now, no left navigation) ──
  const bottom = (await page.evaluate(() => window.innerHeight)) - 16
  const pg = await rect(page.getByTestId('daily-log-page'))
  const card = await rect(page.locator('section', { hasText: '30-min Log' }).first())
  const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1)
  expect(Math.abs(bottom - pg.bottom) <= 1 && Math.abs(bottom - card.bottom) <= 1 && !scrolls, `30-min Log card ends at the window bottom, no page scroll (${Math.round(card.bottom)} vs ${bottom})`)
  expect((await page.evaluate(() => document.documentElement.scrollHeight)) <= 900 + 1, 'no page scroll needed')

  // ── 4: dropdown opens under the clicked cell, not over the first row ─────
  const target = cell(20, 'category') // 10:00, well below the first row, room underneath
  await target.click()
  await page.getByLabel('Open options').click()
  const pop = page.locator('[role="listbox"]').locator('..')
  await pop.waitFor()
  const [c, p, ed] = await Promise.all([rect(target), rect(pop), rect(page.getByLabel('Cell editor'))])
  expect(Math.abs(ed.top - c.top) <= 2 && (await pop.getAttribute('data-drop')) === 'down' && p.top >= c.bottom && p.top - c.bottom <= 8, `▾ opens the editor on 10:00 and the list right under it (cell ${Math.round(c.top)}–${Math.round(c.bottom)}, list ${Math.round(p.top)})`)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c_02_dropdown_1000.png') })
  await page.keyboard.press('Escape')
  await cell(22, 'task').click()
  await page.keyboard.press('Enter')
  const [c2, p2] = await Promise.all([rect(cell(22, 'task')), rect(page.locator('[role="listbox"]').locator('..'))])
  expect(p2.top >= c2.bottom && p2.top - c2.bottom <= 8, 'Enter on a Task cell (11:00) also opens the list under that cell')
  await page.keyboard.press('Escape')
  // lowest row: not enough room below, so the list opens upwards and stays fully visible
  await cell(32, 'category').click()
  await page.keyboard.press('Enter')
  const pop3 = page.locator('[role="listbox"]').locator('..')
  const [c3, p3, box3] = await Promise.all([rect(cell(32, 'category')), rect(pop3), rect(page.getByTestId('grid-scroll'))])
  expect((await pop3.getAttribute('data-drop')) === 'up' && p3.bottom <= c3.top && p3.top >= box3.top - 1, `on the last row (16:00) the list opens upwards inside the card (list ${Math.round(p3.top)}–${Math.round(p3.bottom)}, cell ${Math.round(c3.top)})`)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c_03_dropdown_up.png') })
  await page.keyboard.press('Escape')
  await cell(15, 'category').click()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'c_01_daily.png') })

  // narrower desktop: still aligned
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(300)
  const card2 = await rect(page.locator('section', { hasText: '30-min Log' }).first())
  const sc2 = await page.getByTestId('grid-scroll').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }))
  expect(Math.abs(800 - 16 - card2.bottom) <= 1 && sc2.sh > sc2.ch, '1280×800: card still ends at the window bottom; the table scrolls inside it')

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('BATCH C E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
