import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import { handleIngest } from '../api/_lib/ingestCore'

async function masterBytes(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Timesheet')
  ws.addRow(['No.', 'Project'])
  ws.addRow([1, '2041--Utility Work Lamps'])
  ws.addRow([2, '00.Timelog--Leave(휴가 및 휴무)'])
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const okApply = () => vi.fn(async () => ({ status: 'imported' as const, import_id: 'imp1', added: 1, missing: 0 }))

describe('POST /api/ingest core', () => {
  it('rejects when the server has no token configured', async () => {
    const out = await handleIngest({ headers: {}, body: Buffer.from('x') }, { token: undefined, apply: okApply() })
    expect(out.status).toBe(500)
  })

  it('rejects a wrong or missing token', async () => {
    const apply = okApply()
    expect((await handleIngest({ headers: {}, body: await masterBytes() }, { token: 's3cret', apply })).status).toBe(401)
    expect((await handleIngest({ headers: { 'x-timecrumbs-token': 's3cre' }, body: await masterBytes() }, { token: 's3cret', apply })).status).toBe(401)
    expect(apply).not.toHaveBeenCalled()
  })

  it('still accepts the header name from before the rename (x-jarvis-token)', async () => {
    const apply = okApply()
    const out = await handleIngest({ headers: { 'x-jarvis-token': 's3cret' }, body: await masterBytes() }, { token: 's3cret', apply })
    expect(out.status).toBe(200)
    expect((await handleIngest({ headers: { 'x-jarvis-token': 'wrong' }, body: await masterBytes() }, { token: 's3cret', apply: okApply() })).status).toBe(401)
  })

  it('rejects empty bodies and non-master files', async () => {
    const headers = { 'x-timecrumbs-token': 's3cret' }
    expect((await handleIngest({ headers, body: Buffer.alloc(0) }, { token: 's3cret', apply: okApply() })).status).toBe(400)
    const bad = await handleIngest({ headers, body: Buffer.from('not an xlsx') }, { token: 's3cret', apply: okApply() })
    expect(bad.status).toBe(422)
  })

  it('parses raw bytes, hashes them and applies the import', async () => {
    const apply = okApply()
    const bytes = await masterBytes()
    const out = await handleIngest({ headers: { 'x-timecrumbs-token': 's3cret', 'x-file-name': 'TS_2026.xlsx' }, body: bytes }, { token: 's3cret', apply })
    expect(out).toEqual({ status: 200, body: { status: 'imported', import_id: 'imp1', added: 1, missing: 0, rows: 2 } })
    expect(apply).toHaveBeenCalledWith({
      fileName: 'TS_2026.xlsx',
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      rows: [
        { name: '2041--Utility Work Lamps', code: '2041', kind: 'project' },
        { name: '00.Timelog--Leave(휴가 및 휴무)', code: null, kind: 'timelog' },
      ],
    })
  })

  it('accepts JSON bodies with base64 content (incl. Power Automate "$content")', async () => {
    const b64 = (await masterBytes()).toString('base64')
    const headers = { 'x-timecrumbs-token': 's3cret' }
    for (const body of [{ contentBase64: b64, fileName: 'a.xlsx' }, { $content: b64 }]) {
      const apply = okApply()
      const out = await handleIngest({ headers, body }, { token: 's3cret', apply })
      expect(out.status).toBe(200)
    }
  })
})
