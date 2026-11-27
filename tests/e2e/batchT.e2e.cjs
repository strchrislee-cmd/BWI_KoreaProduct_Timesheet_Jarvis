// 2026-11-27 (16): teammates on the Daily Kanban, Figma-like. Check people you may read: their cards
// show only while Doing, and the same task Doing for several people is one block with their avatars;
// moving the replay slider moves the avatars between blocks. People get colours; the colour chips show
// only the people of a colour. REPORT=1 writes docs/test-reports/<date>-kanban-team/ (see report.cjs).
// Demo mode, made-up teammates (they logged the day; their last task is Doing).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'
// 빨간색 #D44C47 (not anyone's default colour in the demo team, so the change shows)
const RED = 'rgb(212, 76, 71)'

const report = createReport({
  id: 'kanban-team',
  title: 'Daily Kanban 팀원 보기 (Doing + 아바타) + 사람별 색',
  suite: 'tests/e2e/batchT.e2e.cjs',
  request:
    'Kanban에 있는 내용이 Doing으로 옮겨가고, 그 블록에 Figma 공동작업 UI처럼 사용자 아이콘이 붙게. 원하는 사용자를 다 체크해 두면 시간에 따라 어떤 Doing이 이루어지는지 볼 수 있게. (결정) 팀원 카드는 Doing일 때만, 같은 업무는 한 블록에 아이콘 여러 개.',
  criteria: [
    'Daily Kanban 위 팀원 체크(볼 수 있는 사람만). 체크한 팀원은 Doing인 업무만 보이고, 블록에 그 사람 아이콘(이니셜 원, 그 사람 색).',
    '같은 업무(Project · Type · Task)를 여러 사람이 Doing 중이면 한 블록에 아이콘이 여럿. 내 카드는 끌기·… 메뉴 그대로, 팀원만의 블록은 읽기만.',
    '되감기 슬라이더를 옮기면 아이콘이 그 시간에 Doing이던 블록으로 옮겨 간다.',
    '사람마다 색(나에게만 적용), 색으로 보기로 그 색 사람만. 체크와 색은 새로 고쳐도 그대로, 모두 해제하면 내 카드만.',
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
  const blocks = (s) => column(s).getByTestId('kanban-card').evaluateAll((els) => els.map((e) => `${e.querySelector('span')?.textContent?.trim()}@${e.dataset.people ?? ''}`))
  const toKanban = async () => {
    await page.goto(BASE + `/timesheets/kanban?date=${DAY}`)
    await page.getByTestId('kanban-board').waitFor()
    await page.waitForTimeout(500)
  }
  const replayAt = async (slot) => {
    await page.getByLabel('Replay time').fill(String(slot - 15))
    await page.waitForTimeout(250)
  }

  await page.goto(BASE + `/timesheets/org?date=${DAY}`)
  await page.getByRole('button', { name: '데모 팀원 만들기' }).click()
  await page.waitForTimeout(400)
  await toKanban()
  const people = await bar().locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  await box('서지아').check()
  await box('윤도현').check()
  await page.waitForTimeout(700)
  const first = { doing: await blocks('doing'), wait: await blocks('wait'), avatars: await column('doing').getByTestId('avatar').evaluateAll((els) => els.map((e) => e.textContent)) }
  const c1 = report.check({
    name: '체크한 팀원은 Doing인 업무만, 블록에 그 사람 아이콘',
    expected: '체크 목록 5명, Doing: 부품 리스트 정리(서지아)·3D 모델링(윤도현), Wait에 팀원 카드 없음, 아이콘 글자 서·윤',
    actual: `목록 [${people}] · Doing [${first.doing}] · Wait [${first.wait}] · 아이콘 [${first.avatars}]`,
    how: 'kanban-team 체크박스, Doing 칸 블록의 data-people, Wait 칸, avatar 글자',
    pass: people.length === 5 && first.doing.join('|') === '부품 리스트 정리@서지아|3D 모델링@윤도현' && first.wait.length === 0 && first.avatars.join('|') === '서|윤',
  })

  // my card on the same task as 윤도현 → one block with both avatars
  await page.getByRole('button', { name: '카드 추가' }).click()
  const form = page.getByRole('form', { name: 'New card' })
  await form.getByLabel('Task').fill('3D 모델링')
  const general = await page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')).projects.find((p) => p.system_key === 'general').id)
  await form.getByLabel('Project').selectOption(general)
  await form.getByRole('button', { name: '추가' }).click()
  await page.waitForTimeout(400)
  const mineNew = column('backlog').getByTestId('kanban-card').filter({ hasText: '3D 모델링' })
  await mineNew.getByRole('button', { name: 'Options for 3D 모델링' }).click()
  await page.getByRole('menu', { name: 'Card menu' }).getByRole('menuitem', { name: '→ Doing', exact: true }).click()
  await page.waitForTimeout(600)
  const merged = column('doing').locator('[data-testid="kanban-card"]').filter({ hasText: '3D 모델링' })
  const theirs = column('doing').locator('[data-testid="kanban-card"]').filter({ hasText: '부품 리스트 정리' })
  const m = {
    count: await merged.count(),
    people: await merged.getAttribute('data-people'),
    avatars: await merged.getByTestId('avatar').evaluateAll((els) => els.map((e) => e.textContent)),
    mineDrag: await merged.getAttribute('draggable'),
    mineMenu: await merged.getByRole('button', { name: /^Options for/ }).count(),
    theirDrag: await theirs.getAttribute('draggable'),
    theirMenu: await theirs.getByRole('button', { name: /^Options for/ }).count(),
  }
  const c2 = report.check({
    name: '같은 업무를 여러 사람이 Doing → 한 블록에 아이콘 여럿',
    expected: "Doing의 '3D 모델링' 블록 1개, 아이콘 [나, 윤], 내 카드라 끌기·메뉴 있음; '부품 리스트 정리'(서지아만)는 끌기·메뉴 없음",
    actual: `블록 ${m.count}개, 사람 '${m.people}', 아이콘 [${m.avatars}], 내 블록 draggable=${m.mineDrag}·메뉴 ${m.mineMenu}, 서지아 블록 draggable=${m.theirDrag}·메뉴 ${m.theirMenu}`,
    how: "data-people, avatar 글자, draggable, Options 버튼 수",
    pass: m.count === 1 && m.people === '나,윤도현' && m.avatars.join('|') === '나|윤' && m.mineDrag === 'true' && m.mineMenu === 1 && m.theirDrag === 'false' && m.theirMenu === 0,
  })
  await page.mouse.move(700, 880)
  await report.shot(page, { caption: "같은 업무 '3D 모델링'을 나와 윤도현이 Doing → 한 블록에 아이콘 둘 (Figma처럼)", marks: [{ target: merged, n: c2, label: '아이콘 둘' }, { target: theirs, n: c1, label: '팀원 Doing' }] })

  // replay: avatars move to the block each person was Doing then
  await replayAt(22)
  const at1100 = await blocks('doing')
  await replayAt(26)
  const at1300 = await blocks('doing')
  const c3 = report.check({
    name: '슬라이더를 옮기면 아이콘이 그 시간의 Doing 블록으로',
    expected: "11:00: 3D 모델링@나 · 시험 지원@서지아 · 설계 회의@윤도현 / 13:00: 3D 모델링@나,윤도현 · 부품 리스트 정리@서지아",
    actual: `11:00 [${at1100}] / 13:00 [${at1300}]`,
    how: '되감은 Doing 칸의 블록과 data-people',
    pass: at1100.join('|') === '3D 모델링@나|시험 지원@서지아|설계 회의@윤도현' && at1300.join('|') === '3D 모델링@나,윤도현|부품 리스트 정리@서지아',
  })
  await page.mouse.move(700, 880)
  await report.shot(page, { caption: '11:00으로 되감기: 윤도현 아이콘은 설계 회의, 서지아는 시험 지원 블록에', marks: [{ target: column('doing'), n: c3, label: '11:00의 Doing' }] })
  await page.getByRole('button', { name: '지금으로' }).click()
  await page.waitForTimeout(300)

  // colours: 서지아 → 빨간색 on her avatar; Daily Log Team window shows the same
  await bar().getByRole('button', { name: 'Color of 서지아' }).click()
  await page.getByLabel('Option menu').getByRole('button', { name: '빨간색', exact: true }).click()
  await page.mouse.click(1300, 860)
  await page.waitForTimeout(500)
  const avatarColor = await theirs.getByTestId('avatar').evaluate((e) => getComputedStyle(e).backgroundColor)
  await page.goto(BASE + `/timesheets?date=${DAY}`)
  await page.getByTestId('team-panel').waitFor()
  const logDot = await page.getByTestId('team-panel').getByRole('button', { name: 'Color of 서지아' }).evaluate((e) => getComputedStyle(e).backgroundColor)
  // colour filter: only 서지아
  await toKanban()
  await page.getByRole('group', { name: 'Color filter' }).getByRole('button', { name: 'Show 서지아' }).click()
  await page.waitForTimeout(300)
  const onlyJia = await page.getByTestId('kanban-card').evaluateAll((els) => els.map((e) => e.dataset.people))
  await page.getByRole('group', { name: 'Color filter' }).getByRole('button', { name: 'Show everyone' }).click()
  const c4 = report.check({
    name: '사람 색(아이콘·팀원 창 같은 색), 색으로 보기',
    expected: `서지아 아이콘 ${RED}, Daily Log 팀원 창 점도 ${RED}; 서지아 색만 → 서지아 블록만(내 카드도 숨김)`,
    actual: `아이콘 ${avatarColor}, 팀원 창 ${logDot}, 서지아만 [${onlyJia}]`,
    how: 'avatar / 색 점 background-color, 색 필터 후 블록의 data-people',
    pass: avatarColor === RED && logDot === RED && onlyJia.length > 0 && onlyJia.every((p) => p === '서지아'),
  })

  // remembered after reload; clearing shows only my cards, without avatars
  await page.reload()
  await page.getByTestId('kanban-board').waitFor()
  await page.waitForTimeout(500)
  const kept = await bar().locator('input:checked').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  await bar().getByRole('button', { name: '모두 해제' }).click()
  await page.waitForTimeout(400)
  const alone = { cards: await page.getByTestId('kanban-card').count(), avatars: await page.getByTestId('avatar').count() }
  report.check({
    name: '새로 고쳐도 체크 그대로, 모두 해제하면 내 카드만',
    expected: '체크 [서지아, 윤도현]; 해제 후 내 카드 1장(3D 모델링), 아이콘 0',
    actual: `체크 [${kept}]; 카드 ${alone.cards}, 아이콘 ${alone.avatars}`,
    how: 'checked 체크박스, kanban-card / avatar 수',
    pass: kept.join('|') === '서지아|윤도현' && alone.cards === 1 && alone.avatars === 0,
  })

  // L1 with nobody to read: no team row
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
