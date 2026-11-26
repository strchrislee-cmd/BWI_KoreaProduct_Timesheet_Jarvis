// Rename check: demo data saved under the old key moves to the new key; no "jarvis" left in the page.
const { chromium } = require('playwright')
const BASE = 'http://localhost:4173'
let step = 0
const expect = (cond, msg) => { if (!cond) throw new Error('FAILED: ' + msg); console.log(`  ✓ ${++step}. ${msg}`) }
;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // 1) create demo data the way the old version stored it
  await page.goto(BASE + '/')
  await page.evaluate(() => {
    const v = localStorage.getItem('timecrumbs-demo-v1')
    const state = JSON.parse(v)
    state.profiles[0].email = 'demo@jarvis.local'
    state.slots.push({ user_id: state.profiles[0].id, work_date: '2026-11-16', slot_index: 16, kind: 'work', group_project_id: null, label: '옛날 기록', description: 'legacy', details: '', focus: null })
    localStorage.removeItem('timecrumbs-demo-v1')
    localStorage.setItem('jarvis-demo-v1', JSON.stringify(state))
  })
  // 2) reload: the app should pick it up and move it
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.locator('[data-cell="16:category"]').filter({ hasText: '옛날 기록' }).waitFor()
  const keys = await page.evaluate(() => ({ old: localStorage.getItem('jarvis-demo-v1'), now: JSON.parse(localStorage.getItem('timecrumbs-demo-v1')) }))
  expect(keys.old === null && keys.now.slots.some((s) => s.label === '옛날 기록'), 'demo data under the old key (jarvis-demo-v1) moved to timecrumbs-demo-v1')
  expect(keys.now.profiles[0].email === 'demo@teamembedded.local', 'demo e-mail updated to demo@teamembedded.local')
  const html = await page.content()
  expect(!/jarvis/i.test(html), 'no "jarvis" anywhere in the rendered page')
  expect(!(await page.locator('body').innerText()).includes('TimeCrumbs'), 'no "TimeCrumbs" on screen (renamed to TeamEmbedded)')
  await page.goto(BASE + '/settings')
  await page.getByLabel('리퀴드 글래스').check()
  await page.waitForFunction(() => document.querySelector('#timecrumbs-liquid-glass') !== null)
  const bf = await page.locator('section.glass').first().evaluate((el) => getComputedStyle(el).backdropFilter)
  expect(bf.includes('timecrumbs-liquid-glass'), 'liquid glass filter works under its new id')
  await page.getByLabel('블러').check()
  expect(errors.length === 0, 'no page errors')
  await browser.close()
  console.log('RENAME E2E passed')
})().catch((e) => { console.error(e); process.exit(1) })
