import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { MasterImportResult } from '../src/domain/types.js'
import { handleIngest } from './_lib/ingestCore.js'
import { adminClient, readBody } from './_lib/server.js'

/**
 * POST /api/ingest — Power Automate sends the group master .xlsx here.
 * Headers: x-timecrumbs-token: <INGEST_TOKEN> (the old name x-jarvis-token also works), Content-Type: application/octet-stream, optional x-file-name.
 * Re-sending the same file is a no-op (sha256 de-duplication in apply_master_import).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const out = await handleIngest(
      { headers: req.headers, body: await readBody(req) },
      {
        token: process.env.INGEST_TOKEN,
        apply: async (input) => {
          const { data, error } = await adminClient().rpc('apply_master_import', {
            p_file_name: input.fileName,
            p_source: 'ingest',
            p_content_hash: input.contentHash,
            p_rows: input.rows,
          })
          if (error) throw new Error(error.message)
          return data as MasterImportResult
        },
      },
    )
    return res.status(out.status).json(out.body)
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
