import { makeDate, timeToSlot } from '../domain/time.js'
import { cellNumber, cellText, cellTime, type Workbook, type Worksheet } from './cells.js'

// Personal 30-min log (Google Sheets export, CONTEXT.md §4-C):
// one sheet per day, header row with "시간", category in the next column,
// a free-text content column, and "몰입도 0~3".

export interface ParsedEntry {
  slot_index: number
  label: string
  description: string
  focus: number | null
}

export interface ParsedDay {
  sheetName: string
  date: string | null
  entries: ParsedEntry[]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

function monthNumber(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (/^\d{1,2}$/.test(t)) return Number(t)
  const i = MONTHS.indexOf(t.slice(0, 3))
  return i >= 0 ? i + 1 : null
}

function validDate(y: number, m: number, d: number): string | null {
  if (!(y > 2000 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null
  return makeDate(y, m, d)
}

function detectDate(ws: Worksheet, fallbackYear: number): string | null {
  // "날짜 | 2026 | Dec | 16" row
  for (let r = 1; r <= Math.min(ws.rowCount, 6); r++) {
    const values: string[] = []
    let found = false
    for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
      const text = cellText(ws.getRow(r).getCell(c)).trim()
      if (found && text) values.push(text)
      if (text === '날짜') found = true
    }
    if (found && values.length >= 3) {
      const date = validDate(Number(values[0]), monthNumber(values[1]) ?? 0, Number(values[2]))
      if (date) return date
    }
  }
  // Sheet names: "Dec16", "2026-12-16", "12-16"
  const name = ws.name.trim()
  let m = name.match(/^([A-Za-z]{3,9})\s*(\d{1,2})$/)
  if (m) return validDate(fallbackYear, monthNumber(m[1]) ?? 0, Number(m[2]))
  m = name.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]))
  m = name.match(/^(\d{1,2})[-./](\d{1,2})$/)
  if (m) return validDate(fallbackYear, Number(m[1]), Number(m[2]))
  return null
}

function parseSheet(ws: Worksheet, fallbackYear: number): ParsedDay | null {
  let headerRow = 0
  let timeCol = 0
  for (let r = 1; r <= Math.min(ws.rowCount, 10) && !headerRow; r++) {
    for (let c = 1; c <= Math.min(ws.columnCount, 20); c++) {
      if (cellText(ws.getRow(r).getCell(c)).trim() === '시간') {
        headerRow = r
        timeCol = c
        break
      }
    }
  }
  if (!headerRow) return null

  const catCol = timeCol + 1
  let focusCol = 0
  for (let c = catCol + 1; c <= Math.min(ws.columnCount, 20); c++) {
    if (cellText(ws.getRow(headerRow).getCell(c)).includes('몰입')) {
      focusCol = c
      break
    }
  }

  // Content column: the column between category and focus with the most non-numeric text.
  const lastCandidate = focusCol ? focusCol - 1 : catCol + 3
  let contentCol = catCol + 1
  let best = -1
  for (let c = catCol + 1; c <= lastCandidate; c++) {
    let score = 0
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const text = cellText(ws.getRow(r).getCell(c)).trim()
      if (text && !Number.isFinite(Number(text))) score++
    }
    if (score > best) {
      best = score
      contentCol = c
    }
  }

  const entries: ParsedEntry[] = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const time = cellTime(row.getCell(timeCol))
    if (!time) continue
    const label = cellText(row.getCell(catCol)).trim()
    const description = cellText(row.getCell(contentCol)).trim()
    if (!label && !description) continue
    const f = focusCol ? cellNumber(row.getCell(focusCol)) : null
    entries.push({
      slot_index: timeToSlot(time),
      label,
      description,
      focus: f !== null && f >= 0 && f <= 3 ? Math.round(f) : null,
    })
  }
  return { sheetName: ws.name, date: detectDate(ws, fallbackYear), entries }
}

export function parseDailyLogWorkbook(wb: Workbook, fallbackYear: number): ParsedDay[] {
  return wb.worksheets
    .filter((ws) => ws.state !== 'hidden' && ws.state !== 'veryHidden')
    .map((ws) => parseSheet(ws, fallbackYear))
    .filter((d): d is ParsedDay => d !== null && d.entries.length > 0)
}
