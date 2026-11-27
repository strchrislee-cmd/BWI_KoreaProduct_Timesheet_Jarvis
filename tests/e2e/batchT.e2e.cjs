// 2026-11-27 (13): teammates on the Daily Kanban. Check people you may read and their cards join your
// board (read-only, their name on the card); give people colours and show only the cards of a colour.
// REPORT=1 writes docs/test-reports/<date>-kanban-team/ (see report.cjs). Demo mode, made-up teammates.
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'
// 빨간색 #D44C47 (not anyone's default colour in the demo team, so the change shows)
const RED = 'rgb(212, 76, 71)'

const report = createReport({
  id: 'kanban-team',
  title: 'Daily Kanban 팀원 보기 + 사람별 색 필터',
  suite: 'tests/e2e/batchT.e2e.cjs',
  request:
    'Daily Kanban에도 Team 체크를 추가하고, 체크하면 그 사람의 업무를 같은 Kanban에 표시(카드에 이름). Team에 색상 속성을 부여해 인원별 색상으로 필터링. Daily Log는 지금처럼 아래쪽으로.',
  criteria: [
    'Daily Kanban 위에 팀원 체크(볼 수 있는 사람만). 체크한 사람의 카드가 내 카드와 같은 칸에 들어오고, 카드에 그 사람 이름.',
    '팀원 카드는 읽기만(끌기·… 메뉴 없음), 내 카드는 예전처럼 끌어서 옮김.',
    '사람마다 색을 줄 수 있고(나에게만 적용), 카드의 이름표와 왼쪽 줄이 그 색. 팀원 창(Daily Log)에도 같은 색.',
    '색으로 보기: 색을 누르면 그 색 사람의 카드만, 같은 색 사람은 함께, 전체로 되돌림.',
    '체크와 색은 새로 고쳐도 그대로, 모두 해제하면 내 카드만.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date(`${DAY}T10:10:00`))
  report.env(`Chromium ${browser.version()}`, `1440×900, 시계 ${DAY} 10:10 고정, 데모 모드(가상 팀원)`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  const bar = () => page.getByTestId('kanban-team')
  const box = (name) => bar().getByRole('checkbox', { name, exact: true })
  const column = (s) => page.locator(`[data-column="${s}"]`)
  const cardsOf = async (s) =>
    column(s)
      .getByTestId('kanban-card')
      .evaluateAll((els) => els.map((e) => `${e.querySelector('span')?.textContent?.trim()}@${e.dataset.person ?? ''}`))
  const toKanban = async () => {
    await page.goto(BASE + `/timesheets/kanban?date=${DAY}`)
    await page.getByTestId('kanban-board').waitFor()
    await page.waitForTimeout(500)
  }
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')))

  // made-up team; one card of my own in Backlog
  await page.goto(BASE + `/timesheets/org?date=${DAY}`)
  await page.getByRole('button', { name: '데모 팀원 만들기' }).click()
  await page.waitForTimeout(400)
  await toKanban()
  await page.getByRole('button', { name: '카드 추가' }).click()
  await page.getByRole('form', { name: 'New card' }).getByLabel('Task').fill('내 견적 검토')
  await page.getByRole('form', { name: 'New card' }).getByRole('button', { name: '추가' }).click()
  await page.waitForTimeout(400)

  const people = await bar().locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  await box('서지아').check()
  await box('윤도현').check()
  await page.waitForTimeout(700)
  const wait = await cardsOf('wait')
  const doing = await cardsOf('doing')
  const c1 = report.check({
    name: '팀원을 체크하면 그 사람 카드가 같은 칸에, 카드에 이름',
    expected: "체크 목록에 볼 수 있는 5명, Wait·Doing에 서지아·윤도현 카드(이름표), 내 카드도 이름표 '나'",
    actual: `목록 [${people.join(', ')}] · Wait [${wait.join(', ')}] · Doing [${doing.join(', ')}] · Backlog [${(await cardsOf('backlog')).join(', ')}]`,
    how: 'kanban-team 체크박스 5개, 카드의 data-person 이 서지아/윤도현/나',
    pass:
      people.length === 5 &&
      wait.some((c) => c.endsWith('@서지아')) &&
      wait.some((c) => c.endsWith('@윤도현')) &&
      doing.some((c) => c.endsWith('@서지아')) &&
      (await cardsOf('backlog')).join('|') === '내 견적 검토@나',
  })
  await page.mouse.move(700, 700)
  await report.shot(page, { caption: '팀원 서지아·윤도현의 카드가 내 보드에 함께 (이름표)', marks: [{ target: bar(), n: c1, label: '팀원 체크' }, { target: column('wait'), n: c1, label: '이름표' }] })

  // teammates' cards are read-only; mine moves as before (and only mine)
  const jiaCard = column('wait').locator('[data-person="서지아"]').first()
  const mineCard = column('backlog').locator('[data-person="나"]')
  const jiaRO = { drag: await jiaCard.getAttribute('draggable'), menu: await jiaCard.getByRole('button', { name: /^Options for/ }).count() }
  const mineRW = { drag: await mineCard.getAttribute('draggable'), menu: await mineCard.getByRole('button', { name: /^Options for/ }).count() }
  const before = (await store()).kanbanCards.filter((c) => c.user_id !== 'demo-admin').map((c) => `${c.id}:${c.status}:${c.sort_order}`).sort().join('|')
  await mineCard.dragTo(column('doing').getByTestId('kanban-card').first())
  await page.waitForTimeout(600)
  const after = await store()
  const mineNow = after.kanbanCards.find((c) => c.description === '내 견적 검토')
  const othersSame = after.kanbanCards.filter((c) => c.user_id !== 'demo-admin').map((c) => `${c.id}:${c.status}:${c.sort_order}`).sort().join('|') === before
  const c2 = report.check({
    name: '팀원 카드는 읽기만, 내 카드는 팀원 카드 사이로 끌어 옮김',
    expected: '서지아 카드 draggable=false·메뉴 0, 내 카드 draggable=true·메뉴 1, 끌어 놓으면 내 카드만 Doing, 팀원 카드 그대로',
    actual: `서지아 ${jiaRO.drag}/${jiaRO.menu}, 나 ${mineRW.drag}/${mineRW.menu}, 내 카드 → ${mineNow.status}, 팀원 카드 그대로 ${othersSame}`,
    how: "draggable 속성, Options 버튼 수, 저장된 상태(내 카드 status 'doing', 다른 사람 카드 상태·순서 변화 없음)",
    pass: jiaRO.drag === 'false' && jiaRO.menu === 0 && mineRW.drag === 'true' && mineRW.menu === 1 && mineNow.status === 'doing' && othersSame,
  })

  // colours: 서지아 → 빨간색, on her name tag and the card's left line; Daily Log shows the same
  await bar().getByRole('button', { name: 'Color of 서지아' }).click()
  await page.getByLabel('Option menu').getByRole('button', { name: '빨간색', exact: true }).click()
  await page.mouse.click(1300, 820)
  await page.waitForTimeout(500)
  const line = await jiaCard.evaluate((e) => getComputedStyle(e).borderLeftColor)
  const tag = await jiaCard.getByTestId('card-person').evaluate((e) => getComputedStyle(e).backgroundColor)
  await page.goto(BASE + `/timesheets?date=${DAY}`)
  await page.getByTestId('team-panel').waitFor()
  const logDot = await page.getByTestId('team-panel').getByRole('button', { name: 'Color of 서지아' }).evaluate((e) => getComputedStyle(e).backgroundColor)
  const c3 = report.check({
    name: '사람에게 색 주기: 카드 왼쪽 줄·이름표, 팀원 창에도 같은 색',
    expected: `서지아 = 빨간색 ${RED}: 카드 왼쪽 줄 같은 색, 이름표는 연한 빨강, Daily Log 팀원 창 점도 ${RED}`,
    actual: `왼쪽 줄 ${line}, 이름표 ${tag}, 팀원 창 ${logDot}`,
    how: 'computed border-left-color / 팀원 창 색 점 background-color 비교, 이름표가 흰색·회색이 아님',
    pass: line === RED && logDot === RED && tag !== 'rgba(0, 0, 0, 0)' && tag !== 'rgb(255, 255, 255)',
  })

  // colour filter: only that colour's people; same colour → together; 전체 → everyone
  await toKanban()
  const filter = page.getByRole('group', { name: 'Color filter' })
  await filter.getByRole('button', { name: 'Show 서지아' }).click()
  await page.waitForTimeout(300)
  const onlyJia = await page.getByTestId('kanban-card').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.person))])
  await filter.getByRole('button', { name: 'Show everyone' }).click()
  await bar().getByRole('button', { name: 'Color of 윤도현' }).click()
  await page.getByLabel('Option menu').getByRole('button', { name: '빨간색', exact: true }).click()
  await page.mouse.click(1300, 820)
  await page.waitForTimeout(500)
  const chips = await filter.getByRole('button').allInnerTexts()
  await filter.getByRole('button', { name: 'Show 서지아, 윤도현' }).click()
  await page.waitForTimeout(300)
  const redOnly = await page.getByTestId('kanban-card').evaluateAll((els) => [...new Set(els.map((e) => e.dataset.person))].sort())
  const c4 = report.check({
    name: '색으로 보기: 그 색 사람의 카드만, 같은 색은 함께',
    expected: "서지아 색만 → 서지아 카드만; 윤도현도 빨강 → 색 칩 '서지아 · 윤도현' 하나, 누르면 두 사람 카드만(내 카드 없음)",
    actual: `서지아만 [${onlyJia.join(', ')}] · 칩 [${chips.join(' | ')}] · 빨강만 [${redOnly.join(', ')}]`,
    how: '보이는 카드의 data-person 집합, Color filter 버튼 글자',
    pass: onlyJia.join('|') === '서지아' && chips.includes('서지아 · 윤도현') && redOnly.join('|') === '서지아|윤도현',
  })
  await page.mouse.move(700, 700)
  await report.shot(page, { caption: '빨강(서지아·윤도현)만 보기', marks: [{ target: filter, n: c4, label: '색으로 보기' }, { target: column('wait'), n: c3, label: '사람 색' }] })

  // remembered after reload; clearing shows only my cards again
  await page.reload()
  await page.getByTestId('kanban-board').waitFor()
  await page.waitForTimeout(600)
  const kept = { checked: await bar().locator('input:checked').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label'))), line: await column('wait').locator('[data-person="서지아"]').first().evaluate((e) => getComputedStyle(e).borderLeftColor) }
  await bar().getByRole('button', { name: '모두 해제' }).click()
  await page.waitForTimeout(500)
  const alone = { cards: await page.getByTestId('kanban-card').count(), tags: await page.getByTestId('card-person').count(), filter: await page.getByRole('group', { name: 'Color filter' }).count() }
  const c5 = report.check({
    name: '새로 고쳐도 체크·색 그대로, 모두 해제하면 내 카드만',
    expected: `체크 [서지아, 윤도현], 서지아 줄 ${RED}; 해제 후 카드 1장(내 것), 이름표 0, 색 필터 없음`,
    actual: `체크 [${kept.checked.join(', ')}], 줄 ${kept.line}; 해제 후 카드 ${alone.cards}, 이름표 ${alone.tags}, 색 필터 ${alone.filter}`,
    how: 'checked 체크박스 이름, border-left-color, 해제 후 kanban-card 1 · card-person 0 · Color filter 0',
    pass: kept.checked.join('|') === '서지아|윤도현' && kept.line === RED && alone.cards === 1 && alone.tags === 0 && alone.filter === 0,
  })
  await report.shot(page, { caption: '모두 해제: 내 보드만', marks: [{ target: bar(), n: c5, label: '모두 해제' }] })

  // L1 with nobody to read: no team row (as before)
  await page.goto(BASE + '/settings')
  await page.getByLabel('Demo role').selectOption('l1')
  await page.waitForTimeout(300)
  await toKanban()
  report.check({ name: '볼 사람이 없으면(L1) 팀원 줄 없음', expected: '0개', actual: `${await bar().count()}개`, how: 'kanban-team 수 === 0', pass: (await bar().count()) === 0 })

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건${errors.length ? ': ' + errors.join(' | ') : ''}`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchT: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
