import type { VercelRequest, VercelResponse } from '@vercel/node'
import { adminClient } from '../_lib/server.js'

const ROLES = ['admin', 'l1', 'l2', 'l3']

/**
 * POST /api/admin/invite { email, role, can_export } with "Authorization: Bearer <access token>".
 * Only admins. Records the invitation (the DB trigger reads it when the account is created),
 * then asks Supabase Auth to e-mail the invite link.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const sb = adminClient()
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth, error: authError } = await sb.auth.getUser(token)
    if (authError || !auth.user) return res.status(401).json({ error: 'Not signed in' })

    const { data: me } = await sb.from('profiles').select('role').eq('id', auth.user.id).maybeSingle()
    if (me?.role !== 'admin') return res.status(403).json({ error: 'Admins only' })

    const body = (req.body ?? {}) as { email?: string; role?: string; can_export?: boolean }
    const email = String(body.email ?? '').trim().toLowerCase()
    const role = ROLES.includes(String(body.role)) ? String(body.role) : 'l1'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Invalid e-mail address' })

    const { error: invError } = await sb
      .from('invitations')
      .upsert({ email, role, can_export: body.can_export !== false, invited_by: auth.user.id, status: 'pending' }, { onConflict: 'email' })
    if (invError) return res.status(400).json({ error: invError.message })

    const { error: mailError } = await sb.auth.admin.inviteUserByEmail(email, {
      redirectTo: process.env.APP_URL || `https://${req.headers.host}`,
    })
    if (mailError) return res.status(400).json({ error: mailError.message })

    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
