import { projectNameKey, toMasterRow } from '../domain/projects.js'
import type { MasterRow } from '../domain/types.js'
import { cellText, type Workbook, type Worksheet } from './cells.js'

// Group timesheet master (SharePoint, CONTEXT.md §4-A): a "No." column and a "Project" column.
// Numbered rows are projects / 00.Timelog categories. The first date block is enough —
// every block lists the same projects.

function findHeader(ws: Worksheet): { row: number; noCol: number; projectCol: number } | null {
  const maxRow = Math.min(ws.rowCount, 40)
  const maxCol = Math.min(ws.columnCount, 30)
  for (let r = 1; r <= maxRow; r++) {
    let noCol = 0
    let projectCol = 0
    for (let c = 1; c <= maxCol; c++) {
      const text = cellText(ws.getRow(r).getCell(c)).trim()
      if (!noCol && /^no\.?$/i.test(text)) noCol = c
      if (!projectCol && /^project/i.test(text)) projectCol = c
    }
    if (noCol && projectCol) return { row: r, noCol, projectCol }
  }
  return null
}

export function parseMasterWorkbook(wb: Workbook): MasterRow[] {
  for (const ws of wb.worksheets) {
    const header = findHeader(ws)
    if (!header) continue

    const rows: MasterRow[] = []
    const seen = new Set<string>()
    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const no = cellText(row.getCell(header.noCol)).trim()
      const name = cellText(row.getCell(header.projectCol)).replace(/\s+/g, ' ').trim()
      if (/^indi\w*\s*sum/i.test(name) || /^no\.?$/i.test(no)) break // end of the first block
      if (!/^\d+$/.test(no) || !name) continue
      const parsed = toMasterRow(name)
      const key = projectNameKey(parsed.name)
      if (!seen.has(key)) {
        seen.add(key)
        rows.push(parsed)
      }
    }
    if (rows.length) return rows
  }
  throw new Error('Could not find a sheet with "No." and "Project" header columns.')
}
