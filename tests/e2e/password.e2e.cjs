// 11-24: password sign-in, forgot-password link, Settings password, Admin temporary password.
// Runs the Supabase build (dist-mock, port 4174) against a fake Supabase served by page.route.
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
const PROFILE = {
  id: USER.id, email: USER.email, name: 'Boss', engineer_code: 'B1', role: 'admin', can_export: true, timezone: 'Asia/Seoul',
  work_start: '09:00', work_end: '18:00', lunch_start: '12:00', lunch_end: '13:00', daily_target_hours: 8, template_style: 'simple', preferences: {},
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const calls = { token: [], otp: [], user: [], invite: [] }

  await page.route(SB + '/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/token') {
      const body = req.postDataJSON()
      calls.token.push({ grant: url.searchParams.get('grant_type'), ...body })
      if (body.password !== 'right-pass-1') return json(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(200, { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user: USER })
    }
    if (url.pathname === '/auth/v1/otp') {
      calls.otp.push(req.postDataJSON())
      return json(200, {})
    }
    if (url.pathname === '/auth/v1/user') {
      if (req.method() === 'PUT') calls.user.push(req.postDataJSON())
      return json(200, USER)
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 })
    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.slice('/rest/v1/'.length)
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object')
      if (table === 'profiles') return json(200, single || url.searchParams.get('id') ? (single ? PROFILE : [PROFILE]) : [PROFILE])
      if (table === 'org_settings') return json(200, single ? { ai_enabled: false, ai_model: 'm' } : [{ ai_enabled: false, ai_model: 'm' }])
      return json(200, single ? null : [])
    }
    return json(404, { msg: 'not mocked: ' + url.pathname })
  })
  await page.route('**/api/admin/invite', async (route) => {
    const body = route.request().postDataJSON()
    calls.invite.push({ auth: route.request().headers()['authorization'], ...body })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sent: body.password ? 'password_new' : 'invite' }) })
  })

  // --- login screen
  await page.goto(BASE + '/')
  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  expect((await page.getByLabel('Password').count()) === 1, 'login screen asks for e-mail and password')
  await page.getByLabel('Work e-mail').fill('boss@example.com')
  await page.getByLabel('Password').fill('wrong-pass')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('alert').waitFor()
  expect((await page.getByRole('alert').innerText()).includes('Wrong e-mail or password'), 'wrong password shows a clear message')
  expect(calls.token.length === 1 && calls.token[0].grant === 'password' && calls.token[0].email === 'boss@example.com', 'password grant sent with the e-mail')

  await page.getByRole('button', { name: /Forgot password/ }).click()
  expect((await page.getByLabel('Password').count()) === 0, 'forgot password: password field hidden')
  await page.getByRole('button', { name: 'Send sign-in link' }).click()
  await page.getByText('Check your inbox').waitFor()
  expect(calls.otp.length === 1 && calls.otp[0].email === 'boss@example.com' && calls.otp[0].create_user === false, 'sign-in link sent without creating accounts')
  await page.getByRole('button', { name: 'Back to password sign-in' }).click()
  await page.getByLabel('Password').fill('right-pass-1')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByRole('link', { name: 'Settings' }).first().waitFor()
  expect(true, 'right password signs in')

  // --- Settings → password
  await page.goto(BASE + '/settings')
  await page.getByLabel('New password', { exact: true }).waitFor()
  const save = page.getByRole('button', { name: '비밀번호 저장' })
  await page.getByLabel('New password', { exact: true }).fill('short')
  await page.getByLabel('Confirm new password').fill('short')
  await save.click()
  await page.getByText('비밀번호는 8자 이상이어야 합니다.').waitFor()
  await page.getByLabel('New password', { exact: true }).fill('new-pass-123')
  await page.getByLabel('Confirm new password').fill('new-pass-124')
  await save.click()
  await page.getByText('두 칸의 비밀번호가 서로 다릅니다.').waitFor()
  expect(calls.user.length === 0, 'short or mismatched passwords are not sent')
  await page.getByLabel('Confirm new password').fill('new-pass-123')
  await save.click()
  await page.getByText('저장했습니다.', { exact: false }).waitFor()
  expect(calls.user.length === 1 && calls.user[0].password === 'new-pass-123', 'password saved to Supabase')
  expect((await page.getByLabel('New password', { exact: true }).inputValue()) === '', 'fields cleared after saving')

  // --- Admin → temporary password
  await page.goto(BASE + '/admin')
  await page.getByLabel('Temporary password').waitFor()
  await page.locator('input[type=email]').fill('colleague@example.com')
  expect((await page.getByRole('button', { name: 'Send invite' }).count()) === 1, 'empty password: Send invite')
  await page.getByLabel('Temporary password').fill('abc')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByText('Password must be at least 8 characters').waitFor()
  expect(calls.invite.length === 0, 'too-short temporary password is not sent')
  await page.getByLabel('Temporary password').fill('start-1234')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByText('계정을 만들었습니다(메일 없음)', { exact: false }).waitFor()
  expect(calls.invite.length === 1 && calls.invite[0].password === 'start-1234' && calls.invite[0].email === 'colleague@example.com' && calls.invite[0].auth === `Bearer ${JWT}`, 'temporary password sent to the invite API with the admin token')
  expect((await page.getByLabel('Temporary password').inputValue()) === '' && (await page.getByRole('button', { name: 'Send invite' }).count()) === 1, 'form cleared, back to Send invite')
  await page.screenshot({ path: __dirname + '/shots/password-admin.png' })
  expect(errors.length === 0, `no page errors (${errors.join(' | ')})`)

  // --- e-mail links: a used/expired link says so; a working reset link lands on the password card
  const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await fresh.route(SB + '/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await fresh.goto(BASE + '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await fresh.getByRole('alert').waitFor()
  expect((await fresh.getByRole('alert').innerText()).includes('already used or has expired'), 'expired link: the login screen says why')
  expect(!fresh.url().includes('#'), 'expired link: address bar cleaned')
  await fresh.close()

  const reset = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const resetErrors = []
  reset.on('pageerror', (e) => resetErrors.push(e.message))
  await reset.route(SB + '/**', (route) => {
    const url = new URL(route.request().url())
    const single = (route.request().headers()['accept'] || '').includes('vnd.pgrst.object')
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname === '/auth/v1/user') return json(USER)
    if (url.pathname === '/rest/v1/profiles') return json(single ? PROFILE : [PROFILE])
    if (url.pathname === '/rest/v1/org_settings') return json(single ? { ai_enabled: false, ai_model: 'm' } : [{ ai_enabled: false, ai_model: 'm' }])
    return json(single ? null : [])
  })
  await reset.goto(`${BASE}/#access_token=${JWT}&expires_at=${now + 3600}&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery`)
  await reset.getByTestId('set-password-prompt').waitFor()
  expect(new URL(reset.url()).pathname === '/settings', 'reset link: signed in and taken to Settings')
  expect((await reset.evaluate(() => document.activeElement?.getAttribute('aria-label'))) === 'New password', 'reset link: cursor in the new password field')
  await reset.screenshot({ path: __dirname + '/shots/password-reset-link.png' })
  await reset.goto(BASE + '/settings')
  await reset.getByLabel('New password', { exact: true }).waitFor()
  expect((await reset.getByTestId('set-password-prompt').count()) === 0, 'prompt only right after the link')
  expect(resetErrors.length === 0, `no page errors after the link (${resetErrors.join(' | ')})`)
  await reset.close()

  // --- demo build: no password card (there is no sign-in)
  const demo = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await demo.goto(DEMO + '/settings')
  await demo.getByText('Mode:').waitFor()
  expect((await demo.getByLabel('New password', { exact: true }).count()) === 0, 'demo mode has no password card')

  const login = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
  await login.route(SB + '/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await login.goto(BASE + '/')
  await login.getByRole('heading', { name: 'Sign in' }).waitFor()
  await login.screenshot({ path: __dirname + '/shots/password-login.png' })
  await browser.close()
  console.log('password: all checks passed')
})().catch((e) => { console.error(e); process.exit(1) })
