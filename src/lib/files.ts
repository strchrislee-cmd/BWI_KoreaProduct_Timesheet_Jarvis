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

/** Downscale an uploaded photo (longest side ≤ 1920 px) and return it as a JPEG data URL. */
export async function compressImage(file: File, maxSide = 1920, quality = 0.82): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다.')
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('이미지를 읽을 수 없습니다.'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    const data = canvas.toDataURL('image/jpeg', quality)
    if (data.length > 2_900_000) throw new Error('이미지가 너무 큽니다. 더 작은 사진을 골라 주세요.')
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}
