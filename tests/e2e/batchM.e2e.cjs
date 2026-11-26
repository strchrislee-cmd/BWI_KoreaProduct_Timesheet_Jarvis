// 2026-11-26 (2): bottom dock (auto-hide, magnify, labels). The Today window's placement moved to
// batchO (window layout). REPORT=1 writes docs/test-reports/<date>-dock/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'

const report = createReport({
  id: 'dock',
  title: 'Dock 메뉴 (아래 가운데, 자동 숨김)',
  suite: 'tests/e2e/batchM.e2e.cjs',
  request:
    '왼쪽 고정 메뉴를 iOS Dock처럼(아래 가운데, 평소엔 숨김). (추가) 커진 아이콘이 옆 아이콘을 가리지 않게, 마우스가 사라지면 숨게. Today 창 배치는 창 배치 편집 보고서(batchO)로 옮김.',
  criteria: [
    '왼쪽 메뉴가 없어지고 그 자리를 내용이 쓴다.',
    'Dock은 잠시 뒤 숨고, 마우스가 화면 아래 끝에 오면 아래 가운데에 나타나며, 멀어지면 다시 숨는다.',
    '아이콘에 마우스를 올리면 커지고 "이름 · 신 이름"이 뜨며, 누르면 그 화면으로 간다.',
    '커진 아이콘이 옆 아이콘을 가리지 않고, 마우스가 창 밖으로 나가도 숨는다.',
    '휴대폰은 하단 탭 바를 쓰고 Dock이 없다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  report.env(`Chromium ${browser.version()}`, '1440×900 (휴대폰 390×844)')
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const dock = page.getByTestId('dock')
  await dock.waitFor()
  const shown = () => dock.getAttribute('data-shown')

  // ── dock ────────────────────────────────────────────────────────────────
  const title = page.getByRole('heading', { name: 'Timesheets' })
  const tx = Math.round((await title.boundingBox()).x)
  const c1 = report.check({ name: '왼쪽 메뉴 없음: 화면 왼쪽 끝부터 내용', expected: '제목 x < 40px (예전 왼쪽 메뉴는 184px)', actual: `x = ${tx}px`, how: 'title.boundingBox().x < 40', pass: tx < 40 })
  await page.mouse.move(700, 400)
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]')?.dataset.shown === 'false', null, { timeout: 4000 })
  await page.waitForTimeout(350) // let the slide-down finish before the picture
  const c2 = report.check({ name: 'Dock은 잠시 뒤 숨는다', expected: "data-shown = 'false'", actual: `'${await shown()}'`, how: "dock.dataset.shown === 'false' (4초 안)", pass: (await shown()) === 'false' })
  await report.shot(page, { caption: 'Dock이 숨은 상태: 아래 가운데 작은 막대만 보임', marks: [{ target: title, n: c1, label: '왼쪽 끝부터' }, { target: dock.locator('xpath=preceding-sibling::div[1]'), n: c2, label: 'Dock 위치 표시' }] })
  await page.mouse.move(720, 895)
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]')?.dataset.shown === 'true')
  // the dock slides up over 300 ms; measure once it has arrived
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]').getBoundingClientRect().bottom <= window.innerHeight)
  await page.waitForTimeout(350)
  const box = await dock.boundingBox()
  const center = Math.round(box.x + box.width / 2)
  const c3 = report.check({ name: '마우스가 아래 끝에 오면 아래 가운데에 나타남', expected: '가운데 x ≈ 720px, 화면 안', actual: `가운데 x = ${center}px, 아래 ${Math.round(box.y + box.height)}px`, how: '|center − 720| < 4 && bottom ≤ 900', pass: Math.abs(center - 720) < 4 && box.y + box.height <= 900 })
  const ts = dock.getByRole('link', { name: 'Timesheets · Chronos' })
  const icon = ts.locator('[data-dock-icon]')
  const before = Math.round((await icon.boundingBox()).height)
  await ts.hover()
  await page.waitForTimeout(250)
  const after = Math.round((await icon.boundingBox()).height)
  const tip = ts.getByRole('tooltip')
  const tipText = (await tip.innerText()).replace(/\s+/g, ' ').trim()
  const c4 = report.check({ name: '아이콘에 마우스를 올리면 커지고 이름이 뜸', expected: '높이 1.2배 이상, "Timesheets Chronos"', actual: `${before}px → ${after}px, "${tipText}"`, how: "after > before × 1.2 && tooltip 에 'Chronos'", pass: after > before * 1.2 && tipText.includes('Chronos') })
  // 2026-11-26 bug: the grown icon covered its neighbours. Now they move aside, and the dock keeps its height.
  const spans = await dock.locator('[data-dock-icon]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right)] }))
  const overlap = Math.max(...spans.slice(1).map((b, k) => spans[k][1] - b[0]))
  const dockH = Math.round((await dock.boundingBox()).height)
  report.check({ name: '커진 아이콘이 옆 아이콘을 가리지 않음', expected: '아이콘끼리 겹침 0px 이하, Dock 높이 그대로', actual: `겹침 최대 ${overlap}px, Dock 높이 ${Math.round(box.height)} → ${dockH}px`, how: '앞 아이콘 right − 다음 아이콘 left ≤ 0 && |높이 차| ≤ 1', pass: overlap <= 0 && Math.abs(dockH - box.height) <= 1 })
  const links = await dock.getByRole('link').count()
  report.check({ name: 'Home · Timesheets · Admin · Settings, 앱 이름과 사용자', expected: '아이콘 4개 + TeamEmbedded', actual: `아이콘 ${links}개${(await dock.innerText()).includes('TeamEmbedded') ? ' + TeamEmbedded' : ''}`, how: "links === 4 && text 에 'TeamEmbedded'", pass: links === 4 && (await dock.innerText()).includes('TeamEmbedded') })
  await report.shot(page, { caption: 'Dock이 나타난 상태에서 Timesheets 아이콘에 마우스', marks: [{ target: dock, n: c3, label: '아래 가운데' }, { target: icon, n: c4 }] })
  await dock.getByRole('link', { name: 'Settings · Hephaestus' }).click()
  await page.waitForURL(/\/settings$/)
  report.check({ name: '아이콘을 누르면 이동', expected: '/settings', actual: new URL(page.url()).pathname, how: "pathname === '/settings'", pass: new URL(page.url()).pathname === '/settings' })
  await page.mouse.move(700, 300)
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]')?.dataset.shown === 'false', null, { timeout: 4000 })
  report.check({ name: '마우스가 멀어지면 다시 숨음', expected: "data-shown = 'false'", actual: `'${await shown()}'`, how: "dock.dataset.shown === 'false'", pass: (await shown()) === 'false' })
  // 2026-11-26 bug: leaving the window through the bottom edge (e.g. onto the taskbar) left the dock up
  await page.mouse.move(300, 895)
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]')?.dataset.shown === 'true')
  await page.mouse.move(300, 960, { steps: 3 })
  await page.waitForFunction(() => document.querySelector('[data-testid="dock"]')?.dataset.shown === 'false', null, { timeout: 3000 }).catch(() => {})
  report.check({ name: '마우스가 화면 아래로 빠져나가도 숨음', expected: "아래 끝에서 나타난 뒤 창 밖으로 나가면 data-shown = 'false'", actual: `'${await shown()}'`, how: "창 밖으로 이동 후 3초 안에 dock.dataset.shown === 'false'", pass: (await shown()) === 'false' })

  // phones
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await phone.goto(BASE + '/timesheets?date=2026-11-16')
  const tabbar = phone.getByRole('navigation', { name: 'Mobile navigation' })
  await tabbar.waitFor()
  const dockVisible = await phone.getByTestId('dock').isVisible()
  const c16 = report.check({ name: '휴대폰은 하단 탭 바, Dock 없음', expected: '탭 바 보임, Dock 안 보임', actual: `탭 바 보임, Dock ${dockVisible ? '보임' : '안 보임'}`, how: '!dock.isVisible()', pass: !dockVisible })
  await report.shot(phone, { caption: '휴대폰(390×844)', marks: [{ target: tabbar, n: c16, label: '탭 바' }] })
  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchM: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
