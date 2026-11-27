// 2026-11-27 (15): the Daily Kanban of a day. Only that day's cards show (plus Backlog / ToDo); a slider
// replays the board half hour by half hour from the Daily Log (moves by hand at the time they were made);
// Kanban Flow below shows, per person, every card's column in each half hour.
// REPORT=1 writes docs/test-reports/<date>-kanban-flow/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'
const YESTERDAY = '2026-11-26'

const report = createReport({
  id: 'kanban-flow',
  title: 'Daily Kanban: 그날의 카드, 하루 되감기, Kanban Flow',
  suite: 'tests/e2e/batchV.e2e.cjs',
  request:
    '(버그) Daily Kanban은 그날의 내용을 보여 줘야 하는데 지난 데이터가 넘어온다. 칸반에 하루를 30분 간격으로 어떤 일을 Doing으로 했는지 스크롤을 옮기며 블록이 이동하는 것을 보는 UI. 칸반 아래 Kanban Flow: 30분 간격으로 선택된 사용자마다 어떻게 이동했는지 하루 전체 그래프.',
  criteria: [
    '선택한 날짜의 카드만(그날 Daily Log에 기록됐거나 손으로 옮긴 카드) + Backlog·ToDo. 지난 카드는 "지난 카드도 보기"로만.',
    '하루 되감기: 슬라이더를 30분씩 옮기면 그 시점의 보드(Daily Log 기준: 그 칸의 업무가 Doing, 이전 업무는 Wait), 손으로 옮긴 카드는 옮긴 시각에. 그 30분에 옮겨진 카드는 노란 테두리, 되감기 중에는 읽기 전용.',
    'Kanban Flow: 나와 체크한 팀원마다 그날 움직인 카드가 한 줄씩, 30분마다 칸(Doing 진한 색, Wait 연한 색, Done 회색). 칸을 누르면 그 시간으로 되감기.',
    '지난 날짜는 그날 하루가 끝났을 때의 보드(읽기 전용).',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  report.env(`Chromium ${browser.version()}`, `1440×900, 시계 ${DAY} 16:10 고정(어제 기록은 ${YESTERDAY} 16:00), 데모 모드`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.getByTestId('grid-scroll').locator(`[data-cell="${i}:${col}"]`)
  const paste = async (i, tsv) => {
    await cell(i, 'category').click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(500)
  }
  const column = (s) => page.locator(`[data-column="${s}"]`)
  const titles = async (s) => column(s).getByTestId('kanban-card').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()))
  const board = async () => {
    const out = {}
    for (const s of ['backlog', 'todo', 'wait', 'doing', 'donecheck', 'done']) out[s] = await titles(s)
    return out
  }
  const toKanban = async (date = DAY) => {
    await page.goto(BASE + `/timesheets/kanban?date=${date}`)
    await page.getByTestId('kanban-board').waitFor()
    await page.waitForTimeout(500)
  }
  const slider = () => page.getByLabel('Replay time')
  const range = async () => ({ min: Number(await slider().getAttribute('min')), max: Number(await slider().getAttribute('max')) })
  // the slider starts at 07:30 (work start, half hour 15): position k = half hour 15 + k
  const replayAt = async (slot) => {
    await slider().fill(String(slot - 15))
    await page.waitForTimeout(250)
  }

  // yesterday: one task (its card is yesterday's)
  await page.clock.setFixedTime(new Date(`${YESTERDAY}T16:00:00`))
  await page.goto(BASE + `/timesheets?date=${YESTERDAY}`)
  await cell(18, 'category').waitFor()
  await paste(18, '품질\t지난주 이슈\n품질\t지난주 이슈')
  // today: 09:00–10:00 도면검토, 10:00 8D 보고, 13:00 도면검토 again
  await page.clock.setFixedTime(new Date(`${DAY}T15:10:00`))
  await page.goto(BASE + `/timesheets?date=${DAY}`)
  await cell(18, 'category').waitFor()
  await paste(18, '설계\t도면검토\n설계\t도면검토\n품질\t8D 보고')
  await paste(26, '설계\t도면검토')
  // 15:10: 8D 보고 moved to Done by hand
  await toKanban()
  const card8d = column('wait').getByTestId('kanban-card').filter({ hasText: '8D 보고' })
  await card8d.getByRole('button', { name: 'Options for 8D 보고' }).click()
  await page.getByRole('menu', { name: 'Card menu' }).getByRole('menuitem', { name: '→ Done', exact: true }).click()
  await page.waitForTimeout(400)

  // ── the day's board ──
  await page.clock.setFixedTime(new Date(`${DAY}T16:10:00`))
  await toKanban()
  const today = await board()
  await page.getByLabel('Show earlier cards').check()
  await page.waitForTimeout(300)
  const all = await board()
  await page.getByLabel('Show earlier cards').uncheck()
  await page.waitForTimeout(300)
  const c1 = report.check({
    name: '그날의 카드만 (지난 카드는 "지난 카드도 보기"로만)',
    expected: "오늘 보드: Doing '도면검토', Done '8D 보고', 어제의 '지난주 이슈' 없음; 지난 카드도 보기 → Wait에 '지난주 이슈'",
    actual: `오늘 Doing [${today.doing}], Done [${today.done}], Wait [${today.wait}] · 지난 카드 포함 Wait [${all.wait}]`,
    how: '칸별 카드 제목, Show earlier cards 체크 전후',
    pass: today.doing.join('|') === '도면검토' && today.done.join('|') === '8D 보고' && !Object.values(today).flat().includes('지난주 이슈') && all.wait.includes('지난주 이슈'),
  })
  await page.mouse.move(700, 880)
  await report.shot(page, { caption: '오늘의 보드: 어제 카드는 빠지고, 위에 하루 되감기 슬라이더', marks: [{ target: page.getByTestId('kanban-board'), n: c1, label: '그날의 카드' }, { target: page.getByTestId('kanban-replay'), n: c1 + 1, label: '되감기' }] })

  // ── replay half hour by half hour ──
  const { min, max } = await range()
  await replayAt(18)
  const at0900 = { b: await board(), moved: await page.locator('[data-moved]').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim())), time: await page.getByTestId('replay-time').innerText() }
  await replayAt(20)
  const at1000 = await board()
  await replayAt(29)
  const at1430 = await board()
  await replayAt(30)
  const at1500 = { b: await board(), moved: await page.locator('[data-moved]').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim())) }
  const ro = { menus: await page.getByRole('button', { name: /^Options for/ }).count(), drag: await page.getByTestId('kanban-card').first().getAttribute('draggable'), note: await page.getByTestId('replay-note').innerText() }
  const c2 = report.check({
    name: '하루 되감기: 30분마다 Daily Log대로, 손으로 옮긴 건 옮긴 시각에',
    expected:
      "09:00 Doing '도면검토'(노란 테두리), 10:00 Doing '8D 보고'·Wait '도면검토', 14:30 Doing '도면검토'·Wait '8D 보고', 15:00 Done '8D 보고'(이 30분에 옮김), 되감기 중 메뉴 0개·끌기 불가",
    actual: `범위 ${min}~${max} · 09:00(${at0900.time}) Doing [${at0900.b.doing}] 테두리 [${at0900.moved}] · 10:00 Doing [${at1000.doing}] Wait [${at1000.wait}] · 14:30 Doing [${at1430.doing}] Wait [${at1430.wait}] · 15:00 Done [${at1500.b.done}] 테두리 [${at1500.moved}] · 메뉴 ${ro.menus}, draggable=${ro.drag}`,
    how: '슬라이더 위치별 칸 제목, data-moved, Options 버튼 수, draggable',
    pass:
      at0900.b.doing.join('|') === '도면검토' &&
      at0900.moved.includes('도면검토') &&
      at0900.time.startsWith('09:00') &&
      at1000.doing.join('|') === '8D 보고' &&
      at1000.wait.join('|') === '도면검토' &&
      at1430.doing.join('|') === '도면검토' &&
      at1430.wait.join('|') === '8D 보고' &&
      at1500.b.done.join('|') === '8D 보고' &&
      at1500.moved.includes('8D 보고') &&
      ro.menus === 0 &&
      ro.drag === 'false' &&
      ro.note.includes('읽기 전용'),
  })
  await page.mouse.move(700, 880)
  await report.shot(page, { caption: '15:00으로 되감기: 15:10에 손으로 옮긴 8D 보고가 Done (노란 테두리)', marks: [{ target: column('done'), n: c2, label: '15:00 시점' }] })

  // ── Kanban Flow: rows per card, columns per half hour; a cell replays that time ──
  await page.getByRole('button', { name: '지금으로' }).click()
  await page.waitForTimeout(300)
  const flow = page.getByTestId('kanban-flow')
  const rowStatus = (task, slot) => flow.locator(`[data-testid="flow-row"][data-task="${task}"] [data-slot="${slot}"]`).getAttribute('data-status')
  const f = {
    rows: await flow.getByTestId('flow-row').evaluateAll((els) => els.map((e) => e.dataset.task)),
    d18: await rowStatus('도면검토', 18),
    d20: await rowStatus('도면검토', 20),
    d26: await rowStatus('도면검토', 26),
    e20: await rowStatus('8D 보고', 20),
    e30: await rowStatus('8D 보고', 30),
    e17: await rowStatus('8D 보고', 17),
  }
  await flow.locator('[data-testid="flow-row"][data-task="8D 보고"] [data-slot="30"]').click()
  await page.waitForTimeout(300)
  const jumped = await page.getByTestId('replay-time').innerText()
  const c3 = report.check({
    name: 'Kanban Flow: 카드마다 한 줄, 30분마다 칸 · 칸을 누르면 그 시간으로',
    expected: "줄: 도면검토, 8D 보고 (어제 카드 없음) · 도면검토 09:00 doing, 10:00 wait, 13:00 doing · 8D 10:00 doing, 15:00 done, 08:30 없음 · 15:00 칸 누르면 '15:00–15:30'",
    actual: `줄 [${f.rows}] · 도면검토 ${f.d18}/${f.d20}/${f.d26} · 8D ${f.e20}/${f.e30}/'${f.e17}' · 누른 뒤 '${jumped}'`,
    how: 'flow-row 의 data-task, 칸의 data-status, 누른 뒤 replay-time',
    pass:
      f.rows.join('|') === '도면검토|8D 보고' &&
      f.d18 === 'doing' &&
      f.d20 === 'wait' &&
      f.d26 === 'doing' &&
      f.e20 === 'doing' &&
      f.e30 === 'done' &&
      f.e17 === '' &&
      jumped.startsWith('15:00'),
  })
  await flow.scrollIntoViewIfNeeded()
  await page.mouse.move(700, 10)
  await report.shot(page, { caption: 'Kanban Flow: 30분마다 카드가 있던 칸 (진한 색 Doing, 연한 색 Wait, 회색 Done), 굵은 테두리 = 되감은 시각', marks: [{ target: flow, n: c3, label: 'Kanban Flow' }] })

  // teammates: their rows join the flow (demo team logged today)
  await page.goto(BASE + `/timesheets/org?date=${DAY}`)
  await page.getByRole('button', { name: '데모 팀원 만들기' }).click()
  await page.waitForTimeout(400)
  await toKanban()
  await page.getByTestId('kanban-team').getByRole('checkbox', { name: '윤도현', exact: true }).check()
  await page.waitForTimeout(700)
  const people = await page.getByTestId('flow-person').evaluateAll((els) => els.map((e) => e.dataset.person))
  const dhRows = await page.locator('[data-testid="flow-person"][data-person="윤도현"] [data-testid="flow-row"]').evaluateAll((els) => els.map((e) => e.dataset.task))
  await replayAt(22)
  const dhAt1100 = await page.locator('[data-column="doing"] [data-person="윤도현"]').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()))
  const c4 = report.check({
    name: '체크한 팀원도 Flow에 사람별로, 되감기에도 함께',
    expected: "Flow 사람 [나, 윤도현], 윤도현 줄: 도면 검토 · 설계 회의 · 3D 모델링, 11:00 되감기 Doing에 윤도현 '설계 회의'",
    actual: `사람 [${people}] · 윤도현 줄 [${dhRows}] · 11:00 윤도현 Doing [${dhAt1100}]`,
    how: 'flow-person / flow-row, 되감은 보드의 윤도현 카드',
    pass: people.join('|') === '나|윤도현' && dhRows.join('|') === '도면 검토|설계 회의|3D 모델링' && dhAt1100.join('|') === '설계 회의',
  })

  // a past day: the board at the end of that day, reading only
  await page.getByTestId('kanban-team').getByRole('button', { name: '모두 해제' }).click()
  await toKanban(YESTERDAY)
  const past = { b: await board(), label: await page.getByTestId('replay-time').innerText(), note: await page.getByTestId('replay-note').innerText(), menus: await page.getByRole('button', { name: /^Options for/ }).count() }
  report.check({
    name: '지난 날짜: 그날 하루가 끝났을 때의 보드 (읽기 전용)',
    expected: "어제: Doing '지난주 이슈', 오늘 카드 없음, '하루 끝', 안내에 읽기 전용, 메뉴 0개",
    actual: `Doing [${past.b.doing}], 전체 [${Object.values(past.b).flat()}], '${past.label}', '${past.note}', 메뉴 ${past.menus}`,
    how: '칸 제목, replay-time / replay-note, Options 버튼 수',
    pass: past.b.doing.join('|') === '지난주 이슈' && Object.values(past.b).flat().length === 1 && past.label === '하루 끝' && past.note.includes('읽기 전용') && past.menus === 0,
  })

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건${errors.length ? ': ' + errors.join(' | ') : ''}`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchV: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
