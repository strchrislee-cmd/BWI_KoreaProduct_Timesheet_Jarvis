// 11-23 (6): levels L1/L2/L3 (non-admin view), locked admin settings, personal aliases.
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4173'
const SHOTS = process.env.SHOTS ? path.join(__dirname, process.env.SHOTS) : null
const TMP = path.join(__dirname, 'tmpI')
fs.mkdirSync(TMP, { recursive: true })
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }
const LEAVE = '00.Timelog--Leave(휴가 및 휴무)'

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce', acceptDownloads: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !/jsdelivr|403|ERR_TUNNEL/.test(m.text()) && errors.push(m.text()))
  const cell = (i, col) => page.locator(`[data-cell="${i}:${col}"]`)
  const setRole = async (label) => {
    await page.goto(BASE + '/settings')
    await page.getByLabel('Demo role').selectOption({ label })
    await page.waitForFunction((l) => document.querySelector('nav')?.innerText.includes(l.split(' ')[0]), label)
  }

  // ── admin: the levels in user management ────────────────────────────────────
  await page.goto(BASE + '/admin')
  const roleOpts = await page.getByLabel('Role of demo@teamembedded.local').locator('option').allInnerTexts().catch(() => [])
  const inviteOpts = await page.locator('form select').first().locator('option').allInnerTexts()
  expect(inviteOpts.map((o) => o.split(' ')[0]).join(',') === 'L1,L2,L3,Admin', `invite levels: ${inviteOpts.join(' | ')}`)
  expect(roleOpts.length === 0 || roleOpts.join(',') === 'L1,L2,L3,Admin', `user role select: ${roleOpts.join(',') || '(demo user row)'}`)

  // ── switch the demo user to L1 ──────────────────────────────────────────────
  await setRole('L1 — 자기 시간 기록 · 개인 설정')
  const nav = await page.locator('nav').first().innerText()
  expect(nav.includes('L1') && !nav.includes('Admin'), 'as L1: the side menu shows L1 and no Admin page')

  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByTestId('admin-lock-note').waitFor()
  expect((await page.getByLabel('New project name').count()) === 0 && (await page.getByLabel(/^Rename /).count()) === 0 && (await page.getByLabel(/^Remove 0/).count()) === 0,
    'L1: no add / rename / remove controls; a lock note says the list is an admin setting')
  expect((await page.getByLabel('Project list file').count()) === 0, 'L1 cannot load a project list (can still save one)')
  const leaveRow = page.locator('tbody tr', { hasText: LEAVE })
  expect((await leaveRow.getByLabel('Remove alias 휴가').count()) === 0 && (await leaveRow.locator('[aria-label="관리자 설정"]').count()) === 1, 'team alias 휴가 shows a lock and cannot be removed')
  await leaveRow.getByText(LEAVE, { exact: true }).dblclick()
  await page.getByRole('status').filter({ hasText: '관리자 설정이라 수정할 수 없습니다' }).waitFor()
  expect((await page.getByLabel('Project name', { exact: true }).count()) === 0, 'double-clicking a name tells L1 it is an admin setting (no editor)')
  await leaveRow.locator('td').nth(1).dblclick()
  expect((await page.getByLabel(`No of ${LEAVE}`).count()) === 0, 'double-clicking the No does not open an editor either')

  // personal alias
  await leaveRow.getByLabel(`Add alias for ${LEAVE}`).fill('내휴가')
  await page.keyboard.press('Enter')
  await leaveRow.getByText('내휴가').waitFor()
  expect((await leaveRow.innerText()).includes('내\n내휴가') || (await leaveRow.innerText()).includes('내 내휴가') || (await leaveRow.getByLabel('Remove alias 내휴가').count()) === 1, 'L1 adds a personal alias (marked 내, removable)')
  await leaveRow.getByLabel(`Add alias for ${LEAVE}`).fill('휴가')
  await page.keyboard.press('Enter')
  await page.getByRole('alert').filter({ hasText: '이미 팀 별칭' }).waitFor()
  ok('a personal alias cannot repeat a team alias')
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'i_01_l1_projects.png') })

  // personal colours still work for L1
  await page.getByLabel('Group color of PROJECT CO-WORK').click()
  await page.getByRole('dialog', { name: 'Option menu' }).getByRole('button', { name: '보라색' }).click()
  await page.mouse.click(5, 5)
  expect((await leaveRow.getByLabel(`Color of ${LEAVE}`).evaluate((e) => getComputedStyle(e).backgroundColor)) === 'rgb(144, 101, 176)', 'L1 can still set personal colours (대분류 common colour)')

  // the personal alias maps L1's own time
  await page.goto(BASE + '/timesheets?date=2026-11-16')
  expect((await page.getByLabel('Engineer').count()) === 0, 'L1 has no engineer picker (nobody else to read)')
  await cell(18, 'category').click()
  await page.keyboard.type('내휴가')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  const text = await cell(18, 'category').innerText()
  expect(!text.includes('⚠') && (await page.getByText('Unmapped categories').count()) === 0, `typing the personal alias maps to the project (cell: ${text.trim()})`)

  // ── back to admin ────────────────────────────────────────────────────────────
  await setRole('Admin — 사용자·프로젝트 관리, 모든 자료')
  await page.goto(BASE + '/timesheets/projects?date=2026-11-16')
  await page.getByTestId('group-project').or(page.getByTestId('group-timelog')).first().waitFor()
  expect((await page.getByTestId('admin-lock-note').count()) === 0 && (await page.locator('tbody tr', { hasText: LEAVE }).getByLabel('Remove alias 휴가').count()) === 1, 'admin: no lock note, team aliases removable')
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '목록 저장 (.json)' }).click()])
  const saved = path.join(TMP, 'list.json')
  await dl.saveAs(saved)
  const file = JSON.parse(fs.readFileSync(saved, 'utf8'))
  const leave = file.projects.find((p) => p.name === LEAVE)
  expect(leave.aliases.includes('휴가') && !leave.aliases.includes('내휴가'), 'the saved list holds team aliases only (personal ones stay personal)')

  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)
  await browser.close()
  console.log('batchI: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
