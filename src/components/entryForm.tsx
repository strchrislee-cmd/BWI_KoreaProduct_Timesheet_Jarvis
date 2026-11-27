import { useMemo } from 'react'
import { useStore, useUser } from '../data/StoreContext'
import { isSelectable, projectNumbers, sortProjects } from '../domain/projects'
import { timeToSlot } from '../domain/time'
import type { TimeSlot, WorkType } from '../domain/types'
import { selectableWorkTypes } from '../domain/workTypes'
import { useAsync } from '../lib/hooks'
import { NONWORK_CHOICES } from '../pages/timesheets/grid/DailyGrid'
import type { GridContext } from '../pages/timesheets/grid/gridModel'
import { KIND_LABEL, displayName } from '../pages/timesheets/projectUi'

/**
 * What the small "log this half hour" forms need (the 30-minute reminder, the Daily Kanban log popup):
 * the day's data, the Project choices, and the grid context to turn typed text into a Daily Log row
 * exactly as the Daily Log does (buildChanges).
 */
export function useEntryForm(date: string) {
  const { store } = useStore()
  const user = useUser()
  const data = useAsync(
    () =>
      Promise.all([store.listProjects(), store.listAliases(), store.listSlots(user.id, date, date), store.getWorkDay(user.id, date), store.listWorkTypes()]),
    [store, user.id, date],
  )
  const lunch = useMemo(() => {
    const s = new Set<number>()
    for (let i = timeToSlot(user.lunch_start); i < timeToSlot(user.lunch_end); i++) s.add(i)
    return s
  }, [user.lunch_start, user.lunch_end])

  const ctxFor = (saved: TimeSlot[]): GridContext | null => {
    if (!data.data) return null
    const [projects, aliases, , , workTypes] = data.data
    return {
      projects,
      aliases: aliases.filter((a) => !a.user_id || a.user_id === user.id),
      byId: new Map(projects.map((p) => [p.id, p])),
      workTypes,
      workTypeById: new Map(workTypes.map((w) => [w.id, w])),
      saved: new Map(saved.map((s) => [s.slot_index, s])),
      lunch,
      blank: (index) => ({ user_id: user.id, work_date: date, slot_index: index, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null, work_type_id: null }),
      color: () => '', // not shown here
    }
  }

  const groups = useMemo(() => {
    if (!data.data) return []
    const projects = data.data[0]
    const numbers = projectNumbers(projects)
    const selectable = sortProjects(projects.filter(isSelectable))
    return (['project', 'timelog', 'local_section'] as const)
      .map((kind) => ({ label: KIND_LABEL[kind], items: selectable.filter((p) => p.kind === kind).map((p) => ({ text: displayName(p), no: numbers.get(p.id) })) }))
      .filter((g) => g.items.length)
  }, [data.data])

  return { data, lunch, ctxFor, groups }
}

/** Project choice as in the Daily Log (grouped, with No), plus the non-work rows */
export function ProjectSelect({ groups, value, onChange }: { groups: ReturnType<typeof useEntryForm>['groups']; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Project" className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">프로젝트 (Project)</option>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.items.map((o) => (
            <option key={o.text} value={o.text}>
              {o.no ? `${o.no}. ` : ''}
              {o.text}
            </option>
          ))}
        </optgroup>
      ))}
      <optgroup label="비업무">
        {NONWORK_CHOICES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </optgroup>
    </select>
  )
}

export function TypeSelect({ workTypes, value, onChange }: { workTypes: WorkType[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Type" className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">유형 (Type)</option>
      {selectableWorkTypes(workTypes).map((w) => (
        <option key={w.id} value={w.name}>
          {w.name}
        </option>
      ))}
    </select>
  )
}
