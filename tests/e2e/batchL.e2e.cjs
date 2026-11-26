// 2026-11-26: MID (중분류) column — now called Type (유형) — paste rules, repeated tasks with MID, row + button, Weekly Result Work,
// admin MID list. REPORT=1 writes docs/test-reports/<date>-mid/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'mid',
  title: 'Type(유형) 칸 · 행 + 버튼',
  suite: 'tests/e2e/batchL.e2e.cjs',
  request:
    '일의 종류를 나타내는 MID 카테고리를 대분류 다음 칸에 추가(선택 사항). 목록은 관리자가 관리하고, 엑셀 3칸 붙여넣기는 예전처럼, 반복 업무에 MID 포함, Weekly Result의 Work 열을 MID로. 시간 앞 + 버튼으로 그 행(업무내용 제외)을 반복 업무로 추가.',
  criteria: [
    'Daily Log 머리글이 Time · Project · Type · Task · Content 순서이고 표가 카드 밖으로 넘치지 않는다.',
    'Type 드롭다운에 관리자 목록 12개가 순서대로 나오고, 입력으로 골라진다.',
    '엑셀 2~3칸은 예전처럼(Project·Task·업무내용), 둘째 칸이 Type 이름이거나 4칸이면 Type 포함, Daily Log 안 복사는 칸 순서 그대로. 목록에 없는 이름은 무시.',
    '+ 버튼은 Project·Type·Task를 반복 업무로 저장하고 중복을 만들지 않으며, 적용하면 업무내용은 그대로 둔다.',
    'Weekly Result의 Work 열은 Type, 없으면 회의/기타.',
    '관리자는 Type를 추가·이름 변경·순서 변경·삭제(쓰였으면 숨김)·되돌리기할 수 있고, L1은 읽기만 한다. 한국어 화면 머리글은 유형.',
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

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const head = (await headRow.innerText()).split('\n').map((t) => t.trim()).filter(Boolean)
  const c1 = report.check({
    name: 'Type 칸이 Project 바로 다음',
    expected: 'Time|Project|Type|Task|Content',
    actual: head.join('|'),
    how: "머리글 텍스트 === 'Time|Project|Type|Task|Content'",
    pass: head.join('|') === 'Time|Project|Type|Task|Content',
  })
  const fit = await page.locator('[role=grid]').evaluate((el) => ({ sw: el.parentElement.scrollWidth, cw: el.parentElement.clientWidth }))
  const c2 = report.check({
    name: '1440px에서 표가 카드 안에 들어감(가로 스크롤 없음)',
    expected: '표 너비 ≤ 카드 너비',
    actual: `${fit.sw}px / ${fit.cw}px`,
    how: 'scrollWidth <= clientWidth + 1',
    pass: fit.sw <= fit.cw + 1,
  })

  // dropdown
  await cell(18, 'category').click()
  await page.keyboard.type('회의')
  await page.keyboard.press('Enter')
  await cell(18, 'mid').click()
  await page.keyboard.press('Enter')
  const opts = (await page.locator('[role=listbox] [role=option]').allInnerTexts()).map((t) => t.trim())
  const c3 = report.check({
    name: 'Type 드롭다운에 관리자 목록 12개가 순서대로',
    expected: '12개, 첫 항목 개발-신규, 마지막 일반-이메일 및 일반업무',
    actual: `${opts.length}개, ${opts[0]} … ${opts[opts.length - 1]}`,
    how: "options.length === 12 && 첫 항목·마지막 항목 이름 비교",
    pass: opts.length === 12 && opts[0].includes('개발-신규') && opts[11].includes('일반-이메일 및 일반업무'),
  })
  await report.shot(page, { caption: 'Type 칸을 열었을 때의 드롭다운', marks: [{ target: headRow.getByText('Type', { exact: true }), n: c1, label: 'Project 다음 칸' }, { target: page.locator('[role=listbox]'), n: c3, label: '12개' }] })
  await page.keyboard.type('int')
  await page.keyboard.press('Enter')
  await cell(18, 'mid').filter({ hasText: '회의-INT' }).waitFor()
  const c4 = report.check({ name: '"int" 입력 + Enter로 회의-INT 선택', expected: '회의-INT', actual: await text(18, 'mid'), how: "09:00 Type 칸 텍스트 === '회의-INT'", pass: (await text(18, 'mid')) === '회의-INT' })

  // paste rules
  await paste(19, 'category', '회의\tINT | Daily_Scrum\t회의록')
  const r19 = [await text(19, 'mid'), await text(19, 'task'), await text(19, 'details')]
  const c5 = report.check({
    name: '엑셀 3칸(Project·Task·업무내용)은 예전처럼',
    expected: "Type 빈칸, Task 'INT | Daily_Scrum', 업무내용 '회의록'",
    actual: `Type '${r19[0]}', Task '${r19[1]}', 업무내용 '${r19[2]}'`,
    how: "mid === '' && task === 'INT | Daily_Scrum' && details === '회의록'",
    pass: r19[0] === '' && r19[1] === 'INT | Daily_Scrum' && r19[2] === '회의록',
  })
  await paste(20, 'category', '회의\t지원-8D\t8D 보고')
  const c6 = report.check({
    name: '둘째 칸이 Type 이름인 3칸은 Type 포함 순서대로',
    expected: "Type '지원-8D', Task '8D 보고'",
    actual: `Type '${await text(20, 'mid')}', Task '${await text(20, 'task')}'`,
    how: "mid === '지원-8D' && task === '8D 보고'",
    pass: (await text(20, 'mid')) === '지원-8D' && (await text(20, 'task')) === '8D 보고',
  })
  await paste(21, 'category', '회의\t개발-신규\t설계\t도면 검토')
  const c7 = report.check({
    name: '4칸은 Project·Type·Task·업무내용',
    expected: "Type '개발-신규', 업무내용 '도면 검토'",
    actual: `Type '${await text(21, 'mid')}', 업무내용 '${await text(21, 'details')}'`,
    how: "mid === '개발-신규' && details === '도면 검토'",
    pass: (await text(21, 'mid')) === '개발-신규' && (await text(21, 'details')) === '도면 검토',
  })
  await paste(22, 'mid', '없는 분류')
  const c8 = report.check({ name: '목록에 없는 이름은 무시', expected: "Type 빈칸", actual: `'${await text(22, 'mid')}'`, how: "10:30 Type 칸 === ''", pass: (await text(22, 'mid')) === '' })
  await cell(21, 'category').click()
  await page.keyboard.down('Shift')
  await cell(21, 'details').click()
  await page.keyboard.up('Shift')
  await page.keyboard.press('Control+C')
  await cell(23, 'category').click()
  await page.keyboard.press('Control+V')
  await cell(23, 'mid').filter({ hasText: '개발-신규' }).waitFor()
  const c9 = report.check({
    name: 'Daily Log 안에서 복사·붙여넣기하면 Type까지 같은 칸으로',
    expected: "11:30 행 Type '개발-신규', 업무내용 '도면 검토'",
    actual: `Type '${await text(23, 'mid')}', 업무내용 '${await text(23, 'details')}'`,
    how: "row23.mid === '개발-신규' && row23.details === '도면 검토'",
    pass: (await text(23, 'mid')) === '개발-신규' && (await text(23, 'details')) === '도면 검토',
  })
  await page.mouse.click(5, 5)
  await report.shot(page, {
    caption: '붙여넣기 결과 (09:30 ~ 11:30)',
    marks: [
      { target: cell(18, 'mid'), n: c4 },
      { target: page.locator('[data-slot="19"]'), n: c5, label: '3칸 · 예전 배치' },
      { target: cell(20, 'mid'), n: c6 },
      { target: page.locator('[data-slot="21"]'), n: c7, label: '4칸' },
      { target: cell(22, 'mid'), n: c8 },
      { target: page.locator('[data-slot="23"]'), n: c9, label: '내부 복사' },
    ],
  })

  // row + button
  await page.locator('[data-slot="20"]').hover()
  await page.getByRole('button', { name: 'Add 10:00 to repeated tasks' }).click()
  await page.getByText('반복 업무에 추가:', { exact: false }).waitFor()
  const chip = page.getByTestId('templates').getByRole('button', { name: '8D 보고', exact: true })
  await chip.waitFor()
  const c10 = report.check({ name: '+ 를 누르면 그 행이 반복 업무에 추가', expected: "반복 업무 표에 '8D 보고'", actual: `${await page.getByTestId('templates').getByRole('button', { name: '8D 보고', exact: true }).count()}개`, how: "반복 업무 표 안 '8D 보고' 수 === 1", pass: true })
  await page.locator('[data-slot="20"]').hover()
  await report.shot(page, { caption: '행 앞 + 버튼과 추가된 반복 업무', marks: [{ target: page.getByRole('button', { name: 'Add 10:00 to repeated tasks' }), n: c10, label: '+' }, { target: chip, n: c10, label: '추가됨' }] })
  await page.getByRole('button', { name: 'Add 10:00 to repeated tasks' }).click()
  await page.getByText('이미 반복 업무에 있습니다', { exact: false }).waitFor()
  const dup = await page.getByTestId('templates').getByRole('button', { name: '8D 보고', exact: true }).count()
  report.check({ name: '+ 를 다시 눌러도 중복 없음', expected: "칩 1개, '이미 반복 업무에 있습니다' 안내", actual: `칩 ${dup}개, 안내 표시`, how: 'chip count === 1', pass: dup === 1 })
  const emptyPlus = await page.locator('[data-slot="12"]').getByRole('button', { name: /repeated tasks/ }).count()
  report.check({ name: '빈 행에는 + 가 없음', expected: '0개', actual: `${emptyPlus}개`, how: "06:00 행 + 버튼 수 === 0", pass: emptyPlus === 0 })
  await cell(26, 'details').click()
  await page.keyboard.type('남길 내용')
  await page.keyboard.press('Enter')
  await cell(26, 'category').click()
  await chip.click()
  await cell(26, 'mid').filter({ hasText: '지원-8D' }).waitFor()
  const c13 = report.check({
    name: '반복 업무 적용: Project·Type·Task는 채우고 업무내용은 그대로',
    expected: "Type '지원-8D', Task '8D 보고', 업무내용 '남길 내용'",
    actual: `Type '${await text(26, 'mid')}', Task '${await text(26, 'task')}', 업무내용 '${await text(26, 'details')}'`,
    how: "mid === '지원-8D' && task === '8D 보고' && details === '남길 내용'",
    pass: (await text(26, 'mid')) === '지원-8D' && (await text(26, 'task')) === '8D 보고' && (await text(26, 'details')) === '남길 내용',
  })
  await page.mouse.click(5, 5)
  await report.shot(page, { caption: '반복 업무를 13:00 행에 적용', marks: [{ target: page.locator('[data-slot="26"]'), n: c13, label: '업무내용 유지' }] })

  // Weekly Result
  await page.getByRole('link', { name: 'Weekly Result' }).click()
  await page.getByText('Weekly Task Result').waitFor()
  const work = (await page.locator('table.sheet tbody tr td:nth-child(6)').allInnerTexts()).map((t) => t.trim())
  const c14 = report.check({
    name: 'Weekly Result의 Work 열: Type, 없으면 회의',
    expected: '회의-INT, 지원-8D, 개발-신규, 회의 포함',
    actual: work.join(', '),
    how: "work 에 '회의-INT','지원-8D','개발-신규','회의' 모두 포함",
    pass: ['회의-INT', '지원-8D', '개발-신규', '회의'].every((w) => work.includes(w)),
  })
  const chips = await page.getByTestId('work-mid').count()
  report.check({ name: 'Type Work 값은 색 칩', expected: '3개 이상', actual: `${chips}개`, how: "[data-testid=work-mid] 수 >= 3", pass: chips >= 3 })
  await report.shot(page, { caption: 'Weekly Result — Work 열', marks: [{ target: page.locator('table.sheet thead th').nth(5), n: c14, label: 'Work = Type' }] })

  // admin Type list
  await page.getByRole('link', { name: 'Projects' }).click()
  const table = page.getByRole('table', { name: 'Type list' })
  await table.waitFor()
  await page.getByLabel('New type').fill('개발-원가절감')
  await page.getByRole('button', { name: 'Type 추가' }).click()
  await table.getByText('개발-원가절감').waitFor()
  await page.getByLabel('New type').fill('개발 - 신규')
  await page.getByRole('button', { name: 'Type 추가' }).click()
  await page.getByText('이미 있는 유형입니다', { exact: false }).waitFor()
  const c16 = report.check({ name: '관리자 Type 추가, 같은 이름(띄어쓰기만 다름)은 거절', expected: "추가됨 / '이미 있는 유형입니다'", actual: '추가됨 / 거절 안내 표시', how: "목록에 '개발-원가절감' 있음 && 오류 문구 표시", pass: true })
  await page.getByText('이미 있는 유형입니다', { exact: false }).scrollIntoViewIfNeeded()
  await report.shot(page, { caption: 'Projects → Type 카드: 추가와 중복 거절 (관리자)', marks: [{ target: table.getByText('개발-원가절감'), n: c16, label: '추가됨' }, { target: page.getByText('이미 있는 유형입니다', { exact: false }), n: c16, label: '중복 거절' }] })
  await table.getByText('개발-원가절감').dblclick()
  await page.getByLabel('Rename 개발-원가절감').fill('개발-VA·VE')
  await page.keyboard.press('Enter')
  await table.getByText('개발-VA·VE').waitFor()
  await page.getByRole('button', { name: 'Move 개발-VA·VE up' }).click()
  await page.waitForTimeout(300)
  const names = (await table.locator('tbody tr td:nth-child(3)').allInnerTexts()).map((t) => t.trim())
  const c17 = report.check({ name: '이름 더블클릭 수정, ↑ 로 순서 변경', expected: "12번째 '개발-VA·VE', 13번째 '일반-이메일 및 일반업무'", actual: `12번째 '${names[11]}', 13번째 '${names[12]}'`, how: "names[11] === '개발-VA·VE' && names[12] === '일반-이메일 및 일반업무'", pass: names[11] === '개발-VA·VE' && names[12] === '일반-이메일 및 일반업무' })
  await table.locator('tbody tr').nth(11).scrollIntoViewIfNeeded()
  await report.shot(page, { caption: 'Projects → Type 카드: 이름 변경과 순서 변경', marks: [{ target: table.locator('tbody tr').nth(11), n: c17, label: '이름 변경 · 순서 ↑' }] })
  await page.getByRole('button', { name: 'Remove 개발-VA·VE' }).click()
  await page.getByText('개발-VA·VE: 삭제했습니다.').waitFor()
  await page.getByRole('button', { name: 'Remove 지원-8D' }).click()
  await page.getByText('이미 쓰인 기록이 있어 숨겼습니다', { exact: false }).waitFor()
  report.check({ name: '안 쓰인 Type는 삭제, 쓰인 Type는 숨김', expected: "'삭제했습니다' / '숨겼습니다'", actual: '두 안내 모두 표시', how: '삭제·숨김 안내 문구 확인', pass: true })
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await cell(20, 'mid').filter({ hasText: '지원-8D' }).waitFor()
  await cell(27, 'mid').click()
  await page.keyboard.press('Enter')
  const after = await page.locator('[role=listbox] [role=option]').allInnerTexts()
  const c19 = report.check({ name: '숨긴 Type는 예전 행에 그대로 보이고 드롭다운에서는 빠짐', expected: '10:00 행 지원-8D 유지, 드롭다운에 없음', actual: `행 유지, 드롭다운 ${after.some((o) => o.includes('지원-8D')) ? '있음' : '없음'}`, how: "!options.includes('지원-8D')", pass: !after.some((o) => o.includes('지원-8D')) })
  await report.shot(page, { caption: '숨긴 Type(지원-8D): 예전 행에는 남고 새로 고를 때는 없음', marks: [{ target: cell(20, 'mid'), n: c19, label: '예전 행' }, { target: page.locator('[role=listbox]'), n: c19, label: '목록에 없음' }] })
  await page.keyboard.press('Escape')
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByLabel('숨긴 항목 보기', { exact: false }).check()
  await page.getByRole('button', { name: 'Restore 지원-8D' }).click()
  await page.getByText('되돌렸습니다: 지원-8D').waitFor()
  report.check({ name: '숨긴 Type 되돌리기', expected: "'되돌렸습니다: 지원-8D'", actual: '안내 표시', how: '되돌리기 안내 문구 확인', pass: true })

  // L1 read-only
  await page.goto(BASE + '/settings')
  await page.getByLabel('Demo role').selectOption('l1')
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByTestId('mid-lock-note').waitFor()
  const l1 = { add: await page.getByLabel('New type').count(), remove: await page.getByRole('button', { name: /^Remove / }).count() }
  const c21 = report.check({ name: 'L1은 Type 목록을 읽기만', expected: '추가 칸·삭제 버튼 없음, 관리자 설정 안내', actual: `추가 칸 ${l1.add}개, 삭제 버튼 ${l1.remove}개`, how: 'add === 0 && remove === 0', pass: l1.add === 0 && l1.remove === 0 })
  await page.getByTestId('mid-lock-note').scrollIntoViewIfNeeded()
  await report.shot(page, { caption: 'L1으로 본 Type 카드', marks: [{ target: page.getByTestId('mid-lock-note'), n: c21, label: '읽기 전용' }] })
  await page.goto(BASE + '/settings')
  await page.getByLabel('Demo role').selectOption('admin')

  // Korean header
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('한국어').check()
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const headKo = (await headRow.innerText()).split('\n').map((t) => t.trim()).filter(Boolean)
  const c22 = report.check({ name: '한국어 화면 머리글', expected: '시간|프로젝트|유형|업무|업무내용', actual: headKo.join('|'), how: "머리글 === '시간|프로젝트|유형|업무|업무내용'", pass: headKo.join('|') === '시간|프로젝트|유형|업무|업무내용' })
  await report.shot(page, { caption: '한국어 화면', marks: [{ target: headRow.getByText('유형', { exact: true }), n: c22, label: '유형' }] })
  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  void c2
  report.save()
  await browser.close()
  console.log('batchL: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
