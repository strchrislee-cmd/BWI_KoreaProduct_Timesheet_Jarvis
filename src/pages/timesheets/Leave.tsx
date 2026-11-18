import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, Card, ErrorNote, Field, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { DEFAULT_LEAVE_HOURS } from '../../domain/aggregate'
import { WEEKDAY_SHORT, monthGrid } from '../../domain/time'
import type { LeaveType } from '../../domain/types'
import { useAsync } from '../../lib/hooks'
import { useTimesheets } from './TimesheetsLayout'

export const LEAVE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual leave',
  half_am: 'Half-day AM',
  half_pm: 'Half-day PM',
  sick: 'Sick leave',
  company: 'Company leave',
  biz_trip: 'Business trip',
}
const LEAVE_COLOR: Record<LeaveType, string> = {
  annual: 'bg-primary text-white',
  half_am: 'bg-sage text-primary',
  half_pm: 'bg-sage text-primary',
  sick: 'bg-cat-meeting',
  company: 'bg-[#d9d9d9]',
  biz_trip: 'bg-cat-general',
}

export function LeavePage() {
  const { store } = useStore()
  const user = useUser()
  const { date, engineer, setDate } = useTimesheets()
  const canEdit = user.role !== 'viewer' && (engineer.id === user.id || user.role === 'admin')
  const grid = monthGrid(date)
  const month = date.slice(0, 7)

  const q = useAsync(() => store.listLeave(engineer.id, grid[0], grid[41]), [store, engineer.id, grid[0]])
  const [form, setForm] = useState({ leave_type: 'annual' as LeaveType, start_date: date, end_date: date, hours_per_day: 8, note: '' })
  const [error, setError] = useState<Error | null>(null)

  async function submit() {
    try {
      await store.addLeave({ ...form, user_id: engineer.id })
      setError(null)
      q.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  async function remove(id: string) {
    try {
      await store.deleteLeave(id)
      q.reload()
    } catch (e) {
      setError(e as Error)
    }
  }

  const leaves = q.data ?? []

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card title={new Date(`${month}-01T00:00:00Z`).toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })}>
        <div className="grid grid-cols-7 gap-1 text-sm">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="rounded-lg bg-sage-light py-1 text-center font-semibold">
              {d}
            </div>
          ))}
          {grid.map((d) => {
            const dayLeaves = leaves.filter((l) => d >= l.start_date && d <= l.end_date)
            return (
              <button
                key={d}
                onClick={() => setDate(d)}
                className={cx('min-h-20 rounded-lg border border-line p-1 text-left align-top', d.slice(0, 7) !== month && 'opacity-40', d === date && 'ring-2 ring-primary')}
              >
                <div className="text-xs font-semibold">{Number(d.slice(8))}</div>
                {dayLeaves.map((l) => (
                  <div key={l.id} className={cx('mt-1 truncate rounded-full px-2 text-[11px] font-semibold', LEAVE_COLOR[l.leave_type])}>
                    {LEAVE_LABEL[l.leave_type]}
                  </div>
                ))}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="Request leave">
          <div className="space-y-3">
            <Field label="Type">
              <select
                className="field"
                value={form.leave_type}
                disabled={!canEdit}
                onChange={(e) => {
                  const t = e.target.value as LeaveType
                  setForm({ ...form, leave_type: t, hours_per_day: DEFAULT_LEAVE_HOURS[t] })
                }}
              >
                {Object.entries(LEAVE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="From">
                <input type="date" className="field" value={form.start_date} disabled={!canEdit} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
              </Field>
              <Field label="To">
                <input type="date" className="field" value={form.end_date} disabled={!canEdit} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Hours per day">
              <input type="number" step="0.5" min="0.5" max="24" className="field" value={form.hours_per_day} disabled={!canEdit} onChange={(e) => setForm({ ...form, hours_per_day: Number(e.target.value) })} />
            </Field>
            <Field label="Note">
              <input className="field" value={form.note} disabled={!canEdit} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="optional" />
            </Field>
            <ErrorNote error={error ?? q.error} />
            <Button className="w-full" onClick={() => void submit()} disabled={!canEdit}>
              Submit
            </Button>
            <p className="text-xs text-muted">Weekdays only. Fills “00.Timelog--Leave” (company leave / business trip go to their own rows) in the group timesheet.</p>
          </div>
        </Card>

        <Card title="This month">
          <ul className="space-y-2 text-sm">
            {leaves.length === 0 && <li className="text-muted">No leave.</li>}
            {leaves.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="flex-1">
                  <strong>{LEAVE_LABEL[l.leave_type]}</strong> · {l.start_date.slice(5)}
                  {l.end_date !== l.start_date && `–${l.end_date.slice(5)}`} · {l.hours_per_day}h/day
                </span>
                {canEdit && (
                  <button aria-label="Delete leave" className="rounded-full p-1 text-muted hover:bg-sage-light" onClick={() => void remove(l.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
