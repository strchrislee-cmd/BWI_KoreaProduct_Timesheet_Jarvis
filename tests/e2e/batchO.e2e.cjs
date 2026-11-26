// 2026-11-26 (4): quick tasks (업무 빠른 등록) with empty Task, auto-wrap checkbox, Today donut,
// window layout editing on a dot grid (move / resize / jiggle / save toast) and the right-edge dock.
// REPORT=1 writes docs/test-reports/<date>-layout/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'layout',
  title: '창 배치 편집 · 오른쪽 Dock · Today 그래프 · 자동 줄바꿈 · 업무 빠른 등록',
  suite: 'tests/e2e/batchO.e2e.cjs',
  request:
    'Task 없이 저장하면 (내용 없음) 또는 확인. 반복 업무 → 업무 빠른 등록. 자동 줄바꿈 체크박스. 30-min Log · Today · 반복 업무 창의 크기·위치 조절(점 그리드, 아이폰처럼 흔들흔들, 저장/취소/기본 설정 토스트, 사용자마다 저장). Today 도넛 그래프. Today · 반복 업무를 아래 Dock처럼 오른쪽으로 숨기는 기능과 자석 체크박스.',
  criteria: [
    'Task가 빈 행을 저장하려 하면 확인을 묻고, 저장하면 표에 (내용 없음)으로 보인다(프로젝트 이름이 아니라).',
    '창 이름은 업무 빠른 등록.',
    '자동 줄바꿈을 끄면 긴 글이 한 줄로 줄고(행 높이 그대로) 마우스를 올리면 전체 글. 설정은 사람마다 저장.',
    'Today 그래프 보기: 도넛, 가운데 합계, 항목별 %. 마우스를 올린 항목의 %가 가운데에. 보기 선택은 저장.',
    '배치 편집(버튼 또는 제목줄 끌기): 점 그리드, 창이 흔들림, 옮기기·크기 조절이 그리드에 맞춰짐, 아래 토스트에 저장 / 취소 / 기본 설정으로.',
    '저장한 배치는 새로 고쳐도 그대로, 취소는 되돌림, 기본 설정으로는 처음 배치.',
    '자석 켬: Today · 업무 빠른 등록을 오른쪽 끝에 놓으면 오른쪽 Dock으로. 자석 끔: 붙지 않음. 버튼으로도 넣고 꺼냄.',
    '오른쪽 Dock은 평소 숨고, 마우스가 오른쪽 끝에 오면 나타나며, 멀어지면 다시 숨는다.',
    '휴대폰은 배치 편집 없이 고정 배치.',
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
  const dialogs = []
  let answer = false
  page.on('dialog', (d) => {
    dialogs.push(d.message())
    void (answer ? d.accept() : d.dismiss())
  })
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const paste = async (i, col, tsv) => {
    await cell(i, col).click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(250)
  }
  const quick = page.getByTestId('templates-panel')
  const today = page.getByTestId('today-panel')
  const pageBox = () => page.getByTestId('daily-log-page').boundingBox()
  // the window's own place and size on the page (offset*, so the jiggle's rotation does not count)
  const rectOf = (id) =>
    page.locator(`[data-window="${id}"]`).first().evaluate((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }))
  const drag = async (from, to, steps = 8) => {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps })
  }
  const away = async () => {
    await page.mouse.move(700, 120)
    await page.waitForTimeout(900)
  }

  await page.goto(BASE + '/timesheets?date=2026-11-16')
  await quick.waitFor()
  const c1 = report.check({ name: '창 이름: 업무 빠른 등록', expected: "제목 '업무 빠른 등록'", actual: `'${(await quick.locator('h2').innerText()).trim()}'`, how: "templates-panel h2 === '업무 빠른 등록'", pass: (await quick.locator('h2').innerText()).trim() === '업무 빠른 등록' })

  // ── empty Task ───────────────────────────────────────────────────────────
  await paste(18, 'category', '회의\t회의-INT\t주간 회의')
  await paste(19, 'category', '설계\t개발-신규\t아주 긴 업무 이름이 칸을 넘어가면 여러 줄로 보이는지 확인하는 문장입니다')
  await paste(20, 'category', '품질\t지원-8D\t8D 보고')
  await paste(21, 'category', '품질')
  await page.mouse.click(5, 5)
  await page.locator('[data-slot="21"]').hover()
  await page.getByRole('button', { name: 'Add 10:30 to quick tasks' }).click()
  await page.waitForTimeout(300)
  const rowsAfterNo = await quick.getByTestId('template-row').count()
  answer = true
  await page.locator('[data-slot="21"]').hover()
  await page.getByRole('button', { name: 'Add 10:30 to quick tasks' }).click()
  await quick.getByTestId('template-row').first().waitFor()
  const emptyName = (await quick.getByTestId('template-row').first().locator('td').nth(1).innerText()).trim()
  const c2 = report.check({
    name: 'Task가 빈 행: 확인을 묻고, 저장하면 (내용 없음)',
    expected: "확인 창 2번(취소 → 저장 안 됨, 확인 → 저장), 표에 '(내용 없음)'",
    actual: `확인 창 ${dialogs.length}번, 취소 후 ${rowsAfterNo}행, 저장 후 '${emptyName}'`,
    how: "dialogs === 2 && 취소 후 0행 && Task 칸 === '(내용 없음)'",
    pass: dialogs.length === 2 && dialogs[0].includes('Task(업무)가 비어') && rowsAfterNo === 0 && emptyName === '(내용 없음)',
  })
  for (const [slot, time] of [[18, '09:00'], [20, '10:00']]) {
    await page.locator(`[data-slot="${slot}"]`).hover()
    await page.getByRole('button', { name: `Add ${time} to quick tasks` }).click()
    await page.waitForTimeout(200)
  }
  await away()
  await report.shot(page, { caption: '업무 빠른 등록: Task 없이 저장한 항목은 (내용 없음)', marks: [{ target: quick.locator('h2'), n: c1, label: '새 이름' }, { target: quick.getByTestId('template-row').first(), n: c2, label: '(내용 없음)' }] })

  // ── auto-wrap ────────────────────────────────────────────────────────────
  const rowH = async (slot = 19) => Math.round((await page.locator(`[data-slot="${slot}"]`).boundingBox()).height)
  const plain = await rowH(25) // an empty row: the normal height
  const wrapped = await rowH()
  await page.getByLabel('자동 줄바꿈').uncheck()
  await page.waitForTimeout(200)
  const oneLine = await rowH()
  const tip = await cell(19, 'task').locator('span').first().getAttribute('title')
  await page.reload()
  await page.locator('[data-slot="19"]').waitFor()
  const kept = !(await page.getByLabel('자동 줄바꿈').isChecked())
  const c3 = report.check({
    name: '자동 줄바꿈을 끄면 한 줄(행 높이 그대로), 마우스를 올리면 전체 글, 설정 유지',
    expected: `켬: 행이 늘어남(> ${plain}px) / 끔: 빈 행과 같은 ${plain}px, title에 전체 글, 새로 고쳐도 꺼짐`,
    actual: `켬 ${wrapped}px / 끔 ${oneLine}px, title ${tip ? '있음' : '없음'}, 새로 고침 후 ${kept ? '꺼짐' : '켜짐'}`,
    how: 'wrapped > 빈 행 && oneLine === 빈 행 높이 && title 에 전체 글 && 새로 고침 후 unchecked',
    pass: wrapped > plain && oneLine === plain && (tip ?? '').includes('여러 줄로') && kept,
  })
  await away()
  await report.shot(page, { caption: '자동 줄바꿈 끔: 긴 글이 한 줄로', marks: [{ target: page.locator('[data-slot="19"]'), n: c3, label: '한 줄 + …' }, { target: page.getByLabel('자동 줄바꿈'), n: c3, label: '체크박스' }] })
  await page.getByLabel('자동 줄바꿈').check()

  // ── Today donut ──────────────────────────────────────────────────────────
  await today.getByRole('button', { name: '그래프' }).click()
  const donut = page.getByTestId('today-donut')
  await donut.waitFor()
  const slices = await donut.locator('[data-slice]').count()
  const pcts = (await donut.locator('li').allInnerTexts()).map((t) => Number((t.match(/(\d+)%/) ?? [])[1]))
  const center = (await page.getByTestId('donut-center').innerText()).replace(/\s+/g, ' ').trim()
  // the first slice starts at 12 o'clock and runs clockwise; 3 o'clock on the ring is inside it (it is 50%)
  const ring = await donut.locator('svg').boundingBox()
  await page.mouse.move(ring.x + ring.width / 2 + 59, ring.y + ring.height / 2)
  await page.waitForTimeout(200)
  const hovered = (await page.getByTestId('donut-center').innerText()).replace(/\s+/g, ' ').trim()
  const c4 = report.check({
    name: 'Today 그래프: 도넛, 가운데 합계, 항목별 %, 올린 항목의 %',
    expected: '조각 3개, % 합 ≈ 100, 가운데 2h 00m, 올리면 가운데에 그 항목 %',
    actual: `조각 ${slices}개, % ${pcts.join('+')} = ${pcts.reduce((a, b) => a + b, 0)}, 가운데 '${center}', 올렸을 때 '${hovered}'`,
    how: 'slices === 3 && |합 − 100| ≤ 2 && center 에 2h 00m && hover 시 %',
    pass: slices === 3 && Math.abs(pcts.reduce((a, b) => a + b, 0) - 100) <= 2 && center.includes('2h 00m') && /\d+%/.test(hovered),
  })
  await report.shot(page, { caption: 'Today 그래프 보기 (조각에 마우스)', marks: [{ target: donut, n: c4, label: '도넛 + %' }] })
  await page.reload()
  await today.waitFor()
  report.check({ name: '그래프 보기 선택은 저장됨', expected: '새로 고쳐도 도넛', actual: (await page.getByTestId('today-donut').count()) ? '도넛' : '목록', how: 'today-donut count === 1', pass: (await page.getByTestId('today-donut').count()) === 1 })

  // ── layout editing ───────────────────────────────────────────────────────
  await away()
  await page.getByRole('button', { name: '배치 편집' }).click()
  const toast = page.getByTestId('layout-toast')
  await toast.waitFor()
  const jiggling = await page.locator('[data-jiggle="true"]').count()
  const c6 = report.check({
    name: '배치 편집: 점 그리드, 창 3개가 흔들림, 저장 토스트',
    expected: "점 그리드 있음, data-jiggle 3개, 토스트 '배치를 저장하겠습니까?' + 저장/취소/기본 설정으로",
    actual: `점 그리드 ${await page.getByTestId('dot-grid').count()}개, 흔들림 ${jiggling}개, 버튼 ${(await toast.getByRole('button').allInnerTexts()).join('/')}`,
    how: "dot-grid === 1 && jiggle === 3 && 토스트 버튼 3개",
    pass: (await page.getByTestId('dot-grid').count()) === 1 && jiggling === 3 && (await toast.innerText()).includes('배치를 저장하겠습니까?') && (await toast.getByRole('button').count()) === 3,
  })
  // move the quick tasks window down and left, then resize Today from its corner
  const q0 = await rectOf('quick')
  const qh = await page.getByTestId('templates-panel-handle').boundingBox()
  await drag({ x: qh.x + 90, y: qh.y + 12 }, { x: qh.x + 90 - 500, y: qh.y + 12 + 230 })
  await report.shot(page, { caption: '배치 편집 중: 업무 빠른 등록 창을 끄는 중', marks: [{ target: page.getByTestId('dot-grid'), n: c6, label: '점 그리드' }, { target: toast, n: c6, label: '저장 토스트' }] })
  await page.mouse.up()
  const q1 = await rectOf('quick')
  const t0 = await rectOf('today')
  const corner = await page.getByTestId('today-resize').boundingBox()
  await drag({ x: corner.x + 12, y: corner.y + 12 }, { x: corner.x + 12 - 50, y: corner.y + 12 + 100 })
  await page.mouse.up()
  const t1 = await rectOf('today')
  const onGrid = [t1.x, t1.y, t1.w, t1.h, q1.x, q1.y].every((v) => v % 24 === 0)
  const c7 = report.check({
    name: '크기 조절과 옮기기가 점 간격(24px)에 맞춰짐',
    expected: 'Today 폭 줄고 높이 늘어남, 업무 빠른 등록 왼쪽 아래로 이동, 모든 값이 24의 배수',
    actual: `Today ${t0.w}×${t0.h} → ${t1.w}×${t1.h}, 업무 빠른 등록 (${q0.x},${q0.y}) → (${q1.x},${q1.y})`,
    how: 't1.w < t0.w && t1.h > t0.h && q1.x < q0.x && q1.y > q0.y && 값 % 24 === 0',
    pass: t1.w < t0.w && t1.h > t0.h && q1.x < q0.x && q1.y > q0.y && onGrid,
  })
  await page.mouse.move(700, 60)
  await report.shot(page, { caption: '옮기고 크기를 바꾼 뒤(저장 전)', marks: [{ target: page.locator('[data-window="today"]'), n: c7, label: '크기 조절' }, { target: page.locator('[data-window="quick"]'), n: c7, label: '옮김' }] })
  await toast.getByRole('button', { name: '저장' }).click()
  await page.reload()
  await today.waitFor()
  const saved = { t: await rectOf('today'), q: await rectOf('quick') }
  const c8 = report.check({
    name: '저장한 배치는 새로 고쳐도 그대로, 흔들림 멈춤',
    expected: `Today ${t1.w}×${t1.h}, 업무 빠른 등록 (${q1.x},${q1.y}), 흔들림 0`,
    actual: `Today ${saved.t.w}×${saved.t.h}, 업무 빠른 등록 (${saved.q.x},${saved.q.y}), 흔들림 ${await page.locator('[data-jiggle="true"]').count()}`,
    how: '새로 고친 뒤 rect 가 저장 전과 같음 && data-jiggle=true 0개',
    pass: saved.t.w === t1.w && saved.t.h === t1.h && saved.q.x === q1.x && saved.q.y === q1.y && (await page.locator('[data-jiggle="true"]').count()) === 0,
  })

  // dragging a title bar starts editing; 취소 puts it back
  const th = await page.getByTestId('today-panel-handle').boundingBox()
  await drag({ x: th.x + 60, y: th.y + 10 }, { x: th.x - 240, y: th.y + 10 })
  await page.mouse.up()
  const editingByDrag = (await page.getByTestId('layout-toast').count()) === 1
  const moved = await rectOf('today')
  await page.getByTestId('layout-toast').getByRole('button', { name: '취소' }).click()
  const back = await rectOf('today')
  report.check({ name: '제목줄을 끌어도 편집 시작, 취소하면 되돌아감', expected: `토스트 나타남, 옮긴 x ≠ ${saved.t.x}, 취소 후 x = ${saved.t.x}`, actual: `토스트 ${editingByDrag ? '나타남' : '없음'}, 옮긴 x ${moved.x}, 취소 후 x ${back.x}`, how: 'toast && moved.x !== saved.x && back.x === saved.x', pass: editingByDrag && moved.x !== saved.t.x && back.x === saved.t.x })

  // ── right-edge dock: magnet ──────────────────────────────────────────────
  const th2 = await page.getByTestId('today-panel-handle').boundingBox()
  await drag({ x: th2.x + 60, y: th2.y + 10 }, { x: 1440 - 20, y: 300 }, 12)
  const hint = await page.getByTestId('edge-drop-hint').count()
  const c9 = report.check({ name: '자석 켬: 오른쪽 끝으로 끌면 오른쪽이 강조됨', expected: "'오른쪽 Dock' 강조 1개", actual: `${hint}개`, how: 'edge-drop-hint count === 1', pass: hint === 1 })
  await report.shot(page, { caption: '자석: Today를 오른쪽 끝으로 끄는 중', marks: [{ target: page.getByTestId('edge-drop-hint'), n: c9, label: '오른쪽 Dock' }] })
  await page.mouse.up()
  await page.getByTestId('layout-toast').getByRole('button', { name: '저장' }).click()
  const edge = page.getByTestId('edge-dock')
  await edge.waitFor({ state: 'attached' })
  const inDock = (await edge.getByTestId('today-panel').count()) === 1 && (await page.getByTestId('daily-log-page').getByTestId('today-panel').count()) === 0
  report.check({ name: '놓으면 Today가 오른쪽 Dock으로', expected: 'Today가 오른쪽 Dock 안에(페이지에는 없음)', actual: inDock ? '오른쪽 Dock 안' : '페이지에 남음', how: 'edge-dock 안 today-panel && 페이지 안 0개', pass: inDock })
  await away()
  await page.waitForFunction(() => document.querySelector('[data-testid="edge-dock"]')?.dataset.shown === 'false', null, { timeout: 4000 })
  const hiddenFirst = await edge.getAttribute('data-shown')
  await page.mouse.move(1440 - 6, 450)
  await page.waitForFunction(() => document.querySelector('[data-testid="edge-dock"]')?.dataset.shown === 'true')
  await page.waitForTimeout(400)
  const c11 = report.check({ name: '오른쪽 Dock: 평소 숨고, 마우스가 오른쪽 끝에 오면 나타남', expected: "처음 'false' → 오른쪽 끝에서 'true'", actual: `'${hiddenFirst}' → '${await edge.getAttribute('data-shown')}'`, how: "data-shown 'false' → 'true'", pass: hiddenFirst === 'false' && (await edge.getAttribute('data-shown')) === 'true' })
  await report.shot(page, { caption: '마우스를 오른쪽 끝으로: 오른쪽 Dock이 나타남', marks: [{ target: edge, n: c11, label: '오른쪽 Dock' }] })
  await page.mouse.move(600, 400)
  await page.waitForFunction(() => document.querySelector('[data-testid="edge-dock"]')?.dataset.shown === 'false', null, { timeout: 4000 })
  report.check({ name: '멀어지면 다시 숨음', expected: "data-shown 'false'", actual: `'${await edge.getAttribute('data-shown')}'`, how: "data-shown === 'false'", pass: (await edge.getAttribute('data-shown')) === 'false' })

  // magnet off: no snapping
  await page.getByRole('button', { name: '배치 편집' }).click()
  await page.getByTestId('layout-toast').getByLabel('자석처럼 붙이기').uncheck()
  const qh2 = await page.getByTestId('templates-panel-handle').boundingBox()
  await drag({ x: qh2.x + 60, y: qh2.y + 10 }, { x: 1440 - 20, y: 500 }, 12)
  const hintOff = await page.getByTestId('edge-drop-hint').count()
  await page.mouse.up()
  const place = await page.getByTestId('daily-log-page').getByTestId('templates-panel').getAttribute('data-place')
  report.check({ name: '자석 끔: 오른쪽 끝에 놓아도 붙지 않음', expected: "강조 없음, 업무 빠른 등록은 그리드에 남음", actual: `강조 ${hintOff}개, 위치 '${place}'`, how: "edge-drop-hint 0개 && data-place === 'grid'", pass: hintOff === 0 && place === 'grid' })
  await page.getByTestId('layout-toast').getByRole('button', { name: '취소' }).click()

  // buttons: take Today out, put the quick tasks in
  await page.mouse.move(1440 - 6, 450)
  await edge.getByRole('button', { name: 'Take Today out of the right dock' }).click()
  await page.getByTestId('daily-log-page').getByTestId('today-panel').waitFor()
  await quick.getByRole('button', { name: 'Put 업무 빠른 등록 in the right dock' }).click()
  await page.getByTestId('edge-dock').getByTestId('templates-panel').waitFor()
  const swapped = (await page.getByTestId('daily-log-page').getByTestId('today-panel').count()) === 1 && (await page.getByTestId('edge-dock').getByTestId('templates-panel').count()) === 1
  report.check({ name: '버튼으로 오른쪽 Dock에 넣고 꺼냄', expected: 'Today는 페이지로, 업무 빠른 등록은 오른쪽 Dock으로', actual: swapped ? '그대로 됨' : '안 됨', how: 'page 안 today-panel && edge-dock 안 templates-panel', pass: swapped })

  // back to the default arrangement
  await page.getByRole('button', { name: '배치 편집' }).click()
  await page.getByTestId('layout-toast').getByRole('button', { name: '기본 설정으로' }).click()
  await page.reload()
  await today.waitFor()
  const layoutAttr = await page.getByTestId('daily-log-page').getAttribute('data-layout')
  const edgeCount = await page.getByTestId('edge-dock').count()
  const c15 = report.check({ name: '기본 설정으로: 처음 배치(왼쪽 30-min Log, 오른쪽 Today · 업무 빠른 등록)', expected: "data-layout 'default', 오른쪽 Dock 없음", actual: `'${layoutAttr}', 오른쪽 Dock ${edgeCount}개`, how: "data-layout === 'default' && edge-dock 0개", pass: layoutAttr === 'default' && edgeCount === 0 })
  await away()
  await report.shot(page, { caption: '기본 설정으로 되돌린 화면', marks: [{ target: page.getByTestId('daily-log-page'), n: c15, label: '기본 배치' }] })

  // phones
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await phone.goto(BASE + '/timesheets?date=2026-11-16')
  await phone.getByRole('navigation', { name: 'Mobile navigation' }).waitFor()
  const editBtn = await phone.getByRole('button', { name: '배치 편집' }).count()
  report.check({ name: '휴대폰은 고정 배치(배치 편집 없음)', expected: '배치 편집 버튼 0개', actual: `${editBtn}개`, how: 'button 배치 편집 count === 0', pass: editBtn === 0 })
  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchO: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
