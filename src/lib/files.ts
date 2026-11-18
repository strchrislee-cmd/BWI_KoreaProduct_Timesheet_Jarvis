import type { Workbook } from '../excel/cells'

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function downloadWorkbook(wb: Workbook, fileName: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Lazy-load the Excel helpers (ExcelJS is large) only when a file is read or written. */
export const loadExcel = () =>
  Promise.all([
    import('../excel/cells'),
    import('../excel/master'),
    import('../excel/dailyLog'),
    import('../excel/export'),
  ]).then(([cells, master, dailyLog, exp]) => ({ ...cells, ...master, ...dailyLog, ...exp }))
