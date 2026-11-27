// 2026-11-27 (16): Daily Kanban → Log Enable. Every :00 / :30 a popup asks to log the half hour that just
// ended with the card in Doing: 기록 (one click), 수정 (pick another card → it moves to Doing, the one Doing
// before waits, that task is logged) or 건너뛰기. On any page; no popup for a half hour already logged.
// Demo build with a fake clock (Fri 2026-11-27; demo hours 07:30–16:30, lunch 12:00–13:00).
// REPORT=1 writes docs/test-reports/<date>-kanban-log/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'

const report = createReport({
  id: 'kanban-log',
  title: 'Daily Kanban: Log Enable — 30분마다 Doing 업무를 Daily Log에 기록',
  suite: 'tests/e2e/batchW.e2e.cjs',
  request:
    'Kanban 모드에서 Log Enable을 켜면 30분 정각·정시에 "Doing에 있는 내용을 Log로 기록하겠습니까?" 팝업을 띄워 간단히 클릭하게 하고, 다를 경우 수정 버튼으로 다른 업무를 Doing에 놓고 Daily Log에는 변경된 정보로 기록.',
  criteria: [
    'Daily Kanban의 Log Enable을 켜면 정각·30분마다 방금 끝난 30분을 Doing 카드로 기록할지 묻는다 (앱 어느 화면에서나, 브라우저 알림도).',
    '기록: 한 번 눌러 그 30분을 Doing 카드의 Project·Type·Task로 Daily Log에 저장.',
    '수정: 다른 카드를 고르면 그 카드가 Doing으로 가고(원래 Doing은 Wait로) 그 업무로 기록.',
    '건너뛰기: 아무것도 저장하지 않음. 이미 기록된 30분은 묻지 않음. 끄면 더 묻지 않음.',
  ],
})

// headless Chromium has no notifications: a stub that records what would be shown (permission granted)
const fakeNotification = () => {
  window.__notes = []
  class FakeNotification {
    static get permission() {
      return 'granted'
    }
    static async requestPermission() {
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
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  await ctx.addInitScript(fakeNotification)
  const page = await ctx.newPage()
  report.env(`Chromium ${browser.version()}`, `1440×900, 가짜 시계 ${DAY}(금) 09:20부터 흐름, 데모 모드(근무 07:30–16:30, 점심 12:00–13:00)`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.clock.install({ time: new Date(`${DAY}T09:20:00`) })

  const cell = (i, col) => page.getByTestId('grid-scroll').locator(`[data-cell="${i}:${col}"]`)
  const column = (s) => page.locator(`[data-column="${s}"]`)
  const titles = async (s) => column(s).getByTestId('kanban-card').evaluateAll((els) => els.map((e) => e.querySelector('span')?.textContent?.trim()))
  const toKanban = async () => {
    await page.goto(BASE + `/timesheets/kanban?date=${DAY}`)
    await page.getByTestId('kanban-board').waitFor()
    await page.waitForTimeout(400)
  }
  const popup = page.getByRole('dialog', { name: 'Log the Doing card' })
  const notes = () => page.evaluate(() => window.__notes)
  const slotsOf = () =>
    page.evaluate((day) => {
      const st = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
      const me = st.profiles[0].id
      return st.slots.filter((s) => s.user_id === me && s.work_date === day).sort((a, b) => a.slot_index - b.slot_index).map((s) => `${s.slot_index}:${s.description}`)
    }, DAY)

  // 09:00 logged in the Daily Log (its card goes to Doing), and a card of my own in Backlog
  await page.goto(BASE + `/timesheets?date=${DAY}`)
  await cell(18, 'category').click()
  await page.evaluate((t) => navigator.clipboard.writeText(t), '설계\t도면검토')
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(500)
  await toKanban()
  await column('backlog').getByRole('button', { name: '카드 추가' }).click()
  const form = page.getByRole('form', { name: 'New card' })
  await form.getByLabel('Task').fill('견적 검토')
  await form.getByLabel('Type').selectOption({ label: '지원-견적' })
  await form.getByRole('button', { name: '추가' }).click()
  await column('backlog').getByTestId('kanban-card').filter({ hasText: '견적 검토' }).waitFor()

  // ── Log Enable ──
  const toggle = page.getByRole('checkbox', { name: 'Log Enable' })
  const offHint = await page.getByTestId('kanban-log').innerText()
  await toggle.check()
  await page.waitForTimeout(300)
  const onHint = await page.getByTestId('kanban-log').innerText()
  await page.getByRole('button', { name: '지금 해 보기' }).click()
  await popup.waitFor()
  const tryIt = { title: await popup.innerText(), doing: await popup.getByTestId('doing-card').innerText() }
  const c1 = report.check({
    name: 'Daily Kanban에 Log Enable · 켜면 안내와 "지금 해 보기"',
    expected: "끈 상태 안내 '켜면 …' → 켜면 '정각·30분마다 …' + 지금 해 보기 → 08:30–09:00 팝업, Doing 카드 '도면검토'",
    actual: `끈 상태 '${offHint.replace(/\s+/g, ' ')}' → 켠 상태 '${onHint.replace(/\s+/g, ' ')}' · 팝업 '${tryIt.title.split('\n').slice(0, 2).join(' / ')}' · Doing '${tryIt.doing.replace(/\s+/g, ' ')}'`,
    how: 'kanban-log 글자, 지금 해 보기 → dialog "Log the Doing card" 와 doing-card',
    pass: offHint.includes('켜면') && onHint.includes('정각·30분마다') && onHint.includes('지금 해 보기') && tryIt.title.includes('08:30–09:00') && tryIt.doing.includes('도면검토'),
  })
  await page.mouse.move(700, 10)
  await report.shot(page, { caption: 'Log Enable을 켜고 "지금 해 보기": 방금 끝난 30분을 Doing 카드로 기록할지 묻는 팝업', marks: [{ target: page.getByTestId('kanban-log'), n: c1, label: 'Log Enable' }, { target: popup, n: c1, label: '팝업' }] })
  await popup.getByRole('button', { name: '건너뛰기' }).click()
  await popup.waitFor({ state: 'detached' })

  // 09:30: 09:00–09:30 is already logged → no popup
  await page.clock.runFor(10 * 60_000)
  await page.waitForTimeout(500)
  const at0930 = { popups: await popup.count(), notes: (await notes()).length }

  // 10:00: popup for 09:30–10:00 with the Doing card → 기록
  await page.clock.runFor(30 * 60_000)
  await popup.waitFor()
  const at1000 = { title: await popup.innerText(), doing: await popup.getByTestId('doing-card').innerText(), notes: await notes() }
  await page.mouse.move(700, 10)
  const c2 = report.check({
    name: '정각·30분마다 팝업 (이미 기록된 30분은 묻지 않음), 브라우저 알림도',
    expected: "09:30 팝업·알림 없음(09:00–09:30 기록됨) → 10:00 '09:30–10:00 을 Doing 업무로 기록할까요?', Doing '도면검토', 알림 'TeamEmbedded · Daily Kanban 기록'",
    actual: `09:30 팝업 ${at0930.popups}개·알림 ${at0930.notes}건 → 10:00 '${at1000.title.split('\n')[1]}' · Doing '${at1000.doing.replace(/\s+/g, ' ')}' · 알림 ${at1000.notes.map((n) => `'${n.title}: ${n.body}'`).join(', ')}`,
    how: 'clock.runFor 로 09:30·10:00 경계, dialog 수, window.__notes',
    pass:
      at0930.popups === 0 &&
      at0930.notes === 0 &&
      at1000.title.includes('09:30–10:00') &&
      at1000.doing.includes('도면검토') &&
      at1000.notes.length === 1 &&
      at1000.notes[0].title === 'TeamEmbedded · Daily Kanban 기록' &&
      at1000.notes[0].body.includes('09:30–10:00'),
  })
  await report.shot(page, { caption: '10:00: 09:30–10:00 을 Doing 업무(도면검토)로 기록할까요? — 기록 / 수정 / 건너뛰기', marks: [{ target: popup, n: c2, label: '10:00 팝업' }] })
  await popup.getByRole('button', { name: '기록', exact: true }).click()
  await popup.waitFor({ state: 'detached' })
  await page.waitForTimeout(400)
  const after1000 = { slots: await slotsOf(), doing: await titles('doing') }
  const c3 = report.check({
    name: '기록: 한 번에 그 30분을 Doing 업무로 Daily Log에 저장',
    expected: "Daily Log 18 '도면검토', 19 '도면검토' · Doing 그대로 '도면검토'",
    actual: `Daily Log [${after1000.slots}] · Doing [${after1000.doing}]`,
    how: '저장된 칸(slot_index:Task), 보드의 Doing',
    pass: after1000.slots.join('|') === '18:도면검토|19:도면검토' && after1000.doing.join('|') === '도면검토',
  })

  // 10:30: 수정 → pick 견적 검토 → it goes to Doing (도면검토 waits) and is logged
  await page.clock.runFor(30 * 60_000)
  await popup.waitFor()
  await popup.getByRole('button', { name: '수정' }).click()
  const picks = await popup.getByTestId('pick-card').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()))
  await page.mouse.move(700, 10)
  await report.shot(page, { caption: '10:30 수정: 이 시간에 한 업무를 고르면 Doing으로 옮기고 그 업무로 기록', marks: [{ target: popup.getByRole('list', { name: 'Choose a card' }), n: c3 + 1, label: '다른 업무 고르기' }] })
  await popup.getByTestId('pick-card').filter({ hasText: '견적 검토' }).click()
  await popup.waitFor({ state: 'detached' })
  await column('doing').getByTestId('kanban-card').filter({ hasText: '견적 검토' }).waitFor()
  const after1030 = { slots: await slotsOf(), doing: await titles('doing'), wait: await titles('wait'), backlog: await titles('backlog') }
  const c4 = report.check({
    name: '수정: 고른 카드가 Doing으로, 원래 Doing은 Wait로, 그 업무로 기록',
    expected: "고를 목록에 '견적 검토 Backlog · 지원-견적' → 고른 뒤 Daily Log 20 '견적 검토', Doing '견적 검토', Wait '도면검토', Backlog 비어 있음",
    actual: `목록 [${picks}] → Daily Log [${after1030.slots}] · Doing [${after1030.doing}] · Wait [${after1030.wait}] · Backlog [${after1030.backlog}]`,
    how: 'pick-card 글자, 저장된 칸, 보드 칸별 제목 (열린 보드가 바로 다시 읽힘)',
    pass:
      picks.some((p) => p.includes('견적 검토') && p.includes('Backlog') && p.includes('지원-견적')) &&
      after1030.slots.join('|') === '18:도면검토|19:도면검토|20:견적 검토' &&
      after1030.doing.join('|') === '견적 검토' &&
      after1030.wait.join('|') === '도면검토' &&
      after1030.backlog.length === 0,
  })
  await page.mouse.move(700, 880)
  await report.shot(page, { caption: '수정 후 보드: 견적 검토가 Doing, 도면검토는 Wait', marks: [{ target: column('doing'), n: c4, label: 'Doing으로' }, { target: column('wait'), n: c4, label: 'Wait로' }] })

  // 11:00 on the Daily Log page: the popup shows there too → 건너뛰기 leaves 10:30 empty
  await page.goto(BASE + `/timesheets?date=${DAY}`)
  await cell(20, 'task').filter({ hasText: '견적 검토' }).waitFor()
  await page.clock.runFor(30 * 60_000)
  await popup.waitFor()
  const at1100 = { title: await popup.innerText(), doing: await popup.getByTestId('doing-card').innerText(), url: new URL(page.url()).pathname }
  const grid = { r19: await cell(19, 'task').innerText(), r20: await cell(20, 'task').innerText() }
  await page.mouse.move(700, 10)
  await report.shot(page, { caption: '11:00, Daily Log 화면에서도 같은 팝업 (Doing: 견적 검토). 위 칸에 기록된 09:30·10:00', marks: [{ target: popup, n: c4 + 1, label: '어디서나' }, { target: cell(20, 'task'), n: c4 + 1, label: '수정으로 기록' }] })
  await popup.getByRole('button', { name: '건너뛰기' }).click()
  await popup.waitFor({ state: 'detached' })
  const after1100 = await slotsOf()
  report.check({
    name: '앱 어디서나 (Daily Log 화면에서도) · 건너뛰기는 저장하지 않음',
    expected: "/timesheets 에서 '10:30–11:00' 팝업, Doing '견적 검토' · Daily Log 칸 19 도면검토, 20 견적 검토 · 건너뛰기 후 21 비어 있음",
    actual: `${at1100.url} '${at1100.title.split('\n')[1]}' · Doing '${at1100.doing.replace(/\s+/g, ' ')}' · 칸 19 '${grid.r19}', 20 '${grid.r20}' · 건너뛴 뒤 [${after1100}]`,
    how: 'Daily Log 페이지에서 clock.runFor → dialog, grid 칸 글자, 저장된 칸',
    pass:
      at1100.url === '/timesheets' &&
      at1100.title.includes('10:30–11:00') &&
      at1100.doing.includes('견적 검토') &&
      grid.r19.includes('도면검토') &&
      grid.r20.includes('견적 검토') &&
      after1100.join('|') === '18:도면검토|19:도면검토|20:견적 검토',
  })

  // Log Enable off → no more popups (the 30-minute reminder is off too)
  await toKanban()
  await toggle.uncheck()
  await page.waitForTimeout(300)
  const notesBefore = (await notes()).length
  await page.clock.runFor(30 * 60_000)
  await page.waitForTimeout(500)
  const off = { popups: await popup.count(), reminders: await page.getByRole('dialog', { name: '30-min reminder' }).count(), notes: (await notes()).length - notesBefore, saved: await page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')).profiles[0].preferences?.kanbanLog) }
  report.check({
    name: '끄면 더 묻지 않음 (설정은 저장됨)',
    expected: '11:30 팝업 0개, 30분 알림 창 0개, 새 브라우저 알림 0건, 저장된 kanbanLog false',
    actual: `팝업 ${off.popups}개, 30분 알림 창 ${off.reminders}개, 새 알림 ${off.notes}건, kanbanLog ${off.saved}`,
    how: 'Log Enable 해제 후 clock.runFor 30분, dialog 수, window.__notes, 저장된 preferences',
    pass: off.popups === 0 && off.reminders === 0 && off.notes === 0 && off.saved === false,
  })

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건${errors.length ? ': ' + errors.join(' | ') : ''}`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchW: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
