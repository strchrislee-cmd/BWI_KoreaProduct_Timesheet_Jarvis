import type { VercelRequest, VercelResponse } from '@vercel/node'
import { dailyPhoto } from './_lib/backgroundCore.js'

/** GET /api/background — today's Unsplash photo when UNSPLASH_ACCESS_KEY is set. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' })
  try {
    const out = await dailyPhoto({
      key: process.env.UNSPLASH_ACCESS_KEY,
      query: process.env.UNSPLASH_QUERY || 'nature landscape',
      fetchFn: (url, init) => fetch(url, init),
      now: new Date(),
    })
    res.setHeader('Cache-Control', out.cacheControl)
    return res.status(out.status).json(out.body)
  } catch (e) {
    return res.status(502).json({ configured: true, error: (e as Error).message })
  }
}
