// 11-24 (3): Admin → Users: set someone's password (dialog) and delete an account (confirm).
// Supabase build (dist-mock, port 4174) against a fake Supabase served by page.route.
const { chromium } = require('playwright')
const BASE = process.env.BASE || 'http://localhost:4174'
const DEMO = process.env.DEMO || 'http://localhost:4173'
const SB = 'https://mock.supabase.test'
let step = 0
const ok = (m) => console.log(`  ✓ ${++step}. ${m}`)
const expect = (c, m) => { if (!c) throw new Error('FAILED: ' + m); ok(m) }

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const now = Math.floor(Date.now() / 1000)
const USER = { id: 'u-admin', aud: 'authenticated', role: 'authenticated', email: 'boss@example.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' }
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', aud: 'authenticated', exp: now + 3600, iat: now, email: USER.email })}.sig`
const base = { engineer_code: '', can_export: true, timezone: 'Asia/Seoul', work_start: '09:00', work_end: '18:00', lunch_start: '12:00', lunch_end: '13:00', daily_target_hours: 8, template_style: 'simple', preferences: {} }
const ME = { ...base, id: USER.id, email: USER.email, name: 'Boss', role: 'admin' }
let team = [ME, { ...base, id: 'u-col', email: 'colleague@example.com', name: 'colleague', role: 'l2' }]

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const calls = []
  await page.route(SB + '/**', (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') return json(200, { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user: USER })
    if (url.pathname === '/auth/v1/user') return json(200, USER)
    if (url.pathname === '/rest/v1/profiles') return json(200, url.searchParams.get('id') ? (single ? ME : [ME]) : team)
    if (url.pathname === '/rest/v1/org_settings') return json(200, single ? { ai_enabled: false, ai_model: 'm' } : [{ ai_enabled: false, ai_model: 'm' }])
    return json(200, single ? null : [])
  })
  await page.route('**/api/admin/user', (route) => {
    const body = route.request().postDataJSON()
    calls.push({ auth: route.request().headers()['authorization'], ...body })
    if (body.action === 'delete') team = team.filter((p) => p.id !== body.user_id)
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })

  await page.goto(BASE + '/')
  await page.getByLabel('Work e-mail').fill('boss@example.com')
  await page.getByLabel('Password').fill('right-pass-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Admin' }).first().click()
  const row = (email) => page.locator('tbody tr', { hasText: email }).first()
  await row('colleague@example.com').waitFor()
  expect((await row('boss@example.com').getByRole('button').count()) === 0 && (await row('boss@example.com').innerText()).includes('비밀번호는 설정에서'), 'own row: no buttons, points to Settings')
  expect((await row('colleague@example.com').getByRole('button', { name: 'Set password of colleague@example.com' }).count()) === 1, 'other row: password button')
  expect((await row('colleague@example.com').getByRole('button', { name: 'Delete user colleague@example.com' }).count()) === 1, 'other row: delete button')

  // password dialog
  await row('colleague@example.com').getByRole('button', { name: 'Set password of colleague@example.com' }).click()
  const dialog = page.getByRole('dialog', { name: '비밀번호 설정' })
  await dialog.waitFor()
  expect((await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'New temporary password', 'dialog opens with the cursor in the password field')
  await dialog.getByLabel('New temporary password').fill('abc')
  await dialog.getByRole('button', { name: '저장' }).click()
  await dialog.getByText('Password must be at least 8 characters').waitFor()
  expect(calls.length === 0, 'too-short password is not sent')
  await dialog.getByLabel('New temporary password').fill('start-1234')
  await dialog.getByRole('button', { name: '저장' }).click()
  await page.getByText('colleague@example.com: 비밀번호를 바꿨습니다(메일 없음)', { exact: false }).waitFor()
  expect((await dialog.count()) === 0, 'dialog closes after saving')
  expect(calls[0].action === 'set_password' && calls[0].user_id === 'u-col' && calls[0].password === 'start-1234' && calls[0].auth === `Bearer ${JWT}`, 'password sent to the admin API with the admin token')

  // delete: cancel first, then confirm
  let asked = ''
  page.once('dialog', (d) => { asked = d.message(); void d.dismiss() })
  await row('colleague@example.com').getByRole('button', { name: 'Delete user colleague@example.com' }).click()
  await page.waitForTimeout(200)
  expect(asked.includes('colleague@example.com') && asked.includes('되돌릴 수 없습니다') && calls.length === 1, 'delete asks first and warns; cancelling sends nothing')
  page.once('dialog', (d) => void d.accept())
  await row('colleague@example.com').getByRole('button', { name: 'Delete user colleague@example.com' }).click()
  await page.getByText('colleague@example.com 계정을 삭제했습니다.').waitFor()
  expect(calls[1].action === 'delete' && calls[1].user_id === 'u-col', 'delete sent to the admin API')
  await page.waitForTimeout(300)
  expect((await page.locator('tbody tr', { hasText: 'colleague@example.com' }).count()) === 0, 'the row is gone after the delete')
  await page.screenshot({ path: __dirname + '/shots/users-admin.png' })
  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)

  // demo build: own row only, no password button
  const demo = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await demo.goto(DEMO + '/admin')
  await demo.getByText('Users', { exact: true }).waitFor()
  expect((await demo.getByRole('button', { name: /^Set password of/ }).count()) === 0, 'demo: no password buttons')
  await browser.close()
  console.log('users: all checks passed')
})().catch((e) => { console.error(e); process.exit(1) })
