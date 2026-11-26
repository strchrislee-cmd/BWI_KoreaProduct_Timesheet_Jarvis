// Browser smoke test of JARVIS in demo mode (localStorage). Run: node e2e.cjs
const { chromium } = require('playwright')
const path = require('path')
const E = __dirname
const BASE = 'http://localhost:4173'
const SHOTS = process.env.SHOTS

let step = 0
const ok = (msg) => console.log(`  ✓ ${++step}. ${msg}`)
function expect(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg)
  ok(msg)
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // The web font CDN is blocked by the sandbox network policy (not an app error).
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text()) && errors.push(m.text()))
  page.on('requestfailed', (r) => !r.url().includes('cdn.jsdelivr.net') && errors.push('request failed: ' + r.url()))
  page.on('dialog', (d) => d.accept())
  const shot = async (name) => SHOTS && (await page.screenshot({ path: path.join(SHOTS, name + '.png') }))

  // Home
  await page.goto(BASE + '/')
  await page.getByText('Dashboard widgets will be defined in a later phase').waitFor()
  expect(await page.getByText('Demo mode').isVisible(), 'home renders with demo banner and empty widget slots')
  await shot('02_home')

  // Projects: baseline import
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('dialog', { name: 'Review master import' }).waitFor()
  expect(await page.getByText('New (4)').isVisible(), 'baseline preview: 4 new projects, 7 seeded timelog rows matched')
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()
  expect((await page.getByTestId('new-count').textContent()) === '0', 'baseline import flags nothing as NEW')

  // Second import with a new group project
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v2.xlsx'))
  await page.getByText('New (1)').waitFor()
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: '1 new' }).waitFor()
  expect((await page.getByTestId('new-count').textContent()) === '1', 'second import detects 1 new project')
  expect(await page.getByRole('row', { name: /2071--Marine Flood Light/ }).getByText('NEW').isVisible(), 'NEW badge on 2071--Marine Flood Light')

  // Same file again → duplicate
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v2.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'already imported' }).waitFor()
  ok('re-uploading the same file is a no-op')

  // Aliases
  for (const [project, alias] of [['2041--Utility Work Lamps', '워크램프'], ['LED Bar Redesign', '엘이디바']]) {
    const input = page.getByLabel(`Add alias for ${project}`)
    await input.fill(alias)
    await input.press('Enter')
    await page.getByRole('row', { name: new RegExp(project) }).getByText(alias).waitFor()
  }
  ok('aliases added for two projects')
  await shot('05_projects')

  // Daily log: pick categories and type tasks
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.getByText('1 new group project detected').waitFor()
  ok('daily log shows the NEW project alert')
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const editor = page.getByLabel('Cell editor')
  // grid: category → Tab → task → Tab → 업무내용 (details)
  await cell(15, 'category').click()
  await page.keyboard.type('일반')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('이메일 및 일반업무')
  await page.keyboard.press('Enter')
  await cell(16, 'category').click()
  await page.keyboard.type('워크램프')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('개발 | 하우징 설계')
  await page.keyboard.press('Tab')
  await page.keyboard.type('도면 검토')
  await page.keyboard.press('Enter')
  await page.getByTestId('today-total').filter({ hasText: '1h 00m' }).waitFor()
  ok('two slots typed into the grid, total 1h')

  // Paste three rows from "Excel" into 08:30
  await cell(17, 'category').click()
  await editor.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '회의\tINT | Daily_Scrum\n워크램프\t개발 | 하우징 설계\n플루드\t견적 검토\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await page.getByTestId('today-total').filter({ hasText: '2h 30m' }).waitFor()
  expect(await page.getByText('Unmapped categories').isVisible(), 'pasted 3 rows; unknown "플루드" shows as unmapped')
  await page.getByLabel('Map 플루드').selectOption({ label: '2071--Marine Flood Light' })
  await page.getByText('Unmapped categories').waitFor({ state: 'detached' })
  ok('quick-map 플루드 → 2071 removes the unmapped warning')

  // Persistence across reload
  await page.reload()
  await page.getByTestId('today-total').filter({ hasText: '2h 30m' }).waitFor()
  expect((await cell(16, 'task').innerText()).trim() === '개발 | 하우징 설계' && (await cell(16, 'details').innerText()).trim() === '도면 검토', 'slots persist after reload (incl. 업무내용)')
  await shot('00_daily_log')

  // Import wizard with personal 30-min log
  await page.getByRole('button', { name: 'Import .xlsx' }).click()
  await page.setInputFiles('input[aria-label="Daily log file"]', path.join(E, 'daily_log_nov.xlsx'))
  await page.getByText('Days found in daily_log_nov.xlsx').waitFor()
  expect((await page.getByLabel('Date for Nov17').inputValue()) === '2026-11-17', 'wizard detects sheet dates from the 날짜 row')
  expect(await page.getByRole('dialog').getByText('Non-work (not counted)').first().isVisible(), 'wizard classifies 출근/점심/퇴근 as non-work')
  await shot('09_import_wizard')
  await page.getByRole('button', { name: 'Generate timesheet & weekly result' }).click()
  await page.getByText('Imported 40 slots on 2 day(s)').waitFor()
  ok('wizard imported 40 slots on 2 days')
  await page.getByRole('button', { name: 'Close' }).first().click()

  // Leave on Wednesday
  await page.goto(BASE + '/timesheets/leave?date=2026-11-18')
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.locator('li', { hasText: '11-18' }).waitFor()
  ok('annual leave added on 2026-11-18')
  await shot('06_leave')

  // Weekly plan
  await page.goto(BASE + '/timesheets/weekly?date=2026-11-16')
  await page.getByText('Weekly Task Result').waitFor()
  const planRows = await page.locator('table.sheet tbody tr').count()
  expect(planRows >= 15, `weekly plan has ${planRows} merged rows`)
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export .xlsx' }).click()])
  expect(dl1.suggestedFilename() === 'WeeklyResult_W47_DU.xlsx', 'weekly result export downloads ' + dl1.suggestedFilename())
  await shot('03_weekly_plan')

  // Group timesheet
  await page.goto(BASE + '/timesheets/group?date=2026-11-16')
  const table = page.getByTestId('group-table')
  await table.waitFor()
  const sumRow = table.getByRole('row', { name: /Individual Sum/ })
  const sums = await sumRow.locator('td').allTextContents()
  // Mon 2.5h (manual), Tue 8h (import; 출근/점심/퇴근 excluded), Wed 8h leave, Thu 8h, Fri 0
  expect(sums.slice(2).join(' ') === '2.50 8.00 8.00 8.00 0.00 26.50', 'individual sums per day: ' + sums.slice(2).join(' '))
  expect((await table.getByRole('row', { name: /Leave\(휴가 및 휴무\)/ }).locator('td').nth(4).textContent()) === '8.00', 'leave fills 00.Timelog--Leave on Wed')
  expect(await page.getByTestId('issues').getByText('nothing logged').isVisible(), 'validation flags the empty Friday')
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export group .xlsx' }).click()])
  expect(dl2.suggestedFilename() === 'GroupTimesheet_W47_DU.xlsx', 'group export downloads ' + dl2.suggestedFilename())
  await dl2.saveAs(path.join(E, 'downloaded_group.xlsx'))
  await shot('04_group_timesheet')

  // Settings
  await page.goto(BASE + '/settings')
  await page.getByLabel('Engineer code').fill('JP')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await page.getByRole('status').filter({ hasText: 'Profile saved' }).waitFor()
  expect(await page.locator('nav').getByText('JP').isVisible(), 'profile setting saved and reflected in nav')
  await shot('07_settings')

  // Admin
  await page.goto(BASE + '/admin')
  await page.getByPlaceholder('new.member@company.com').fill('new.member@example.com')
  await page.getByRole('button', { name: 'Send invite' }).click()
  await page.getByRole('cell', { name: 'new.member@example.com' }).waitFor()
  ok('admin invites a user (pending invitation listed)')
  await shot('08_admin')

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
