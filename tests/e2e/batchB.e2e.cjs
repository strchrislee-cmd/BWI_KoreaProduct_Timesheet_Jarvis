// Browser test for batch B (B1–B8, B10) in demo mode. Run: SHOTS=shots node batchB.e2e.cjs
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
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED|fonts/.test(m.text()) && errors.push(m.text()))
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, timezoneId: 'Asia/Seoul' })
  const page = await ctx.newPage()
  watch(page)
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const menu = page.getByRole('dialog', { name: 'Option menu' })
  const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el)[p], prop)
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
  const demoPrefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')).profiles[0].preferences)

  // master sheet so there are group projects
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()

  // ═══ B5 — Project mapping: add, color, hide, restore, delete ═══
  const nameInput = page.getByLabel('New project name')
  await nameInput.fill('  2045--Compact   Work Lamp ')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '2045--Compact Work Lamp' }).waitFor()
  const manualRow = page.locator('tr', { hasText: '2045--Compact Work Lamp' })
  expect((await manualRow.getByText('직접 추가').isVisible()) && (await manualRow.getByText('Active').isVisible()), 'B5 admin adds a project by hand (name tidied, "직접 추가")')

  await page.getByLabel('New project kind').selectOption('timelog')
  await nameInput.fill('Safety Audit')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.locator('tr', { hasText: '00.Timelog--Safety Audit' }).waitFor()
  ok('B5 Timelog rows get the "00.Timelog--" prefix')

  await page.getByLabel('New project kind').selectOption('project')
  await nameInput.fill('2045--compact work lamp')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '이미 있는 프로젝트' }).waitFor()
  ok('B5 duplicate names are refused')
  await nameInput.fill('')

  // color set in Projects is the same as the Daily Log color
  await page.getByLabel('Color of 2045--Compact Work Lamp').click()
  await menu.waitFor()
  expect((await menu.locator('[title*="Daily Log의 같은 카테고리 색과 함께 바뀝니다"]').count()) === 1, 'B5 color menu opens from the Projects table (personal color, ⓘ note)')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b_05_projects_color.png') })
  await menu.getByRole('button', { name: '초록색' }).click()
  await page.mouse.click(5, 995)
  await menu.waitFor({ state: 'detached' })

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(16, 'category').click()
  await page.keyboard.type('2045')
  await page.keyboard.press('Enter')
  const row16 = page.locator('[role="row"][data-slot="16"]')
  await page.waitForTimeout(200)
  expect(await sameBg(row16, rowBg('#448361')), 'B5 Daily Log uses the color chosen in Projects (초록색)')
  await cell(16, 'category').click()
  await page.keyboard.press('Enter')
  const opt = page.getByRole('listbox').getByRole('option', { name: /2045--Compact Work Lamp/ })
  await opt.hover()
  await opt.getByLabel('Options for 2045--Compact Work Lamp').click()
  await menu.getByRole('button', { name: '보라색' }).click()
  await page.mouse.click(5, 995)
  await menu.waitFor({ state: 'detached' })
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  expect(
    (await css(page.getByLabel('Color of 2045--Compact Work Lamp'), 'backgroundColor')) === 'rgb(144, 101, 176)',
    'B5 a color changed in Daily Log shows in Projects (보라색)',
  )

  // hide a master project, check it is gone from the dropdown, restore it
  // rows sit under 대분류 header rows (group-project = PROJECT RND); cells: color, No, name, aliases, status
  const masterName = await page.evaluate(() => {
    let group = ''
    for (const tr of document.querySelectorAll('tbody tr')) {
      if (tr.dataset.testid?.startsWith('group-')) { group = tr.dataset.testid; continue }
      const td = [...tr.querySelectorAll('td')].map((td) => td.innerText.trim())
      if (group === 'group-project' && !td[4].includes('직접 추가')) return td[2]
    }
  })
  await page.getByLabel(`Remove ${masterName}`).click()
  await page.getByRole('status').filter({ hasText: '숨김' }).waitFor()
  expect(!(await page.locator('tr', { hasText: masterName }).count()), `B5 master project "${masterName}" hidden right away (no confirm, restorable)`)
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  expect(!(await page.getByRole('listbox').getByText(masterName, { exact: true }).count()), 'B5 hidden project is not offered in the Daily Log dropdown')
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByRole('button', { name: /숨긴 항목 보기 \(1\)/ }).click()
  const hiddenRow = page.locator('tr', { hasText: masterName })
  expect(await hiddenRow.getByText('숨김').isVisible(), 'B5 "숨긴 항목 보기" lists the hidden project')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b_06_projects_hidden.png') })
  await page.getByLabel(`Restore ${masterName}`).click()
  await page.getByRole('status').filter({ hasText: '되돌림' }).waitFor()
  expect(await page.locator('tr', { hasText: masterName }).getByText('Active').isVisible(), 'B5 restore brings it back')

  // manual + unused → confirm → deleted; manual + used → hidden
  await page.getByLabel('Remove 00.Timelog--Safety Audit').click()
  const confirm = page.getByRole('dialog', { name: '프로젝트 삭제' })
  expect(await confirm.getByText('완전히 삭제').isVisible(), 'B5 deleting a hand-added project asks first')
  await confirm.getByRole('button', { name: '삭제' }).click()
  await page.getByRole('status').filter({ hasText: '삭제됨' }).waitFor()
  expect(!(await page.locator('tr', { hasText: 'Safety Audit' }).count()), 'B5 unused hand-added project is deleted')
  await page.getByLabel('Remove 2045--Compact Work Lamp').click()
  await confirm.getByRole('button', { name: '삭제' }).click()
  await page.getByRole('status').filter({ hasText: '숨김' }).waitFor()
  ok('B5 hand-added project already used in a log is hidden instead')
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.waitForFunction(() => document.querySelector('[data-cell="16:category"]')?.textContent.includes('2045'), null, { timeout: 5000 }).catch(() => {})
  const kept = await cell(16, 'category').innerText()
  expect(kept.includes('2045') && !kept.includes('⚠'), `B5 the existing log keeps its (hidden) project ("${kept.trim()}")`)

  // a master project hidden before a re-import stays hidden; a hand-added name in the new sheet merges without NEW
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByLabel(`Remove ${masterName}`).click()
  await page.getByRole('status').filter({ hasText: '숨김' }).waitFor()
  await nameInput.fill('2071--Marine Flood Light')
  await page.getByRole('button', { name: '추가', exact: true }).click()
  await page.locator('tr', { hasText: '2071--Marine Flood Light' }).getByText('직접 추가').waitFor()
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v2.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'Imported' }).waitFor()
  expect((await page.getByTestId('new-count').innerText()) === '0', 'B5 re-import: the hand-added 2071 merges without NEW')
  expect(!(await page.locator('tr', { hasText: '2071--Marine Flood Light' }).getByText('직접 추가').count()), 'B5 merged row is now a master row')
  expect(!(await page.locator('tr', { hasText: masterName }).count()), 'B5 hidden master project stays hidden after re-import')

  // ═══ B1 / B7 — no color dot in the cell, no gray hint for repeated tasks ═══
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(18, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('INT | Daily_Scrum')
  await page.keyboard.press('Enter')
  await page.locator('[data-slot="18"] > div').nth(1).click()
  await page.getByRole('button', { name: '선택한 행 저장' }).click()
  await page.getByTestId('templates').locator('[data-testid="template-row"]').first().waitFor()
  await cell(18, 'category').click()
  expect((await page.getByLabel('Category color').count()) === 0 && (await page.getByLabel('Open options').count()) === 1, 'B1 selected category cell has no color dot (▾ only)')
  await cell(19, 'task').click()
  await page.keyboard.press('Enter')
  const tOpt = page.getByRole('listbox').getByRole('option', { name: /INT \| Daily_Scrum/ })
  expect((await tOpt.innerText()).trim() === 'INT | Daily_Scrum', 'B7 repeated-task option shows only the task (no gray category text)')
  expect((await tOpt.getAttribute('title')).startsWith('회의'), 'B7 category still shown as a tooltip on hover')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b_07_task_dropdown.png') })
  await page.keyboard.press('Escape')

  // ═══ B10 — corner radius scale ═══
  const card = page.locator('section').filter({ hasText: '30-min Log' }).first()
  const radius = (loc) => css(loc, 'borderTopLeftRadius')
  expect((await radius(card)) === '16px', 'B10 bento cards 16px')
  expect((await radius(page.getByRole('button', { name: /Import \.xlsx/ }))) === '10px', 'B10 buttons 10px')
  expect((await radius(page.getByRole('link', { name: 'Daily Log' }))) === '10px', 'B10 tabs 10px')
  expect((await radius(page.getByTestId('templates').locator('[data-testid="template-row"] .rounded-chip').first())) === '6px', 'B10 chips 6px (the Project chip in the repeated-task table)')
  expect((await css(page.getByRole('button', { name: /Import \.xlsx/ }), 'cornerShape')) === 'superellipse(1.5)', 'B10 continuous (iPhone-like) corners in Chromium')
  const avatar = page.locator('nav .rounded-full').first()
  expect((await css(avatar, 'cornerShape')) !== 'superellipse(1.5)' && parseFloat(await radius(avatar)) >= 16, 'B10 avatar stays a circle')
  await page.getByRole('button', { name: /Import \.xlsx/ }).click()
  const modal = page.getByRole('dialog').locator('> div').first()
  expect((await radius(modal)) === '12px', 'B10 dialogs 12px')
  await page.getByRole('dialog').getByLabel('Close').click()

  // ═══ B4 — flowing gradient (WebGL since 11-22) ═══
  const flow = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return { frames: el.flowDebug?.frames ?? -1, time: el.flowDebug?.time ?? -1, renderer: el.dataset.renderer, animated: el.dataset.animated, paused: el.dataset.paused, speed: el.dataset.speed, children: el.children.length } }, sel)
  const BG = '[data-testid="app-background"]'
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  let f0 = await flow(BG)
  expect(f0.renderer === 'webgl' && f0.animated === 'true' && f0.speed === 'normal', 'B4 background is the WebGL flowing gradient, on + 보통 by default')
  expect(f0.children === 0, 'B2/B4 no overlay pattern elements (no dots, stripes or grid)')
  await wait(1500)
  let f1 = await flow(BG)
  expect(f1.frames - f0.frames >= 10, `B4 frames keep coming (${f1.frames - f0.frames} in 1.5 s)`)
  const rate = (f1.time - f0.time) / 1.5
  expect(rate > 0.6 && rate < 1.4, `B4 보통 runs at about 1× (measured ${rate.toFixed(2)}×)`)
  const shotA = await page.locator(BG).evaluate((el) => el.toDataURL())
  await wait(800)
  expect((await page.locator(BG).evaluate((el) => el.toDataURL())) !== shotA, 'B4 the picture actually changes (it flows)')

  await page.goto(BASE + '/settings')
  const PV = '[data-testid="gradient-preview"]'
  await page.locator(PV).waitFor()
  expect((await flow(PV)).renderer === 'webgl' && (await page.getByTestId('flow-speed-hint').innerText()).includes('약 16초'), 'B4 Settings shows a live preview and "약 16초" for 보통')
  await page.getByRole('group', { name: 'Flow speed' }).getByRole('button', { name: /빠르게/ }).click()
  await page.getByTestId('flow-speed-hint').filter({ hasText: '약 8초' }).waitFor()
  f0 = await flow(PV)
  await wait(1500)
  f1 = await flow(PV)
  const fast = (f1.time - f0.time) / 1.5
  expect(fast > 1.3 && (await flow(PV)).speed === 'fast' && (await flow(BG)).speed === 'fast', `B4 빠르게: preview and background switch at once (measured ${fast.toFixed(2)}×)`)
  if (SHOTS) await page.locator('section', { hasText: '무작위 그라데이션 패턴' }).screenshot({ path: path.join(SHOTS, 'c_04_settings_flow.png') })
  const seed0 = await page.locator(BG).getAttribute('data-seed')
  await page.getByRole('button', { name: '다른 패턴' }).click()
  await page.waitForFunction((s) => document.querySelector('[data-testid="app-background"]').dataset.seed !== s, seed0)
  expect((await flow(BG)).children === 0 && (await flow(PV)).renderer === 'webgl', 'B4 "다른 패턴" changes colours only (no dots or stripes)')

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.paused === 'true')
  f0 = await flow(BG)
  await wait(800)
  expect((await flow(BG)).frames === f0.frames, 'B4 pauses while the tab is hidden')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByLabel('Flowing gradient').uncheck()
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.animated === 'false')
  f0 = await flow(BG)
  await wait(800)
  expect((await flow(BG)).frames === f0.frames, 'B4 "물결처럼 흐르기" off → still background')
  await page.getByLabel('Flowing gradient').check()
  await page.waitForFunction(() => document.querySelector('[data-testid="app-background"]').dataset.animated === 'true')

  const rm = await browser.newContext({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' })
  const rmPage = await rm.newPage()
  await rmPage.goto(BASE + '/settings')
  await rmPage.getByTestId('app-background').waitFor()
  const rmFlow = await rmPage.getByTestId('app-background').evaluate((el) => el.dataset.animated)
  expect(rmFlow === 'false' && (await rmPage.getByText('동작 줄이기').isVisible()), 'B4 no motion when the OS asks for reduced motion (and Settings says so)')
  await rm.close()

  // ═══ B3 — liquid glass ═══
  const glassCard = page.locator('section.glass').first()
  expect((await css(glassCard, 'backdropFilter')).startsWith('blur(18px)'), 'B3 default UI style is blur')
  await page.getByLabel('리퀴드 글래스').check()
  await page.waitForFunction(() => document.documentElement.dataset.ui === 'liquid')
  expect((await page.evaluate(() => document.documentElement.dataset.refraction)) === 'on', 'B3 Chromium → refraction on')
  expect((await css(glassCard, 'backdropFilter')).includes('url('), 'B3 cards use the refracting liquid-glass filter')
  expect(await page.locator('#timecrumbs-liquid-glass feDisplacementMap').count(), 'B3 SVG displacement filter is on the page')
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(18, 'category').waitFor()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b_03_liquid_daily.png') })
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  const pop = page.locator('.glass-strong').first()
  expect(!(await css(pop, 'backdropFilter')).includes('url('), 'B3 dropdowns stay readable (no bend behind text)')
  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForFunction(() => document.documentElement.dataset.ui === 'liquid')
  ok('B3 UI style persists after reload')

  // ═══ B8 — every new setting is a per-user preference (profiles.preferences in Supabase) ═══
  const p = await demoPrefs()
  expect(p.uiStyle === 'liquid' && p.background.speed === 'fast' && p.background.animate === true && Object.keys(p.categoryColors).length >= 1, 'B8 UI style, flow and project colors saved in the user preferences')
  await page.goto(BASE + '/settings')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'b_04_settings.png') })
  await page.getByLabel('블러').check()
  await page.waitForFunction(() => document.documentElement.dataset.ui === 'blur')
  expect((await css(page.locator('section.glass').first(), 'backdropFilter')).startsWith('blur(18px)'), 'B3 switching back to 블러')
  await ctx.close()

  // ═══ B6 — now line (fake clock, Seoul time) ═══
  const c2 = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, timezoneId: 'Asia/Seoul', reducedMotion: 'reduce' }) // fake clock + runFor would replay every animation frame
  const p2 = await c2.newPage()
  watch(p2)
  await p2.clock.install({ time: new Date('2026-11-20T10:17:30+09:00') })
  await p2.goto(BASE + '/timesheets')
  const line = p2.getByTestId('now-line')
  await line.waitFor()
  const inRow = await line.evaluate((el) => el.closest('[role="row"]').dataset.slot)
  expect(inRow === '20' && (await line.innerText()).trim() === '10:17', 'B6 now line in the 10:00 row with "10:17"')
  const top = await line.evaluate((el) => el.offsetTop / el.closest('[role="row"]').offsetHeight)
  expect(Math.abs(top - 17 / 30) < 0.03, 'B6 line sits 17/30 of the way into the row')
  expect((await css(p2.locator('[data-slot="20"] > div').nth(1), 'color')) === 'rgb(229, 72, 77)', 'B6 current time label highlighted')
  if (SHOTS) await p2.screenshot({ path: path.join(SHOTS, 'b_02_now_line.png') })
  await p2.clock.runFor(60_000)
  await p2.waitForFunction(() => document.querySelector('[data-testid="now-line"]')?.textContent.includes('10:18'))
  ok('B6 updates every minute (10:18)')
  await p2.clock.runFor(13 * 60_000)
  await p2.waitForFunction(() => document.querySelector('[data-testid="now-line"]')?.closest('[role="row"]').dataset.slot === '21')
  ok('B6 moves to the next row at 10:30')
  await p2.goto(BASE + '/timesheets?date=2026-11-19')
  await p2.locator('[data-cell="20:category"]').waitFor()
  expect((await p2.getByTestId('now-line').count()) === 0, 'B6 no now line on other days')
  await c2.close()

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('BATCH B E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
