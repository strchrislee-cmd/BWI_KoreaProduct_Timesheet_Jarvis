import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from '../../components/ui'
import { changedFields, runTime, type ChangedField, type ProposalItem, type TaskFields } from '../../domain/aiCleanup'
import { EMPTY_TASK_LABEL } from '../../domain/quickTasks'
import type { GroupProject, WorkType } from '../../domain/types'
import { displayName } from './projectUi'

/** How Project / Type / Task read on screen (a project's display name, ⚠ unmapped text, the Type's name). */
export interface FieldNames {
  project: (f: TaskFields) => string
  type: (f: TaskFields) => string
}
export function fieldNames(byId: Map<string, GroupProject>, typeById: Map<string, WorkType>): FieldNames {
  return {
    project: (f) => {
      const p = f.group_project_id ? byId.get(f.group_project_id) : undefined
      return p ? displayName(p) : f.label ? `⚠ ${f.label}` : '—'
    },
    type: (f) => (f.work_type_id ? (typeById.get(f.work_type_id)?.name ?? '—') : '—'),
  }
}

const LABEL: Record<ChangedField, string> = { project: 'Project', type: 'Type', task: 'Task' }

/** one field: unchanged → the value; changed → before (struck out, red) → after (green) */
function Field({ name, before, after, changed }: { name: ChangedField; before: string; after: string; changed: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2 text-sm" data-field={name} data-changed={changed || undefined}>
      <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted">{LABEL[name]}</span>
      {changed ? (
        <span className="flex min-w-0 flex-wrap items-baseline gap-1.5">
          <del className="rounded-[4px] bg-red-100 px-1 text-red-800 decoration-red-500/70 [overflow-wrap:anywhere]" data-side="before">
            {before}
          </del>
          <ArrowRight size={12} className="shrink-0 self-center text-muted" aria-hidden />
          <ins className="rounded-[4px] bg-emerald-100 px-1 font-semibold text-emerald-900 no-underline [overflow-wrap:anywhere]" data-side="after">
            {after}
          </ins>
        </span>
      ) : (
        <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{before}</span>
      )}
    </div>
  )
}

/**
 * Proposed changes as a diff, one card per run of half hours: time, then Project / Type / Task with what
 * changes struck out and the new value next to it, and the reason. With `checked`, each card has a
 * checkbox to choose what to apply.
 */
export function ProposalDiff({
  items,
  names,
  checked,
  onToggle,
  applied,
}: {
  items: ProposalItem[]
  names: FieldNames
  checked?: boolean[]
  onToggle?: (i: number) => void
  /** an answered proposal: which items were applied */
  applied?: number[] | null
}) {
  return (
    <ol className="space-y-2" aria-label="Proposed changes">
      {items.map((item, i) => {
        const changed = changedFields(item.before, item.after)
        const task = (f: TaskFields) => f.description || EMPTY_TASK_LABEL
        const box: ReactNode = checked && onToggle && (
          <input type="checkbox" className="mt-0.5" checked={checked[i]} onChange={() => onToggle(i)} aria-label={`Apply ${runTime(item.slots)}`} />
        )
        return (
          <li
            key={i}
            data-testid="diff-item"
            data-changed={changed.join(',')}
            className={cx('flex gap-3 rounded-control border border-black/5 bg-white/85 p-3 shadow-sm', checked && !checked[i] && 'opacity-55')}
          >
            {box}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-semibold text-primary">{runTime(item.slots)}</span>
                {applied && <span className={cx('rounded-chip px-1.5 text-[11px] font-semibold', applied.includes(i) ? 'bg-emerald-100 text-emerald-900' : 'bg-black/5 text-muted')}>{applied.includes(i) ? '적용함' : '적용 안 함'}</span>}
              </div>
              <Field name="project" before={names.project(item.before)} after={names.project(item.after)} changed={changed.includes('project')} />
              <Field name="type" before={names.type(item.before)} after={names.type(item.after)} changed={changed.includes('type')} />
              <Field name="task" before={task(item.before)} after={task(item.after)} changed={changed.includes('task')} />
              {item.reason && <p className="pl-16 text-xs text-muted">💡 {item.reason}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
