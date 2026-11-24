import { describe, expect, it } from 'vitest'
import { userAdminCore, type UserAdminDeps } from '../api/_lib/userAdminCore'

function fake(profiles: { id: string; email: string; role: string }[]) {
  const log: string[] = []
  const deps: UserAdminDeps = {
    listProfiles: async () => profiles,
    setPassword: async (id, pw) => void log.push(`password:${id}:${pw}`),
    deleteUser: async (id) => void log.push(`delete:${id}`),
    deleteInvitation: async (email) => void log.push(`invitation:${email}`),
  }
  return { deps, log }
}

const people = [
  { id: 'a1', email: 'boss@example.com', role: 'admin' },
  { id: 'u2', email: 'Colleague@Example.com', role: 'l2' },
]

describe('POST /api/admin/user core', () => {
  it('sets a password without e-mail', async () => {
    const { deps, log } = fake(people)
    expect(await userAdminCore('a1', { action: 'set_password', user_id: 'u2', password: 'start-1234' }, deps)).toEqual({ status: 200, body: { ok: true } })
    expect(log).toEqual(['password:u2:start-1234'])
  })

  it('rejects short passwords and unknown people', async () => {
    const { deps, log } = fake(people)
    expect((await userAdminCore('a1', { action: 'set_password', user_id: 'u2', password: 'short' }, deps)).status).toBe(400)
    expect((await userAdminCore('a1', { action: 'set_password', user_id: 'nobody', password: 'start-1234' }, deps)).status).toBe(404)
    expect(log).toEqual([])
  })

  it('deletes the account and its invitation', async () => {
    const { deps, log } = fake(people)
    expect(await userAdminCore('a1', { action: 'delete', user_id: 'u2' }, deps)).toEqual({ status: 200, body: { ok: true } })
    expect(log).toEqual(['delete:u2', 'invitation:colleague@example.com'])
  })

  it('never deletes yourself or the last admin', async () => {
    const { deps, log } = fake([...people, { id: 'a3', email: 'second@example.com', role: 'admin' }])
    expect(await userAdminCore('a1', { action: 'delete', user_id: 'a1' }, deps)).toEqual({ status: 400, body: { error: 'You cannot delete your own account' } })
    const solo = fake(people)
    // the only admin cannot be deleted; with a second admin (a3) it can
    expect((await userAdminCore('u2', { action: 'delete', user_id: 'a1' }, solo.deps)).body).toEqual({ error: 'Cannot delete the last admin' })
    expect(await userAdminCore('a3', { action: 'delete', user_id: 'a1' }, deps)).toEqual({ status: 200, body: { ok: true } })
    expect([...log, ...solo.log]).toEqual(['delete:a1', 'invitation:boss@example.com'])
  })

  it('unknown actions are refused', async () => {
    const { deps } = fake(people)
    expect((await userAdminCore('a1', { action: 'promote', user_id: 'u2' }, deps)).status).toBe(400)
  })
})
