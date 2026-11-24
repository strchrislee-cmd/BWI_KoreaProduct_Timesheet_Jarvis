import type { VercelRequest, VercelResponse } from '@vercel/node'
import { userAdminCore } from '../_lib/userAdminCore.js'
import { adminClient } from '../_lib/server.js'

/**
 * POST /api/admin/user { action: 'set_password', user_id, password } | { action: 'delete', user_id }
 * with "Authorization: Bearer <access token>". Only admins. See api/_lib/userAdminCore.ts.
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

    const out = await userAdminCore(auth.user.id, (req.body ?? {}) as Record<string, unknown>, {
      listProfiles: async () => {
        const { data, error } = await sb.from('profiles').select('id, email, role')
        if (error) throw new Error(error.message)
        return data
      },
      setPassword: async (userId, password) => {
        const { error } = await sb.auth.admin.updateUserById(userId, { password, email_confirm: true })
        if (error) throw new Error(error.message)
      },
      deleteUser: async (userId) => {
        const { error } = await sb.auth.admin.deleteUser(userId)
        if (error) throw new Error(error.message)
      },
      deleteInvitation: async (email) => {
        const { error } = await sb.from('invitations').delete().eq('email', email)
        if (error) throw new Error(error.message)
      },
    })
    return res.status(out.status).json(out.body)
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message })
  }
}
