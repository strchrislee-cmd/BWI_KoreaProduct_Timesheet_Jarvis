// 2026-11-27 (12): reading by level and the Org Chart. L1 own time, L2 + the L1s below, L3 + the L2s and
// L1s below; everyone sees the whole Org Chart; admins alone set manager and team; an L1 asks an L2,
// who approves for 1 hour / 1 day / 1 week. The Team window stacks the checked people's 30-min logs
// under your own in check order. REPORT=1 writes docs/test-reports/<date>-org-access/ (see report.cjs).
// Demo mode: the people are made-up demo teammates (데모 팀원 만들기).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'

const report = createReport({
  id: 'org-access',
  title: '단계별 열람 권한 + 조직도',
  suite: 'tests/e2e/batchS.e2e.cjs',
  request:
    'L1은 개인 자료만, L2는 자기에게 속한 L1, L3는 자기에게 속한 L2와 L1을 단계별로. 조직도 탭(모두 전체 조직을 봄, 조직 정보는 admin만 부여). L1이 L2 자료를 보려면 요청 후 일시적으로. 상위 관리자는 Today 같은 창에서 담당자 이름을 체크하면 작성창과 같은 창이 본인 타임시트 아래로 체크한 순서대로 보이고, 위치를 바꾸면 순서가 바뀜.',
  criteria: [
    'Timesheets에 조직도 탭. L1·L2·L3 모두 전체 조직(보고 라인 + 팀)을 본다.',
    '관리자만 상위자와 팀을 바꾼다. 상위자는 더 높은 등급이고 보고 라인이 돌아오지 않는 사람만 고를 수 있다.',
    'L2는 아래의 L1, L3는 아래의 L2와 L1만 볼 수 있다(같거나 높은 등급은 안 보임).',
    '팀원 창: 체크한 사람의 30분 기록이 내 기록 아래에 체크한 순서대로, 끌어서 순서 변경, 모두 해제 후 다시 체크하면 그 순서. 읽기 전용, 새로 고쳐도 유지.',
    'L1은 L2에게 열람 요청 → 그 L2가 1시간·하루·1주 중 골라 승인(또는 거절) → 승인 기간 동안 일일 기록·주간 결과·칸반을 읽기만.',
    '휴대폰에서도 조직도가 화면 안에 들어온다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date(`${DAY}T10:10:00`))
  report.env(`Chromium ${browser.version()}`, `1440×900 (휴대폰 390×844), 시계 ${DAY} 10:10 고정, 데모 모드(가상 팀원)`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))

  const level = async (role) => {
    await page.goto(BASE + '/settings')
    await page.getByLabel('Demo role').selectOption(role)
    await page.waitForTimeout(300)
  }
  const toOrg = async () => {
    await page.goto(BASE + `/timesheets/org?date=${DAY}`)
    await page.getByLabel('Org chart').waitFor()
  }
  const toLog = async () => {
    await page.goto(BASE + `/timesheets?date=${DAY}`)
    await page.getByTestId('grid-scroll').locator('[data-cell="18:category"]').waitFor()
    await page.waitForTimeout(300)
  }
  const team = () => page.getByTestId('team-panel')
  const teamNames = () => team().locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).sort())
  const sheets = async () => page.getByTestId('team-sheet').evaluateAll((els) => els.map((e) => e.dataset.person))
  const orgRow = (name) => page.locator(`[data-testid="org-row"][data-person="${name}"]`)

  // ── demo team + the whole org on the tab ─────────────────────────────────
  await toOrg()
  await page.getByRole('button', { name: '데모 팀원 만들기' }).click()
  await page.waitForTimeout(500)
  const tabs = await page.locator('nav a').allInnerTexts()
  const rows = await page.getByTestId('org-row').evaluateAll((els) => els.map((e) => `${e.style.marginLeft || '0rem'}:${e.dataset.person}`))
  const c1 = report.check({
    name: '조직도 탭: 보고 라인대로 전체 조직이 들여쓰기로 보임',
    expected: "탭 'Org Chart', 한서윤(L3) → Demo User → 오하린 → 강민호, 서지아, 윤도현",
    actual: `탭 ${tabs.includes('Org Chart') ? '있음' : '없음'} · ${rows.join(' / ')}`,
    how: 'nav 에 Org Chart, org-row 순서와 margin-left(1.5rem 단위)',
    pass: tabs.includes('Org Chart') && rows.join('|') === '0rem:한서윤|1.5rem:Demo User|3rem:오하린|4.5rem:강민호|3rem:서지아|3rem:윤도현',
  })

  // admin: manager and team; the choices never make the line loop
  const leadChoices = await page.getByLabel('Manager of 한서윤').locator('option').allInnerTexts()
  const jiaChoices = await page.getByLabel('Manager of 서지아').locator('option').allInnerTexts()
  await page.getByLabel('Manager of 서지아').selectOption({ label: '↑ 오하린 (L2)' })
  await page.waitForTimeout(300)
  await page.getByLabel('Team of 서지아').fill('시험팀')
  await page.getByLabel('Team of 서지아').press('Enter')
  await page.waitForTimeout(400)
  await page.reload()
  await page.getByLabel('Org chart').waitFor()
  const jia = { margin: await orgRow('서지아').evaluate((e) => e.style.marginLeft), team: await page.getByLabel('Team of 서지아').inputValue() }
  const c2 = report.check({
    name: '관리자가 상위자·팀 지정 (돌아오는 보고 라인은 고를 수 없음)',
    expected: "한서윤의 선택지에 아래 사람 없음, 서지아의 선택지는 더 높은 등급만; 서지아 → 오하린 아래, 팀 '시험팀' (새로 고쳐도)",
    actual: `한서윤: [${leadChoices.join(', ')}] · 서지아: [${jiaChoices.join(', ')}] · 저장 후 들여쓰기 ${jia.margin}, 팀 '${jia.team}'`,
    how: "선택지 목록 비교, 저장 후 서지아 margin-left 4.5rem(오하린 아래) && 팀 '시험팀'",
    pass:
      leadChoices.join('|') === '상위 없음' &&
      jiaChoices.join('|') === '상위 없음|↑ Demo User (Admin)|↑ 한서윤 (L3)|↑ 오하린 (L2)' &&
      jia.margin === '4.5rem' &&
      jia.team === '시험팀',
  })
  await report.shot(page, { caption: '조직도 (관리자: 상위자·팀 지정)', marks: [{ target: orgRow('한서윤'), n: c1, label: '전체 조직' }, { target: orgRow('서지아'), n: c2, label: '상위자·팀' }] })

  // ── L2: the L1s below; answers the request ───────────────────────────────
  await level('l2')
  await toOrg()
  const l2Edit = await page.locator('select[aria-label^="Manager of"]').count()
  const l2Rows = await page.getByTestId('org-row').count()
  await page.getByTestId('access-request').getByRole('button', { name: '하루' }).click()
  await page.waitForTimeout(400)
  const decided = await page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')).accessRequests.map((r) => ({ status: r.status, hours: r.expires_at ? (new Date(r.expires_at) - new Date(r.decided_at)) / 3600000 : null })))
  const c3 = report.check({
    name: 'L2: 조직도는 전체를 보되 편집 없음, 받은 요청을 하루로 승인',
    expected: '조직도 6명, 상위자 선택 0개, 윤도현의 요청 → approved 24시간, 받은 요청 목록 비어짐',
    actual: `${l2Rows}명, 선택 ${l2Edit}개, 요청 ${JSON.stringify(decided)}, 남은 요청 ${await page.getByTestId('access-request').count()}개`,
    how: "org-row 6 && select 0 && status 'approved' && 24h",
    pass: l2Rows === 6 && l2Edit === 0 && decided.length === 1 && decided[0].status === 'approved' && decided[0].hours === 24 && (await page.getByTestId('access-request').count()) === 0,
  })
  await toLog()
  const l2Team = await teamNames()
  const c4 = report.check({
    name: 'L2: 팀원 창에는 아래의 L1만',
    expected: '강민호, 서지아, 윤도현 (같은 L2 오하린, 위의 L3 한서윤은 없음)',
    actual: l2Team.join(', '),
    how: '팀원 창 체크박스 이름 목록',
    pass: l2Team.join('|') === '강민호|서지아|윤도현',
  })

  // check order = display order; drag to reorder; clear all and check again
  await team().getByLabel('서지아').check()
  await team().getByLabel('윤도현').check()
  await page.waitForTimeout(800)
  const order1 = await sheets()
  const shown = team().getByTestId('team-shown')
  await shown.nth(1).hover()
  await page.mouse.down()
  const box = await shown.nth(0).boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 4, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const order2 = await sheets()
  await team().getByRole('button', { name: '모두 해제' }).click()
  await page.waitForTimeout(500)
  const none = await sheets()
  await team().getByLabel('강민호').check()
  await team().getByLabel('서지아').check()
  await page.waitForTimeout(800)
  const order3 = await sheets()
  await page.reload()
  await page.getByTestId('grid-scroll').locator('[data-cell="18:category"]').waitFor()
  await page.getByTestId('team-sheet').first().waitFor()
  const order4 = await sheets()
  const c5 = report.check({
    name: '팀원 창: 체크한 순서대로 아래에 쌓이고, 끌면 순서 변경, 모두 해제 후 다시 체크한 순서',
    expected: '서지아→윤도현, 끌어서 윤도현→서지아, 해제 후 없음, 강민호→서지아, 새로 고쳐도 강민호→서지아',
    actual: `${order1.join('→')} / ${order2.join('→')} / ${none.length ? none.join('→') : '없음'} / ${order3.join('→')} / ${order4.join('→')}`,
    how: 'team-sheet 의 data-person 순서',
    pass: order1.join('|') === '서지아|윤도현' && order2.join('|') === '윤도현|서지아' && none.length === 0 && order3.join('|') === '강민호|서지아' && order4.join('|') === '강민호|서지아',
  })

  // the sheets are the same 30-min log, reading only
  const jiaSheet = page.locator('[data-testid="team-sheet"][data-person="서지아"]')
  const cell = jiaSheet.locator('[data-cell="20:task"]')
  const before = await cell.innerText()
  await cell.dblclick()
  await page.keyboard.type('바꾸기')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(300)
  const after = await cell.innerText()
  const ownBelow = (await page.getByTestId('daily-log-page').boundingBox()).y < (await page.getByTestId('team-sheets').boundingBox()).y
  const c6 = report.check({
    name: '팀원 기록은 작성창과 같은 30분 표, 내 기록 아래, 읽기 전용',
    expected: "서지아 10:00 업무 '시험 지원' 그대로 (입력해도 안 바뀜), 내 기록보다 아래",
    actual: `'${before}' → '${after}', 내 기록 아래 ${ownBelow}`,
    how: "data-cell=20:task 더블클릭+입력 후 같은 글자 && daily-log-page.y < team-sheets.y",
    pass: before === '시험 지원' && after === before && ownBelow,
  })
  await page.mouse.move(700, 150)
  await page.evaluate(() => window.scrollTo(0, 400))
  await page.waitForTimeout(800)
  await report.shot(page, { caption: 'L2: 팀원 창과 체크한 순서대로 쌓인 팀원 기록 (아래로 스크롤)', marks: [{ target: team(), n: c4, label: '아래 L1만' }, { target: page.getByTestId('team-sheets'), n: c5, label: '체크한 순서' }] })

  // ── L3: the L2s and the L1s below ─────────────────────────────────────────
  await level('l3')
  await toLog()
  const l3Team = await teamNames()
  const c7 = report.check({
    name: 'L3: 아래의 L2와 그 아래 L1까지',
    expected: '강민호, 서지아, 오하린, 윤도현 (위의 L3 한서윤은 없음)',
    actual: l3Team.join(', '),
    how: '팀원 창 체크박스 이름 목록',
    pass: l3Team.join('|') === '강민호|서지아|오하린|윤도현',
  })

  // ── L1: own time; asks an L2; reads while the approval lasts ─────────────
  await level('l1')
  await toLog()
  const l1Window = await team().count()
  await toOrg()
  const askLead = await orgRow('한서윤').getByRole('button', { name: /^Ask / }).count()
  const askLabel = await orgRow('오하린').getByRole('button', { name: 'Ask 오하린 for access' }).innerText()
  await orgRow('오하린').getByRole('button', { name: 'Ask 오하린 for access' }).click()
  await page.waitForTimeout(400)
  const pending = await orgRow('오하린').innerText()
  const c8 = report.check({
    name: 'L1: 팀원 창 없음, L2에게만 열람 요청 → 요청 중',
    expected: "팀원 창 0개, 한서윤(L3)에는 요청 버튼 없음, 오하린(L2)에 '열람 요청' → 누른 뒤 '요청 중'",
    actual: `팀원 창 ${l1Window}개, 한서윤 버튼 ${askLead}개, 오하린 '${askLabel}' → '${pending.replace(/\s+/g, ' ')}'`,
    how: "team-panel 0 && 한서윤 행 버튼 0 && 오하린 행 버튼 '열람 요청' 후 '요청 중'",
    pass: l1Window === 0 && askLead === 0 && askLabel === '열람 요청' && pending.includes('요청 중'),
  })
  await report.shot(page, { caption: 'L1: 조직도에서 L2에게 열람 요청', marks: [{ target: orgRow('오하린'), n: c8, label: '요청 중' }] })

  // 오하린 is a made-up teammate: approve for an hour as she would (demo data in this browser)
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
    const r = s.accessRequests.find((x) => x.status === 'pending')
    Object.assign(r, { status: 'approved', decided_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString() })
    localStorage.setItem('timecrumbs-demo-v1', JSON.stringify(s))
  })
  await toLog()
  const granted = await teamNames()
  await team().getByLabel('오하린').check()
  await page.waitForTimeout(800)
  const grantedSheet = await sheets()
  await page.goto(BASE + `/timesheets/weekly?date=${DAY}`)
  const picker = page.getByLabel('Engineer')
  await picker.waitFor()
  const pickable = await picker.locator('option').allInnerTexts()
  await picker.selectOption({ label: '오하린 (OHR)' })
  await page.waitForTimeout(600)
  const weekly = await page.locator('main').innerText()
  await page.getByRole('link', { name: 'Daily Kanban' }).click()
  await page.getByTestId('kanban-board').waitFor()
  await page.waitForTimeout(400)
  const kanbanNote = await page.getByText('의 보드 (읽기 전용)').innerText()
  await page.getByRole('link', { name: 'Group Timesheet' }).click()
  await page.waitForTimeout(500)
  const groupPicker = await page.getByLabel('Engineer').count()
  const c9 = report.check({
    name: '승인된 동안: 팀원 창·주간 결과·칸반에서 그 L2를 읽기만 (다른 탭은 내 자료)',
    expected: "팀원 창 '오하린', 그 기록 표시, 고르기 [Demo User, 오하린], 주간 결과에 '시험 계획서', 칸반 '오하린의 보드 (읽기 전용)', 그룹 타임시트엔 고르기 없음",
    actual: `팀원 창 [${granted.join(', ')}], 기록 [${grantedSheet.join(', ')}], 고르기 [${pickable.join(', ')}], 주간 '시험 계획서' ${weekly.includes('시험 계획서')}, 칸반 '${kanbanNote}', 그룹 고르기 ${groupPicker}개`,
    how: '팀원 창 이름, team-sheet, Engineer 옵션, 주간 결과 본문, 칸반 안내, Group Timesheet 의 Engineer 0개',
    pass:
      granted.join('|') === '오하린' &&
      grantedSheet.join('|') === '오하린' &&
      pickable.join('|') === 'Demo User (DU)|오하린 (OHR)' &&
      weekly.includes('시험 계획서') &&
      kanbanNote.includes('오하린의 보드 (읽기 전용)') &&
      groupPicker === 0,
  })

  // the approval ends → back to own time only
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
    for (const r of s.accessRequests) if (r.status === 'approved') r.expires_at = new Date(Date.now() - 60000).toISOString()
    localStorage.setItem('timecrumbs-demo-v1', JSON.stringify(s))
  })
  await toLog()
  const after1 = await team().count()
  await toOrg()
  const again = await orgRow('오하린').innerText()
  const c10 = report.check({
    name: '승인 기간이 끝나면 다시 내 자료만',
    expected: "팀원 창 없음, 오하린 행에 '기간 끝 · 다시 요청'",
    actual: `팀원 창 ${after1}개, 오하린 '${again.replace(/\s+/g, ' ')}'`,
    how: "team-panel 0 && '기간 끝' 글자",
    pass: after1 === 0 && again.includes('기간 끝'),
  })
  await report.shot(page, { caption: 'L1: 승인 기간이 끝난 뒤', marks: [{ target: orgRow('오하린'), n: c10, label: '기간 끝' }] })

  // phones: the chart fits the screen
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await ctx.storageState() })
  const phone = await phoneCtx.newPage()
  await phone.clock.setFixedTime(new Date(`${DAY}T10:10:00`))
  await phone.goto(BASE + `/timesheets/org?date=${DAY}`)
  await phone.getByLabel('Org chart').waitFor()
  const width = await phone.evaluate(() => document.documentElement.scrollWidth)
  report.check({ name: '휴대폰: 조직도가 화면 안에', expected: '페이지 폭 ≤ 390', actual: `${width}px`, how: 'documentElement.scrollWidth ≤ 390', pass: width <= 390 })
  await phoneCtx.close()

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건${errors.length ? ': ' + errors.join(' | ') : ''}`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchS: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
