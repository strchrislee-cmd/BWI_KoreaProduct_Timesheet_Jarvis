import { createHash, timingSafeEqual } from 'node:crypto'
import { loadWorkbook } from '../../src/excel/cells.js'
import { parseMasterWorkbook } from '../../src/excel/master.js'
import type { MasterImportResult, MasterRow } from '../../src/domain/types.js'

// Framework-free core of POST /api/ingest so it can be unit-tested.

export interface IngestInput {
  headers: Record<string, string | string[] | undefined>
  /** Raw bytes, or a JSON object: { contentBase64, fileName } or Power Automate's { "$content": base64 }. */
  body: Buffer | Record<string, unknown> | undefined
}

export interface IngestDeps {
  token: string | undefined
  apply: (input: { fileName: string; contentHash: string; rows: MasterRow[] }) => Promise<MasterImportResult>
}

export interface IngestOutput {
  status: number
  body: Record<string, unknown>
}

const header = (h: IngestInput['headers'], name: string) => {
  const v = h[name]
  return Array.isArray(v) ? v[0] : v
}

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function extractFile(input: IngestInput): { bytes: Buffer; fileName: string } {
  let fileName = header(input.headers, 'x-file-name') ?? 'master.xlsx'
  const body = input.body
  if (Buffer.isBuffer(body)) return { bytes: body, fileName }
  if (body && typeof body === 'object') {
    const b64 = (body.contentBase64 ?? body.$content) as unknown
    if (typeof body.fileName === 'string') fileName = body.fileName
    if (typeof b64 === 'string') return { bytes: Buffer.from(b64, 'base64'), fileName }
  }
  return { bytes: Buffer.alloc(0), fileName }
}

export async function handleIngest(input: IngestInput, deps: IngestDeps): Promise<IngestOutput> {
  if (!deps.token) return { status: 500, body: { error: 'INGEST_TOKEN is not configured on the server' } }
  // x-jarvis-token: the header's name before the app was renamed; still accepted so older flows keep working
  const given = header(input.headers, 'x-timecrumbs-token') ?? header(input.headers, 'x-jarvis-token') ?? ''
  if (!sameSecret(given, deps.token)) return { status: 401, body: { error: 'Invalid or missing x-timecrumbs-token' } }

  const { bytes, fileName } = extractFile(input)
  if (!bytes.length) {
    return { status: 400, body: { error: 'Empty body: send the .xlsx bytes (Content-Type: application/octet-stream)' } }
  }

  let rows: MasterRow[]
  try {
    rows = parseMasterWorkbook(await loadWorkbook(bytes))
  } catch (e) {
    return { status: 422, body: { error: `Could not read the master sheet: ${(e as Error).message}` } }
  }

  const contentHash = createHash('sha256').update(bytes).digest('hex')
  const result = await deps.apply({ fileName, contentHash, rows })
  return { status: 200, body: { ...result, rows: rows.length } }
}
