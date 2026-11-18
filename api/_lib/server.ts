import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'

export function adminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Body as Buffer or parsed JSON. Vercel only pre-parses JSON / octet-stream / text,
 * so for other content types (e.g. the .xlsx MIME type) read the raw stream.
 */
export async function readBody(req: VercelRequest): Promise<Buffer | Record<string, unknown> | undefined> {
  const parsed: unknown = req.body
  if (Buffer.isBuffer(parsed)) return parsed
  if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  if (typeof parsed === 'string') return undefined // text/plain would have corrupted binary data
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(Buffer.from(c)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
