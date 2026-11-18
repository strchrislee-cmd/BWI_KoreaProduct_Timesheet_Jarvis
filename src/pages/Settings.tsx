import { Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageTitle } from '../components/Shell'
import { Button, Card, ErrorNote, Field } from '../components/ui'
import { LocalStore } from '../data/localStore'
import { useStore, useUser } from '../data/StoreContext'
import type { OrgSettings, Profile } from '../domain/types'
import { useAsync } from '../lib/hooks'

type ProfileForm = Pick<
  Profile,
  'name' | 'engineer_code' | 'timezone' | 'work_start' | 'work_end' | 'lunch_start' | 'lunch_end' | 'daily_target_hours' | 'template_style'
>

export function Settings() {
  const { store, refreshUser } = useStore()
  const user = useUser()
  const isAdmin = user.role === 'admin'
  const [form, setForm] = useState<ProfileForm>(user)
  const [saved, setSaved] = useState('')
  const [error, setError] = useState<Error | null>(null)

  const org = useAsync(() => store.getOrgSettings(), [store])
  const [orgForm, setOrgForm] = useState<OrgSettings | null>(null)
  useEffect(() => {
    if (org.data) setOrgForm(org.data)
  }, [org.data])

  const set = <K extends keyof ProfileForm>(k: K, v: ProfileForm[K]) => setForm({ ...form, [k]: v })

  async function saveProfile() {
    try {
      if (!/^\d{2}:\d{2}$/.test(form.work_start) || !/^\d{2}:\d{2}$/.test(form.work_end)) throw new Error('Use HH:MM for work hours')
      await store.updateProfile(user.id, form)
      await refreshUser()
      setSaved('Profile saved')
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  async function saveOrg() {
    if (!orgForm) return
    try {
      await store.updateOrgSettings(orgForm)
      setSaved('Organisation settings saved')
      setError(null)
    } catch (e) {
      setError(e as Error)
    }
  }

  return (
    <div>
      <PageTitle>Settings</PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorNote error={error ?? org.error} />
        {saved && <p className="rounded-xl bg-sage px-4 py-2 text-sm font-semibold text-primary" role="status">{saved}</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Profile">
          <div className="space-y-3">
            <Field label="E-mail">
              <input className="field" value={user.email} disabled />
            </Field>
            <Field label="Name">
              <input className="field" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
            <Field label="Engineer code" hint="Matches your column header in the group timesheet">
              <input className="field" value={form.engineer_code} onChange={(e) => set('engineer_code', e.target.value)} />
            </Field>
            <Field label="Time zone">
              <input className="field" value={form.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title="Work hours">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <input type="time" step="1800" className="field" value={form.work_start} onChange={(e) => set('work_start', e.target.value)} />
              </Field>
              <Field label="End">
                <input type="time" step="1800" className="field" value={form.work_end} onChange={(e) => set('work_end', e.target.value)} />
              </Field>
              <Field label="Lunch start">
                <input type="time" step="1800" className="field" value={form.lunch_start} onChange={(e) => set('lunch_start', e.target.value)} />
              </Field>
              <Field label="Lunch end">
                <input type="time" step="1800" className="field" value={form.lunch_end} onChange={(e) => set('lunch_end', e.target.value)} />
              </Field>
            </div>
            <Field label="Daily target (h)">
              <input type="number" step="0.5" className="field" value={form.daily_target_hours} onChange={(e) => set('daily_target_hours', Number(e.target.value))} />
            </Field>
            <Field label="Excel template style" hint="Template download arrives in phase 2">
              <select className="field" value={form.template_style} onChange={(e) => set('template_style', e.target.value as Profile['template_style'])}>
                <option value="compact">Compact</option>
                <option value="detailed">Detailed</option>
                <option value="project_first">Project-first</option>
              </select>
            </Field>
            <Button onClick={() => void saveProfile()}>Save profile</Button>
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          <Card tone="sage" title={<span className="flex items-center gap-2"><Sparkles size={18} /> AI provider</span>}>
            {orgForm ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" disabled={!isAdmin} checked={orgForm.ai_enabled} onChange={(e) => setOrgForm({ ...orgForm, ai_enabled: e.target.checked })} />
                  Enable AI mapping suggestions (phase 2)
                </label>
                <Field label="Model">
                  <input className="field" disabled={!isAdmin} value={orgForm.ai_model} onChange={(e) => setOrgForm({ ...orgForm, ai_model: e.target.value })} />
                </Field>
                <p className="text-xs text-muted">The API key is never stored in the browser or the database: set ANTHROPIC_API_KEY in Vercel → Environment Variables.</p>
                {isAdmin && (
                  <Button variant="outline" onClick={() => void saveOrg()}>
                    Save organisation settings
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">Loading…</p>
            )}
          </Card>
          <Card title="Data">
            <p className="text-sm">
              Mode: <strong>{store.mode === 'demo' ? 'Demo (this browser only)' : 'Supabase'}</strong>
            </p>
            {store.mode === 'demo' && (
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => {
                  if (confirm('Delete all demo data in this browser?')) {
                    LocalStore.reset()
                    window.location.reload()
                  }
                }}
              >
                Reset demo data
              </Button>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
