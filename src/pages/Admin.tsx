import { Shield, UserPlus, Users } from 'lucide-react'
import { useState } from 'react'
import { PageTitle } from '../components/Shell'
import { Button, Card, ErrorNote, Field, Pill } from '../components/ui'
import { useStore, useUser } from '../data/StoreContext'
import { passwordProblem } from '../domain/password'
import type { InviteSent, Role } from '../domain/types'
import { useAsync } from '../lib/hooks'
import { useT } from '../lib/i18n'
import { ROLES, roleLabel } from '../domain/roles'

export function Admin() {
  const tr = useT()
  const { store, refreshUser } = useStore()
  const me = useUser()
  const profiles = useAsync(() => store.listProfiles(), [store])
  const invitations = useAsync(() => store.listInvitations(), [store])
  const [form, setForm] = useState({ email: '', role: 'l1' as Role, can_export: true, password: '' })
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

  const invite = (input: { email: string; role: Role; can_export: boolean; password?: string } = form) =>
    run(async () => {
      const problem = input.password ? passwordProblem(input.password) : null
      if (problem) throw new Error(problem)
      const { sent } = await store.invite(input)
      if (input === form) setForm({ ...form, email: '', password: '' })
      invitations.reload()
      profiles.reload()
      // see api/_lib/inviteCore.ts: an existing account gets a sign-in link (or, with a password, that password)
      const notices: Record<InviteSent, string> = {
        invite: `Invitation sent to ${input.email}`,
        login_link: `${input.email}: 이미 계정이 있는 주소라 로그인 링크를 다시 보냈습니다.`,
        password_new: `${input.email}: 계정을 만들었습니다(메일 없음). 임시 비밀번호를 직접 전달해 주세요.`,
        password_reset: `${input.email}: 이미 계정이 있어 비밀번호를 방금 입력한 임시 비밀번호로 바꿨습니다(메일 없음).`,
      }
      setNotice(notices[sent])
    })

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
      <PageTitle>{tr('Admin')}</PageTitle>
      <div className="mb-4 grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <Users className="text-primary" />
            <div>
              <div className="text-sm font-semibold text-muted">Members</div>
              <div className="font-display text-4xl font-extrabold">{profiles.data?.length ?? '–'}</div>
            </div>
          </div>
        </Card>
        <Card className={pending.length ? 'bg-accent-soft' : ''}>
          <div className="text-sm font-semibold text-muted">Pending invites</div>
          <div className="font-display text-4xl font-extrabold text-accent">{pending.length}</div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Shield className="text-primary" />
            <div>
              <div className="text-sm font-semibold text-muted">Admins</div>
              <div className="font-display text-4xl font-extrabold">{admins}</div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mb-4 space-y-2">
        <ErrorNote error={error ?? profiles.error ?? invitations.error} />
        {notice && <p className="rounded-control bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">{notice}</p>}
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
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
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
                  <td>{roleLabel(i.role)}</td>
                  <td>
                    <Pill tone={i.status === 'pending' ? 'orange' : i.status === 'accepted' ? 'green' : 'grey'}>{i.status}</Pill>
                  </td>
                  <td>
                    <span className="flex justify-end gap-1">
                      {i.status === 'pending' && (
                        <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => void invite({ email: i.email, role: i.role, can_export: i.can_export })}>
                          다시 보내기
                        </Button>
                      )}
                      {i.status === 'pending' ? (
                        <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => void run(async () => (await store.revokeInvitation(i.id), invitations.reload()))}>
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          className="!px-2.5 !py-1 text-xs"
                          aria-label={`Delete invitation ${i.email}`}
                          onClick={() => void run(async () => (await store.deleteInvitation(i.id), invitations.reload()))}
                        >
                          삭제
                        </Button>
                      )}
                    </span>
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
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label} — {r.desc}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.can_export} onChange={(e) => setForm({ ...form, can_export: e.target.checked })} /> Can export group timesheet
            </label>
            <Field label="임시 비밀번호 (선택)" hint="비워 두면 초대 메일을 보냅니다. 넣으면 메일 없이 바로 계정을 만들고(이미 있으면 비밀번호를 바꿈) 그 비밀번호로 로그인합니다. 8자 이상.">
              <input
                type="text"
                className="field"
                autoComplete="off"
                spellCheck={false}
                aria-label="Temporary password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Button type="submit" className="w-full">
              {form.password ? 'Create account' : 'Send invite'}
            </Button>
            <p className="text-xs text-muted">
              {form.password
                ? 'No e-mail is sent. Give the person this password; they can change it in Settings.'
                : 'The invitee gets an e-mail link; their account is created with this role when they open it.'}
            </p>
          </form>
        </Card>
      </div>
    </div>
  )
}
