// 2026-11-26 (3): column names Project / Type / Task, a line after the row + column, the repeated-task
// menu shows Project · Type, and repeated tasks as a numbered table in a docking window.
// REPORT=1 writes docs/test-reports/<date>-templates-table/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'templates-table',
  title: '반복 업무 표 · 칸 이름 Project/Type/Task · + 칸 줄',
  suite: 'tests/e2e/batchN.e2e.cjs',
  request:
    '칸 이름을 Project / Type / Task로(한국어 프로젝트 / 유형 / 업무). 행 앞 + 옆에 세로 줄. 반복 업무 … 메뉴 맨 위에 Project · Type. 반복 업무를 표로, 오른쪽 도킹 창에, 번호는 1부터, 끌기와 No 더블클릭으로 순서 변경. (추가 요청) 표에는 No와 Task만, Project · Type은 … 메뉴에서만.',
  criteria: [
    '표 머리글이 Time · Project · Type · Task · Content(한국어: 시간 · 프로젝트 · 유형 · 업무 · 업무내용).',
    '+ 칸 오른쪽에 다른 칸 사이와 같은 세로 줄이 머리글부터 모든 행에 있다.',
    '반복 업무는 No · Task 두 칸 표로 간단히 보이고(Project · Type은 … 메뉴에서) No는 1부터.',
    '행을 누르면 고른 칸에 그 반복 업무가 들어간다.',
    '행을 끌거나 No를 더블클릭해 번호를 입력하면 그 자리로 옮겨지고, 새로 고쳐도 유지된다.',
    '… 메뉴 맨 윗줄에 그 반복 업무의 Project · Type이 보인다.',
    '반복 업무 창은 Today처럼 떼어 낼 수 있고 오른쪽에 다시 붙는다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  report.env(`Chromium ${browser.version()}`, '1440×900')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const text = async (i, col) => (await cell(i, col).innerText()).trim()
  const paste = async (i, col, tsv) => {
    await cell(i, col).click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(250)
  }
  const headRow = page.locator('[role=grid] > div').first()
  const panel = page.getByTestId('templates-panel')
  const rows = page.getByTestId('template-row')
  const tasks = async () => (await rows.locator('td:nth-child(2)').allInnerTexts()).map((t) => t.trim())
  const nos = async () => (await rows.locator('td:nth-child(1)').allInnerTexts()).map((t) => t.trim())

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await page.mouse.move(700, 400)

  // ── C1 column names ──────────────────────────────────────────────────────
  const head = (await headRow.innerText()).split('\n').map((t) => t.trim()).filter(Boolean)
  const c1 = report.check({ name: '머리글: Project · Type · Task', expected: 'Time|Project|Type|Task|Content', actual: head.join('|'), how: "머리글 텍스트 === 'Time|Project|Type|Task|Content'", pass: head.join('|') === 'Time|Project|Type|Task|Content' })

  // ── C2 line after the + column ───────────────────────────────────────────
  const lines = await page.evaluate(() => {
    const head = document.querySelector('[role=grid] > div > div')
    const gutters = [head, ...document.querySelectorAll('[data-row-add]')]
    return gutters.map((el) => { const s = getComputedStyle(el); return `${s.borderRightWidth} ${s.borderRightStyle}` })
  })
  const cellLine = await cell(18, 'category').evaluate((el) => { const s = getComputedStyle(el); return `${s.borderLeftWidth} ${s.borderLeftStyle}` })
  const allLined = lines.length > 10 && lines.every((l) => l === cellLine)
  const c2 = report.check({ name: '+ 칸 오른쪽 세로 줄(머리글과 모든 행)', expected: `${lines.length}곳 모두 다른 칸 사이 줄과 같음 (${cellLine})`, actual: allLined ? `${lines.length}곳 모두 '${cellLine}'` : `다름: ${[...new Set(lines)].join(', ')}`, how: '머리글·각 행의 + 칸 border-right === 다른 칸 border-left', pass: allLined })

  // three repeated tasks from the + button
  await paste(18, 'category', '회의\t회의-INT\t주간 회의')
  await paste(19, 'category', '설계\t개발-신규\t도면 검토')
  await paste(20, 'category', '품질\t지원-8D\t8D 보고')
  await page.mouse.click(5, 5)
  for (const [slot, time] of [[18, '09:00'], [19, '09:30'], [20, '10:00']]) {
    await page.locator(`[data-slot="${slot}"]`).hover()
    await page.getByRole('button', { name: `Add ${time} to repeated tasks` }).click()
    await page.getByText('반복 업무에 추가:', { exact: false }).last().waitFor()
  }
  await rows.nth(2).waitFor()
  await page.mouse.move(700, 120)
  await report.shot(page, {
    caption: '새 칸 이름, + 칸 줄, 반복 업무 표',
    marks: [
      { target: headRow, n: c1, label: 'Project · Type · Task' },
      { target: page.locator('[data-slot="18"] [data-row-add]'), n: c2, label: '+ 칸 줄' },
    ],
  })

  // ── C4 table ─────────────────────────────────────────────────────────────
  const th = (await panel.locator('thead th').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
  const first = (await rows.first().locator('td').allInnerTexts()).map((t) => t.trim())
  const c3 = report.check({
    name: '반복 업무가 No · Task 두 칸 표로, No는 1부터',
    expected: "머리글 No|Task, 1번 행 '1 · 주간 회의', No 1,2,3",
    actual: `머리글 ${th.join('|')}, 1번 행 '${first.slice(0, 2).join(' · ')}', No ${(await nos()).join(',')}`,
    how: "thead === 'No|Task' && row1 = ['1','주간 회의'] && No === 1,2,3",
    pass: th.join('|') === 'No|Task' && first.slice(0, 2).join('|') === '1|주간 회의' && (await nos()).join(',') === '1,2,3',
  })
  await report.shot(page, { caption: '반복 업무 표(오른쪽 도킹 창)', marks: [{ target: panel.locator('table'), n: c3, label: 'No · Task' }] })

  // click applies to the selected cells
  await cell(24, 'category').click()
  await rows.nth(1).locator('td').nth(1).click()
  await cell(24, 'task').filter({ hasText: '도면 검토' }).waitFor()
  // ⚠ = the existing "not mapped to a project yet" mark in front of a free-text label
  const applied = [(await text(24, 'category')).replace(/^⚠\s*/, ''), await text(24, 'mid'), await text(24, 'task')]
  const c4 = report.check({ name: '행을 누르면 고른 칸에 적용', expected: "12:00 행 '설계 · 개발-신규 · 도면 검토'", actual: `'${applied.join(' · ')}'`, how: "12:00 행 Project·Type·Task === 2번 반복 업무", pass: applied.join('|') === '설계|개발-신규|도면 검토' })
  await report.shot(page, { caption: '2번 반복 업무를 12:00 행에 적용', marks: [{ target: page.locator('[data-slot="24"]'), n: c4, label: '적용됨' }, { target: rows.nth(1), n: c4, label: '누른 행' }] })

  // drag the 3rd row to the top
  const from = await rows.nth(2).boundingBox()
  const to = await rows.nth(0).boundingBox()
  await page.mouse.move(from.x + from.width * 0.6, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width * 0.6, to.y + to.height / 2 - 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(() => document.querySelector('[data-testid="template-row"] td:nth-child(2)')?.textContent.includes('8D 보고'))
  const afterDrag = await tasks()
  const c5 = report.check({ name: '행을 끌어 맨 위로', expected: '8D 보고 · 주간 회의 · 도면 검토', actual: afterDrag.join(' · '), how: "Task 순서 === ['8D 보고','주간 회의','도면 검토']", pass: afterDrag.join('|') === '8D 보고|주간 회의|도면 검토' })

  // double-click No and type a number
  await rows.nth(2).locator('td').first().dblclick()
  const noInput = page.getByLabel('No of 도면 검토')
  await noInput.fill('1')
  await noInput.press('Enter')
  await page.waitForFunction(() => document.querySelector('[data-testid="template-row"] td:nth-child(2)')?.textContent.includes('도면 검토'))
  const afterNo = await tasks()
  const c6 = report.check({ name: 'No를 더블클릭해 1을 입력하면 1번으로', expected: '도면 검토 · 8D 보고 · 주간 회의', actual: afterNo.join(' · '), how: "Task 순서 === ['도면 검토','8D 보고','주간 회의']", pass: afterNo.join('|') === '도면 검토|8D 보고|주간 회의' })
  await page.reload()
  await rows.nth(2).waitFor()
  const afterReload = await tasks()
  report.check({ name: '새로 고쳐도 순서 유지', expected: '도면 검토 · 8D 보고 · 주간 회의', actual: afterReload.join(' · '), how: '새로 고친 뒤 Task 순서가 같음', pass: afterReload.join('|') === '도면 검토|8D 보고|주간 회의' })
  await page.mouse.move(700, 120)
  await report.shot(page, { caption: '순서를 바꾼 뒤(새로 고침 후)', marks: [{ target: rows.first().locator('td').first(), n: c6, label: 'No 1' }, { target: rows.nth(1), n: c5, label: '끌어 올린 행' }] })

  // ── C3 menu header ───────────────────────────────────────────────────────
  await rows.nth(1).getByRole('button', { name: 'Options for 8D 보고' }).click()
  const ctxLine = page.getByTestId('option-context')
  const ctxText = (await ctxLine.innerText()).replace(/\s+/g, ' ').trim()
  const nameVal = await page.getByLabel('Option name').inputValue()
  const c7 = report.check({ name: '… 메뉴 맨 위에 Project · Type', expected: "'품질 · 지원-8D', 그 아래 이름 '8D 보고'", actual: `'${ctxText}', 이름 '${nameVal}'`, how: "option-context === '품질 · 지원-8D' && 이름 칸 === '8D 보고'", pass: ctxText === '품질 · 지원-8D' && nameVal === '8D 보고' })
  await report.shot(page, { caption: '반복 업무 … 메뉴', marks: [{ target: ctxLine, n: c7, label: 'Project · Type' }] })
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  // ── docking window ───────────────────────────────────────────────────────
  const docked0 = await panel.getAttribute('data-docked')
  const h = await page.getByTestId('templates-panel-handle').boundingBox()
  await page.mouse.move(h.x + 60, h.y + 10)
  await page.mouse.down()
  await page.mouse.move(520, 300, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  const floatRows = await rows.count()
  const c8 = report.check({ name: '반복 업무 창을 떼어 내면 떠서 표를 보여 줌', expected: "처음 'true' → 'false', 표 3행", actual: `'${docked0}' → '${await panel.getAttribute('data-docked')}', 표 ${floatRows}행`, how: "docked 'true' → 'false' && 행 수 === 3", pass: docked0 === 'true' && (await panel.getAttribute('data-docked')) === 'false' && floatRows === 3 })
  await report.shot(page, { caption: '떼어 낸 반복 업무 창', marks: [{ target: panel, n: c8, label: '떠 있는 창' }] })
  const h2 = await page.getByTestId('templates-panel-handle').boundingBox()
  await page.mouse.move(h2.x + 60, h2.y + 10)
  await page.mouse.down()
  await page.mouse.move(1440 - 30, 400, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  report.check({ name: '오른쪽 끝에 놓으면 다시 붙음', expected: "data-docked = 'true'", actual: `'${await panel.getAttribute('data-docked')}'`, how: "panel.dataset.docked === 'true'", pass: (await panel.getAttribute('data-docked')) === 'true' })

  // ── Korean names ─────────────────────────────────────────────────────────
  await page.goto(BASE + '/settings')
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('한국어').check()
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await rows.first().waitFor()
  const headKo = (await headRow.innerText()).split('\n').map((t) => t.trim()).filter(Boolean)
  const thKo = (await panel.locator('thead th').allInnerTexts()).map((t) => t.trim()).filter(Boolean)
  const c10 = report.check({ name: '한국어 이름: 프로젝트 · 유형 · 업무', expected: '머리글 시간|프로젝트|유형|업무|업무내용, 반복 업무 No|업무', actual: `머리글 ${headKo.join('|')}, 반복 업무 ${thKo.join('|')}`, how: '두 머리글 텍스트가 기대와 같음', pass: headKo.join('|') === '시간|프로젝트|유형|업무|업무내용' && thKo.join('|') === 'No|업무' })
  await page.mouse.move(700, 120)
  await report.shot(page, { caption: '한국어 화면', marks: [{ target: headRow, n: c10, label: '프로젝트 · 유형 · 업무' }, { target: panel.locator('thead'), n: c10 }] })
  await page.goto(BASE + '/settings')
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('English').check()

  // phones keep applying repeated tasks from the entry sheet
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await phone.goto(BASE + '/timesheets?date=2026-11-16')
  await phone.getByRole('navigation', { name: 'Mobile navigation' }).waitFor()
  report.check({ name: '휴대폰에는 반복 업무 창 없음(입력 창에서 고름)', expected: '창 안 보임', actual: (await phone.getByTestId('templates-panel').isVisible()) ? '보임' : '안 보임', how: '!templates-panel.isVisible()', pass: !(await phone.getByTestId('templates-panel').isVisible()) })
  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchN: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
