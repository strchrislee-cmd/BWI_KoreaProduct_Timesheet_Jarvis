import { Shield, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { PageTitle } from '../components/Shell'
import { Button, Card, ErrorNote, Field, Pill } from '../components/ui'
import { useStore, useUser } from '../data/StoreContext'
import type { Role } from '../domain/types'
import { useAsync } from '../lib/hooks'

export function Admin() {
  const { store, refreshUser } = useStore()
  const me = useUser()
  const profiles = useAsync(() => store.listProfiles(), [store])
  const invitations = useAsync(() => store.listInvitations(), [store])
  const [form, setForm] = useState({ email: '', role: 'member' as Role, can_export: true })
  const [error, setError] = useState<Error | null>(null)
  const [notice, setNotice] = useState('')

  async function run(fn: () => Promise<void>, ok?: string) {
    try {
      await fn()
      setError(null)
      if (ok) setNotice(ok)
    } catch (e) {
      setError(e as Error)
    }
  }

  const invite = () =>
    run(async () => {
      await store.invite(form)
      setForm({ ...form, email: '' })
      invitations.reload()
    }, `Invitation sent to ${form.email}`)

  const update = (id: string, patch: { role?: Role; can_export?: boolean }) =>
    run(async () => {
      await store.updateProfile(id, patch)
      profiles.reload()
      if (id === me.id) await refreshUser()
    })

  const pending = (invitations.data ?? []).filter((i) => i.status === 'pending')
  const admins = (profiles.data ?? []).filter((p) => p.role === 'admin').length

  return (
    <div>
      <PageTitle>Admin</PageTitle>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Users className="text-primary" />
            <div>
              <div className="text-sm font-semibold text-muted">Members</div>
              <div className="text-4xl font-extrabold">{profiles.data?.length ?? '–'}</div>
            </div>
          </div>
        </Card>
        <Card className={pending.length ? 'bg-accent-soft' : ''}>
          <div className="text-sm font-semibold text-muted">Pending invites</div>
          <div className="text-4xl font-extrabold text-accent">{pending.length}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Shield className="text-primary" />
            <div>
              <div className="text-sm font-semibold text-muted">Admins</div>
              <div className="text-4xl font-extrabold">{admins}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-4 space-y-2">
        <ErrorNote error={error ?? profiles.error ?? invitations.error} />
        {notice && <p className="rounded-xl bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">{notice}</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card title="Users">
          <table className="sheet">
            <thead>
              <tr>
                <th>Name</th>
                <th>E-mail</th>
                <th>Role</th>
                <th>Can export</th>
              </tr>
            </thead>
            <tbody>
              {(profiles.data ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold">
                    {p.name} {p.engineer_code && <span className="text-muted">({p.engineer_code})</span>}
                  </td>
                  <td>{p.email}</td>
                  <td>
                    <select aria-label={`Role of ${p.email}`} className="cell-input" value={p.role} onChange={(e) => void update(p.id, { role: e.target.value as Role })}>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td>
                    <input type="checkbox" aria-label={`Export permission of ${p.email}`} checked={p.can_export} onChange={(e) => void update(p.id, { can_export: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mb-2 mt-6 font-bold">Invitations</h3>
          <table className="sheet">
            <thead>
              <tr>
                <th>E-mail</th>
                <th>Role</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(invitations.data ?? []).map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.role}</td>
                  <td>
                    <Pill tone={i.status === 'pending' ? 'orange' : i.status === 'accepted' ? 'green' : 'grey'}>{i.status}</Pill>
                  </td>
                  <td>
                    {i.status === 'pending' && (
                      <Button variant="ghost" onClick={() => void run(async () => (await store.revokeInvitation(i.id), invitations.reload()))}>
                        Revoke
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {invitations.data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted">
                    No invitations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title={<span className="flex items-center gap-2"><UserPlus size={18} /> Invite user</span>}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void invite()
            }}
          >
            <Field label="E-mail">
              <input type="email" required className="field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="new.member@company.com" />
            </Field>
            <Field label="Role">
              <select className="field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="member">Member — logs own time</option>
                <option value="viewer">Viewer — read-only</option>
                <option value="admin">Admin — manages users & master</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.can_export} onChange={(e) => setForm({ ...form, can_export: e.target.checked })} /> Can export group timesheet
            </label>
            <Button type="submit" className="w-full">
              Send invite
            </Button>
            <p className="text-xs text-muted">The invitee gets an e-mail link; their account is created with this role when they open it.</p>
          </form>
        </Card>
      </div>
    </div>
  )
}
