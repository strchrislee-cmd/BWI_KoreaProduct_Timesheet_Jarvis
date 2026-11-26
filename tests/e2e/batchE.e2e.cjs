// 11-23 (2): 대분류/소분류 project groups with group colours, panel opacity slider.
const { chromium } = require('playwright')
const path = require('path')
const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS ? path.join(__dirname, process.env.SHOTS) : null
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }
const PURPLE = 'rgb(144, 101, 176)'

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/jsdelivr|403|ERR_TUNNEL/.test(m.text()) && errors.push(m.text()))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  // colours of the rows under one 대분류 header in the Project mapping table
  const groupColors = (kind) =>
    page.evaluate((kind) => {
      let group = ''
      const out = []
      for (const tr of document.querySelectorAll('tbody tr')) {
        if (tr.dataset.testid?.startsWith('group-')) { group = tr.dataset.testid; continue }
        const sw = tr.querySelector('[aria-label^="Color of "]')
        if (group === `group-${kind}` && sw) out.push({ name: sw.getAttribute('aria-label').slice(9), color: getComputedStyle(sw).backgroundColor })
      }
      return out
    }, kind)

  // ── 대분류 groups in Projects ─────────────────────────────────────────────
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  // fresh demo data has no RND rows: add two fictional ones (admin form)
  for (const name of ['2045--Compact Work Lamp', '2046--Trail Beacon Mini']) {
    await page.getByLabel('New project name').fill(name)
    await page.getByRole('button', { name: '추가', exact: true }).click()
    await page.locator('tbody tr', { hasText: name }).waitFor()
  }
  await page.getByTestId('group-project').waitFor()
  const heads = await page.locator('thead th').allInnerTexts()
  const groups = await page.locator('tbody tr[data-testid^="group-"]').allInnerTexts()
  expect(!heads.includes('Kind') && groups.length === 3, `Project mapping is grouped by 대분류 (no Kind column): ${groups.map((g) => g.replace(/\s+/g, ' ')).join(' | ')}`)
  expect(['PROJECT RND', 'PROJECT CO-WORK', 'PROJECT NON-RND'].every((n, i) => groups[i].includes(n)), '대분류 names: PROJECT RND / PROJECT CO-WORK / PROJECT NON-RND')
  const filters = await page.getByRole('button', { name: /^PROJECT / }).allInnerTexts()
  expect(filters.length === 3, `filter buttons use the 대분류 names (${filters.join(', ')})`)

  // common colour for every 소분류 in CO-WORK
  const before = await groupColors('timelog')
  await page.getByLabel('Group color of PROJECT CO-WORK').click()
  const menu = page.getByRole('dialog', { name: 'Option menu' })
  expect((await menu.innerText()).includes(`PROJECT CO-WORK · ${before.length}개`), `group colour menu opens for PROJECT CO-WORK (${before.length} items)`)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'e_03_group_menu.png') })
  await menu.getByRole('button', { name: '보라색' }).click()
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)
  await menu.waitFor({ state: 'detached' })
  const purple = await groupColors('timelog')
  expect(purple.every((r) => r.color === PURPLE), 'picking 보라색 on the 대분류 paints every CO-WORK item purple')
  const rnd = await groupColors('project')
  expect(rnd.every((r) => r.color !== PURPLE) || rnd.length === 0, 'other 대분류 keep their colours')
  expect((await page.getByLabel('Group color of PROJECT CO-WORK').evaluate((e) => getComputedStyle(e).backgroundColor)) === PURPLE, 'the group swatch shows the common colour')

  // individual override still works
  const one = purple[0].name
  await page.getByLabel(`Color of ${one}`).click()
  await menu.getByRole('button', { name: '초록색' }).click()
  await page.mouse.click(5, 5)
  const mixed = await groupColors('timelog')
  expect(mixed[0].color !== PURPLE && mixed.slice(1).every((r) => r.color === PURPLE), `one 소분류 (${one}) can still get its own colour`)
  expect((await page.getByLabel('Group color of PROJECT CO-WORK').evaluate((e) => getComputedStyle(e).backgroundImage)).startsWith('conic-gradient'), 'mixed colours show as a multi-colour group swatch')

  // randomise every 소분류
  await page.getByLabel('Randomize colors in PROJECT CO-WORK').click()
  await page.waitForFunction(() => true)
  await page.waitForTimeout(300)
  const random = await groupColors('timelog')
  const distinct = new Set(random.map((r) => r.color)).size
  expect(distinct >= Math.min(3, random.length) && random.every((r) => r.color !== PURPLE), `"모두 랜덤" gives each CO-WORK item its own random colour (${distinct} distinct of ${random.length})`)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'e_02_projects_groups.png') })

  // menu action: 하위 항목 모두 랜덤 (파스텔)
  await page.getByLabel('Group color of PROJECT NON-RND').click()
  const sec0 = await groupColors('local_section')
  await menu.getByRole('button', { name: '하위 항목 모두 랜덤 (파스텔)' }).click()
  await page.waitForTimeout(300)
  const sec1 = await groupColors('local_section')
  expect(sec1.some((r, i) => r.color !== sec0[i].color), '"하위 항목 모두 랜덤 (파스텔)" re-colours the NON-RND items')
  await page.mouse.click(5, 5)

  // the Daily Log uses the same colours and group names
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  const list = await page.getByRole('listbox').innerText()
  expect(['PROJECT RND', 'PROJECT CO-WORK', 'PROJECT NON-RND'].every((n) => list.includes(n)), 'Daily Log dropdown groups options under the 대분류 names')
  await page.keyboard.press('Escape')

  // ── Settings: group controls next to each 대분류 ─────────────────────────────
  await page.goto(BASE + '/settings')
  for (const n of ['PROJECT RND', 'PROJECT CO-WORK', 'PROJECT NON-RND']) await page.getByLabel(`Group color of ${n}`).waitFor()
  expect((await page.getByLabel('Group color of Non-work').count()) === 0, 'Settings › 카테고리 색상: every 대분류 has a group colour + 모두 랜덤 (Non-work has a single item, none)')
  const box = page.locator('div.min-w-0', { has: page.getByLabel('Group color of PROJECT RND') })
  const swatches = () => box.locator('[aria-label^="Color of "]').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))
  await page.getByLabel('Group color of PROJECT RND').click()
  await menu.getByRole('button', { name: '보라색' }).click()
  await page.mouse.click(5, 5)
  expect((await swatches()).every((c) => c === PURPLE), 'Settings: a common colour for PROJECT RND paints all its items')
  await box.getByLabel('Randomize colors in PROJECT RND').click()
  await page.waitForTimeout(300)
  expect((await swatches()).every((c) => c !== PURPLE), 'Settings: 모두 랜덤 re-colours all PROJECT RND items')
  if (SHOTS) await box.screenshot({ path: path.join(SHOTS, 'e_04_settings_groups.png') })

  // ── panel opacity slider ────────────────────────────────────────────────
  const slider = page.getByLabel('Panel opacity')
  const panel = page.locator('.glass:not(.glass-sage)').first()
  expect((await slider.inputValue()) === '58' && (await page.getByTestId('panel-opacity-value').innerText()) === '58%', 'blur: panel opacity slider starts at the default 58%')
  expect((await panel.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(255, 255, 255, 0.58)', 'blur panels at 58% look as before')
  await slider.fill('90')
  expect((await panel.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(255, 255, 255, 0.9)', 'dragging to 90% makes the panels more opaque right away')
  if (SHOTS) await page.locator('.glass', { hasText: '화면 스타일' }).screenshot({ path: path.join(SHOTS, 'e_05_opacity_slider.png') })
  await page.waitForTimeout(800)
  await page.reload()
  await slider.waitFor()
  expect((await slider.inputValue()) === '90' && (await panel.evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(255, 255, 255, 0.9)', 'the value is saved per user and applied after reload')
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  expect((await page.locator('.glass:not(.glass-sage)').first().evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgba(255, 255, 255, 0.9)', 'other pages use the same panel opacity')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'e_06_daily_blur90.png') })
  await page.goto(BASE + '/settings')

  await page.getByRole('radio', { name: '리퀴드 글래스' }).check()
  await page.waitForFunction(() => document.documentElement.dataset.ui === 'liquid')
  expect((await slider.inputValue()) === '22', 'liquid glass keeps its own value (default 22%)')
  const img0 = await panel.evaluate((e) => getComputedStyle(e).backgroundImage)
  expect(img0.includes('rgba(255, 255, 255, 0.36)'), 'liquid panels at 22% look as before')
  await slider.fill('70')
  const img1 = await panel.evaluate((e) => getComputedStyle(e).backgroundImage)
  // 0.36 → 0.754 at 70% (Chromium stores alpha in 1/255 steps, so it prints 0.753)
  expect(Math.abs(parseFloat(img1.match(/rgba\(255, 255, 255, ([\d.]+)\)/)[1]) - 0.754) < 0.005, `liquid at 70% keeps its sheen but lets less background through (${img1.slice(0, 60)}…)`)
  await page.getByRole('button', { name: '기본값으로' }).click()
  expect((await slider.inputValue()) === '22', '"기본값으로" resets the slider')
  await page.waitForTimeout(800)
  await page.getByRole('radio', { name: '블러' }).check()
  await page.waitForFunction(() => document.documentElement.dataset.ui === 'blur')
  expect((await slider.inputValue()) === '90', 'switching back to blur restores its own 90%')

  // phone width: slider fits, no horizontal scroll
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(200)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow <= 0 && (await slider.isVisible()), 'Settings fits a phone screen with the new controls')

  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await browser.close()
  console.log('batchE: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
