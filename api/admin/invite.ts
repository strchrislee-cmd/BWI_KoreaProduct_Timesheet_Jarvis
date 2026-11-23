import type { VercelRequest, VercelResponse } from '@vercel/node'
import { inviteCore } from '../_lib/inviteCore.js'
import { adminClient } from '../_lib/server.js'

const must = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
  if (error) throw new Error(error.message)
  return data
}

/**
 * POST /api/admin/invite { email, role, can_export } with "Authorization: Bearer <access token>".
 * Only admins. Records the invitation, then e-mails the invite link (or, when the address already
 * has an account, a fresh sign-in link). See api/_lib/inviteCore.ts.
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

    const redirectTo = process.env.APP_URL || `https://${req.headers.host}`
    const out = await inviteCore((req.body ?? {}) as Record<string, unknown>, {
      saveInvitation: async (row) =>
        void must(await sb.from('invitations').upsert({ ...row, invited_by: auth.user.id, status: 'pending' }, { onConflict: 'email' })),
      inviteUser: async (email) => {
        const { data, error } = await sb.auth.admin.inviteUserByEmail(email, { redirectTo })
        if (error && (error.code === 'email_exists' || /already been registered/i.test(error.message))) return { exists: true }
        if (error) throw new Error(error.message)
        return { exists: false, userId: data.user.id }
      },
      findUserId: async (email) => {
        for (let page = 1; ; page++) {
          const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 })
          if (error) throw new Error(error.message)
          const users = data.users
          const hit = users.find((u) => u.email?.toLowerCase() === email)
          if (hit) return hit.id
          if (users.length < 1000) return null
        }
      },
      hasProfile: async (id) => !!must(await sb.from('profiles').select('id').eq('id', id).maybeSingle()),
      createProfile: async (row) => void must(await sb.from('profiles').insert({ ...row, name: row.email.split('@')[0] })),
      markAccepted: async (email) =>
        void must(await sb.from('invitations').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('email', email)),
      sendLoginLink: async (email) => {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo } })
        if (error) throw new Error(error.message)
      },
    })
    return res.status(out.status).json(out.body)
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message })
  }
}
