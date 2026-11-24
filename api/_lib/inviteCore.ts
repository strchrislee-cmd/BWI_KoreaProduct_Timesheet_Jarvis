// POST /api/admin/invite, minus Supabase (tested in tests/invite.test.ts).
//
// Inviting creates the person's login account at once (Supabase Auth). So:
// - a new address gets the invite e-mail; their TimeCrumbs profile is made from the invitation
//   (the DB trigger normally does this; done here too so a missing trigger cannot leave them out);
// - an address that already has an account (e.g. invited before, or the first send failed after
//   the account was made) gets a fresh sign-in link instead of the error "already registered",
//   and gets its profile if it is missing.
// With a temporary password no e-mail is sent: the account is made (or, if it exists, its password
// is set to this one) and the admin hands the password over. The person can change it in Settings.

import { passwordProblem } from '../../src/domain/password.js'
import type { InviteSent } from '../../src/domain/types.js'

export const ROLES = ['admin', 'l1', 'l2', 'l3'] as const
export type InviteRole = (typeof ROLES)[number]

export interface InviteDeps {
  /** record the invitation as pending (insert or update by e-mail) */
  saveInvitation(row: { email: string; role: InviteRole; can_export: boolean }): Promise<void>
  /** Supabase invite; exists = the address already has an account */
  inviteUser(email: string): Promise<{ exists: false; userId: string } | { exists: true }>
  findUserId(email: string): Promise<string | null>
  hasProfile(userId: string): Promise<boolean>
  createProfile(row: { id: string; email: string; role: InviteRole; can_export: boolean }): Promise<void>
  markAccepted(email: string): Promise<void>
  sendLoginLink(email: string): Promise<void>
  /** account with this password, e-mail confirmed, nothing sent; exists = the address already has an account */
  createUser(email: string, password: string): Promise<{ exists: false; userId: string } | { exists: true }>
  /** set the password of an existing account (and confirm its e-mail, so it can sign in with it) */
  setPassword(userId: string, password: string): Promise<void>
}

export type InviteResult = { status: 200; body: { ok: true; sent: InviteSent } } | { status: 400; body: { error: string } }

export async function inviteCore(
  input: { email?: unknown; role?: unknown; can_export?: unknown; password?: unknown },
  deps: InviteDeps,
): Promise<InviteResult> {
  const email = String(input.email ?? '').trim().toLowerCase()
  const role: InviteRole = ROLES.includes(input.role as InviteRole) ? (input.role as InviteRole) : 'l1'
  const can_export = input.can_export !== false
  const password = typeof input.password === 'string' && input.password !== '' ? input.password : null
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, body: { error: 'Invalid e-mail address' } }
  const problem = password === null ? null : passwordProblem(password)
  if (problem) return { status: 400, body: { error: problem } }

  await deps.saveInvitation({ email, role, can_export })
  const ensureProfile = async (userId: string) => {
    if (!(await deps.hasProfile(userId))) await deps.createProfile({ id: userId, email, role, can_export })
    await deps.markAccepted(email)
  }

  if (password !== null) {
    const created = await deps.createUser(email, password)
    if (!created.exists) {
      await ensureProfile(created.userId)
      return { status: 200, body: { ok: true, sent: 'password_new' } }
    }
    const userId = await deps.findUserId(email)
    if (!userId) return { status: 400, body: { error: `Supabase says ${email} is registered, but the account was not found` } }
    await deps.setPassword(userId, password)
    await ensureProfile(userId)
    return { status: 200, body: { ok: true, sent: 'password_reset' } }
  }

  const invited = await deps.inviteUser(email)
  if (!invited.exists) {
    await ensureProfile(invited.userId)
    return { status: 200, body: { ok: true, sent: 'invite' } }
  }

  const userId = await deps.findUserId(email)
  if (!userId) return { status: 400, body: { error: `Supabase says ${email} is registered, but the account was not found` } }
  await ensureProfile(userId)
  await deps.sendLoginLink(email)
  return { status: 200, body: { ok: true, sent: 'login_link' } }
}
