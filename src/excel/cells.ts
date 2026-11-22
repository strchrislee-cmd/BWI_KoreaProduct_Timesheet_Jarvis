import ExcelJS from 'exceljs'

export type Workbook = ExcelJS.Workbook
export type Worksheet = ExcelJS.Worksheet
type Cell = ExcelJS.Cell

export async function loadWorkbook(data: ArrayBuffer | Uint8Array): Promise<Workbook> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS accepts ArrayBuffer (browser) and Buffer (Node); its typings only name Buffer.
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0])
  return wb
}

export function newWorkbook(): Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'TimeCrumbs'
  return wb
}

/** Displayed text of a cell, for plain values, rich text, formulas and hyperlinks. */
export function cellText(cell: Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('')
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result)
    if ('text' in v) return String(v.text)
    return ''
  }
  return String(v)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A time-of-day cell → 'HH:MM' (Excel time values, day fractions or "7:30" text). */
export function cellTime(cell: Cell): string | null {
  let v: unknown = cell.value
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) v = (v as { result: unknown }).result
  if (v instanceof Date) return `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const minutes = Math.round(v * 1440)
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
  }
  if (typeof v === 'string') {
    const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
    if (m && Number(m[1]) < 24) return `${pad(Number(m[1]))}:${m[2]}`
  }
  return null
}

export function cellNumber(cell: Cell): number | null {
  const text = cellText(cell).trim()
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}
