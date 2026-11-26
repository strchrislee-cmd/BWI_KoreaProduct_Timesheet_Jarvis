import { BellRing, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore, useUser } from '../data/StoreContext'
import { isSelectable, projectNumbers, sortProjects } from '../domain/projects'
import { continuePlan } from '../domain/reminders'
import { selectableWorkTypes } from '../domain/workTypes'
import { slotToTime, timeToSlot } from '../domain/time'
import type { TimeSlot } from '../domain/types'
import { useAsync } from '../lib/hooks'
import { NONWORK_CHOICES } from '../pages/timesheets/grid/DailyGrid'
import { buildChanges, cellText, type GridContext } from '../pages/timesheets/grid/gridModel'
import { KIND_LABEL, displayName } from '../pages/timesheets/projectUi'
import { Button, ErrorNote } from './ui'

/** Fired after the toast saves slots, so an open Daily Log reloads. detail: { date } */
export const SLOTS_CHANGED = 'teamembedded:slots'
/** Settings → 알림 → 입력 창 띄워 보기: open the toast now for the half hour that just ended */
export const SHOW_REMINDER_TOAST = 'teamembedded:reminder-toast'

/**
 * The 30-minute reminder inside the app (bottom right, on any page): log the half hour that just
 * ended with the same three fields as a Daily Log row, or continue the previous task into every
 * empty half hour since it (continuePlan). Browser notifications cannot hold an input, so this is
 * where the typing happens; the notification only brings the tab forward.
 */
export function ReminderToast({ date, slot, onClose }: { date: string; slot: number; onClose: () => void }) {
  const { store } = useStore()
  const user = useUser()
  const data = useAsync(
    () =>
      Promise.all([store.listProjects(), store.listAliases(), store.listSlots(user.id, date, date), store.getWorkDay(user.id, date), store.listWorkTypes()]),
    [store, user.id, date],
  )
  const [category, setCategory] = useState('')
  const [mid, setMid] = useState('')
  const [task, setTask] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  const lunch = useMemo(() => {
    const s = new Set<number>()
    for (let i = timeToSlot(user.lunch_start); i < timeToSlot(user.lunch_end); i++) s.add(i)
    return s
  }, [user.lunch_start, user.lunch_end])
  const start = data.data?.[3]?.start_time ?? user.work_start

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

  const plan = data.data ? continuePlan(slot, data.data[2], { start, lunch }) : null
  const groups = useMemo(() => {
    if (!data.data) return []
    const projects = data.data[0]
    const numbers = projectNumbers(projects)
    const selectable = sortProjects(projects.filter(isSelectable))
    return (['project', 'timelog', 'local_section'] as const)
      .map((kind) => ({ label: KIND_LABEL[kind], items: selectable.filter((p) => p.kind === kind).map((p) => ({ text: displayName(p), no: numbers.get(p.id) })) }))
      .filter((g) => g.items.length)
  }, [data.data])

  /** save with the day's slots as they are now (the grid may have changed since the toast opened) */
  async function run(build: (saved: TimeSlot[], ctx: GridContext) => TimeSlot[]) {
    setBusy(true)
    try {
      const saved = await store.listSlots(user.id, date, date)
      const ctx = ctxFor(saved)
      if (!ctx) return
      const slots = build(saved, ctx)
      if (slots.length) await store.saveSlots(slots)
      window.dispatchEvent(new CustomEvent(SLOTS_CHANGED, { detail: { date } }))
      onClose()
    } catch (e) {
      setError(e as Error)
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run((_, ctx) =>
      buildChanges(
        [
          { index: slot, col: 'category', text: category },
          { index: slot, col: 'mid', text: mid },
          { index: slot, col: 'task', text: task },
          { index: slot, col: 'details', text: details },
        ],
        ctx,
      ).flatMap((c) => (c.slot ? [c.slot] : [])),
    )

  const continuePrevious = () =>
    run((saved) => {
      const p = continuePlan(slot, saved, { start, lunch })
      return p ? p.targets.map((i) => ({ ...p.from, slot_index: i })) : []
    })

  const planLabel = (() => {
    if (!plan || !data.data) return ''
    const ctx = ctxFor(data.data[2])
    const what = [
      ctx ? cellText(plan.from, 'category', ctx.byId) : plan.from.label,
      ctx ? cellText(plan.from, 'mid', ctx.byId, ctx.workTypeById) : '',
      plan.from.description,
    ]
      .filter(Boolean)
      .join(' · ')
    const until = plan.targets[plan.targets.length - 1] + 1
    return `${what} → ${slotToTime(plan.targets[0])}–${slotToTime(until)}${plan.targets.length > 1 ? ` (${plan.targets.length}칸)` : ''}`
  })()

  // portal: inside a glass card (backdrop-filter) `fixed` would be relative to the card, not the screen
  return createPortal(
    <div
      role="dialog"
      aria-label="30-min reminder"
      className="glass-strong fixed inset-x-3 bottom-24 z-50 rounded-card p-4 shadow-xl md:inset-x-auto md:bottom-5 md:right-5 md:w-[380px]"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="mb-3 flex items-start gap-2">
        <BellRing size={18} className="mt-0.5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-muted">TeamEmbedded · 30분 기록</div>
          <div className="break-keep font-display text-base font-bold">
            <span className="font-mono">{slotToTime(slot)}</span>–<span className="font-mono">{slotToTime(slot + 1)}</span> 업무를 기록해 주세요
          </div>
        </div>
        <button aria-label="Close reminder" className="rounded-control p-1 text-muted hover:bg-black/5" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <ErrorNote error={error ?? data.error} />
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <select aria-label="Project" className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
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
        <select aria-label="Type" className="field" value={mid} onChange={(e) => setMid(e.target.value)}>
          <option value="">유형 (Type)</option>
          {selectableWorkTypes(data.data?.[4] ?? []).map((w) => (
            <option key={w.id} value={w.name}>
              {w.name}
            </option>
          ))}
        </select>
        <input aria-label="Task" className="field" placeholder="업무 (Task)" value={task} onChange={(e) => setTask(e.target.value)} />
        <input aria-label="Content" className="field" placeholder="업무내용 (Content)" value={details} onChange={(e) => setDetails(e.target.value)} />
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1" disabled={busy || !data.data || !(category || mid || task.trim() || details.trim())}>
            저장
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            나중에
          </Button>
        </div>
      </form>
      <div className="mt-2 border-t border-dashed border-black/10 pt-2">
        <Button type="button" variant="outline" className="w-full" disabled={busy || !plan} onClick={() => void continuePrevious()}>
          이전 업무 계속
        </Button>
        <p className="mt-1 truncate text-xs text-muted" data-testid="continue-preview" title={planLabel}>
          {plan ? planLabel : '오늘 앞에 기록한 업무가 없습니다'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
