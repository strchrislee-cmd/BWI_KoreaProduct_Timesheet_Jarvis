import { CircleAlert, Sparkles, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type ClipboardEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { Button, Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { resolveLabel } from '../../domain/labels'
import { isNewProject } from '../../domain/projects'
import { SLOTS_PER_DAY, SLOT_HOURS, slotToTime, timeToSlot } from '../../domain/time'
import type { GroupProject, TimeSlot } from '../../domain/types'
import { useAsync } from '../../lib/hooks'
import { ImportWizard } from './ImportWizard'
import { displayName, labelFor, slotTone } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'

const NONWORK_CHOICES = ['점심', '휴식', '퇴근']

function slotValue(s: TimeSlot | undefined): string {
  if (!s) return ''
  if (s.kind === 'nonwork') return `nw:${s.label}`
  return s.group_project_id ? `gp:${s.group_project_id}` : `um:${s.label}`
}

function CategorySelect({
  slot,
  projects,
  disabled,
  onChange,
}: {
  slot: TimeSlot | undefined
  projects: GroupProject[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const usable = projects.filter((p) => p.status === 'active' || p.id === slot?.group_project_id)
  const group = (kind: GroupProject['kind']) =>
    usable
      .filter((p) => p.kind === kind)
      .map((p) => (
        <option key={p.id} value={`gp:${p.id}`}>
          {displayName(p)}
        </option>
      ))
  const nonwork = slot?.kind === 'nonwork' && !NONWORK_CHOICES.includes(slot.label) ? [...NONWORK_CHOICES, slot.label] : NONWORK_CHOICES
  return (
    <select
      aria-label="Category"
      className="cell-input max-w-[260px] truncate"
      value={slotValue(slot)}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">—</option>
      {slot && slot.kind === 'work' && !slot.group_project_id && <option value={`um:${slot.label}`}>⚠ {slot.label || '(no category)'}</option>}
      <optgroup label="Projects">{group('project')}</optgroup>
      <optgroup label="Timelog">{group('timelog')}</optgroup>
      <optgroup label="General">{group('local_section')}</optgroup>
      <optgroup label="Non-work">
        {nonwork.map((l) => (
          <option key={l} value={`nw:${l}`}>
            {l}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

export function DailyLog() {
  const { store } = useStore()
  const user = useUser()
  const { search } = useLocation()
  const { date, engineer, projects, aliases, latestImport, reloadMaster } = useTimesheets()
  const canEdit = user.role !== 'viewer' && (engineer.id === user.id || user.role === 'admin')

  const q = useAsync(() => store.listSlots(engineer.id, date, date), [store, engineer.id, date])
  const [slots, setSlots] = useState<Map<number, TimeSlot>>(new Map())
  const [error, setError] = useState<Error | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    if (q.data) setSlots(new Map(q.data.map((s) => [s.slot_index, s])))
  }, [q.data])

  const byId = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const newProjects = projects.filter((p) => isNewProject(p, latestImport))

  const indexes = useMemo(() => {
    if (showAll) return Array.from({ length: SLOTS_PER_DAY }, (_, i) => i)
    const first = timeToSlot(engineer.work_start)
    const [eh, em] = engineer.work_end.split(':').map(Number)
    const last = Math.max(first, Math.ceil((eh * 60 + em) / 30) - 1)
    const set = new Set<number>(slots.keys())
    for (let i = first; i <= last; i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [showAll, engineer.work_start, engineer.work_end, slots])

  const blank = (index: number): TimeSlot => ({
    user_id: engineer.id,
    work_date: date,
    slot_index: index,
    kind: 'work',
    group_project_id: null,
    label: '',
    description: '',
    focus: null,
  })

  async function persist(changes: { index: number; slot: TimeSlot | null }[]) {
    if (!changes.length) return
    setSlots((prev) => {
      const m = new Map(prev)
      for (const c of changes) (c.slot ? m.set(c.index, c.slot) : m.delete(c.index))
      return m
    })
    try {
      await store.saveSlots(changes.flatMap((c) => (c.slot ? [c.slot] : [])))
      for (const c of changes) if (!c.slot) await store.clearSlot(engineer.id, date, c.index)
      setError(null)
    } catch (e) {
      setError(e as Error)
      q.reload()
    }
  }

  function setCategory(index: number, value: string) {
    const cur = slots.get(index) ?? blank(index)
    if (!value) return persist([{ index, slot: null }])
    if (value.startsWith('gp:')) {
      const p = byId.get(value.slice(3))!
      return persist([{ index, slot: { ...cur, kind: 'work', group_project_id: p.id, label: labelFor(p, aliases) } }])
    }
    if (value.startsWith('nw:')) return persist([{ index, slot: { ...cur, kind: 'nonwork', group_project_id: null, label: value.slice(3) } }])
  }

  function setDescription(index: number, text: string) {
    const cur = slots.get(index)
    if ((!cur && !text.trim()) || cur?.description === text) return
    void persist([{ index, slot: { ...(cur ?? blank(index)), description: text } }])
  }

  function setFocus(index: number, value: string) {
    const cur = slots.get(index)
    if (cur) void persist([{ index, slot: { ...cur, focus: value === '' ? null : Number(value) } }])
  }

  /** Paste rows from Excel/Sheets: "description" or "category<TAB>description" per line. */
  function handlePaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text/plain')
    if (!text.includes('\n') && !text.includes('\t')) return
    e.preventDefault()
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n')
    const changes = lines.flatMap((line, i) => {
      const idx = index + i
      if (idx >= SLOTS_PER_DAY) return []
      const cols = line.split('\t')
      const label = cols.length >= 2 ? cols[0].trim() : null
      const description = (cols.length >= 2 ? cols.slice(1).join(' ') : cols[0]).trim()
      let next: TimeSlot = { ...(slots.get(idx) ?? blank(idx)), description }
      const resolved = label ? resolveLabel(label, aliases, projects) : null
      if (label !== null && resolved) next = { ...next, ...resolved, label }
      return [{ index: idx, slot: next }]
    })
    void persist(changes)
  }

  async function mapLabel(label: string, groupProjectId: string) {
    try {
      await store.addAlias(groupProjectId, label)
      await persist(
        [...slots.values()]
          .filter((s) => s.kind === 'work' && !s.group_project_id && s.label === label)
          .map((s) => ({ index: s.slot_index, slot: { ...s, group_project_id: groupProjectId } })),
      )
      reloadMaster()
    } catch (e) {
      setError(e as Error)
    }
  }

  const work = [...slots.values()].filter((s) => s.kind === 'work')
  const total = work.length * SLOT_HOURS
  const breakdown = new Map<string, number>()
  for (const s of work) {
    const key = s.group_project_id ? displayName(byId.get(s.group_project_id)!) : `⚠ ${s.label || 'Unmapped'}`
    breakdown.set(key, (breakdown.get(key) ?? 0) + SLOT_HOURS)
  }
  const unmappedLabels = [...new Set(work.filter((s) => !s.group_project_id && s.label).map((s) => s.label))]

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card
        title="30-min Log"
        action={
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-muted">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 24h
            </label>
            {canEdit && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                <Upload size={16} /> Import .xlsx
              </Button>
            )}
          </div>
        }
      >
        <ErrorNote error={error ?? q.error} />
        {q.loading && !q.data ? (
          <Loading />
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="sheet">
              <thead>
                <tr>
                  <th className="w-16">Time</th>
                  <th className="w-[260px]">Category</th>
                  <th>Task</th>
                  <th className="w-28">Focus</th>
                </tr>
              </thead>
              <tbody>
                {indexes.map((i) => {
                  const s = slots.get(i)
                  const p = s?.group_project_id ? byId.get(s.group_project_id) : undefined
                  return (
                    <tr key={`${date}-${i}`} className={slotTone(s, p)} data-slot={i}>
                      <td className="font-semibold tabular-nums">{slotToTime(i)}</td>
                      <td>
                        <CategorySelect slot={s} projects={projects} disabled={!canEdit} onChange={(v) => void setCategory(i, v)} />
                      </td>
                      <td>
                        <input
                          aria-label={`Task ${slotToTime(i)}`}
                          className="cell-input"
                          defaultValue={s?.description ?? ''}
                          key={`${s?.description ?? ''}`}
                          disabled={!canEdit}
                          placeholder={canEdit ? 'e.g. 개발 | 하우징 설계' : ''}
                          onBlur={(e) => setDescription(i, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          onPaste={(e) => handlePaste(i, e)}
                        />
                      </td>
                      <td>
                        <select
                          aria-label="Focus"
                          className="cell-input"
                          value={s?.focus ?? ''}
                          disabled={!canEdit || !s}
                          onChange={(e) => setFocus(i, e.target.value)}
                        >
                          <option value="">–</option>
                          {[0, 1, 2, 3].map((f) => (
                            <option key={f} value={f}>
                              {'●'.repeat(f) || '0'}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Tip: paste rows copied from Excel/Sheets into a Task cell — one line per 30 min, optionally "category⇥task".</p>
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="Today">
          <div className="text-5xl font-extrabold text-primary" data-testid="today-total">
            {Math.floor(total)}h {total % 1 ? '30m' : '00m'}
          </div>
          <p className="mb-3 text-sm text-muted">target {engineer.daily_target_hours}h</p>
          <ul className="space-y-1.5 text-sm">
            {[...breakdown.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([name, h]) => (
                <li key={name} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="font-semibold tabular-nums">{h.toFixed(1)}h</span>
                </li>
              ))}
          </ul>
        </Card>

        {newProjects.length > 0 && (
          <Card tone="accent" title={`${newProjects.length} new group project${newProjects.length > 1 ? 's' : ''} detected`}>
            <ul className="mb-3 space-y-1.5">
              {newProjects.map((p) => (
                <li key={p.id} className="truncate rounded-xl bg-white/90 px-3 py-1.5 text-sm font-semibold text-ink">
                  {p.name}
                </li>
              ))}
            </ul>
            <Link to={{ pathname: '/timesheets/projects', search }} className="inline-block rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-ink">
              Map now
            </Link>
          </Card>
        )}

        {unmappedLabels.length > 0 && (
          <Card tone="sage" title={<span className="flex items-center gap-2"><CircleAlert size={18} /> Unmapped categories</span>}>
            <p className="mb-2 text-sm text-muted">These hours are not in any group project yet. Pick one to save an alias for everyone.</p>
            <ul className="space-y-2">
              {unmappedLabels.map((label) => (
                <li key={label} className="flex items-center gap-2">
                  <Pill tone="orange">{label}</Pill>
                  <select
                    aria-label={`Map ${label}`}
                    className="field !py-1 text-sm"
                    defaultValue=""
                    disabled={!canEdit}
                    onChange={(e) => e.target.value && void mapLabel(label, e.target.value)}
                  >
                    <option value="">Map to…</option>
                    {projects
                      .filter((p) => p.status === 'active')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {displayName(p)}
                        </option>
                      ))}
                  </select>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card tone="sage" title={<span className={cx('flex items-center gap-2')}><Sparkles size={18} /> AI Assist</span>}>
          <p className="text-sm text-muted">Mapping suggestions arrive in phase 2 (Settings → AI provider).</p>
        </Card>
      </div>

      {importing && (
        <ImportWizard
          onClose={() => setImporting(false)}
          onDone={() => {
            setImporting(false)
            reloadMaster()
            q.reload()
          }}
        />
      )}
    </div>
  )
}
