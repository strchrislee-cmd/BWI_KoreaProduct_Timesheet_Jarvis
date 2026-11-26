// 11-24 (5): 30-min reminder toast — type an entry, "이전 업무 계속", "나중에", Settings try-it, phone layout.
// Demo build with a fake clock (Mon 2026-11-16; demo hours 07:30–16:30, lunch 12:00–13:00).
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4173'
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }

// headless Chromium does not grant notifications: stub Notification like batch.e2e.cjs (A4)
const fakeNotification = () => {
  window.__notes = []
  class FakeNotification {
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
}

;(async () => {
  const browser = await chromium.launch()
  // reducedMotion: with a fake clock, runFor would replay every animation frame of the flowing background
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript(fakeNotification)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time: new Date('2026-11-16T10:29:30') })

  // reminders on, and one entry at 09:00 (slot 18) to continue from
  await page.goto(BASE + '/settings')
  await page.getByLabel('30-minute reminders').check()
  await page.getByRole('button', { name: '입력 창 띄워 보기' }).waitFor()
  const label = await page.evaluate(() => {
    const st = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
    const p = st.projects.find((x) => !x.hidden && x.status === 'active')
    st.slots.push({ user_id: st.profiles[0].id, work_date: '2026-11-16', slot_index: 18, kind: 'work', group_project_id: p.id, label: p.name, description: '설계 검토', details: '도면 확인', focus: null })
    localStorage.setItem('timecrumbs-demo-v1', JSON.stringify(st))
    return p.name
  })
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.locator('[data-cell="18:task"]').filter({ hasText: '설계 검토' }).waitFor()

  // 10:30 → toast for 10:00–10:30; continue fills 09:30 and 10:00
  await page.clock.runFor(40_000)
  const toast = page.getByRole('dialog', { name: '30-min reminder' })
  await toast.waitFor()
  expect((await toast.innerText()).includes('10:00–10:30 업무를 기록해 주세요'), 'toast appears at 10:30 for 10:00–10:30')
  expect((await page.evaluate(() => window.__notes)).some((n) => n.body === '10:00–10:30 업무를 기록해 주세요'), 'the browser notification still goes out too')
  const preview = await toast.getByTestId('continue-preview').innerText()
  expect(preview.includes('설계 검토') && preview.includes('09:30–10:30 (2칸)'), `continue preview names the task and both empty half hours (${preview})`)
  await toast.getByRole('button', { name: '이전 업무 계속' }).click()
  await toast.waitFor({ state: 'detached' })
  await page.locator('[data-cell="20:task"]').filter({ hasText: '설계 검토' }).waitFor()
  expect((await page.locator('[data-cell="19:task"]').innerText()).includes('설계 검토') && (await page.locator('[data-cell="20:details"]').innerText()).includes('도면 확인'), '이전 업무 계속: 09:30 and 10:00 filled with the 09:00 entry; Daily Log updated')

  // 11:00 → type an entry
  await page.clock.runFor(30 * 60_000)
  await toast.waitFor()
  expect((await toast.innerText()).includes('10:30–11:00'), 'next toast at 11:00 for 10:30–11:00')
  expect(await toast.getByRole('button', { name: '저장' }).isDisabled(), 'save is off until something is entered')
  const option = await toast.getByLabel('Project', { exact: true }).locator('optgroup').first().locator('option').first().getAttribute('value')
  await toast.getByLabel('Project', { exact: true }).selectOption(option)
  await toast.getByLabel('Task', { exact: true }).fill('리뷰')
  await toast.getByLabel('Content').fill('회의록 정리')
  await toast.getByRole('button', { name: '저장' }).click()
  await toast.waitFor({ state: 'detached' })
  await page.locator('[data-cell="21:details"]').filter({ hasText: '회의록 정리' }).waitFor()
  expect((await page.locator('[data-cell="21:category"]').innerText()).includes(option) && (await page.locator('[data-cell="21:task"]').innerText()).includes('리뷰'), 'typed entry saved to 10:30 with category, sub category and content')

  // 11:30 → 나중에 leaves the slot empty
  await page.clock.runFor(30 * 60_000)
  await toast.waitFor()
  await toast.getByRole('button', { name: '나중에' }).click()
  await toast.waitFor({ state: 'detached' })
  expect((await page.locator('[data-cell="22:task"]').innerText()).trim() === '', '나중에 closes the toast and saves nothing')
  await page.screenshot({ path: __dirname + '/shots/toast-grid.png' })

  // Settings try-it button
  await page.goto(BASE + '/settings')
  await page.getByRole('button', { name: '입력 창 띄워 보기' }).click()
  await toast.waitFor()
  await page.screenshot({ path: __dirname + '/shots/toast-settings.png' })
  expect((await toast.innerText()).includes('11:00–11:30'), 'Settings → 입력 창 띄워 보기 opens the toast for the half hour that just ended')
  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)

  // phone: the toast sits above the bottom tab bar, inside the screen
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
  await phone.addInitScript(fakeNotification)
  const m = await phone.newPage()
  await m.goto(BASE + '/settings')
  await m.getByLabel('30-minute reminders').check()
  await m.evaluate(() => window.dispatchEvent(new Event('teamembedded:reminder-toast')))
  const t = m.getByRole('dialog', { name: '30-min reminder' })
  await t.waitFor()
  const box = await t.boundingBox()
  const bar = await m.getByRole('navigation', { name: 'Mobile navigation' }).boundingBox()
  expect(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= bar.y, 'phone: toast fits the screen above the tab bar')
  await m.screenshot({ path: __dirname + '/shots/toast-phone.png' })
  await browser.close()
  console.log('toast: all checks passed')
})().catch((e) => { console.error(e); process.exit(1) })
