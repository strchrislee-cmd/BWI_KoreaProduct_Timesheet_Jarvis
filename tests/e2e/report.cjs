// Test report for a browser suite: every check (test case, expected, actual, assertion, PASS/FAIL)
// plus annotated screenshots (a red outline and the check's number drawn on the element it looked
// at). With REPORT=1 the suite writes docs/test-reports/<date>-<id>/index.html and the list page
// docs/test-reports/index.html. Without REPORT the checks still run and print as before.
// Demo data only: the repository is public.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..', '..')
const OUT = path.join(ROOT, 'docs', 'test-reports')
const MARK = '#E5484D'

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const localDate = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function commit() {
  try {
    const head = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
    const dirty = execSync('git status --porcelain -- src supabase api', { cwd: ROOT }).toString().trim()
    return dirty ? `${head} + 커밋 전 변경` : head
  } catch {
    return '—'
  }
}

/**
 * @param {{ id: string, title: string, request: string, criteria: string[], suite: string }} meta
 */
function createReport(meta) {
  const enabled = !!process.env.REPORT
  const date = process.env.REPORT_DATE || localDate()
  const dir = path.join(OUT, `${date}-${meta.id}`)
  const checks = []
  const shots = []
  let env = { browser: '', viewport: '' }
  if (enabled) {
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(dir, { recursive: true })
  }

  const report = {
    /** browser + viewport shown in the report header */
    env(browserVersion, viewport) {
      env = { browser: browserVersion, viewport }
    },
    /**
     * One test case. Throws on FAIL (after saving the report), like the plain expect() of the suites.
     * @param {{ name: string, expected: string, actual: string, how: string, pass: boolean }} c
     * @returns {number} the case number, for marks on screenshots
     */
    check(c) {
      const n = checks.length + 1
      checks.push({ n, ...c, pass: !!c.pass, shot: null })
      console.log(`  ${c.pass ? '✓' : '✗'} ${n}. ${c.name}`)
      if (!c.pass) {
        report.save()
        throw new Error(`FAILED: ${c.name} — expected ${c.expected}, got ${c.actual}`)
      }
      return n
    },
    /**
     * Annotated screenshot: outlines and numbers on the elements the given checks looked at.
     * @param {import('playwright').Page} page
     * @param {{ caption: string, marks: { target: any, n: number, label?: string }[] }} s
     */
    async shot(page, { caption, marks }) {
      if (!enabled) return
      const boxes = []
      for (const m of marks) {
        const b = typeof m.target?.boundingBox === 'function' ? await m.target.boundingBox() : m.target
        if (b) boxes.push({ x: b.x, y: b.y, width: b.width, height: b.height, n: m.n, label: m.label ?? '' })
      }
      await page.evaluate(
        ({ boxes, color }) => {
          const root = document.createElement('div')
          root.id = '__test_report_marks'
          root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
          for (const b of boxes) {
            const r = document.createElement('div')
            r.style.cssText = `position:fixed;left:${b.x - 4}px;top:${b.y - 4}px;width:${b.width + 8}px;height:${b.height + 8}px;border:3px solid ${color};border-radius:8px;box-shadow:0 0 0 4px ${color}33`
            const badge = document.createElement('div')
            badge.textContent = String(b.n)
            badge.style.cssText = `position:absolute;left:-15px;top:-15px;min-width:26px;height:26px;padding:0 6px;box-sizing:border-box;border-radius:13px;background:${color};color:#fff;font:700 13px/26px system-ui,sans-serif;text-align:center;box-shadow:0 1px 4px #0005`
            r.appendChild(badge)
            if (b.label) {
              const t = document.createElement('div')
              t.textContent = b.label
              const above = b.y > 40
              t.style.cssText = `position:absolute;left:16px;${above ? 'top:-30px' : 'bottom:-30px'};white-space:nowrap;background:${color};color:#fff;font:600 12px/22px system-ui,sans-serif;padding:0 8px;border-radius:6px;box-shadow:0 1px 4px #0004`
              r.appendChild(t)
            }
            root.appendChild(r)
          }
          document.body.appendChild(root)
        },
        { boxes, color: MARK },
      )
      const file = `shot-${String(shots.length + 1).padStart(2, '0')}.jpg`
      await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 82 })
      await page.evaluate(() => document.getElementById('__test_report_marks')?.remove())
      const id = shots.length + 1
      const { width, height } = page.viewportSize()
      shots.push({ id, file, width, height, caption, marks: marks.map((m) => ({ n: m.n, label: m.label ?? '' })) })
      for (const m of marks) {
        const c = checks.find((x) => x.n === m.n)
        if (c && !c.shot) c.shot = id
      }
    },
    save() {
      if (!enabled) return
      const data = { ...meta, date, commit: commit(), env, checks, shots, passed: checks.filter((c) => c.pass).length, total: checks.length }
      fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(data, null, 2))
      fs.writeFileSync(path.join(dir, 'index.html'), reportPage(data, { full: true }))
      writeIndex()
    },
  }
  return report
}

// ── HTML ────────────────────────────────────────────────────────────────────

const STYLE = `
:root {
  /* QA sheet: summary band, a table of test cases, then the evidence; red marks match the screenshots */
  --bg: #F6F7F8; --surface: #FFFFFF; --ink: #1B2228; --muted: #5E6A73; --line: #DDE2E6;
  --pass: #1E7B4D; --pass-bg: #E3F3EA; --fail: #B4232B; --fail-bg: #FBE6E7; --mark: ${MARK}; --accent: #1F4D3A;
  --font: 'IBM Plex Sans KR', system-ui, -apple-system, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  --mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #12171B; --surface: #1A2126; --ink: #E7ECEF; --muted: #9AA7B0; --line: #2C363D;
  --pass: #5FD39A; --pass-bg: #173528; --fail: #FF8A8F; --fail-bg: #3A1D20; --accent: #8FD1B2; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #12171B; --surface: #1A2126; --ink: #E7ECEF; --muted: #9AA7B0; --line: #2C363D;
  --pass: #5FD39A; --pass-bg: #173528; --fail: #FF8A8F; --fail-bg: #3A1D20; --accent: #8FD1B2; color-scheme: dark }
* { box-sizing: border-box }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.6 var(--font) }
.wrap { max-width: 1180px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 28px }
h1, h2, h3 { line-height: 1.25; text-wrap: balance; margin: 0 }
h1 { font-size: 1.9rem; font-weight: 700 }
h2 { font-size: 1.25rem; font-weight: 700 }
.eyebrow { font: 600 12px/1 var(--mono); letter-spacing: .08em; text-transform: uppercase; color: var(--muted) }
.head { display: grid; gap: 10px }
.meta { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--muted); font-size: 13px }
.meta code, td code, .assert { font-family: var(--mono); font-size: 12.5px }
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font: 700 12px/20px var(--mono); letter-spacing: .03em }
.pill.pass { background: var(--pass-bg); color: var(--pass) } .pill.fail { background: var(--fail-bg); color: var(--fail) }
.summary { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 18px; background: var(--surface); border: 1px solid var(--line); border-radius: 12px }
.summary strong { font-size: 1.5rem; font-variant-numeric: tabular-nums }
.req { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)) }
.box { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 16px 18px; min-width: 0 }
.box p { margin: 6px 0 0; max-width: 68ch } .box ol { margin: 8px 0 0; padding-left: 1.3em; display: grid; gap: 4px }
.tablewrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 12px }
table { border-collapse: collapse; width: 100%; min-width: 860px; font-size: 13.5px }
th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; letter-spacing: .04em; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--surface); position: sticky; top: 0 }
td { padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: top }
td.n { font: 700 13px var(--mono); color: var(--mark); width: 44px } td.n a { color: inherit; text-decoration: none }
tr.fail td { background: var(--fail-bg) }
.shots { display: grid; gap: 22px }
figure { margin: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; scroll-margin-top: 16px }
figure img { display: block; width: 100%; height: auto; border-bottom: 1px solid var(--line) }
figcaption { padding: 12px 16px; display: grid; gap: 6px }
.marks { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; color: var(--muted) }
.badge { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px; background: var(--mark); color: #fff; font: 700 12px/22px var(--mono); margin-right: 4px }
details { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 12px 18px }
summary { cursor: pointer; font-weight: 600 }
dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 12px 0 4px } dt { font-weight: 600 } dd { margin: 0; color: var(--muted) }
a { color: var(--accent) } a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }
.list { display: grid; gap: 12px } .row { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline; justify-content: space-between }
@media (max-width: 640px) { dl { grid-template-columns: 1fr } h1 { font-size: 1.5rem } }
`

const GLOSSARY = [
  ['테스트 리포트 (Test Report)', '무엇을 어떻게 확인했고 결과가 어땠는지 정리한 검증 보고서. 이 문서.'],
  ['테스트 케이스 (Test Case)', '확인 항목 하나. 표의 한 줄.'],
  ['인수 기준 (Acceptance Criteria)', '요청이 "다 됐다"고 볼 조건. 테스트 케이스는 여기서 나온다.'],
  ['기대 결과 / 실제 결과 (Expected / Actual)', '나와야 하는 것과 실제로 나온 것. 판정 근거의 조건을 만족하면 PASS.'],
  ['단언 (Assertion)', '판정 조건을 코드로 쓴 것. 표의 "판정 근거" 열.'],
  ['증적 (Test Evidence)', '통과를 보여 주는 증거. 여기서는 주석 스크린샷.'],
  ['주석 스크린샷 (Annotated Screenshot)', '확인한 요소에 빨간 테두리와 테스트 케이스 번호를 그린 화면.'],
  ['E2E 테스트 (End-to-End)', '실제 브라우저(Chromium)로 사용자처럼 눌러 보며 확인하는 테스트. 이 보고서의 테스트.'],
  ['단위 테스트 (Unit Test)', '함수 하나를 따로 확인하는 테스트(npm test).'],
  ['회귀 테스트 (Regression Test)', '새 기능 때문에 예전 기능이 깨지지 않았는지 전체를 다시 돌리는 것(npm run test:e2e).'],
  ['추적성 (Traceability)', '요청 ↔ 테스트 ↔ 커밋을 서로 찾아갈 수 있게 연결해 두는 것. 머리말의 커밋·스위트 정보.'],
]

function head(title, full) {
  const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=IBM+Plex+Sans+KR:wght@400;600;700&display=swap">`
  const inner = `<title>${esc(title)}</title><meta name="claude:viewport-fit-sides" content="cover">${fonts}<style>${STYLE}</style>`
  return full ? `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">${inner}</head><body>` : inner
}
const foot = (full) => (full ? '</body></html>' : '')

function reportPage(d, { full, back = '../index.html' }) {
  const ok = d.passed === d.total
  const rows = d.checks
    .map(
      (c) => `<tr class="${c.pass ? '' : 'fail'}"><td class="n">${c.shot ? `<a href="#shot-${c.shot}" title="증적 보기">${c.n}</a>` : c.n}</td><td>${esc(c.name)}</td><td>${esc(c.expected)}</td><td>${esc(c.actual)}</td><td><code>${esc(c.how)}</code></td><td><span class="pill ${c.pass ? 'pass' : 'fail'}">${c.pass ? 'PASS' : 'FAIL'}</span></td><td>${c.shot ? `<a href="#shot-${c.shot}">화면 ${c.shot}</a>` : '—'}</td></tr>`,
    )
    .join('')
  const figs = d.shots
    .map(
      (s) => `<figure id="shot-${s.id}"><img src="${esc(s.file)}" alt="${esc(s.caption)}" loading="lazy" width="${s.width ?? 1440}" height="${s.height ?? 900}"${(s.width ?? 1440) < 800 ? ` style="max-width:${s.width}px;margin-inline:auto"` : ''}><figcaption><strong>화면 ${s.id}. ${esc(s.caption)}</strong><div class="marks">${s.marks.map((m) => `<span><span class="badge">${m.n}</span>${esc(d.checks.find((c) => c.n === m.n)?.name ?? m.label)}</span>`).join('')}</div></figcaption></figure>`,
    )
    .join('')
  return `${head(`${d.title} 검증 보고서`, full)}<div class="wrap">
<header class="head"><a href="${back}" class="eyebrow">← 검증 보고서 목록</a><p class="eyebrow">검증 보고서 · E2E</p><h1>${esc(d.title)}</h1>
<div class="meta"><span>날짜 ${esc(d.date)}</span><span>커밋 <code>${esc(d.commit)}</code></span><span>스위트 <code>${esc(d.suite)}</code></span><span>${esc(d.env.browser)} · ${esc(d.env.viewport)}</span><span>데모 모드(가상 데이터)</span></div></header>
<section class="summary" aria-label="결과 요약"><span class="pill ${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span><strong>${d.passed} / ${d.total}</strong><span>테스트 케이스 통과 · 증적 화면 ${d.shots.length}장</span></section>
<section class="req"><div class="box"><h2>요청</h2><p>${esc(d.request)}</p></div><div class="box"><h2>인수 기준</h2><ol>${d.criteria.map((c) => `<li>${esc(c)}</li>`).join('')}</ol></div></section>
<section style="display:grid;gap:12px"><h2>테스트 케이스</h2><div class="tablewrap"><table><thead><tr><th>#</th><th>테스트 케이스</th><th>기대 결과</th><th>실제 결과</th><th>판정 근거 (Assertion)</th><th>결과</th><th>증적</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section class="shots"><h2>증적 (주석 스크린샷)</h2><p style="margin:0;color:var(--muted)">빨간 테두리와 번호는 표의 테스트 케이스 번호입니다. 그 요소를 확인해 판정했습니다.</p>${figs}</section>
<details><summary>용어</summary><dl>${GLOSSARY.map(([t, x]) => `<dt>${esc(t)}</dt><dd>${esc(x)}</dd>`).join('')}</dl></details>
</div>${foot(full)}`
}

function indexPage(reports, { full }) {
  const items = reports
    .map(
      (r) => `<a class="box" href="${esc(r.dir)}/index.html" style="text-decoration:none;color:inherit"><div class="row"><h2>${esc(r.title)}</h2><span class="pill ${r.passed === r.total ? 'pass' : 'fail'}">${r.passed} / ${r.total} ${r.passed === r.total ? 'PASS' : 'FAIL'}</span></div><p style="margin:6px 0 0;color:var(--muted)">${esc(r.date)} · 커밋 <code>${esc(r.commit)}</code> · 증적 ${r.shots.length}장 · <code>${esc(r.suite)}</code></p></a>`,
    )
    .join('')
  return `${head('TeamEmbedded 검증 보고서', full)}<div class="wrap"><header class="head"><p class="eyebrow">TeamEmbedded · 검증 기록</p><h1>검증 보고서</h1><p style="margin:0;color:var(--muted);max-width:68ch">기능마다 무엇을 확인했고 어떻게 PASS로 판정했는지, 확인한 화면에 표시해 남긴 기록입니다. 브라우저 테스트(<code>npm run test:e2e</code>)를 <code>REPORT=1</code>로 돌리면 다시 만들어집니다.</p></header><div class="list">${items}</div>
<details><summary>용어</summary><dl>${GLOSSARY.map(([t, x]) => `<dt>${esc(t)}</dt><dd>${esc(x)}</dd>`).join('')}</dl></details></div>${foot(full)}`
}

function readReports() {
  if (!fs.existsSync(OUT)) return []
  return fs
    .readdirSync(OUT)
    .filter((d) => fs.existsSync(path.join(OUT, d, 'report.json')))
    .map((d) => ({ dir: d, ...JSON.parse(fs.readFileSync(path.join(OUT, d, 'report.json'), 'utf8')) }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
}

function writeIndex() {
  fs.writeFileSync(path.join(OUT, 'index.html'), indexPage(readReports(), { full: true }))
}

module.exports = { createReport, readReports, reportPage, indexPage }
