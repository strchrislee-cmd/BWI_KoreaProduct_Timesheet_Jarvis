// 2026-11-27 (14): AI 정리 with the company's key, and correction proposals shown as a diff.
// The admin sets the key, the daily limit and sees who used how much (Admin → AI 정리); a person gets a
// diff of AI-proposed changes to their own day and applies what they choose; an admin or a higher level
// sends a proposal to someone below them, who sees the same diff and applies rows of it.
// The demo has no server: the test answers POST /api/ai/cleanup itself (what the server would return).
// REPORT=1 writes docs/test-reports/<date>-ai-cleanup/ (see report.cjs).
const { chromium } = require('playwright')
const { createReport } = require('./report.cjs')
const BASE = process.env.BASE || 'http://localhost:4173'
const DAY = '2026-11-27'
const KEY = 'sk-ant-api03-demo-key-000000000wxyz'

const report = createReport({
  id: 'ai-cleanup',
  title: 'AI 정리 + 수정 제안(diff)',
  suite: 'tests/e2e/batchU.e2e.cjs',
  request:
    '관리자 화면에만 AI API 키를 넣고, 가장 싼 모델로 운영. 1인당 하루 사용 횟수 제한, 누가 얼마나 썼는지 기록. 직원이 AI 정리를 누르면 Task·Project·Type 수정 제안 → 확인 후 적용(자기 기록만). 관리자·상위자가 diff로 수정 제안을 보내고, 담당자도 diff로 비교해 적용.',
  criteria: [
    '개인 설정에는 AI 칸이 없고, 관리자 화면에서만 AI 켜기·하루 횟수·API 키(끝 4자리만 보임)를 정한다.',
    'AI가 꺼져 있으면 Daily Log에 AI 정리 버튼이 없다. 켜지면 자기 기록에서만 보인다.',
    'AI 정리: 바뀌는 칸(Project·Type·Task)을 지운 글자 → 새 글자로 보여 주고, 고른 줄만 적용한다.',
    '사용할 때마다 기록되어 관리자 화면에 사람별 횟수·토큰·비용이 보이고, 하루 횟수를 넘으면 막힌다.',
    '관리자·상위자는 아래 사람 기록에 수정 제안(직접 고치거나 AI로 채우기 + 메모)을 보내고, 받는 사람에게 보일 비교 화면을 미리 본다.',
    '받은 사람은 Daily Log에서 같은 비교 화면을 보고 줄마다 골라 적용, 보낸 사람은 조직도에서 결과를 본다.',
  ],
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const page = await ctx.newPage()
  await page.clock.setFixedTime(new Date(`${DAY}T10:10:00`))
  report.env(`Chromium ${browser.version()}`, `1440×900, 시계 ${DAY} 10:10 고정, 데모 모드(서버 응답은 테스트가 대신)`)
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('timecrumbs-demo-v1')))
  const cell = (i, col) => page.getByTestId('grid-scroll').locator(`[data-cell="${i}:${col}"]`)
  const toLog = async () => {
    await page.goto(BASE + `/timesheets?date=${DAY}`)
    await cell(18, 'category').waitFor()
    await page.waitForTimeout(300)
  }
  const paste = async (i, tsv) => {
    await cell(i, 'category').click()
    await page.evaluate((t) => navigator.clipboard.writeText(t), tsv)
    await page.keyboard.press('Control+V')
    await page.waitForTimeout(400)
  }

  // ── before AI is on: no AI in personal Settings, no button in the Daily Log ──
  await toLog()
  await paste(18, '설계\t도면검토\n설계\t도면검토\n품질\t8D 보고')
  const offButton = await page.getByRole('button', { name: 'AI 정리' }).count()
  await page.goto(BASE + '/settings')
  await page.getByRole('heading', { name: 'Settings' }).waitFor()
  const settingsAi = await page.getByText(/AI provider|AI 정리/).count()

  // ── Admin → AI 정리: turn on, limit, key (only its last 4 characters come back) ──
  await page.goto(BASE + '/admin')
  const admin = page.getByTestId('admin-ai')
  await admin.waitFor()
  await page.getByLabel('Enable AI cleanup').check()
  await page.getByLabel('Daily AI uses per person').fill('2')
  await page.getByRole('button', { name: '설정 저장' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Anthropic API key').fill(KEY)
  await page.getByRole('button', { name: '키 저장' }).click()
  await page.waitForTimeout(300)
  const hint = await page.getByTestId('ai-key-hint').innerText()
  const keyField = await page.getByLabel('Anthropic API key').inputValue()
  const stored = JSON.stringify(await state())
  const c1 = report.check({
    name: 'AI 설정은 관리자 화면에만, 키는 끝 4자리만 보임',
    expected: "끄기 전 Daily Log 버튼 0개, 개인 설정 AI 칸 0개, 키 저장 후 '저장된 키: …wxyz', 입력칸 비움, 저장된 자료에 키 원문 없음",
    actual: `버튼 ${offButton}개, 설정 AI 칸 ${settingsAi}개, '${hint}', 입력칸 '${keyField}', 원문 저장 ${stored.includes(KEY)}`,
    how: "AI 정리 버튼 수 0, Settings 의 'AI provider' 0, ai-key-hint 글자, localStorage 에 KEY 없음",
    pass: offButton === 0 && settingsAi === 0 && hint.includes('…wxyz') && keyField === '' && !stored.includes(KEY),
  })
  await report.shot(page, { caption: '관리자 화면 → AI 정리: 켜기, 1인당 하루 횟수, API 키(끝 4자리만)', marks: [{ target: admin, n: c1, label: '관리자만' }] })

  // ── AI 정리 on your own day: the diff, choose rows, apply ──
  const s0 = await state()
  const general = s0.projects.find((p) => p.system_key === 'general')
  const typeId = (name) => s0.workTypes.find((w) => w.name === name).id
  const fields = (p, label, type, task) => ({ group_project_id: p, label, work_type_id: type, description: task })
  const aiAnswer = {
    items: [
      { slots: [18, 19], before: fields(null, '설계', null, '도면검토'), after: fields(general.id, '', typeId('개발-신규'), '도면 검토'), reason: '설계 업무는 일반업무로, 띄어쓰기를 고쳤습니다' },
      { slots: [20], before: fields(null, '품질', null, '8D 보고'), after: fields(null, '품질', typeId('지원-8D'), '8D 보고'), reason: '8D 보고는 지원-8D 유형입니다' },
    ],
    remaining: 1,
    usage: { input_tokens: 1200, output_tokens: 200, cost_usd: 0.00022 },
  }
  let calls = 0
  await page.route('**/api/ai/cleanup', async (route) => {
    calls++
    await route.fulfill({ json: aiAnswer })
  })
  await toLog()
  await page.getByRole('button', { name: 'AI 정리' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 정리' })
  await dialog.waitFor()
  const items = dialog.getByTestId('diff-item')
  const changed = await items.evaluateAll((els) => els.map((e) => e.dataset.changed))
  const first = await items.first().evaluate((e) => ({
    before: [...e.querySelectorAll('[data-side="before"]')].map((x) => x.textContent),
    after: [...e.querySelectorAll('[data-side="after"]')].map((x) => x.textContent),
  }))
  const c2 = report.check({
    name: 'AI 정리: 바뀌는 칸만 지운 글자 → 새 글자로',
    expected: "2줄, 첫 줄 project·type·task 모두 바뀜(⚠ 설계 → 일반업무…, — → 개발-신규, 도면검토 → 도면 검토), 둘째 줄은 type만",
    actual: `바뀐 칸 [${changed.join(' / ')}] · 전 [${first.before.join(', ')}] · 후 [${first.after.join(', ')}]`,
    how: 'diff-item 의 data-changed, del/ins(data-side) 글자',
    pass:
      changed.join('|') === 'project,type,task|type' &&
      first.before.join('|') === '⚠ 설계|—|도면검토' &&
      first.after[0].includes('일반업무') &&
      first.after[1] === '개발-신규' &&
      first.after[2] === '도면 검토',
  })
  await report.shot(page, { caption: 'AI 정리 결과: 지운 글자(빨강) → 새 글자(초록), 줄마다 고르기', marks: [{ target: items.first(), n: c2, label: '비교' }] })
  await dialog.getByLabel('Apply 10:00–10:30').uncheck()
  await dialog.getByRole('button', { name: '선택한 1개 적용' }).click()
  await page.waitForTimeout(600)
  const rowsAfter = [await cell(18, 'category').innerText(), await cell(19, 'task').innerText(), await cell(18, 'mid').innerText(), await cell(20, 'mid').innerText()]
  const notice = await page.getByRole('status').filter({ hasText: '적용했습니다' }).innerText()
  const c3 = report.check({
    name: '고른 줄만 적용 (Ctrl+Z로 되돌리기 가능)',
    expected: "09:00·09:30은 일반업무 · 개발-신규 · '도면 검토', 10:00(체크 해제)은 Type 그대로 비어 있음, '1개 적용했습니다'",
    actual: `09:00 '${rowsAfter[0]}', 09:30 Task '${rowsAfter[1]}', 09:00 Type '${rowsAfter[2]}', 10:00 Type '${rowsAfter[3]}', 안내 '${notice}'`,
    how: 'Daily Log 칸 글자와 안내 문구',
    pass: rowsAfter[0].includes('일반업무') && rowsAfter[1] === '도면 검토' && rowsAfter[2] === '개발-신규' && !rowsAfter[3].includes('지원-8D') && notice.startsWith('1개 적용했습니다'),
  })

  // usage recorded; the daily limit (2) stops the third use
  await page.getByRole('button', { name: 'AI 정리' }).click()
  await page.getByRole('dialog', { name: 'AI 정리' }).getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: 'AI 정리' }).click()
  await page.waitForTimeout(400)
  const limitMsg = await page.getByRole('alert').first().innerText()
  await page.goto(BASE + '/admin')
  await page.getByTestId('admin-ai').waitFor()
  const usageRow = await page.locator('[data-testid="ai-usage-row"][data-person="Demo User"]').innerText()
  const c4 = report.check({
    name: '사용 기록(사람별 횟수·토큰·비용)과 하루 횟수 제한',
    expected: "2회 쓴 뒤 3번째는 '오늘 AI 정리 2회를 모두 썼습니다', 서버 호출 2번, 관리자 표 Demo User 오늘 2/2 · 2회 · 2,800토큰 · 0.0004",
    actual: `안내 '${limitMsg}', 호출 ${calls}번, 표 '${usageRow.replace(/\s+/g, ' ')}'`,
    how: 'alert 문구, /api/ai/cleanup 호출 수, ai-usage-row 글자',
    pass: limitMsg.includes('오늘 AI 정리 2회를 모두 썼습니다') && calls === 2 && /2 \/ 2/.test(usageRow) && usageRow.includes('2,800') && usageRow.includes('0.0004'),
  })
  await report.shot(page, { caption: '관리자 화면: 사람별 AI 사용량(오늘/30일, 토큰, 비용)', marks: [{ target: page.getByLabel('AI usage by person'), n: c4, label: '사용 기록' }] })

  // ── a proposal to someone below: edit or AI-fill, preview the diff, send ──
  await page.getByLabel('Daily AI uses per person').fill('10')
  await page.getByRole('button', { name: '설정 저장' }).click()
  await page.waitForTimeout(300)
  await page.goto(BASE + `/timesheets/org?date=${DAY}`)
  await page.getByRole('button', { name: '데모 팀원 만들기' }).click()
  await page.waitForTimeout(400)
  const s1 = await state()
  const dh = s1.profiles.find((p) => p.name === '윤도현')
  const meeting = s1.projects.find((p) => p.system_key === 'meeting')
  await page.unroute('**/api/ai/cleanup')
  await page.route('**/api/ai/cleanup', (route) =>
    route.fulfill({
      json: {
        items: [{ slots: [22, 23], before: fields(meeting.id, '', null, '설계 회의'), after: fields(meeting.id, '', typeId('회의-INT'), '설계 회의'), reason: '회의는 회의-INT 유형입니다' }],
        remaining: 9,
        usage: { input_tokens: 900, output_tokens: 120, cost_usd: 0.00015 },
      },
    }),
  )
  await toLog()
  await page.getByTestId('team-panel').getByRole('checkbox', { name: '윤도현', exact: true }).check()
  await page.waitForTimeout(600)
  const sheet = page.locator('[data-testid="team-sheet"][data-person="윤도현"]').locator('xpath=ancestor::section[1]')
  await sheet.getByRole('button', { name: '수정 제안' }).click()
  const editor = page.getByTestId('proposal-editor')
  await editor.waitFor()
  await editor.getByLabel('Task at 09:00–11:00').fill('도면 검토 (A사)')
  await editor.getByRole('button', { name: 'AI로 채우기' }).click()
  await page.waitForTimeout(400)
  await editor.getByLabel('Note').fill('회의는 회의-INT로 적어 주세요')
  const preview = await editor.getByTestId('proposal-preview').getByTestId('diff-item').evaluateAll((els) => els.map((e) => e.dataset.changed))
  const c5 = report.check({
    name: '수정 제안 만들기: 직접 고치기 + AI로 채우기, 받는 사람 화면 미리보기',
    expected: '미리보기 2줄: 09:00 Task(직접 고침), 11:00 Type(AI가 채움), 메모 포함',
    actual: `미리보기 [${preview.join(' / ')}], 메모 '${await editor.getByLabel('Note').inputValue()}'`,
    how: 'proposal-preview 안 diff-item 의 data-changed',
    pass: preview.join('|') === 'task|type',
  })
  await report.shot(page, { caption: '수정 제안 편집: 고치기·AI로 채우기·메모, 아래는 받는 사람에게 보일 비교 화면', marks: [{ target: editor.getByTestId('proposal-preview'), n: c5, label: '미리보기' }] })
  await editor.getByRole('button', { name: '제안 보내기 (2줄)' }).click()
  await page.waitForTimeout(400)
  const sentState = (await state()).proposals.find((p) => p.owner_id === dh.id)
  await page.goto(BASE + `/timesheets/org?date=${DAY}`)
  const sentRow = page.getByTestId('sent-proposal').first()
  await sentRow.waitFor()
  const sentText = (await sentRow.innerText()).replace(/\s+/g, ' ')
  const c6 = report.check({
    name: '제안을 보내면 조직도에 보낸 제안(기다리는 중)',
    expected: "저장된 제안: 윤도현, 2줄, AI 사용, 메모; 조직도에 '윤도현 … 2줄 · AI … 기다리는 중'",
    actual: `저장 ${sentState ? `${sentState.items.length}줄, AI ${sentState.by_ai}, 메모 '${sentState.note}'` : '없음'} · 조직도 '${sentText}'`,
    how: 'localStorage proposals 와 sent-proposal 글자',
    pass: !!sentState && sentState.items.length === 2 && sentState.by_ai && sentState.note.includes('회의-INT') && sentText.includes('윤도현') && sentText.includes('기다리는 중'),
  })

  // ── receiving: the same diff in the Daily Log, choose rows, apply ──
  const s2 = await state()
  const lead = s2.profiles.find((p) => p.name === '한서윤')
  const cur = s2.slots.find((x) => x.user_id === 'demo-admin' && x.work_date === DAY && x.slot_index === 18)
  await page.evaluate(
    ({ lead, cur, DAY, typeMeeting }) => {
      const s = JSON.parse(localStorage.getItem('timecrumbs-demo-v1'))
      const f = (x) => ({ group_project_id: x.group_project_id, label: x.label, work_type_id: x.work_type_id, description: x.description })
      s.proposals.push({
        id: 'proposal-from-lead',
        owner_id: 'demo-admin',
        author_id: lead,
        work_date: DAY,
        items: [
          { slots: [18, 19], before: f(cur), after: { ...f(cur), description: '도면 검토 및 승인' }, reason: '승인까지 했다면 함께 적어 주세요' },
          { slots: [20], before: { group_project_id: null, label: '품질', work_type_id: null, description: '8D 보고' }, after: { group_project_id: null, label: '품질', work_type_id: typeMeeting, description: '8D 보고' }, reason: '' },
        ],
        note: '이번 주 기록 확인 부탁해요',
        by_ai: false,
        status: 'open',
        applied: null,
        created_at: new Date().toISOString(),
        answered_at: null,
      })
      localStorage.setItem('timecrumbs-demo-v1', JSON.stringify(s))
    },
    { lead: lead.id, cur, DAY, typeMeeting: typeId('회의-INT') },
  )
  await toLog()
  const banner = page.getByTestId('proposal-banner')
  const bannerText = await banner.innerText()
  await banner.getByRole('button').first().click()
  const recv = page.getByRole('dialog', { name: '수정 제안 · 한서윤' })
  await recv.waitFor()
  const recvNote = await recv.getByText('이번 주 기록 확인 부탁해요').count()
  await report.shot(page, { caption: '받은 수정 제안: 보낸 사람의 메모와 비교 화면, 줄마다 고르기', marks: [{ target: recv.getByTestId('diff-item').first(), n: 7, label: '받은 비교' }] })
  await recv.getByLabel('Apply 10:00–10:30').uncheck()
  await recv.getByRole('button', { name: '선택한 1개 적용' }).click()
  await page.waitForTimeout(700)
  const answered = (await state()).proposals.find((p) => p.id === 'proposal-from-lead')
  const task18 = await cell(18, 'task').innerText()
  const bannerAfter = await page.getByTestId('proposal-banner').count()
  report.check({
    name: '받은 사람: Daily Log에 알림 → 같은 비교 화면 → 고른 줄만 적용',
    expected: "알림 '받은 수정 제안 1건 · 한서윤 · 2줄', 메모 보임, 적용 후 09:00 Task '도면 검토 및 승인', 제안은 answered [0], 알림 사라짐",
    actual: `알림 '${bannerText.replace(/\s+/g, ' ')}', 메모 ${recvNote}개, 09:00 '${task18}', 상태 ${answered.status} [${answered.applied}], 알림 ${bannerAfter}개`,
    how: 'proposal-banner 글자, 대화상자 메모, 칸 글자, localStorage 제안 상태',
    pass: bannerText.includes('받은 수정 제안 1건') && bannerText.includes('한서윤') && recvNote === 1 && task18 === '도면 검토 및 승인' && answered.status === 'answered' && String(answered.applied) === '0' && bannerAfter === 0,
  })

  // L2: proposes only to the L1s below them (not to an L2 of their level)
  await page.goto(BASE + '/settings')
  await page.getByLabel('Demo role').selectOption('l2')
  await page.waitForTimeout(300)
  await toLog()
  const panelNames = await page.getByTestId('team-panel').locator('input[type="checkbox"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  const l2Sheets = await page.getByTestId('team-sheet').evaluateAll((els) => els.map((e) => e.dataset.person))
  const l2Buttons = await page.locator('section:has([data-testid="team-sheet"])').getByRole('button', { name: '수정 제안' }).count()
  report.check({
    name: 'L2: 아래 L1에게만 제안 (같은 등급 L2는 팀원 창에도 없음)',
    expected: '팀원 창에 오하린(L2) 없음, 보이는 L1 기록마다 수정 제안 버튼',
    actual: `팀원 창 [${panelNames.join(', ')}], 기록 [${l2Sheets.join(', ')}], 버튼 ${l2Buttons}개`,
    how: '팀원 창 이름, team-sheet 수와 수정 제안 버튼 수가 같음',
    pass: !panelNames.includes('오하린') && l2Sheets.length > 0 && l2Buttons === l2Sheets.length,
  })

  report.check({ name: '페이지 오류 없음', expected: '0건', actual: `${errors.length}건${errors.length ? ': ' + errors.join(' | ') : ''}`, how: 'pageerror 수 === 0', pass: errors.length === 0 })
  report.save()
  await browser.close()
  console.log('batchU: all checks passed')
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
