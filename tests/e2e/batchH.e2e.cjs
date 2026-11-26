// 11-23 (5): Daily Log No + English labels, admin edits No / names, sheet-name memory, .json save/load.
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const ExcelJS = require('/home/user/BWI_KoreaProduct_Timesheet_Jarvis/node_modules/exceljs')
const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS ? path.join(__dirname, process.env.SHOTS) : null
const TMP = path.join(__dirname, 'tmpH')
fs.mkdirSync(TMP, { recursive: true })
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }

// fictional master sheets: v1, and v2 = v1 + one more row
const RND = ['1101--Trail Lamp Mini', '1102--Harbor Beacon', '1103--Field Light Bar', '1104--Dock Flood Lamp', '1105--Signal Strobe Kit']
async function master(file, names) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Projects')
  ws.addRow(['No.', 'Project'])
  names.forEach((n, i) => ws.addRow([i + 1, n]))
  ws.addRow(['', 'Individual Sum'])
  await wb.xlsx.writeFile(file)
  return file
}

;(async () => {
  const v1 = await master(path.join(TMP, 'm1.xlsx'), RND)
  const v2 = await master(path.join(TMP, 'm2.xlsx'), [...RND, '1106--Cargo Work Lamp'])
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/jsdelivr|403|ERR_TUNNEL/.test(m.text()) && errors.push(m.text()))
  page.on('dialog', (d) => d.accept())
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const rows = (pg = page) =>
    pg.evaluate(() =>
      [...document.querySelectorAll('table:not([aria-label="MID list"]) tbody tr')]
        .filter((tr) => !tr.dataset.testid)
        .map((tr) => {
          const td = tr.querySelectorAll('td')
          return { no: td[1].innerText.trim(), name: td[2].innerText.trim().split('\n')[0], sheet: td[2].innerText.includes('시트 이름') }
        }),
    )
  const upload = async (file, pg = page) => {
    await pg.setInputFiles('input[aria-label="Master sheet file"]', file)
    await pg.getByRole('dialog', { name: 'Review master import' }).waitFor()
  }

  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await upload(v1)
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'baseline' }).waitFor()

  // ── Daily Log: English labels + No in the dropdown ─────────────────────────
  await page.getByRole('link', { name: 'Daily Log' }).click()
  const heads = (await page.locator('[role="grid"] > div').first().innerText()).replace(/\s+/g, ' ').trim()
  expect(heads === 'Time Category MID Sub Category Content', `English headers: ${heads}`)
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  const first = await page.getByRole('listbox').getByRole('option').first().innerText()
  expect(/^1\s*1101--Trail Lamp Mini/.test(first.trim()), `dropdown shows the No on the left ("${first.trim().replace(/\s+/g, ' ')}")`)
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'h_01_dropdown_no.png') })
  await page.keyboard.press('Escape')

  // ── Projects: double-click No ─────────────────────────────────────────────
  await page.getByRole('link', { name: 'Projects' }).click()
  await page.getByTestId('group-project').waitFor()
  await page.locator('tbody tr', { hasText: '1105--Signal Strobe Kit' }).locator('td').nth(1).dblclick()
  await page.getByLabel('No of 1105--Signal Strobe Kit').fill('2')
  await page.keyboard.press('Enter')
  await page.getByRole('status').filter({ hasText: '→ No 2' }).waitFor()
  let r = await rows()
  expect(r.slice(0, 5).map((x) => x.name.slice(0, 4)).join(' ') === '1101 1105 1102 1103 1104' && r.every((x, i) => x.no === String(i + 1)),
    'No 5 → 2: the row moves to No 2 and 2–4 shift down')
  const firstCo = r.find((x) => x.name.startsWith('00.Timelog'))
  await page.locator('tbody tr', { hasText: firstCo.name }).locator('td').nth(1).dblclick()
  await page.getByLabel(`No of ${firstCo.name}`).fill('1')
  await page.keyboard.press('Enter')
  await page.getByRole('status').filter({ hasText: '안에서만' }).waitFor()
  expect((await rows()).find((x) => x.name === firstCo.name).no === firstCo.no, `a CO-WORK row cannot jump into RND (stays No ${firstCo.no}, with a note)`)

  // the dropdown's 번호순 follows
  await page.getByRole('link', { name: 'Daily Log' }).click()
  await cell(17, 'category').click()
  await page.keyboard.press('Enter')
  await page.getByLabel('Sort options').click()
  await page.getByRole('menuitemradio', { name: '타임시트 번호순 (No)' }).click()
  const opts = (await page.getByRole('listbox').getByRole('option').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').trim())
  expect(opts[1].startsWith('2 1105'), `Daily Log 번호순 shows the new order (${opts[1]})`)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  // ── double-click a name; the sheet name is remembered ───────────────────────
  await page.getByRole('link', { name: 'Projects' }).click()
  await page.getByTestId('group-project').waitFor()
  await page.locator('tbody tr', { hasText: '1102--Harbor Beacon' }).getByText('1102--Harbor Beacon', { exact: true }).dblclick()
  await page.getByLabel('Project name', { exact: true }).fill('1102--Harbor Beacon Pro')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '이름 변경' }).waitFor()
  r = await rows()
  const pro = r.find((x) => x.name === '1102--Harbor Beacon Pro')
  expect(pro && pro.sheet, 'a master-sheet row can be renamed by double-click; it shows its sheet name')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'h_02_projects_edit.png') })

  await upload(v2)
  const review = page.getByRole('dialog', { name: 'Review master import' })
  const newCount = await review.getByRole('heading', { name: /^New/ }).innerText()
  const gone = await review.getByRole('heading', { name: /^No longer listed/ }).innerText()
  expect(newCount.includes('(1)') && gone.includes('(0)'), `re-uploading the sheet: the renamed row is matched by its sheet name (${newCount}, ${gone})`)
  await page.getByRole('button', { name: 'Apply import' }).click()
  await page.getByRole('status').filter({ hasText: 'Imported' }).waitFor()
  r = await rows()
  expect(r.some((x) => x.name === '1102--Harbor Beacon Pro') && !r.some((x) => x.name === '1102--Harbor Beacon'), 'after the import the app name is kept')

  // ── save the list (.json) ──────────────────────────────────────────────────
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '목록 저장 (.json)' }).click()])
  const saved = path.join(TMP, await dl.suggestedFilename())
  await dl.saveAs(saved)
  const file = JSON.parse(fs.readFileSync(saved, 'utf8'))
  const proEntry = file.projects.find((p) => p.name === '1102--Harbor Beacon Pro')
  expect(file.format === 'teamembedded-projects' && /teamembedded-projects-\d{4}-\d{2}-\d{2}\.json/.test(path.basename(saved)) && proEntry.sheet_name === '1102--Harbor Beacon',
    `목록 저장 writes ${path.basename(saved)} (${file.projects.length} rows, names, No, sheet names)`)

  // ── load an edited list ────────────────────────────────────────────────────
  const edited = JSON.parse(JSON.stringify(file))
  const rnd = edited.projects.filter((p) => p.kind === 'project')
  edited.projects = [
    ...rnd.reverse(),
    { ...rnd[0], no: null, name: '1107--Garage Light', sheet_name: null, code: null, manual: true, aliases: ['차고등'] },
    ...edited.projects.filter((p) => p.kind !== 'project'),
  ]
  edited.projects.find((p) => p.name.startsWith('1103')).aliases = ['필드바']
  const editedFile = path.join(TMP, 'edited.json')
  fs.writeFileSync(editedFile, JSON.stringify(edited))
  await page.setInputFiles('input[aria-label="Project list file"]', editedFile)
  const lr = page.getByRole('dialog', { name: 'Review project list' })
  await lr.waitFor()
  const text = await lr.innerText()
  expect(text.includes('추가 (1)') && text.includes('1107--Garage Light') && text.includes('별칭 추가 (2)') && /순서\(No\)가 바뀌는 항목 \d+개/.test(text), 'list preview shows adds, aliases and order changes before saving')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'h_03_list_preview.png') })
  await lr.getByRole('button', { name: '불러오기 적용' }).click()
  await page.getByRole('status').filter({ hasText: '목록을 불러왔습니다' }).waitFor()
  r = await rows()
  expect(r[0].name.startsWith('1106') && r[6].name === '1107--Garage Light' && r.every((x, i) => x.no === String(i + 1)), `loaded order applied (No 1 = ${r[0].name}, new row No 7)`)
  expect((await page.locator('tbody tr', { hasText: '1103--Field Light Bar' }).innerText()).includes('필드바'), 'aliases from the file are added')

  // loading the same file again changes nothing
  await page.setInputFiles('input[aria-label="Project list file"]', editedFile)
  await lr.waitFor()
  expect((await lr.innerText()).includes('바뀌는 내용이 없습니다') && (await lr.getByRole('button', { name: '불러오기 적용' }).isDisabled()), 'loading the same list again: nothing to change')
  await lr.getByRole('button', { name: '취소' }).click()

  // another browser (fresh demo data) loads the saved list
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p2 = await ctx2.newPage()
  await p2.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await p2.setInputFiles('input[aria-label="Project list file"]', saved)
  await p2.getByRole('dialog', { name: 'Review project list' }).waitFor()
  await p2.getByRole('button', { name: '불러오기 적용' }).click()
  await p2.getByRole('status').filter({ hasText: '목록을 불러왔습니다' }).waitFor()
  const r2 = await rows(p2)
  const want = file.projects.filter((p) => !p.hidden).map((p) => `${p.no} ${p.name}`)
  expect(r2.map((x) => `${x.no} ${x.name}`).join('|') === want.join('|'), `a fresh browser gets the same list with the same No (${r2.length} rows)`)
  await ctx2.close()

  // Korean labels unchanged
  await page.goto(BASE + '/settings')
  await page.getByRole('radiogroup', { name: 'Language' }).getByLabel('한국어').check()
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  const ko = (await page.locator('[role="grid"] > div').first().innerText()).replace(/\s+/g, ' ').trim()
  expect(ko === '시간 대분류 중분류 업무분류 업무내용', `Korean headers stay: ${ko}`)

  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await browser.close()
  console.log('batchH: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
