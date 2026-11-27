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

/** one recorded column change (kanban_moves) */
export interface KanbanMove {
  id: number
  card_id: string
  user_id: string
  from_status: KanbanStatus | null
  to_status: KanbanStatus
  reason: MoveReason
  moved_at: string
}

/** a card as it stood at the end of a half hour; `moved` = it changed column in that half hour */
export interface ReplayCard {
  card: KanbanCard
  status: KanbanStatus
  moved: boolean
}
export interface DayReplay {
  /** the board at the end of each half hour 0..47 of the day */
  at: ReplayCard[][]
  /** the cards that belong to the day: logged in its Daily Log or moved by hand during it */
  touched: Set<string>
}

const HALF_HOUR = 30 * 60_000

/**
 * One person's board through a day, half hour by half hour, following the Daily Log (the task logged
 * in a half hour is Doing then, the one Doing before it waits), so a day logged later still replays at
 * the right times. Moves made by hand (DoneCheck, Done, …) count in the half hour they were made.
 * The day starts from each card's column before its first move since `dayStart`, with nothing in Doing:
 * a card left Doing from an earlier day waits until it is logged or moved again that day.
 */
export function replayDay(cards: KanbanCard[], moves: KanbanMove[], daySlots: TimeSlot[], dayStart: Date, userId: string): DayReplay {
  const start = dayStart.getTime()
  const end = start + 48 * HALF_HOUR
  const sorted = [...moves].sort((a, b) => a.moved_at.localeCompare(b.moved_at))
  const state = new Map<string, { card: KanbanCard; status: KanbanStatus | null }>()
  for (const c of cards) {
    const first = sorted.find((m) => m.card_id === c.id && Date.parse(m.moved_at) >= start)
    const start0 = first ? first.from_status : c.status
    state.set(c.id, { card: c, status: start0 === 'doing' ? 'wait' : start0 })
  }
  const byKey = new Map(cards.map((c) => [taskKey(c), c.id]))
  const manual = new Map<number, KanbanMove[]>()
  for (const m of sorted) {
    const t = Date.parse(m.moved_at)
    if (m.reason !== 'manual' || t < start || t >= end) continue
    const i = Math.floor((t - start) / HALF_HOUR)
    manual.set(i, [...(manual.get(i) ?? []), m])
  }
  const logged = new Map(daySlots.filter(isTaskSlot).map((s) => [s.slot_index, s]))
  const touched = new Set<string>()
  const at: ReplayCard[][] = []
  let before = new Map([...state].map(([id, v]) => [id, v.status]))
  for (let i = 0; i < 48; i++) {
    const s = logged.get(i)
    if (s) {
      const task = slotTask(s)
      const key = taskKey(task)
      let id = byKey.get(key)
      if (!id) {
        // a task whose card was deleted since: it is still part of that day
        id = `day:${key}`
        byKey.set(key, id)
        state.set(id, { card: { ...task, id, user_id: userId, status: 'wait', sort_order: 1e6 + i, created_at: '', updated_at: '', done_at: null }, status: null })
      }
      for (const v of state.values()) if (v.status === 'doing') v.status = 'wait'
      state.get(id)!.status = 'doing'
      touched.add(id)
    }
    for (const m of manual.get(i) ?? []) {
      const v = state.get(m.card_id)
      if (!v) continue
      v.status = m.to_status
      touched.add(m.card_id)
    }
    const snap: ReplayCard[] = []
    for (const [id, v] of state) if (v.status) snap.push({ card: v.card, status: v.status, moved: before.get(id) !== v.status })
    at.push(snap)
    before = new Map([...state].map(([id, v]) => [id, v.status]))
  }
  return { at, touched }
}

/** The Daily Kanban of a day shows that day's cards and the to-do piles (Backlog, ToDo), not every card ever. */
export const onDayBoard = (c: { id: string; status: KanbanStatus }, touched: Set<string> | undefined) =>
  c.status === 'backlog' || c.status === 'todo' || !!touched?.has(c.id)

/**
 * Columns of a board that can hold several people's cards: in each column the people come in `people`
 * order (the board's owner first), each person's cards by their place. `show` filters (e.g. by colour).
 */
export function boardColumns<C extends KanbanCard>(cards: C[], people: string[], show: (c: C) => boolean = () => true): Map<KanbanStatus, C[]> {
  const rank = new Map(people.map((id, i) => [id, i]))
  const m = new Map<KanbanStatus, C[]>(KANBAN_STATUSES.map((s) => [s, []]))
  const sorted = cards
    .filter(show)
    .sort((a, b) => (rank.get(a.user_id) ?? 1e9) - (rank.get(b.user_id) ?? 1e9) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  for (const c of sorted) m.get(c.status)!.push(c)
  return m
}

/** a block on the board: one of the owner's cards, or a task teammates are Doing */
export interface BoardBlock extends KanbanCard {
  /** the people this block stands for (the owner, and/or the teammates Doing the same task), in `people` order */
  people: string[]
  /** the cards merged into it */
  cardIds: string[]
}

/**
 * The board with teammates: the owner's cards in every column; teammates' cards only while Doing, and
 * one block per task — several people Doing the same task (same Project · Type · Task) share a block.
 * People not in `people` (e.g. filtered out by colour) are left out.
 */
export function teamBlocks(cards: KanbanCard[], owner: string, people: string[]): BoardBlock[] {
  const rank = new Map(people.map((id, i) => [id, i]))
  const out: BoardBlock[] = []
  const doing = new Map<string, BoardBlock>()
  if (rank.has(owner))
    for (const c of cards.filter((x) => x.user_id === owner)) {
      const b: BoardBlock = { ...c, people: [owner], cardIds: [c.id] }
      out.push(b)
      if (c.status === 'doing') doing.set(taskKey(c), b)
    }
  const theirs = cards.filter((x) => x.user_id !== owner && x.status === 'doing' && rank.has(x.user_id)).sort((a, b) => rank.get(a.user_id)! - rank.get(b.user_id)!)
  for (const c of theirs) {
    const b = doing.get(taskKey(c))
    if (b) {
      b.people.push(c.user_id)
      b.cardIds.push(c.id)
      continue
    }
    const nb: BoardBlock = { ...c, people: [c.user_id], cardIds: [c.id] }
    out.push(nb)
    doing.set(taskKey(c), nb)
  }
  return out
}

/** Next sort position at the end of a column. */
export const nextSortOrder = (cards: KanbanCard[], status: KanbanStatus) => Math.max(0, ...cards.filter((c) => c.status === status).map((c) => c.sort_order)) + 1
