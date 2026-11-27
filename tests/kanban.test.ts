import { describe, expect, it } from 'vitest'
import { planKanbanSync, taskKey, nextSortOrder, type KanbanCard } from '../src/domain/kanban'
import type { TimeSlot } from '../src/domain/types'

const slot = (i: number, p: Partial<TimeSlot>): TimeSlot =>
  ({ user_id: 'u', work_date: '2026-11-26', slot_index: i, kind: 'work', group_project_id: null, label: '', description: '', details: '', focus: null, work_type_id: null, ...p }) as TimeSlot
const card = (id: string, status: KanbanCard['status'], p: Partial<KanbanCard>): KanbanCard => ({
  id,
  user_id: 'u',
  group_project_id: null,
  label: '',
  work_type_id: null,
  description: '',
  status,
  sort_order: 1,
  created_at: '',
  updated_at: '',
  done_at: null,
  ...p,
})

describe('Daily Kanban from the Daily Log', () => {
  it('one card per Project · Type · Task (unmapped text counts, mapped projects ignore the typed text)', () => {
    expect(taskKey({ group_project_id: 'p1', label: '아무 별칭', work_type_id: 't', description: ' 도면 ' })).toBe(taskKey({ group_project_id: 'p1', label: '', work_type_id: 't', description: '도면' }))
    expect(taskKey({ group_project_id: null, label: '품질', work_type_id: null, description: 'A' })).not.toBe(taskKey({ group_project_id: null, label: '설계', work_type_id: null, description: 'A' }))
    expect(taskKey({ group_project_id: 'p1', label: '', work_type_id: 't1', description: 'A' })).not.toBe(taskKey({ group_project_id: 'p1', label: '', work_type_id: 't2', description: 'A' }))
  })

  it('the latest half hour that has started is Doing; the Doing before it goes to Wait', () => {
    const cards = [card('old', 'doing', { label: '회의', description: '주간 회의' }), card('b', 'todo', { label: '설계', description: '도면 검토' })]
    const day = [slot(18, { label: '회의', description: '주간 회의' }), slot(19, { label: '설계', description: '도면 검토' }), slot(30, { label: '품질', description: '나중 일' })]
    const plan = planKanbanSync(cards, day, 20) // now = 10:00, 15:00 has not started
    expect(plan.moves).toEqual([
      { id: 'b', to: 'doing' },
      { id: 'old', to: 'wait' },
    ])
    // a new task seen in the log gets a card in Wait (it is not the one being done now)
    expect(plan.create).toEqual([{ task: { group_project_id: null, label: '품질', work_type_id: null, description: '나중 일' }, status: 'wait' }])
  })

  it('a new task logged now gets its card straight in Doing', () => {
    const plan = planKanbanSync([card('old', 'doing', { description: 'A' })], [slot(20, { label: '품질', description: 'B' })], 20)
    expect(plan.create).toEqual([{ task: { group_project_id: null, label: '품질', work_type_id: null, description: 'B' }, status: 'doing' }])
    expect(plan.moves).toEqual([{ id: 'old', to: 'wait' }])
  })

  it('nothing moves when the task now is already Doing; a finished task logged again comes back to Doing', () => {
    expect(planKanbanSync([card('a', 'doing', { description: 'A' }), card('x', 'doing', { description: 'X' })], [slot(20, { description: 'A' })], 21).moves).toEqual([])
    expect(planKanbanSync([card('a', 'done', { description: 'A' })], [slot(20, { description: 'A' })], 21).moves).toEqual([{ id: 'a', to: 'doing' }])
  })

  it('another day only adds cards; lunch, breaks and empty rows are not tasks', () => {
    const plan = planKanbanSync([card('old', 'doing', { description: 'A' })], [slot(20, { description: 'B' }), slot(24, { kind: 'nonwork', label: '점심' }), slot(25, {})], null)
    expect(plan.moves).toEqual([])
    expect(plan.create.map((c) => [c.task.description, c.status])).toEqual([['B', 'wait']])
  })

  it('new cards go to the end of their column', () => {
    expect(nextSortOrder([card('a', 'wait', { sort_order: 4 }), card('b', 'doing', { sort_order: 9 })], 'wait')).toBe(5)
    expect(nextSortOrder([], 'backlog')).toBe(1)
  })
})
