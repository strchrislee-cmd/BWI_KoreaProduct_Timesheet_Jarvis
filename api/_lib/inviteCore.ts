// POST /api/admin/invite, minus Supabase (tested in tests/invite.test.ts).
//
// Inviting creates the person's login account at once (Supabase Auth). So:
// - a new address gets the invite e-mail; their TimeCrumbs profile is made from the invitation
//   (the DB trigger normally does this; done here too so a missing trigger cannot leave them out);
// - an address that already has an account (e.g. invited before, or the first send failed after
//   the account was made) gets a fresh sign-in link instead of the error "already registered",
//   and gets its profile if it is missing.

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
}

export type InviteResult = { status: 200; body: { ok: true; sent: 'invite' | 'login_link' } } | { status: 400; body: { error: string } }

export async function inviteCore(input: { email?: unknown; role?: unknown; can_export?: unknown }, deps: InviteDeps): Promise<InviteResult> {
  const email = String(input.email ?? '').trim().toLowerCase()
  const role: InviteRole = ROLES.includes(input.role as InviteRole) ? (input.role as InviteRole) : 'l1'
  const can_export = input.can_export !== false
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { status: 400, body: { error: 'Invalid e-mail address' } }

  await deps.saveInvitation({ email, role, can_export })
  const ensureProfile = async (userId: string) => {
    if (!(await deps.hasProfile(userId))) await deps.createProfile({ id: userId, email, role, can_export })
    await deps.markAccepted(email)
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
