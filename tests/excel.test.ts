import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { parseMasterWorkbook } from '../src/excel/master'
import { parseDailyLogWorkbook } from '../src/excel/dailyLog'
import { buildGroupTimesheetWorkbook, buildWeeklyPlanWorkbook, WEEKLY_PLAN_HEADERS } from '../src/excel/export'
import { cellText, loadWorkbook } from '../src/excel/cells'
import { buildGroupTimesheet, buildWeeklyPlan } from '../src/domain/aggregate'
import { weekDates } from '../src/domain/time'
import { project, seededProjects, slot } from './helpers'

async function roundTrip(wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer()
  return loadWorkbook(new Uint8Array(buf as ArrayBuffer))
}

/** Synthetic sheet shaped like the SharePoint group timesheet (fictional names). */
function masterWorkbook() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Timesheet')
  const block = (startRow: number) => {
    ws.getCell(startRow, 3).value = new Date(Date.UTC(2026, 10, 2))
    ws.getRow(startRow + 1).values = ['No.', 'Project', 'Alex', 'Min', 'D-sum']
    const rows: [number | '', string, number?][] = [
      [1, 'Line Andon System Implementation'],
      [2, '2041--Utility Work Lamps', 1.5],
      [3, '2053A--Trail Accessory Range - ezT3'],
      [4, '2041--Utility Work Lamps'], // duplicate → ignored
      [5, '00.Timelog--Leave(휴가 및 휴무)', 8],
      ['', '', 8], // per-engineer subtotal row
      ['', '일반업무(Mail발송, 미팅조율, 리소스정리, 개발 등)', 5],
      ['', 'Indivisual Sum', 8],
      ['', 'Biz Trip'],
    ]
    rows.forEach((r, i) => (ws.getRow(startRow + 2 + i).values = [r[0], r[1], r[2] ?? null]))
    return startRow + 2 + rows.length
  }
  const next = block(1)
  block(next + 2) // second day block below — must not be read twice
  return wb
}

describe('master sheet parser', () => {
  it('reads numbered rows of the first block only', async () => {
    const rows = parseMasterWorkbook(await roundTrip(masterWorkbook()))
    expect(rows).toEqual([
      { name: 'Line Andon System Implementation', code: null, kind: 'project' },
      { name: '2041--Utility Work Lamps', code: '2041', kind: 'project' },
      { name: '2053A--Trail Accessory Range - ezT3', code: '2053A', kind: 'project' },
      { name: '00.Timelog--Leave(휴가 및 휴무)', code: null, kind: 'timelog' },
    ])
  })

  it('fails clearly when there is no header', async () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('x').getCell('A1').value = 'hello'
    expect(() => parseMasterWorkbook(wb)).toThrow(/No\.".*"Project"/)
  })
})

describe('daily log parser', () => {
  it('reads the personal 30-min sheet format', async () => {
    const wb = new ExcelJS.Workbook()
    const a = wb.addWorksheet('Dec16')
    a.getRow(1).values = ['날짜', 2026, 'Dec', 16]
    a.getRow(2).values = ['시간', '(수면, 휴식, 정비, 식사, 간식, 업무, 강의, 운전, 독서, 공부, 운동, 여가, 폰, 기타)', null, null, '몰입도 0~3', '평가 1~5', '소요시간(0.5=30분)', '일일평가']
    const t = (h: number, m: number) => new Date(Date.UTC(1899, 11, 30, h, m))
    a.addRow([t(7, 0), '출근', 30, '출근 07:28', 3, 0, 0.5])
    a.addRow([t(7, 30), '일반', 30, '이메일 및 일반업무', 3, 0, 0.5])
    a.addRow([t(8, 0), '', 30, '', 3, 0, 0.5]) // empty → skipped
    a.addRow([t(9, 0), '회의', 30, 'INT | Daily_Scrum', 2, 0, 0.5])
    a.addRow([t(9, 30), '커머', 30, '개발 | 워크램프', 7, 0, 0.5]) // focus out of range → null

    const b = wb.addWorksheet('2026-12-17')
    b.getRow(1).values = ['시간', '구분', '분', '내용', '몰입도']
    b.addRow([0.3125, '일반', 30, '메일', 1]) // 07:30 as a day fraction
    b.addRow(['13:00', '회의', 30, '주간 품질회의', null])

    wb.addWorksheet('Notes').getCell('A1').value = 'no header here'

    const days = parseDailyLogWorkbook(await roundTrip(wb), 2026)
    expect(days.map((d) => [d.sheetName, d.date, d.entries.length])).toEqual([
      ['Dec16', '2026-12-16', 4],
      ['2026-12-17', '2026-12-17', 2],
    ])
    expect(days[0].entries[1]).toEqual({ slot_index: 15, label: '일반', description: '이메일 및 일반업무', focus: 3 })
    expect(days[0].entries[3]).toEqual({ slot_index: 19, label: '커머', description: '개발 | 워크램프', focus: null })
    expect(days[1].entries).toEqual([
      { slot_index: 15, label: '일반', description: '메일', focus: 1 },
      { slot_index: 26, label: '회의', description: '주간 품질회의', focus: null },
    ])
  })
})

describe('exports', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps', sort_order: 1 })]
  const slots = [
    ...Array.from({ length: 4 }, (_, i) => slot('2026-11-16', 15 + i, { group_project_id: 'wl', label: '워크램프', description: '개발 | 하우징' })),
    slot('2026-11-16', 19, { group_project_id: 'meeting', label: '회의', description: 'INT | Daily_Scrum' }),
    slot('2026-11-16', 20, { label: '플루드', description: '견적' }),
  ]

  it('writes the group timesheet layout', async () => {
    const gt = buildGroupTimesheet({ slots, leaves: [], projects, dates: weekDates('2026-11-16').slice(0, 5), targetHours: 8 })
    const wb = await roundTrip(buildGroupTimesheetWorkbook(gt, { engineer: 'Jane Park', engineerCode: 'JP', week: 47 }))
    const ws = wb.getWorksheet('Group Timesheet')!
    const labels = Array.from({ length: ws.rowCount }, (_, i) => cellText(ws.getCell(i + 1, 2)))
    expect(cellText(ws.getCell(1, 1))).toBe('Group Timesheet · Jane Park (JP) · W47')
    expect(cellText(ws.getCell(3, 3))).toBe('Mon 11-16')
    expect(labels[3]).toBe('2041--Utility Work Lamps')
    expect(ws.getCell(4, 3).value).toBe(2)
    const sumRow = labels.indexOf('Individual Sum') + 1
    expect(ws.getCell(sumRow, 3).value).toBe(3) // 2h project + 0.5h meeting + 0.5h unmapped
    expect(labels).toContain('⚠ Unmapped (not in any group project)')
    expect(labels.indexOf('Biz Trip')).toBeGreaterThan(sumRow - 1) // after the sum, like the original
  })

  it('writes the weekly plan with the original 9 columns first', async () => {
    const rows = buildWeeklyPlan(slots, projects)
    const wb = await roundTrip(buildWeeklyPlanWorkbook(rows, { engineer: 'Jane Park' }))
    const ws = wb.getWorksheet('Weekly Plan')!
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(WEEKLY_PLAN_HEADERS)
    expect((ws.getRow(2).values as unknown[]).slice(1, 7)).toEqual([47, '워크램프', '기타', '개발 | 하우징', 'Jane Park', 2])
    expect(ws.getCell(2, 7).value).toEqual(new Date(Date.UTC(2026, 10, 16)))
    expect(cellText(ws.getCell(4, 10))).toBe('⚠ Unmapped')
  })
})
