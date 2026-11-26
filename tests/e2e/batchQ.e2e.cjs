// 2026-11-26 (8): Quick add preset slots (4, e.g. one per quarter) and a tighter No column in the
// grid dropdowns. REPORT=1 writes docs/test-reports/<date>-quick-slots/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'quick-slots',
  title: 'Quick add 프리셋 슬롯 4개 · 드롭다운 번호 간격',
  suite: 'tests/e2e/batchQ.e2e.cjs',
  request:
    'Quick add에 프리셋 슬롯 4개: 분기·시즌마다 저장해 두고 쓰다가 과거 업무가 돌아오면 그 슬롯으로 돌아가 쓰기. 드롭다운의 손잡이와 번호 사이 간격 줄이기.',
  criteria: [
    'Quick add 창에 슬롯 탭 4개(기본 이름 1Q·2Q·3Q·4Q, 항목 수 표시), 하나만 사용 중.',
    '사용 중인 슬롯의 항목만 표·Task 드롭다운·휴대폰 입력 창에 보이고, 새로 저장하면 그 슬롯에 들어간다.',
    '슬롯을 바꾸면 그 슬롯의 항목으로 바뀌고, 다시 돌아오면 예전 항목 그대로.',
    '같은 업무를 다른 슬롯에도 저장할 수 있다.',
    '슬롯은 더블클릭해서 이름을 붙일 수 있고(예: 2026 Q1), 사용 중인 슬롯과 이름은 사람마다 저장된다.',
    '드롭다운의 번호 칸은 가장 긴 번호만큼만 넓어서 손잡이와 번호 사이가 붙어 있다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  report.env(`Chromium ${browser.version()}`, '1440×900 (휴대폰 390×844)')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const paste = async (i, tsv) => {
    await cell(i, 'category').click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(250)
  }
  const quick = page.getByTestId('templates-panel')
  const tabs = page.getByTestId('quick-slots')
  const tab = (n) => tabs.getByRole('tab', { name: new RegExp(`^Preset ${n}\\b`) })
  const rowTasks = async () => (await quick.getByTestId('template-row').locator('td:nth-child(2)').allInnerTexts()).map((t) => t.trim())
  const addRow = async (slot, time) => {
    await page.locator(`[data-slot="${slot}"]`).hover()
    await page.getByRole('button', { name: `Add ${time} to quick tasks` }).click()
    await page.waitForTimeout(300)
  }
  const taskOptions = async (slot) => {
    await cell(slot, 'task').click()
    await page.keyboard.press('Enter')
    await page.locator('[data-drop]').waitFor()
    const list = (await page.locator('[data-drop]').getByRole('option').allInnerTexts()).map((t) => t.trim())
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    return list
  }
  const away = async () => {
    await page.mouse.move(700, 120)
    await page.waitForTimeout(900)
  }

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await tabs.waitFor()
  const tabCount = await tabs.getByRole('tab').count()
  const sel0 = await tab(1).getAttribute('aria-selected')
  const names = (await tabs.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim().split(' ')[0])
  const c1 = report.check({ name: 'Quick add에 슬롯 탭 4개(1Q~4Q), 1Q 사용 중', expected: "탭 1Q|2Q|3Q|4Q, 1Q 선택됨", actual: `탭 ${names.join('|')}, 1Q ${sel0 === 'true' ? '선택됨' : '선택 안 됨'}`, how: "tab names === 1Q..4Q && tab1 aria-selected === 'true'", pass: tabCount === 4 && names.join('|') === '1Q|2Q|3Q|4Q' && sel0 === 'true' })

  // slot 1: two items
  await paste(18, '회의\t회의-INT\t주간 회의')
  await paste(19, '설계\t개발-신규\t도면 검토')
  await paste(20, '품질\t지원-8D\t8D 보고')
  await page.mouse.click(5, 5)
  await addRow(18, '09:00')
  await addRow(19, '09:30')
  const slot1 = await rowTasks()

  // slot 2: empty, then its own item
  await tab(2).click()
  await page.waitForTimeout(300)
  const emptyNote = (await quick.innerText()).includes('이 프리셋은 비어 있습니다')
  const emptyRows = await quick.getByTestId('template-row').count()
  await addRow(20, '10:00')
  const slot2 = await rowTasks()
  const opts2 = await taskOptions(22)
  const counts = (await tabs.getByRole('tab').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
  const c2 = report.check({
    name: '슬롯마다 따로: 슬롯 2는 빈 채로 시작, 새 항목은 슬롯 2에, Task 드롭다운도 슬롯 2만',
    expected: "슬롯 1 '주간 회의, 도면 검토' / 슬롯 2 처음 0개(안내 문구) → '8D 보고' / 드롭다운에 8D 보고만 / 탭 숫자 2·1",
    actual: `슬롯 1 '${slot1.join(', ')}' / 슬롯 2 처음 ${emptyRows}개${emptyNote ? '(안내)' : ''} → '${slot2.join(', ')}' / 드롭다운 ${opts2.filter((o) => /주간 회의|도면 검토|8D 보고/.test(o)).join(', ')} / 탭 ${counts.join(' | ')}`,
    how: 'slot2 rows === [8D 보고] && 드롭다운에 slot1 항목 없음 && 탭 숫자',
    pass:
      slot1.join('|') === '주간 회의|도면 검토' &&
      emptyRows === 0 &&
      emptyNote &&
      slot2.join('|') === '8D 보고' &&
      opts2.some((o) => o.includes('8D 보고')) &&
      !opts2.some((o) => /주간 회의|도면 검토/.test(o)) &&
      counts[0].endsWith('2') &&
      counts[1].endsWith('1'),
  })
  await away()
  await report.shot(page, { caption: '슬롯 2를 쓰는 중: 슬롯 2의 항목만', marks: [{ target: tabs, n: c1, label: '슬롯 4개' }, { target: quick.getByTestId('template-row').first(), n: c2, label: '슬롯 2의 항목' }] })

  // the same task in another slot
  await addRow(18, '09:00')
  const both = await rowTasks()
  report.check({ name: '같은 업무를 다른 슬롯에도 저장', expected: "슬롯 2에 '주간 회의' 추가(슬롯 1에도 있음)", actual: `슬롯 2: ${both.join(', ')}`, how: "slot2 rows 에 '주간 회의'", pass: both.includes('주간 회의') && both.includes('8D 보고') })

  // name slot 2, reload: the slot in use and its name stay
  await tab(2).dblclick()
  await page.getByLabel('Name of preset 2').fill('2026 Q1')
  await page.getByLabel('Name of preset 2').press('Enter')
  await page.reload()
  await tabs.waitFor()
  const named = (await tab(2).innerText()).replace(/\s+/g, ' ').trim()
  const stillActive = await tab(2).getAttribute('aria-selected')
  const whole = await tab(2).locator('.te-clip').evaluate((el) => el.scrollWidth <= el.clientWidth)
  const c4 = report.check({ name: '더블클릭해서 이름 붙이기, 새로 고쳐도 슬롯·이름 유지', expected: "탭 '2026 Q1', 선택된 채, 이름 전체 보임", actual: `탭 '${named}', ${stillActive === 'true' ? '선택됨' : '선택 안 됨'}, 이름 ${whole ? '전체 보임' : '잘림'}`, how: "tab2 text 에 '2026 Q1' && aria-selected && 사용 중인 탭 이름이 잘리지 않음", pass: named.startsWith('2026 Q1') && stillActive === 'true' && whole })
  await away()
  await report.shot(page, { caption: "이름을 붙인 슬롯 '2026 Q1'", marks: [{ target: tab(2), n: c4, label: '이름' }] })

  // back to slot 1: the old items are there
  await tab(1).click()
  await page.waitForTimeout(300)
  const back = await rowTasks()
  report.check({ name: '슬롯 1로 돌아가면 예전 항목 그대로', expected: '주간 회의, 도면 검토', actual: back.join(', '), how: "rows === ['주간 회의','도면 검토']", pass: back.join('|') === '주간 회의|도면 검토' })

  // phones: the entry sheet shows the slot in use
  // a phone with this browser's demo data (quick-add items and slots live in it)
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })
  const phone = await phoneCtx.newPage()
  await phone.goto(BASE + '/timesheets?date=2026-11-16')
  await phone.locator('[role="listitem"][data-slot="26"]').tap()
  await phone.getByRole('dialog', { name: '30-min entry' }).getByTestId('sheet-templates').waitFor()
  const chips = (await phone.getByTestId('sheet-templates').getByRole('button').allInnerTexts()).map((t) => t.trim())
  report.check({ name: '휴대폰 입력 창도 사용 중인 슬롯의 항목만', expected: '주간 회의, 도면 검토', actual: chips.join(', '), how: "sheet-templates === ['주간 회의','도면 검토']", pass: chips.join('|') === '주간 회의|도면 검토' })
  await phone.close()

  // ── dropdown No column ───────────────────────────────────────────────────
  await cell(22, 'category').click()
  await page.keyboard.press('Enter')
  const drop = page.locator('[data-drop]')
  await drop.waitFor()
  const firstOpt = drop.getByRole('option').filter({ has: page.locator('span.font-mono') }).first()
  const gap = await firstOpt.evaluate((el) => {
    const grip = el.querySelector('[aria-label^="Drag "]').getBoundingClientRect()
    const no = el.querySelector('span.font-mono')
    const range = document.createRange()
    range.selectNodeContents(no)
    const text = range.getBoundingClientRect()
    const nums = [...el.closest('[role="listbox"]').querySelectorAll('span.font-mono')].map((s) => s.textContent.length)
    return { gap: Math.round(text.left - grip.right), width: Math.round(no.getBoundingClientRect().width), digits: Math.max(...nums), first: no.textContent }
  })
  const c7 = report.check({
    name: '드롭다운 번호 칸이 가장 긴 번호만큼만: 손잡이와 번호 사이가 좁음',
    expected: `번호 칸 폭 ≈ ${gap.digits}글자(예전 24px 고정), 손잡이~번호 간격 ≤ 16px`,
    actual: `번호 칸 ${gap.width}px, ${gap.first}번 앞 간격 ${gap.gap}px`,
    how: 'width < 24 (2자리 이하일 때) && text.left − grip.right ≤ 16',
    pass: gap.gap <= 16 && (gap.digits > 2 || gap.width < 24),
  })
  await report.shot(page, { caption: 'Project 드롭다운: 손잡이 바로 옆에 번호', marks: [{ target: firstOpt, n: c7, label: '간격 좁힘' }] })
  await page.keyboard.press('Escape')

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchQ: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
