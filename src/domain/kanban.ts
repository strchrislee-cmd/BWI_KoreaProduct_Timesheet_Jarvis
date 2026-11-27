// Daily Kanban: one card per task (Project · Type · Task) on a personal board. The Daily Log moves
// cards: the task logged in the latest half hour that has started today is Doing, the card that was
// Doing before it goes to Wait, and tasks seen in the log for the first time get a card (in Wait).
// People move cards between the columns themselves too. Pure helpers, tested in tests/kanban.test.ts.
import type { TimeSlot } from './types'

export const KANBAN_STATUSES = ['backlog', 'todo', 'wait', 'doing', 'donecheck', 'done'] as const
export type KanbanStatus = (typeof KANBAN_STATUSES)[number]
export const KANBAN_LABEL: Record<KanbanStatus, string> = {
  backlog: 'Backlog',
  todo: 'ToDo',
  wait: 'Wait',
  doing: 'Doing',
  donecheck: 'DoneCheck',
  done: 'Done',
}
export const isKanbanStatus = (v: unknown): v is KanbanStatus => typeof v === 'string' && (KANBAN_STATUSES as readonly string[]).includes(v)

export interface KanbanCard {
  id: string
  user_id: string
  group_project_id: string | null
  /** project text as typed when it is not mapped to a group project */
  label: string
  work_type_id: string | null
  /** the Task */
  description: string
  status: KanbanStatus
  sort_order: number
  created_at: string
  updated_at: string
  done_at: string | null
}

export type KanbanTask = Pick<KanbanCard, 'group_project_id' | 'label' | 'work_type_id' | 'description'>
/** manual = moved on the board, log = moved by the Daily Log */
export type MoveReason = 'manual' | 'log'

/** Same task = same project (or the same unmapped text), Type and Task — the database's unique key. */
export const taskKey = (t: KanbanTask) =>
  [t.group_project_id ?? '', t.group_project_id ? '' : t.label.trim(), t.work_type_id ?? '', t.description.trim()].join('|')

/** A work slot that names a task (lunch, breaks and empty rows do not). */
export const isTaskSlot = (s: TimeSlot) => s.kind === 'work' && (!!s.group_project_id || !!s.label.trim() || !!s.description.trim())

export const slotTask = (s: TimeSlot): KanbanTask => ({
  group_project_id: s.group_project_id,
  label: s.group_project_id ? '' : s.label.trim(),
  work_type_id: s.work_type_id ?? null,
  description: s.description.trim(),
})

export interface KanbanPlan {
  /** new cards for tasks the board has not seen yet */
  create: { task: KanbanTask; status: KanbanStatus }[]
  /** existing cards that change column */
  moves: { id: string; to: KanbanStatus }[]
}

/**
 * What the Daily Log of one day does to the board.
 * `nowSlot`: the current half hour when the day is today, else null (a past or future day only adds
 * cards for new tasks; it does not change what is Doing).
 */
export function planKanbanSync(cards: KanbanCard[], daySlots: TimeSlot[], nowSlot: number | null): KanbanPlan {
  const byKey = new Map(cards.map((c) => [taskKey(c), c]))
  const tasks = daySlots.filter(isTaskSlot).sort((a, b) => a.slot_index - b.slot_index)
  // the task being done now: the latest logged half hour that has started
  const started = nowSlot === null ? [] : tasks.filter((s) => s.slot_index <= nowSlot)
  const current = started.length ? taskKey(slotTask(started[started.length - 1])) : null

  const plan: KanbanPlan = { create: [], moves: [] }
  const seen = new Set<string>()
  for (const s of tasks) {
    const task = slotTask(s)
    const key = taskKey(task)
    if (seen.has(key) || byKey.has(key)) continue
    seen.add(key)
    plan.create.push({ task, status: key === current ? 'doing' : 'wait' })
  }
  if (current) {
    const card = byKey.get(current)
    const becomesDoing = card ? card.status !== 'doing' : true
    if (card && becomesDoing) plan.moves.push({ id: card.id, to: 'doing' })
    // only when Doing changes: whatever was Doing before waits now
    if (becomesDoing) for (const c of cards) if (c.status === 'doing' && taskKey(c) !== current) plan.moves.push({ id: c.id, to: 'wait' })
  }
  return plan
}

/**
 * Columns of a board that can hold several people's cards: in each column the people come in `people`
 * order (the board's owner first), each person's cards by their place. `show` filters (e.g. by colour).
 */
export function boardColumns(cards: KanbanCard[], people: string[], show: (c: KanbanCard) => boolean = () => true): Map<KanbanStatus, KanbanCard[]> {
  const rank = new Map(people.map((id, i) => [id, i]))
  const m = new Map<KanbanStatus, KanbanCard[]>(KANBAN_STATUSES.map((s) => [s, []]))
  const sorted = cards
    .filter(show)
    .sort((a, b) => (rank.get(a.user_id) ?? 1e9) - (rank.get(b.user_id) ?? 1e9) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  for (const c of sorted) m.get(c.status)!.push(c)
  return m
}

/** Next sort position at the end of a column. */
export const nextSortOrder = (cards: KanbanCard[], status: KanbanStatus) => Math.max(0, ...cards.filter((c) => c.status === status).map((c) => c.sort_order)) + 1
