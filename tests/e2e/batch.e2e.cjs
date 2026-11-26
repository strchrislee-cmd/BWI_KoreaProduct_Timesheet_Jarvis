// Browser test for action items A1–A8 (demo mode). Run: node batch.e2e.cjs
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

async function setup(page) {
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()
}

const rowBg = (hex) => `color-mix(in srgb, ${hex} 28%, white)`
const chipBg = (hex) => `color-mix(in srgb, ${hex} 42%, white)`
const sameBg = (locator, cssExpr) =>
  locator.evaluate((el, expr) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = expr
    document.body.appendChild(probe)
    const want = getComputedStyle(probe).backgroundColor
    probe.remove()
    return getComputedStyle(el).backgroundColor === want
  }, cssExpr)

async function drag(page, from, to) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 - 4, { steps: 10 })
  await page.mouse.up()
}

;(async () => {
  const browser = await chromium.launch()
  const errors = []
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|Failed to load resource/.test(m.text()) && errors.push(m.text()))
  }

  // ═══ main context ═══
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  watch(page)
  await setup(page)
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const row = (i) => page.locator(`[role="row"][data-slot="${i}"]`)
  const optionLabels = () => page.getByRole('listbox').getByRole('option').evaluateAll((els) => els.map((e) => e.querySelector('span.truncate')?.textContent ?? ''))
  await cell(15, 'category').waitFor()

  // A1 — start time range
  const startOpts = await page.getByLabel('Start time').locator('option').allTextContents()
  expect(startOpts.join(',') === '07:00,07:30,08:00,08:30,09:00,09:30,10:00', 'A1 start time offers 07:00–10:00 in 30-min steps')

  // A8 — glass + gradient
  expect((await page.getByTestId('app-background').getAttribute('data-mode')) === 'gradient', 'A8 default background is the random gradient pattern')
  const blur = await page.locator('section.glass').first().evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(blur.includes('blur'), 'A8 cards are frosted glass (' + blur + ')')

  // A7 — dashed lines
  expect((await row(15).evaluate((el) => getComputedStyle(el).borderTopStyle)) === 'dashed', 'A7 row separators are dashed')

  // A3 — header + create
  await cell(15, 'category').click()
  await page.keyboard.type('2041')
  await page.keyboard.press('Enter')
  await cell(16, 'category').click()
  await page.keyboard.press('Enter')
  await page.getByText('옵션 선택 또는 생성').waitFor()
  ok('A3 dropdown shows "옵션 선택 또는 생성"')
  await page.keyboard.press('Escape')
  await cell(17, 'category').click()
  await page.keyboard.type('신규카테고리')
  await page.getByRole('option', { name: /“신규카테고리” 생성/ }).waitFor()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-cell="17:category"]').textContent.includes('⚠ 신규카테고리'))
  ok('A3 "+ … 생성" records a new (unmapped) category')

  // A6 — sort menu
  await cell(18, 'category').click()
  await page.keyboard.press('Enter')
  await page.getByLabel('Sort options').click()
  await page.getByRole('menuitemradio', { name: /이름 역순/ }).click()
  let labels = await optionLabels()
  expect(labels.slice(0, 4).join(' | ') === 'Line Andon System Implementation | LED Bar Redesign | 2058--Off-road Light Kit | 2041--Utility Work Lamps', 'A6 sort by name (descending)')
  await page.getByLabel('Sort options').click()
  await page.getByRole('menuitemradio', { name: /이름순/ }).click()
  labels = await optionLabels()
  expect(labels.slice(0, 4).join(' | ') === '2041--Utility Work Lamps | 2058--Off-road Light Kit | LED Bar Redesign | Line Andon System Implementation', 'A6 sort by name (ascending)')

  // A5 — drag reorder (switches to manual)
  const opt = (name) => page.getByRole('listbox').getByRole('option', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
  await opt('Line Andon').hover()
  await drag(page, page.getByLabel('Drag Line Andon System Implementation'), opt('2041--Utility'))
  labels = await optionLabels()
  expect(labels[0] === 'Line Andon System Implementation' && labels[1] === '2041--Utility Work Lamps', 'A5 dragged "Line Andon" to the top: ' + labels.slice(0, 4).join(' | '))
  await page.getByLabel('Sort options').click()
  expect((await page.getByRole('menuitemradio', { name: /수동/ }).getAttribute('aria-checked')) === 'true', 'A5 dragging switches the sort to manual')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  if (SHOTS) {
    await cell(19, 'category').click()
    await page.keyboard.press('Enter')
    await opt('2041--Utility').hover()
    await page.screenshot({ path: path.join(SHOTS, 'batch_01_dropdown.png') })
    await page.keyboard.press('Escape')
  }

  // A2 — option menu on a category: named color + random pastel
  await cell(18, 'category').click()
  await page.keyboard.press('Enter')
  await opt('2041--Utility').hover()
  await page.getByRole('listbox').getByLabel('Options for 2041--Utility Work Lamps').click()
  const menu = page.getByRole('dialog', { name: 'Option menu' })
  await menu.waitFor()
  expect((await menu.getByLabel('Option name').count()) === 0 && (await menu.getByText('삭제').count()) === 0, 'A2 group project menu: color only (no rename / delete)')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'batch_02_option_menu.png') })
  await menu.getByRole('button', { name: '보라색' }).click()
  await page.waitForTimeout(150)
  expect(await sameBg(row(15), rowBg('#9065B0')), 'A2 named color "보라색" applied to the category')
  await menu.getByRole('button', { name: '랜덤 (파스텔)' }).click()
  await page.waitForTimeout(150)
  expect(!(await sameBg(row(15), rowBg('#9065B0'))), 'A2 "랜덤 (파스텔)" picks a new random color')
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  // A2 — repeated task: create, rename, color, delete via menus
  await cell(20, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('INT | Daily_Scrum')
  await page.getByRole('option', { name: /반복 업무로 등록/ }).waitFor()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await cell(21, 'category').click()
  await page.keyboard.type('일반')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('메일 정리')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const chips = page.getByTestId('templates')
  await chips.getByRole('button', { name: '메일 정리', exact: true }).waitFor()
  await cell(22, 'task').click()
  await page.keyboard.press('Enter')
  await opt('INT | Daily_Scrum').hover()
  await page.getByRole('listbox').getByLabel('Options for INT | Daily_Scrum').click()
  await menu.getByLabel('Option name').fill('INT | 데일리 스크럼')
  await menu.getByLabel('Option name').press('Enter')
  await chips.getByRole('button', { name: 'INT | 데일리 스크럼', exact: true }).waitFor()
  ok('A2 repeated task renamed from its option menu')
  await menu.getByRole('button', { name: '초록색' }).click()
  await page.waitForTimeout(200)
  expect(await sameBg(chips.locator('[data-testid="template-row"]').filter({ hasText: '데일리 스크럼' }).locator('.rounded-chip').first(), chipBg('#448361')), 'A2 repeated task color set to 초록색 (its Project chip)')
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  // A5 — drag repeated tasks (rows of the table)
  let chipOrder = await chips.locator('[data-testid="template-row"]').allTextContents()
  await drag(page, chips.locator('[data-testid="template-row"]').filter({ hasText: '메일 정리' }), chips.locator('[data-testid="template-row"]').filter({ hasText: '데일리 스크럼' }))
  await page.waitForTimeout(300)
  chipOrder = await chips.locator('[data-testid="template-row"]').allTextContents()
  expect(chipOrder[0].includes('메일 정리'), 'A5 chips reordered by dragging: ' + chipOrder.join(' | '))
  await cell(23, 'task').click()
  await page.keyboard.press('Enter')
  labels = await optionLabels()
  expect(labels[0] === '메일 정리', 'A5 Task dropdown follows the new manual order')
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  // A2 — delete via chip menu
  await chips.getByLabel('Options for 메일 정리').click()
  await menu.getByText('삭제').click()
  await chips.getByRole('button', { name: '메일 정리', exact: true }).waitFor({ state: 'detached' })
  ok('A2 repeated task deleted from the chip menu')

  // A7 — column width + row height
  const w0 = (await cell(15, 'category').boundingBox()).width
  const sep = await page.getByLabel('Resize Project column').boundingBox()
  await page.mouse.move(sep.x + sep.width / 2, sep.y + sep.height / 2)
  await page.mouse.down()
  await page.mouse.move(sep.x + sep.width / 2 + 90, sep.y + sep.height / 2, { steps: 6 })
  await page.mouse.up()
  const w1 = (await cell(15, 'category').boundingBox()).width
  expect(Math.round(w1 - w0) === 90, `A7 category column resized ${Math.round(w0)} → ${Math.round(w1)}px`)
  await page.getByRole('group', { name: 'Row height' }).getByRole('button', { name: '넓게' }).click()
  await page.waitForTimeout(200)
  expect((await cell(15, 'task').evaluate((el) => el.offsetHeight)) === 44, 'A7 row height "넓게" = 44px')
  await page.reload()
  await cell(15, 'category').waitFor()
  expect(
    Math.round((await cell(15, 'category').boundingBox()).width) === Math.round(w1) && (await cell(15, 'task').evaluate((el) => el.offsetHeight)) === 44,
    'A7 column width and row height persist after reload',
  )
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'batch_03_daily.png') })

  // A8 — backgrounds in Settings
  await page.goto(BASE + '/settings')
  const bg = page.getByTestId('app-background')
  const before = await bg.getAttribute('data-seed')
  await page.getByRole('button', { name: '다른 패턴' }).click()
  await page.waitForFunction((b) => document.querySelector('[data-testid="app-background"]').dataset.seed !== b, before)
  ok('A8 "다른 패턴" switches to another random gradient')
  expect(await page.getByLabel('Unsplash 오늘의 사진').isDisabled(), 'A8 Unsplash option disabled without an API key (falls back to gradients)')
  await page.setInputFiles('input[aria-label="Background photo"]', path.join(E, 'test_bg.png'))
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.mode === 'upload')
  const img = await bg.evaluate((el) => el.style.backgroundImage)
  expect(img.startsWith('url("data:image/jpeg'), 'A8 uploaded photo becomes the background (compressed JPEG)')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'batch_04_settings_upload.png') })
  await page.reload()
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.mode === 'upload')
  ok('A8 uploaded background persists after reload')
  await page.getByRole('button', { name: '삭제' }).click()
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.mode === 'gradient')
  ok('A8 deleting the photo returns to the gradient')

  // A8 — Unsplash when the API answers
  await page.route('**/api/background', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>', author: 'Jane Doe', authorUrl: 'https://unsplash.com/@jane', photoUrl: 'https://unsplash.com' }),
    }),
  )
  await page.reload()
  await page.getByLabel('Unsplash 오늘의 사진').check()
  await page.getByText('Photo by').waitFor()
  expect((await bg.getAttribute('data-mode')) === 'unsplash' && (await page.getByRole('link', { name: 'Jane Doe' }).isVisible()), 'A8 Unsplash photo shown with photographer credit')
  await page.unroute('**/api/background')
  await ctx.close()

  // ═══ A4 notifications: fake clock + stubbed Notification ═══
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' }) // fake clock + runFor would replay every animation frame
  await ctx2.addInitScript(() => {
    window.__notes = []
    class FakeNotification {
      // browsers remember the permission per site → keep it across reloads
      static get permission() {
        return localStorage.getItem('__notification_permission') || 'default'
      }
      static async requestPermission() {
        localStorage.setItem('__notification_permission', 'granted')
        return 'granted'
      }
      constructor(title, opts) {
        window.__notes.push({ title, body: opts?.body })
      }
      close() {}
    }
    window.Notification = FakeNotification
  })
  const p2 = await ctx2.newPage()
  watch(p2)
  await p2.clock.install({ time: new Date('2026-11-16T09:50:00+09:00') }) // Monday
  await setup(p2)
  await p2.goto(BASE + '/settings')
  await p2.getByLabel('30-minute reminders').check()
  await p2.getByTestId('notification-permission').filter({ hasText: '허용됨' }).waitFor()
  ok('A4 enabling reminders asks for browser permission')
  await p2.goto(BASE + '/timesheets?date=2026-11-16')
  const c2 = (i, col) => p2.locator(`[data-cell="${i}:${col}"]`)
  await c2(20, 'category').click() // 10:00–10:30 logged in advance
  await p2.keyboard.type('회의')
  await p2.keyboard.press('Enter')
  const notes = () => p2.evaluate(() => window.__notes)
  // page timers / rAF are faked by the clock, so poll from Node with real timers
  const waitNotes = async (n) => {
    for (let k = 0; k < 60; k++) {
      if ((await notes()).length >= n) return
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error(`expected ${n} notifications, got ${JSON.stringify(await notes())}`)
  }
  await p2.clock.runFor(11 * 60 * 1000) // → 10:01
  await waitNotes(1)
  expect((await notes())[0].body === '09:30–10:00 업무를 기록해 주세요', 'A4 at 10:00 a reminder for the empty 09:30–10:00 slot')
  await p2.clock.runFor(30 * 60 * 1000) // → 10:31 (slot 10:00–10:30 is logged)
  await new Promise((r) => setTimeout(r, 500))
  expect((await notes()).length === 1, 'A4 no reminder when the half hour was already logged')
  await p2.clock.runFor(30 * 60 * 1000) // → 11:01
  await waitNotes(2)
  expect((await notes())[1].body === '10:30–11:00 업무를 기록해 주세요', 'A4 next empty half hour reminded at 11:00')
  await p2.clock.runFor(90 * 60 * 1000) // → 12:31 (lunch 12:00–12:30 skipped; 11:00–12:00 reminded)
  await waitNotes(4)
  expect(!(await notes()).some((n) => n.body.startsWith('12:00')), 'A4 lunch half hours are never reminded')
  await ctx2.close()

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('BATCH E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
