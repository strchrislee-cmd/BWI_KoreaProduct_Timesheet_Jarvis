// POST /api/admin/user, minus Supabase (tested in tests/userAdmin.test.ts).
// Admins, from the Users table: set a person's password (no e-mail) or delete their account.
// Deleting the login account removes the TimeCrumbs profile and everything that hangs off it
// (time slots, leave, work days, templates, personal aliases) through the database's cascades.
import { passwordProblem } from '../../src/domain/password.js'
import { deleteUserProblem } from '../../src/domain/roles.js'

export interface UserAdminDeps {
  listProfiles(): Promise<{ id: string; email: string; role: string }[]>
  /** set the password and confirm the e-mail, so the person can sign in with it */
  setPassword(userId: string, password: string): Promise<void>
  deleteUser(userId: string): Promise<void>
  deleteInvitation(email: string): Promise<void>
}

export type UserAdminResult = { status: 200; body: { ok: true } } | { status: 400 | 404; body: { error: string } }

export async function userAdminCore(
  callerId: string,
  input: { action?: unknown; user_id?: unknown; password?: unknown },
  deps: UserAdminDeps,
): Promise<UserAdminResult> {
  const profiles = await deps.listProfiles()
  const target = profiles.find((p) => p.id === input.user_id)
  if (!target) return { status: 404, body: { error: 'User not found' } }

  if (input.action === 'set_password') {
    const password = typeof input.password === 'string' ? input.password : ''
    const problem = passwordProblem(password)
    if (problem) return { status: 400, body: { error: problem } }
    await deps.setPassword(target.id, password)
    return { status: 200, body: { ok: true } }
  }

  if (input.action === 'delete') {
    const problem = deleteUserProblem(callerId, target, profiles)
    if (problem) return { status: 400, body: { error: problem } }
    await deps.deleteUser(target.id)
    await deps.deleteInvitation(target.email.toLowerCase()) // invitations are stored in lower case
    return { status: 200, body: { ok: true } }
  }

  return { status: 400, body: { error: 'Unknown action' } }
}
