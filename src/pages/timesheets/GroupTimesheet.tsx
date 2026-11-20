import { CircleAlert, CircleCheck, Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, ErrorNote, Loading, Pill, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { buildGroupTimesheet, type DayIssue, type GroupTimesheetRow } from '../../domain/aggregate'
import { isNewProject } from '../../domain/projects'
import { isWeekend, isoWeek, shortLabel, weekDates } from '../../domain/time'
import { downloadWorkbook, loadExcel } from '../../lib/files'
import { useAsync } from '../../lib/hooks'
import { useTimesheets } from './TimesheetsLayout'

const ISSUE_TEXT: Record<DayIssue['type'], (h: number) => string> = {
  unmapped: (h) => `${h.toFixed(1)}h unmapped`,
  empty: () => 'nothing logged',
  under: (h) => `${h.toFixed(1)}h (under target)`,
  over: (h) => `${h.toFixed(1)}h (over target)`,
}

const fmt = (v: number) => (v ? v.toFixed(2) : '')

export function GroupTimesheetPage() {
  const { store } = useStore()
  const user = useUser()
  const { date, engineer, projects, latestImport } = useTimesheets()
  const all = weekDates(date)
  const { week } = isoWeek(date)
  const [error, setError] = useState<Error | null>(null)

  const q = useAsync(
    () => Promise.all([store.listSlots(engineer.id, all[0], all[6]), store.listLeave(engineer.id, all[0], all[6])]),
    [store, engineer.id, all[0]],
  )

  const gt = useMemo(() => {
    if (!q.data) return null
    const [slots, leaves] = q.data
    const base = { slots, leaves, projects, targetHours: engineer.daily_target_hours }
    // show weekends only when something was logged on them
    const full = buildGroupTimesheet({ ...base, dates: all })
    const dates = all.filter((d, i) => !isWeekend(d) || full.daily[i] > 0)
    return buildGroupTimesheet({ ...base, dates })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, projects, engineer.daily_target_hours, all[0]])

  async function exportXlsx() {
    if (!gt) return
    if (gt.issues.some((i) => i.type !== 'over') && !confirm('Some days are incomplete or have unmapped hours. Export anyway?')) return
    try {
      const x = await loadExcel()
      const wb = x.buildGroupTimesheetWorkbook(gt, { engineer: engineer.name, engineerCode: engineer.engineer_code, week })
      await downloadWorkbook(wb, `GroupTimesheet_W${week}_${engineer.engineer_code || engineer.name}.xlsx`)
    } catch (e) {
      setError(e as Error)
    }
  }

  if (!gt) return q.error ? <ErrorNote error={q.error} /> : <Loading />

  const numbered = gt.rows.filter((r) => r.project.kind !== 'local_section')
  const counted = gt.rows.filter((r) => r.project.kind === 'local_section' && r.project.counts_toward_total)
  const extra = gt.rows.filter((r) => !r.project.counts_toward_total)

  const Row = ({ r, no, tone }: { r: GroupTimesheetRow; no?: number; tone: string }) => (
    <tr className={tone}>
      <td className="text-center">{no ?? ''}</td>
      <td className="max-w-[300px] truncate" title={r.project.name}>
        {r.project.name} {isNewProject(r.project, latestImport) && <Pill tone="orange">NEW</Pill>}
      </td>
      {r.hours.map((h, i) => (
        <td key={gt.dates[i]} className="num">
          {fmt(h)}
        </td>
      ))}
      <td className="num font-semibold">{r.total.toFixed(2)}</td>
    </tr>
  )
  const SumRow = ({ label, values, className }: { label: string; values: number[]; className?: string }) => (
    <tr className={cx('font-bold', className)}>
      <td />
      <td>{label}</td>
      {values.map((v, i) => (
        <td key={gt.dates[i]} className="num">
          {v.toFixed(2)}
        </td>
      ))}
      <td className="num">{values.reduce((a, b) => a + b, 0).toFixed(2)}</td>
    </tr>
  )

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card title={`Group format preview · ${engineer.name}`}>
        <ErrorNote error={error} />
        <div className="overflow-auto">
          <table className="sheet" data-testid="group-table">
            <thead>
              <tr>
                <th className="w-10">No.</th>
                <th>Group Project</th>
                {gt.dates.map((d) => (
                  <th key={d} className="num">
                    {shortLabel(d)}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {numbered.map((r, i) => (
                <Row
                  key={r.project.id}
                  r={r}
                  no={i + 1}
                  tone={r.project.kind === 'timelog' ? (r.project.system_key === 'leave' ? 'bg-band-local' : 'bg-cat-timelog') : ''}
                />
              ))}
              <SumRow label="Project subtotal" values={gt.projectSubtotal} />
              {counted.map((r) => (
                <Row key={r.project.id} r={r} tone="bg-band-local" />
              ))}
              {gt.unmapped.some((v) => v > 0) && <SumRow label="⚠ Unmapped" values={gt.unmapped} className="bg-accent-soft text-[#9a3a0e]" />}
              <SumRow label="Individual Sum" values={gt.daily} className="bg-sage" />
              {extra.map((r) => (
                <Row key={r.project.id} r={r} tone="" />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* above the table on narrower screens so the week columns get the full width */}
      <Card title="Validation" className="order-first 2xl:order-none">
        {gt.issues.length === 0 ? (
          <p className="flex items-center gap-2 rounded-control bg-sage px-3 py-2 font-semibold text-primary">
            <CircleCheck size={18} /> Every day = {engineer.daily_target_hours}h, nothing unmapped
          </p>
        ) : (
          <ul className="space-y-2" data-testid="issues">
            {gt.issues.map((i) => (
              <li key={`${i.date}-${i.type}`} className={cx('flex items-start gap-2 rounded-control px-3 py-2 text-sm', i.type === 'over' ? 'bg-sage-light' : 'bg-accent-soft')}>
                <CircleAlert size={16} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{shortLabel(i.date)}</strong> — {ISSUE_TEXT[i.type](i.hours)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="my-3 text-sm text-muted">Week total {gt.weekTotal.toFixed(1)}h</p>
        {user.can_export && (
          <Button className="w-full" onClick={() => void exportXlsx()}>
            <Download size={16} /> Export group .xlsx
          </Button>
        )}
      </Card>
    </div>
  )
}
