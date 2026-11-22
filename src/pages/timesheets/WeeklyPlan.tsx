import { Download, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, ErrorNote, Loading, Pill } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { buildWeeklyPlan } from '../../domain/aggregate'
import { WEEKDAY_SHORT, isoWeek, slotToTime, weekDates } from '../../domain/time'
import { downloadWorkbook, loadExcel } from '../../lib/files'
import { useAsync } from '../../lib/hooks'
import { useTimesheets } from './TimesheetsLayout'

export function WeeklyPlanPage() {
  const { store } = useStore()
  const user = useUser()
  const { date, engineer, projects } = useTimesheets()
  const dates = weekDates(date)
  const { week } = isoWeek(date)
  const [error, setError] = useState<Error | null>(null)

  const q = useAsync(() => store.listSlots(engineer.id, dates[0], dates[6]), [store, engineer.id, dates[0]])
  const rows = useMemo(() => (q.data ? buildWeeklyPlan(q.data, projects) : []), [q.data, projects])

  const perDay = dates.map((d) => rows.filter((r) => r.date === d).reduce((a, r) => a + r.hours, 0))
  const total = perDay.reduce((a, b) => a + b, 0)
  const byProject = new Map<string, number>()
  for (const r of rows) {
    const key = r.groupProjectName || `⚠ ${r.localProject || 'Unmapped'}`
    byProject.set(key, (byProject.get(key) ?? 0) + r.hours)
  }
  const top = [...byProject.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const max = Math.max(...perDay, 1)

  async function exportXlsx() {
    try {
      const x = await loadExcel()
      await downloadWorkbook(x.buildWeeklyPlanWorkbook(rows, { engineer: engineer.name }), `WeeklyPlan_W${week}_${engineer.engineer_code || engineer.name}.xlsx`)
    } catch (e) {
      setError(e as Error)
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card
        title="Weekly Task Plan"
        action={
          <div className="flex items-center gap-2">
            <Pill tone="green">
              <Sparkles size={12} className="mr-1" /> Auto-generated from 30-min log
            </Pill>
            {user.can_export && (
              <Button onClick={() => void exportXlsx()} disabled={!rows.length}>
                <Download size={16} /> Export .xlsx
              </Button>
            )}
          </div>
        }
      >
        <ErrorNote error={error ?? q.error} />
        {q.loading && !q.data ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-muted">No work logged in W{week} yet.</p>
        ) : (
          <div className="overflow-auto">
            <table className="sheet">
              <thead>
                <tr>
                  <th>Week</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Local Project</th>
                  <th>Group Project</th>
                  <th>Work</th>
                  <th>Item</th>
                  <th className="num">Hours</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.date}-${r.startSlot}`}>
                    <td>{r.week}</td>
                    <td className="whitespace-nowrap">{r.date.slice(5)}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {slotToTime(r.startSlot)}–{slotToTime(r.endSlot % 48)}
                    </td>
                    <td>
                      <Pill tone="blue">{r.localProject || '—'}</Pill>
                    </td>
                    <td className="max-w-[260px] truncate">{r.groupProjectName ? r.groupProjectName : <Pill tone="orange">Unmapped</Pill>}</td>
                    <td>{r.work === '회의' ? <Pill tone="yellow">회의</Pill> : <Pill>기타</Pill>}</td>
                    <td>{r.item}</td>
                    <td className="num font-semibold">{r.hours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        <Card title="This week">
          <div className="font-display text-5xl font-extrabold text-primary">{total.toFixed(1)}h</div>
          <div className="mt-4 flex h-32 items-end gap-2">
            {perDay.map((h, i) => (
              <div key={dates[i]} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs font-semibold">{h ? h.toFixed(1) : ''}</span>
                <div className="w-full rounded-chip bg-sage" style={{ height: `${(h / max) * 80}px`, minHeight: 4 }} />
                <span className="text-xs text-muted">{WEEKDAY_SHORT[i]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Top projects">
          {top.length === 0 && <p className="text-sm text-muted">—</p>}
          <ul className="space-y-2">
            {top.map(([name, h]) => (
              <li key={name} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{name}</span>
                  <span className="font-semibold">{h.toFixed(1)}h</span>
                </div>
                <div className="mt-1 h-2 rounded-[3px] bg-sage-light">
                  <div className="h-2 rounded-[3px] bg-primary" style={{ width: `${(h / (top[0]?.[1] || 1)) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
