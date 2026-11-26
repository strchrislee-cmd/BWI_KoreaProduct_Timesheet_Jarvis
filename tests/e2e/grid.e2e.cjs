// Browser test of the Excel/Notion-like Daily Log grid (demo mode). Run: node grid.e2e.cjs
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/ERR_TUNNEL_CONNECTION_FAILED/.test(m.text()) && errors.push(m.text()))

  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const text = async (i, col) => (await cell(i, col).innerText()).trim()
  const editor = page.getByLabel('Cell editor')
  const waitText = async (i, col, expected) => {
    await page.waitForFunction(
      ([sel, exp]) => document.querySelector(sel)?.textContent.trim() === exp,
      [`[data-cell="${i}:${col}"]`, expected],
      { timeout: 5000 },
    ).catch(async () => {
      throw new Error(`cell ${i}:${col} is "${await text(i, col)}", expected "${expected}"`)
    })
  }

  // Setup: master sheet + alias
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.setInputFiles('input[aria-label="Master sheet file"]', path.join(E, 'master_v1.xlsx'))
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()
  const aliasInput = page.getByLabel('Add alias for 2041--Utility Work Lamps')
  await aliasInput.fill('워크램프')
  await aliasInput.press('Enter')
  await page.getByRole('row', { name: /2041--Utility Work Lamps/ }).getByText('워크램프').waitFor()
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(15, 'category').waitFor()

  // 1. lunch default
  expect((await text(24, 'category')) === '점심(기본)' && (await text(25, 'category')) === '점심(기본)', 'lunch rows 12:00–13:00 default to 점심')

  // 2. notion-like dropdown with alias search
  await cell(15, 'category').click()
  await page.keyboard.type('워크')
  await page.getByRole('option', { name: /2041--Utility Work Lamps/ }).waitFor()
  await page.keyboard.press('Enter')
  await waitText(15, 'category', '2041--Utility Work Lamps')
  expect((await cell(16, 'category').getAttribute('class')).includes('outline-primary'), 'typing an alias + Enter picks the project and moves down')

  // 3. type a task (English + Korean)
  await cell(15, 'task').click()
  await page.keyboard.type('개발 | 하우징 설계')
  await page.keyboard.press('Enter')
  await waitText(15, 'task', '개발 | 하우징 설계')
  ok('task typed directly into a cell')

  // 4. multi-cell input: shift+click range, type once
  await cell(16, 'category').click()
  await cell(19, 'category').click({ modifiers: ['Shift'] })
  await page.keyboard.type('회의')
  await page.keyboard.press('Enter')
  for (const i of [16, 17, 18, 19]) await waitText(i, 'category', '회의(개발, 품질, Gemba walk, etc..)')
  ok('one entry applied to 4 selected category cells')

  // 5. drag-select tasks and type once
  await cell(16, 'task').hover()
  await page.mouse.down()
  await cell(19, 'task').hover()
  await page.mouse.up()
  await page.keyboard.type('INT | Daily_Scrum')
  await page.keyboard.press('Enter')
  for (const i of [16, 17, 18, 19]) await waitText(i, 'task', 'INT | Daily_Scrum')
  ok('drag-selected 4 task cells filled at once')

  // 6. Ctrl+C / Ctrl+V inside the grid
  await cell(15, 'category').click()
  await cell(15, 'task').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+C')
  const clip = await page.evaluate(() => navigator.clipboard.readText())
  expect(clip === '2041--Utility Work Lamps\t\t개발 | 하우징 설계', 'Ctrl+C puts TSV on the clipboard (with the empty MID): ' + JSON.stringify(clip))
  await cell(20, 'category').click()
  await page.keyboard.press('Control+V')
  await waitText(20, 'category', '2041--Utility Work Lamps')
  await waitText(20, 'task', '개발 | 하우징 설계')
  ok('Ctrl+V pastes the copied row')

  // 7. paste a block copied from Excel (TSV) — category, task, 업무내용
  await cell(21, 'category').click()
  await editor.evaluate((el) => {
    const dt = new DataTransfer()
    dt.setData('text/plain', '일반\t메일 정리\t회신 3건\r\n플루드\t견적 검토\t\r\nLeave(휴가 및 휴무)\t\t\r\n')
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
  })
  await waitText(21, 'category', '일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)')
  await waitText(21, 'details', '회신 3건')
  await waitText(22, 'category', '⚠ 플루드')
  await waitText(23, 'category', 'Leave(휴가 및 휴무)')
  ok('3×3 block pasted from Excel (incl. unmapped label and short timelog name)')

  // 8. Delete + Ctrl+Z
  await cell(22, 'category').click()
  await cell(22, 'task').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Delete')
  await waitText(22, 'category', '—')
  await page.keyboard.press('Control+Z')
  await waitText(22, 'category', '⚠ 플루드')
  await waitText(22, 'task', '견적 검토')
  ok('Delete clears the selection and Ctrl+Z restores it')

  // 9. single value fills a selection (Excel behaviour)
  await page.evaluate(() => navigator.clipboard.writeText('주간 보고'))
  await cell(15, 'details').click()
  await cell(20, 'details').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+V')
  for (const i of [15, 16, 17, 18, 19, 20]) await waitText(i, 'details', '주간 보고')
  ok('one copied value pasted into 6 업무내용 cells')

  // 10. lunch override and back to default
  await cell(24, 'category').click()
  await page.keyboard.type('워크램프')
  await page.keyboard.press('Enter')
  await waitText(24, 'category', '2041--Utility Work Lamps')
  await cell(24, 'category').click()
  await page.keyboard.press('Delete')
  await waitText(24, 'category', '점심(기본)')
  ok('lunch row can be changed, and clearing it returns to 점심')

  // 11. Ctrl+D fill down
  await cell(26, 'category').click()
  await page.keyboard.type('워크램프')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab') // past the MID column
  await page.keyboard.type('개발 | 시험 준비')
  await page.keyboard.press('Enter')
  await cell(26, 'category').click()
  await cell(28, 'task').click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+D')
  await waitText(28, 'category', '2041--Utility Work Lamps')
  await waitText(28, 'task', '개발 | 시험 준비')
  ok('Tab moves to the next cell; Ctrl+D fills down rows 27–28')

  // 12. repeated task: register from the task dropdown
  await cell(30, 'category').click()
  await page.keyboard.type('일반')
  await page.keyboard.press('Enter')
  await cell(30, 'task').click()
  await page.keyboard.type('이메일 및 일반업무')
  await page.getByRole('option', { name: /반복 업무로 등록/ }).waitFor()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.getByTestId('templates').getByRole('button', { name: '이메일 및 일반업무', exact: true }).waitFor()
  expect((await text(30, 'task')) === '이메일 및 일반업무', 'typed task registered as a repeated task (chip appears)')

  // 13. apply a template chip to selected rows (row selection via time column)
  await page.locator('[data-slot="31"] > div').nth(1).click()
  await page.locator('[data-slot="32"] > div').nth(1).click({ modifiers: ['Shift'] })
  await page.getByTestId('templates').getByRole('button', { name: '이메일 및 일반업무', exact: true }).click()
  for (const i of [31, 32]) {
    await waitText(i, 'category', '일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)')
    await waitText(i, 'task', '이메일 및 일반업무')
  }
  ok('template chip fills category + task on 2 selected rows')

  // 14. pick a template from the task dropdown
  await cell(28, 'task').click()
  await page.keyboard.press('Enter')
  await page.getByRole('option', { name: /이메일 및 일반업무/ }).waitFor()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await waitText(28, 'category', '일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)')
  await waitText(28, 'task', '이메일 및 일반업무')
  ok('template picked from the Task dropdown (Enter → ↓ → Enter)')

  // 15. Korean IME composition (simulated through Chrome DevTools)
  const cdp = await ctx.newCDPSession(page)
  await cell(29, 'task').click()
  for (const t of ['ㅎ', '회', '회ㅇ', '회의']) await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length })
  await cdp.send('Input.insertText', { text: '회의' })
  await cdp.send('Input.imeSetComposition', { text: ' 준', selectionStart: 2, selectionEnd: 2 })
  await cdp.send('Input.insertText', { text: ' 준비' })
  expect((await editor.inputValue()) === '회의 준비', 'Korean IME composition goes straight into the editor: ' + (await editor.inputValue()))
  await page.keyboard.press('Enter')
  await waitText(29, 'task', '회의 준비')
  ok('composed Korean text committed with Enter')
  await cell(15, 'category').click()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'grid_01.png') })

  // 16. dropdown screenshot
  await cell(22, 'category').click()
  await page.keyboard.press('Enter')
  await page.getByRole('listbox').waitFor()
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'grid_02_dropdown.png') })
  await page.keyboard.press('Escape')
  ok('category dropdown opens with Enter and closes with Esc')

  // 17. persistence
  await page.reload()
  await waitText(31, 'task', '이메일 및 일반업무')
  await waitText(24, 'category', '점심(기본)')
  const total = await page.getByTestId('today-total').innerText()
  // work slots: 15-23 (9), 26-28 (3), 29 (task only, unmapped), 30-32 (3) = 16 → 8h
  expect(total === '8h 00m', 'everything persisted after reload; total ' + total)

  expect(errors.length === 0, 'no console/page errors' + (errors.length ? ': ' + errors.join(' | ') : ''))
  await browser.close()
  console.log('GRID E2E passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
