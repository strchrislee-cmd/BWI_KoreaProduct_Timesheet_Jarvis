import type { GroupTimesheet, WeeklyPlanRow } from '../domain/aggregate.js'
import { shortLabel } from '../domain/time.js'
import { newWorkbook, type Workbook } from './cells.js'

type Fill = { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } }
const fill = (rgb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rgb } })
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

function toExcelDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Personal group timesheet (rows like the SharePoint sheet, one column per day). */
export function buildGroupTimesheetWorkbook(
  gt: GroupTimesheet,
  meta: { engineer: string; engineerCode: string; week: number },
): Workbook {
  const wb = newWorkbook()
  const ws = wb.addWorksheet('Group Timesheet')
  const lastCol = gt.dates.length + 3

  ws.getCell(1, 1).value = `Group Timesheet · ${meta.engineer}${meta.engineerCode ? ` (${meta.engineerCode})` : ''} · W${meta.week}`
  ws.getCell(1, 1).font = { bold: true, size: 13 }
  ws.mergeCells(1, 1, 1, lastCol)

  const header = ws.getRow(3)
  ;['No.', 'Project', ...gt.dates.map(shortLabel), 'Total'].forEach((v, i) => {
    const c = header.getCell(i + 1)
    c.value = v
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = fill('00B050')
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = border
  })

  let r = 4
  const writeRow = (no: string | number, label: string, values: number[], color: string, opts: { bold?: boolean; red?: boolean } = {}) => {
    const row = ws.getRow(r++)
    row.getCell(1).value = no
    row.getCell(2).value = label
    values.forEach((v, i) => {
      row.getCell(i + 3).value = v ? v : null
    })
    const total = values.reduce((a, b) => a + b, 0)
    row.getCell(lastCol).value = total ? total : 0
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c)
      cell.fill = fill(color)
      cell.border = border
      if (c >= 3) cell.numFmt = '0.00'
      if (opts.bold) cell.font = { bold: true }
      if (opts.red && c === lastCol) cell.font = { bold: opts.bold, color: { argb: 'FFFF0000' } }
    }
    row.getCell(1).alignment = { horizontal: 'center' }
  }

  let no = 0
  let timelogIdx = 0
  const numbered = gt.rows.filter((x) => x.project.kind !== 'local_section')
  const sections = gt.rows.filter((x) => x.project.kind === 'local_section')

  numbered.forEach((x, i) => {
    no += 1
    const color =
      x.project.kind === 'project'
        ? i % 2 === 0 ? 'FFFFFF' : 'F2F2F2'
        : x.project.system_key === 'leave' ? '70AD47' : timelogIdx++ % 2 === 0 ? 'FFFF00' : 'FFC000'
    writeRow(no, x.project.name, x.hours, color)
  })
  writeRow('', 'Project subtotal', gt.projectSubtotal, 'FFFFFF', { bold: true })

  sections
    .filter((x) => x.project.counts_toward_total)
    .forEach((x, i) => writeRow('', x.project.name, x.hours, i % 2 === 0 ? '70AD47' : 'C6E0B4', { red: true }))
  if (gt.unmapped.some((v) => v > 0)) writeRow('', '⚠ Unmapped (not in any group project)', gt.unmapped, 'FDE7DA', { red: true })
  writeRow('', 'Individual Sum', gt.daily, 'FFFFFF', { bold: true })
  sections
    .filter((x) => !x.project.counts_toward_total)
    .forEach((x) => writeRow('', x.project.name, x.hours, 'FFFFFF'))

  ws.getColumn(1).width = 6
  ws.getColumn(2).width = 72
  for (let c = 3; c <= lastCol; c++) ws.getColumn(c).width = 11
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 3 }]
  return wb
}

export const WEEKLY_PLAN_HEADERS = ['Week', 'Project', 'Work', 'Item', 'Engineer', '시간', '접수일자', 'Due date', '예상시간', 'Group Project']

/** 업무진행세부계획 — same first 9 columns as the existing weekly sheet, plus the group project. */
export function buildWeeklyPlanWorkbook(rows: WeeklyPlanRow[], meta: { engineer: string }): Workbook {
  const wb = newWorkbook()
  const ws = wb.addWorksheet('Weekly Plan')
  ws.addRow(WEEKLY_PLAN_HEADERS)
  for (const r of rows) {
    ws.addRow([
      r.week,
      r.localProject,
      r.work,
      r.item,
      meta.engineer,
      r.hours,
      toExcelDate(r.date),
      toExcelDate(r.date),
      r.hours,
      r.groupProjectName || '⚠ Unmapped',
    ])
  }
  ws.getRow(1).eachCell((c) => {
    c.font = { bold: true }
    c.fill = fill('D9D9D9')
    c.border = border
  })
  ws.getColumn(7).numFmt = 'yyyy-mm-dd'
  ws.getColumn(8).numFmt = 'yyyy-mm-dd'
  ;[6, 18, 8, 48, 12, 7, 12, 12, 9, 56].forEach((w, i) => (ws.getColumn(i + 1).width = w))
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 1), column: WEEKLY_PLAN_HEADERS.length } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  return wb
}
