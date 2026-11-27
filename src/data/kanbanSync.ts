// Applies what the Daily Log of a day means for the Daily Kanban (see domain/kanban.ts → planKanbanSync).
// Runs one at a time, so quick successive saves (a paste over many rows) never create a card twice.
// A failure here never breaks the Daily Log: it is reported to the console and the board catches up
// the next time it syncs (e.g. before migration 0012 has been run on the database).
import { nextSortOrder, planKanbanSync, type KanbanCard } from '../domain/kanban'
import type { TimeSlot } from '../domain/types'
import type { DataStore } from './store'

let queue: Promise<unknown> = Promise.resolve()

/** Bring the board in line with one day of the log; resolves to true when something changed. */
export function syncKanban(store: DataStore, userId: string, daySlots: TimeSlot[], nowSlot: number | null): Promise<boolean> {
  const run = queue.then(async () => {
    const cards = await store.listKanban(userId)
    const plan = planKanbanSync(cards, daySlots, nowSlot)
    if (!plan.create.length && !plan.moves.length) return false
    let pool: KanbanCard[] = cards
    for (const m of plan.moves) {
      const card = pool.find((c) => c.id === m.id)
      if (!card) continue
      const sortOrder = nextSortOrder(pool, m.to)
      await store.moveKanbanCard(card, m.to, sortOrder, 'log')
      pool = pool.map((c) => (c.id === card.id ? { ...c, status: m.to, sort_order: sortOrder } : c))
    }
    for (const n of plan.create) {
      const sortOrder = nextSortOrder(pool, n.status)
      const id = await store.addKanbanCard({ ...n.task, user_id: userId, status: n.status, sort_order: sortOrder }, 'log')
      pool = [...pool, { ...n.task, id, user_id: userId, status: n.status, sort_order: sortOrder, created_at: '', updated_at: '', done_at: null }]
    }
    return true
  })
  queue = run.catch((e) => console.warn('Daily Kanban sync failed', e))
  return run
}
