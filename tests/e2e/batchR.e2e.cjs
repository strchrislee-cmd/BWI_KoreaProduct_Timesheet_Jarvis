// 2026-11-26 (11): Daily Kanban next to the Daily Log. One card per task; the task logged in the latest
// half hour that has started today is Doing, the one before it Wait; cards move by drag and drop or …;
// every move is kept. REPORT=1 writes docs/test-reports/<date>-kanban/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'kanban',
  title: 'Daily Kanban (Daily Log와 연동)',
  suite: 'tests/e2e/batchR.e2e.cjs',
  request:
    'Daily Log 옆에 Daily Kanban. Backlog · ToDo · Wait · Doing · DoneCheck · Done. Doing은 Daily Log에서 지금 하는 업무가 기록되면, 이전 업무도 자연스럽게 칸반에. 완료까지 표시. (이동 여정 분석은 나중에, 기록은 지금부터)',
  criteria: [
    'Timesheets에 Daily Log 다음 탭으로 Daily Kanban, 칸 6개.',
    '업무(Project · Type · Task) 하나가 카드 하나. Daily Log에 처음 나온 업무는 카드가 생긴다.',
    '오늘 이미 시작된 가장 늦은 칸에 기록한 업무가 Doing, 그 전에 Doing이던 카드는 Wait.',
    'Backlog에 카드를 직접 추가하고, 카드를 끌어서 다른 칸으로 옮기거나 … 메뉴로 옮긴다. Done은 완료 날짜 표시.',
    '끝난(Done) 업무를 다시 기록하면 Doing으로 돌아온다.',
    '모든 칸 이동이 기록된다(나중에 Wait ↔ Doing 반복 분석용).',
    '새로 고쳐도 그대로, 휴대폰에서는 칸이 옆으로 넘어간다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  // "now" is 10:10 on 2026-11-26, so the 10:00 half hour has started and 10:30 has not
  await page.clock.setFixedTime(new Date('2026-11-26T10:10:00'))
  report.env(`Chromium ${browser.version()}`, '1440×900 (휴대폰 390×844), 시계 2026-11-26 10:10 고정')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const paste = async (i, tsv) => {
    await cell(i, 'category').click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(500)
  }
  const column = (s) => page.locator(`[data-column="${s}"]`)
  const titles = async (s) => (await column(s).getByTestId('kanban-card').allInnerTexts()).map((t) => t.split('\n')[0].trim())
  const board = async () => {
    const out = {}
    for (const s of ['backlog', 'todo', 'wait', 'doing', 'donecheck', 'done']) out[s] = await titles(s)
    return out
  }
  const toKanban = async () => {
    await page.getByRole('link', { name: 'Daily Kanban' }).click()
    await page.getByTestId('kanban-board').waitFor()
    await page.waitForTimeout(400)
  }
  const toLog = async () => {
    await page.getByRole('link', { name: 'Daily Log' }).click()
    await cell(18, 'category').waitFor()
  }
  const away = async () => {
    await page.mouse.move(700, 120)
    await page.waitForTimeout(900)
  }

  await page.goto(BASE + '/timesheets?date=2026-11-26')
  await cell(18, 'category').waitFor()
  const tabs = (await page.getByRole('link').allInnerTexts()).map((t) => t.trim())
  const tabOk = tabs.indexOf('Daily Kanban') === tabs.indexOf('Daily Log') + 1

  // two tasks this morning: 09:00 and 09:30 (09:30 is the latest that has started → Doing)
  await paste(18, '회의\t회의-INT\t주간 회의')
  await paste(19, '설계\t개발-신규\t도면 검토')
  await toKanban()
  const cols = await page.locator('[data-column]').evaluateAll((els) => els.map((e) => e.getAttribute('data-column')))
  const b1 = await board()
  const c1 = report.check({ name: 'Daily Log 다음 탭에 Daily Kanban, 칸 6개', expected: 'Daily Log → Daily Kanban 순서, backlog·todo·wait·doing·donecheck·done', actual: `${tabOk ? '순서 맞음' : '순서 다름'}, ${cols.join('·')}`, how: '탭 순서 && data-column 6개', pass: tabOk && cols.join('|') === 'backlog|todo|wait|doing|donecheck|done' })
  const c2 = report.check({
    name: '기록한 업무마다 카드, 지금(09:30 칸)의 업무가 Doing, 앞의 업무는 Wait',
    expected: "Doing '도면 검토', Wait '주간 회의'",
    actual: `Doing '${b1.doing.join(', ')}', Wait '${b1.wait.join(', ')}'`,
    how: "doing === ['도면 검토'] && wait === ['주간 회의']",
    pass: b1.doing.join('|') === '도면 검토' && b1.wait.join('|') === '주간 회의',
  })
  await away()
  await report.shot(page, { caption: '09:00 · 09:30을 기록한 뒤의 보드', marks: [{ target: page.getByRole('link', { name: 'Daily Kanban' }), n: c1, label: '새 탭' }, { target: column('doing'), n: c2, label: '지금 업무' }, { target: column('wait'), n: c2, label: '이전 업무' }] })

  // the next half hour: 10:00 → that task is Doing, 도면 검토 waits
  await toLog()
  await paste(20, '품질\t지원-8D\t8D 보고')
  await toKanban()
  const b2 = await board()
  const c3 = report.check({ name: '다음 칸(10:00)을 기록하면 그 업무가 Doing, 도면 검토는 Wait로', expected: "Doing '8D 보고', Wait '주간 회의, 도면 검토'", actual: `Doing '${b2.doing.join(', ')}', Wait '${b2.wait.join(', ')}'`, how: "doing === ['8D 보고'] && wait === ['주간 회의','도면 검토']", pass: b2.doing.join('|') === '8D 보고' && b2.wait.join('|') === '주간 회의|도면 검토' })

  // a card of your own in Backlog, then drag it to ToDo
  await column('backlog').getByRole('button', { name: '카드 추가' }).click()
  const form = page.getByRole('form', { name: 'New card' })
  await form.getByLabel('Task').fill('견적 검토')
  await form.getByLabel('Type').selectOption({ label: '지원-견적' })
  await form.getByRole('button', { name: '추가' }).click()
  await column('backlog').getByTestId('kanban-card').filter({ hasText: '견적 검토' }).waitFor()
  const added = await titles('backlog')
  await column('backlog').getByTestId('kanban-card').filter({ hasText: '견적 검토' }).dragTo(column('todo'))
  await column('todo').getByTestId('kanban-card').filter({ hasText: '견적 검토' }).waitFor()
  const b3 = await board()
  const c4 = report.check({ name: 'Backlog에 카드 추가, 끌어서 ToDo로', expected: "추가 후 Backlog '견적 검토' → ToDo로 이동", actual: `추가 후 Backlog '${added.join(', ')}', 끈 뒤 ToDo '${b3.todo.join(', ')}', Backlog '${b3.backlog.join(', ')}'`, how: "backlog 에 추가 → todo === ['견적 검토'] && backlog 비어 있음", pass: added.includes('견적 검토') && b3.todo.join('|') === '견적 검토' && b3.backlog.length === 0 })
  await away()
  await report.shot(page, { caption: '10:00 기록 뒤 + 직접 만든 카드를 ToDo로 끈 뒤', marks: [{ target: column('doing'), n: c3, label: '8D 보고' }, { target: column('todo'), n: c4, label: '끌어서 옮김' }] })

  // … menu: 도면 검토 → DoneCheck → Done
  const menuMove = async (title, to) => {
    const card = page.getByTestId('kanban-card').filter({ hasText: title })
    await card.hover()
    await card.getByRole('button', { name: `Options for ${title}` }).click()
    await page.getByRole('menu', { name: 'Card menu' }).getByRole('menuitem', { name: `→ ${to}` }).click()
    await page.waitForTimeout(300)
  }
  await menuMove('도면 검토', 'DoneCheck')
  const inCheck = await titles('donecheck')
  await menuMove('도면 검토', 'Done')
  const doneCard = column('done').getByTestId('kanban-card').filter({ hasText: '도면 검토' })
  const doneText = (await doneCard.innerText()).replace(/\s+/g, ' ')
  const c5 = report.check({ name: '… 메뉴로 DoneCheck → Done, 완료 날짜 표시', expected: "DoneCheck를 거쳐 Done에 '도면 검토', '완료 …' 표시", actual: `DoneCheck '${inCheck.join(', ')}' → Done 카드 '${doneText}'`, how: "donecheck 에 있다가 done 에 있고 '완료' 글자", pass: inCheck.includes('도면 검토') && doneText.includes('완료') })
  await page.reload()
  await page.getByTestId('kanban-board').waitFor()
  await page.waitForTimeout(400)
  const b4 = await board()
  report.check({ name: '새로 고쳐도 보드 그대로', expected: "Done '도면 검토', ToDo '견적 검토', Doing '8D 보고'", actual: `Done '${b4.done.join(', ')}', ToDo '${b4.todo.join(', ')}', Doing '${b4.doing.join(', ')}'`, how: '새로 고침 후 같은 칸', pass: b4.done.join('|') === '도면 검토' && b4.todo.join('|') === '견적 검토' && b4.doing.join('|') === '8D 보고' })
  await away()
  await report.shot(page, { caption: 'Done으로 옮긴 카드(완료 날짜)', marks: [{ target: doneCard, n: c5, label: '완료' }] })

  // 10:40: 도면 검토 again at 10:30 → back to Doing (its journey goes on), 8D 보고 waits
  await page.clock.setFixedTime(new Date('2026-11-26T10:40:00'))
  await toLog()
  await paste(21, '설계\t개발-신규\t도면 검토')
  await toKanban()
  const b5 = await board()
  const c6 = report.check({ name: '끝난 업무를 다시 기록하면 Doing으로 돌아옴', expected: "10:30 칸에 '도면 검토' → Doing, '8D 보고' → Wait", actual: `Doing '${b5.doing.join(', ')}', Wait '${b5.wait.join(', ')}', Done '${b5.done.join(', ')}'`, how: "doing === ['도면 검토'] && wait 에 '8D 보고' && done 비어 있음", pass: b5.doing.join('|') === '도면 검토' && b5.wait.includes('8D 보고') && b5.done.length === 0 })

  // every move is kept (demo data lives in this browser)
  const journey = await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
    const card = s.kanbanCards.find((c) => c.description === '도면 검토')
    return s.kanbanMoves.filter((m) => m.card_id === card.id).map((m) => `${m.to_status}(${m.reason})`)
  })
  const c7 = report.check({
    name: '칸 이동이 모두 기록됨(여정)',
    expected: 'doing(log) → wait(log) → donecheck(manual) → done(manual) → doing(log)',
    actual: journey.join(' → '),
    how: "kanban_moves 의 to_status(reason) 순서",
    pass: journey.join(' → ') === 'doing(log) → wait(log) → donecheck(manual) → done(manual) → doing(log)',
  })
  await away()
  await report.shot(page, { caption: "다시 기록한 '도면 검토'가 Doing으로", marks: [{ target: column('doing'), n: c6, label: '돌아옴' }, { target: column('wait'), n: c7, label: '이동 기록' }] })

  // phones: the columns scroll sideways inside the board, the page does not
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })
  const phone = await phoneCtx.newPage()
  await phone.clock.setFixedTime(new Date('2026-11-26T10:40:00'))
  await phone.goto(BASE + '/timesheets/kanban?date=2026-11-26')
  await phone.getByTestId('kanban-board').waitFor()
  const fit = await phone.evaluate(() => ({ page: document.documentElement.scrollWidth, board: document.querySelector('[data-testid="kanban-board"]').scrollWidth }))
  report.check({ name: '휴대폰: 칸은 보드 안에서 옆으로 넘어가고 페이지는 넘치지 않음', expected: '페이지 폭 ≤ 390, 보드 내용 > 390(옆으로 스크롤)', actual: `페이지 ${fit.page}px, 보드 내용 ${fit.board}px`, how: 'documentElement.scrollWidth ≤ 390 && board.scrollWidth > 390', pass: fit.page <= 390 && fit.board > 390 })
  await phoneCtx.close()

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchR: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
