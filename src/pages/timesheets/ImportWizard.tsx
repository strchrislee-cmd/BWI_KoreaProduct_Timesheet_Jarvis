import { useState } from 'react'
import { Button, ErrorNote, Field, Modal, Pill } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import type { ParsedDay } from '../../excel/dailyLog'
import { resolveLabel } from '../../domain/labels'
import { isSelectable } from '../../domain/projects'
import type { TimeSlot } from '../../domain/types'
import { loadExcel } from '../../lib/files'
import { displayName } from './projectUi'
import { useTimesheets } from './TimesheetsLayout'

type Day = ParsedDay & { include: boolean; dateValue: string }

/**
 * Import a personal 30-min log (.xlsx exported from Google Sheets/Excel):
 * upload → detect days → assign engineer → map unknown categories → write slots.
 */
export function ImportWizard({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { store } = useStore()
  const user = useUser()
  const { profiles, projects, aliases, date } = useTimesheets()
  const [days, setDays] = useState<Day[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [engineerId, setEngineerId] = useState(user.id)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function onFile(file: File) {
    setError(null)
    try {
      const x = await loadExcel()
      const wb = await x.loadWorkbook(await file.arrayBuffer())
      const parsed = x.parseDailyLogWorkbook(wb, Number(date.slice(0, 4)))
      if (!parsed.length) throw new Error('No sheet with a "시간" header and entries was found.')
      setDays(parsed.map((d) => ({ ...d, include: true, dateValue: d.date ?? '' })))
      setFileName(file.name)
    } catch (e) {
      setError(e as Error)
    }
  }

  const selected = days?.filter((d) => d.include) ?? []
  const counts = new Map<string, number>()
  for (const d of selected) for (const e of d.entries) if (e.label) counts.set(e.label, (counts.get(e.label) ?? 0) + 1)
  const labels = [...counts.entries()].map(([label, count]) => ({ label, count, resolved: resolveLabel(label, aliases, projects) }))
  const projectName = (id: string) => {
    const p = projects.find((x) => x.id === id)
    return p ? displayName(p) : id
  }

  async function run() {
    setBusy(true)
    setError(null)
    try {
      const missingDate = selected.find((d) => !d.dateValue)
      if (missingDate) throw new Error(`Pick a date for sheet "${missingDate.sheetName}".`)
      for (const [label, projectId] of Object.entries(mapping)) if (projectId) await store.addAlias(projectId, label)
      const allAliases = await store.listAliases()

      let total = 0
      for (const d of selected) {
        const bySlot = new Map<number, TimeSlot>()
        for (const e of d.entries) {
          const r = resolveLabel(e.label, allAliases, projects) ?? { kind: 'work' as const, group_project_id: null }
          bySlot.set(e.slot_index, {
            user_id: engineerId,
            work_date: d.dateValue,
            slot_index: e.slot_index,
            kind: r.kind,
            group_project_id: r.group_project_id,
            label: e.label,
            description: e.description,
            focus: e.focus,
          })
        }
        await store.replaceDay(engineerId, d.dateValue, [...bySlot.values()])
        total += bySlot.size
      }
      setDone(`Imported ${total} slots on ${selected.length} day(s) from ${fileName}.`)
    } catch (e) {
      setError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Import & convert spreadsheet" onClose={done ? onDone : onClose} wide>
      <ErrorNote error={error} />
      {done ? (
        <div className="space-y-4">
          <p className="rounded-control bg-sage px-4 py-3 font-semibold text-primary">{done}</p>
          <Button onClick={onDone}>Close</Button>
        </div>
      ) : !days ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Upload your 30-min log (.xlsx). Google Sheets: File → Download → Microsoft Excel. Each sheet with a “시간” header is read as one day.
          </p>
          <input type="file" accept=".xlsx" aria-label="Daily log file" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-bold">1 · Days found in {fileName}</h3>
              <table className="sheet">
                <thead>
                  <tr>
                    <th />
                    <th>Sheet</th>
                    <th>Date</th>
                    <th className="num">Slots</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d, i) => (
                    <tr key={d.sheetName}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Include ${d.sheetName}`}
                          checked={d.include}
                          onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)))}
                        />
                      </td>
                      <td>{d.sheetName}</td>
                      <td>
                        <input
                          type="date"
                          aria-label={`Date for ${d.sheetName}`}
                          className="cell-input"
                          value={d.dateValue}
                          onChange={(e) => setDays(days.map((x, j) => (j === i ? { ...x, dateValue: e.target.value } : x)))}
                        />
                      </td>
                      <td className="num">{d.entries.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted">Existing entries on the selected days are replaced.</p>
            </div>
            <div>
              <h3 className="mb-2 font-bold">2 · Assign to engineer</h3>
              <Field label="Engineer">
                <select className="field" aria-label="Assign engineer" value={engineerId} disabled={user.role !== 'admin'} onChange={(e) => setEngineerId(e.target.value)}>
                  {(user.role === 'admin' ? profiles : [user]).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.engineer_code && `(${p.engineer_code})`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <h3 className="mb-2 font-bold">3 · Local category → group project</h3>
            <table className="sheet">
              <thead>
                <tr>
                  <th>Local category</th>
                  <th className="num">Slots</th>
                  <th>Group project</th>
                </tr>
              </thead>
              <tbody>
                {labels.map(({ label, count, resolved }) => (
                  <tr key={label}>
                    <td>
                      <Pill tone={resolved?.kind === 'nonwork' ? 'grey' : resolved?.group_project_id ? 'blue' : 'orange'}>{label}</Pill>
                    </td>
                    <td className="num">{count}</td>
                    <td>
                      {resolved?.kind === 'nonwork' ? (
                        <span className="text-muted">Non-work (not counted)</span>
                      ) : resolved?.group_project_id ? (
                        projectName(resolved.group_project_id)
                      ) : (
                        <select
                          aria-label={`Map ${label}`}
                          className="field !py-1 text-sm"
                          value={mapping[label] ?? ''}
                          onChange={(e) => setMapping({ ...mapping, [label]: e.target.value })}
                        >
                          <option value="">⚠ Leave unmapped</option>
                          {projects
                            .filter(isSelectable)
                            .map((p) => (
                              <option key={p.id} value={p.id}>
                                {displayName(p)}
                              </option>
                            ))}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">A mapping you pick is saved as a team alias, so next import resolves it automatically.</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDays(null)}>
              Back
            </Button>
            <Button onClick={() => void run()} disabled={busy || selected.length === 0}>
              {busy ? 'Importing…' : 'Generate timesheet & weekly plan'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
