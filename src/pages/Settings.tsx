import { Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ColorPicker, Swatch } from '../components/ColorPicker'
import { PageTitle } from '../components/Shell'
import { TimeRangePicker } from '../components/TimeRangePicker'
import { Button, Card, ErrorNote, Field } from '../components/ui'
import { LocalStore } from '../data/localStore'
import { useStore, useUser } from '../data/StoreContext'
import { sortProjects } from '../domain/projects'
import type { OrgSettings, Profile } from '../domain/types'
import { useAsync } from '../lib/hooks'
import { NONWORK_KEY, categoryColor } from './timesheets/colors'
import { KIND_LABEL, displayName } from './timesheets/projectUi'
import { useColorPrefs } from './timesheets/useColorPrefs'

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
            <Field label="Default start → end" hint="New days start with these hours; each day can be changed in the Daily Log.">
              <TimeRangePicker
                start={form.work_start}
                end={form.work_end}
                targetHours={form.daily_target_hours}
                lunchStart={form.lunch_start}
                lunchEnd={form.lunch_end}
                onChange={(r) => setForm({ ...form, work_start: r.start, work_end: r.end })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
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
        <CategoryColorsCard />
      </div>
    </div>
  )
}

/** Personal colors for every category (Daily Log rows, dropdowns, Today) and the saved palette. */
function CategoryColorsCard() {
  const { store } = useStore()
  const projectsQ = useAsync(() => store.listProjects(), [store])
  const colors = useColorPrefs()
  const [open, setOpen] = useState<string | null>(null)
  const active = sortProjects((projectsQ.data ?? []).filter((p) => p.status === 'active'))
  const groups = [
    ...(['project', 'timelog', 'local_section'] as const).map((kind) => ({
      title: KIND_LABEL[kind],
      items: active.filter((p) => p.kind === kind).map((p) => ({ key: p.id, name: displayName(p), color: categoryColor('work', p, colors.prefs) })),
    })),
    { title: 'Non-work', items: [{ key: NONWORK_KEY, name: 'Non-work (점심·휴식·퇴근)', color: categoryColor('nonwork', undefined, colors.prefs) }] },
  ].filter((g) => g.items.length)

  return (
    <Card title="카테고리 색상" className="lg:col-span-3">
      <p className="mb-3 text-sm text-muted">Daily Log의 행·드롭다운·Today에 쓰이는 색입니다. 나에게만 적용됩니다. 그리드에서 카테고리 칸을 고른 뒤 ● 를 눌러도 바꿀 수 있습니다.</p>
      <ErrorNote error={colors.error ?? projectsQ.error} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((g) => (
          <div key={g.title}>
            <h3 className="mb-1 text-xs font-semibold uppercase text-muted">{g.title}</h3>
            <ul>
              {g.items.map((it) => (
                <li key={it.key} className="relative flex items-center gap-2 py-1 text-sm">
                  <Swatch color={it.color} label={`Color of ${it.name}`} onClick={() => setOpen(it.key)} />
                  <span className="min-w-0 flex-1 truncate" title={it.name}>
                    {it.name}
                  </span>
                  {colors.isCustom(it.key) && <span className="shrink-0 text-[11px] text-muted">사용자 지정</span>}
                  {open === it.key && (
                    <ColorPicker
                      value={it.color}
                      isCustom={colors.isCustom(it.key)}
                      saved={colors.prefs.palette}
                      onPick={(hex) => void colors.setCategoryColor(it.key, hex)}
                      onSave={(hex) => void colors.savePreset(hex)}
                      onRemoveSaved={(hex) => void colors.removePreset(hex)}
                      onClose={() => setOpen(null)}
                    />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-muted">내 색상 프리셋</h3>
      {colors.prefs.palette.length === 0 ? (
        <p className="text-sm text-muted">색상 선택 창에서 “프리셋에 저장”을 누르면 여기에 보관됩니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" data-testid="saved-palette">
          {colors.prefs.palette.map((c) => (
            <li key={c} className="flex items-center gap-1 rounded-full border border-line py-0.5 pl-1 pr-2 font-mono text-xs">
              <span className="h-4 w-4 rounded-full border border-black/15" style={{ backgroundColor: c }} />
              {c}
              <button aria-label={`Remove saved color ${c}`} className="text-muted hover:text-ink" onClick={() => void colors.removePreset(c)}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
