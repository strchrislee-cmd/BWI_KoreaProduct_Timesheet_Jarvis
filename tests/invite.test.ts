import { describe, expect, it } from 'vitest'
import { inviteCore, type InviteDeps } from '../api/_lib/inviteCore'

/** In-memory stand-in for Supabase: accounts, profiles, invitations and sent mail. */
function fakeSupabase(opts: { accounts?: string[]; profiles?: string[]; trigger?: boolean } = {}) {
  const accounts = new Map((opts.accounts ?? []).map((e, i) => [e, `u${i}`]))
  const profiles = new Map<string, { email: string; role: string }>((opts.profiles ?? []).map((e) => [accounts.get(e)!, { email: e, role: 'l1' }]))
  const invitations = new Map<string, { role: string; status: string }>()
  const mail: string[] = []
  const passwords = new Map<string, string>()
  const deps: InviteDeps = {
    saveInvitation: async (r) => void invitations.set(r.email, { role: r.role, status: 'pending' }),
    inviteUser: async (email) => {
      if (accounts.has(email)) return { exists: true }
      const id = `u${accounts.size}`
      accounts.set(email, id)
      mail.push(`invite:${email}`)
      if (opts.trigger) {
        profiles.set(id, { email, role: invitations.get(email)!.role })
        invitations.get(email)!.status = 'accepted'
      }
      return { exists: false, userId: id }
    },
    findUserId: async (email) => accounts.get(email) ?? null,
    hasProfile: async (id) => profiles.has(id),
    createProfile: async (r) => void profiles.set(r.id, { email: r.email, role: r.role }),
    markAccepted: async (email) => void (invitations.get(email)!.status = 'accepted'),
    sendLoginLink: async (email) => void mail.push(`login:${email}`),
    createUser: async (email, password) => {
      if (accounts.has(email)) return { exists: true }
      const id = `u${accounts.size}`
      accounts.set(email, id)
      passwords.set(id, password)
      if (opts.trigger) {
        profiles.set(id, { email, role: invitations.get(email)!.role })
        invitations.get(email)!.status = 'accepted'
      }
      return { exists: false, userId: id }
    },
    setPassword: async (id, password) => void passwords.set(id, password),
  }
  return { deps, accounts, profiles, invitations, mail, passwords }
}

describe('POST /api/admin/invite core', () => {
  it('a new address gets the invite e-mail and a profile with the chosen level', async () => {
    const sb = fakeSupabase()
    const out = await inviteCore({ email: ' New@Example.com ', role: 'l2' }, sb.deps)
    expect(out).toEqual({ status: 200, body: { ok: true, sent: 'invite' } })
    expect(sb.mail).toEqual(['invite:new@example.com'])
    expect([...sb.profiles.values()]).toEqual([{ email: 'new@example.com', role: 'l2' }])
    expect(sb.invitations.get('new@example.com')!.status).toBe('accepted')
  })

  it('with the DB trigger in place nothing is created twice', async () => {
    const sb = fakeSupabase({ trigger: true })
    await inviteCore({ email: 'a@example.com', role: 'l3' }, sb.deps)
    expect(sb.profiles.size).toBe(1)
  })

  it('an address that already has an account gets a sign-in link instead of an error, and its missing profile', async () => {
    const sb = fakeSupabase({ accounts: ['colleague@example.com'] }) // first send made the account, no profile
    const out = await inviteCore({ email: 'colleague@example.com', role: 'l2' }, sb.deps)
    expect(out).toEqual({ status: 200, body: { ok: true, sent: 'login_link' } })
    expect(sb.mail).toEqual(['login:colleague@example.com'])
    expect(sb.profiles.get('u0')).toEqual({ email: 'colleague@example.com', role: 'l2' })
    expect(sb.invitations.get('colleague@example.com')!.status).toBe('accepted')
  })

  it('an existing member keeps their level (change it in the Users table)', async () => {
    const sb = fakeSupabase({ accounts: ['m@example.com'], profiles: ['m@example.com'] })
    await inviteCore({ email: 'm@example.com', role: 'admin' }, sb.deps)
    expect(sb.profiles.get('u0')!.role).toBe('l1')
    expect(sb.mail).toEqual(['login:m@example.com'])
  })

  it('with a temporary password: the account is made with that password and no e-mail is sent', async () => {
    const sb = fakeSupabase({ trigger: true })
    const out = await inviteCore({ email: 'temp@example.com', role: 'l2', password: 'start-1234' }, sb.deps)
    expect(out).toEqual({ status: 200, body: { ok: true, sent: 'password_new' } })
    expect(sb.mail).toEqual([])
    expect(sb.passwords.get('u0')).toBe('start-1234')
    expect([...sb.profiles.values()]).toEqual([{ email: 'temp@example.com', role: 'l2' }])
    expect(sb.invitations.get('temp@example.com')!.status).toBe('accepted')
  })

  it('with a temporary password for an address that already has an account: its password is set, no e-mail', async () => {
    const sb = fakeSupabase({ accounts: ['colleague@example.com'] }) // invited before, mail never arrived, no profile
    const out = await inviteCore({ email: 'colleague@example.com', role: 'l2', password: 'start-1234' }, sb.deps)
    expect(out).toEqual({ status: 200, body: { ok: true, sent: 'password_reset' } })
    expect(sb.mail).toEqual([])
    expect(sb.passwords.get('u0')).toBe('start-1234')
    expect(sb.profiles.get('u0')).toEqual({ email: 'colleague@example.com', role: 'l2' })
  })

  it('a too-short temporary password is rejected before anything is saved; an empty one means "send the e-mail"', async () => {
    const sb = fakeSupabase()
    expect(await inviteCore({ email: 'a@example.com', password: 'short' }, sb.deps)).toEqual({
      status: 400,
      body: { error: 'Password must be at least 8 characters' },
    })
    expect(sb.invitations.size).toBe(0)
    expect((await inviteCore({ email: 'a@example.com', password: '' }, sb.deps)).body).toEqual({ ok: true, sent: 'invite' })
  })

  it('rejects bad addresses and falls back to L1 for unknown levels', async () => {
    const sb = fakeSupabase()
    expect((await inviteCore({ email: 'nope' }, sb.deps)).status).toBe(400)
    await inviteCore({ email: 'x@example.com', role: 'member' }, sb.deps)
    expect(sb.invitations.get('x@example.com')!.role).toBe('l1')
  })
})
