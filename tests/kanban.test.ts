import { describe, expect, it } from 'vitest'
import { boardColumns, planKanbanSync, taskKey, nextSortOrder, type KanbanCard } from '../src/domain/kanban'
import { personColor, personColorKey } from '../src/pages/timesheets/colors'
import { readPrefs } from '../src/data/preferences'
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

  it('a board with teammates: the owner first, then the people in check order, each by place; filters apply', () => {
    const mine = { ...card('m2', 'wait', { sort_order: 2 }), user_id: 'me' }
    const mine1 = { ...card('m1', 'wait', { sort_order: 1 }), user_id: 'me' }
    const jia = { ...card('j1', 'wait', { sort_order: 1 }), user_id: 'jia' }
    const dh = { ...card('d1', 'wait', { sort_order: 1 }), user_id: 'dh' }
    const done = { ...card('d2', 'done', { sort_order: 1 }), user_id: 'dh' }
    const cols = boardColumns([jia, mine, dh, mine1, done], ['me', 'dh', 'jia'])
    expect(cols.get('wait')!.map((c) => c.id)).toEqual(['m1', 'm2', 'd1', 'j1'])
    expect(cols.get('done')!.map((c) => c.id)).toEqual(['d2'])
    expect(boardColumns([jia, mine, dh], ['me', 'dh', 'jia'], (c) => c.user_id === 'jia').get('wait')!.map((c) => c.id)).toEqual(['j1'])
  })

  it('a person keeps the colour you gave them; otherwise a named colour from their id (never gray)', () => {
    const prefs = readPrefs({ categoryColors: { [personColorKey('jia')]: '#123456' } })
    expect(personColor('jia', prefs)).toBe('#123456')
    expect(personColor('dh', prefs)).toBe(personColor('dh', readPrefs({})))
    expect(personColor('dh', prefs)).not.toBe('#787774')
    // by Org Chart place: neighbours get different colours, gray is never a default
    const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    expect(new Set(order.map((id) => personColor(id, prefs, order))).size).toBe(8)
    expect(order.map((id) => personColor(id, prefs, order))).not.toContain('#787774')
    expect(readPrefs({ kanbanTeam: ['a', 'a', 1, 'b'] }).kanbanTeam).toEqual(['a', 'b'])
    expect(readPrefs({}).kanbanTeam).toEqual([])
  })

  it('new cards go to the end of their column', () => {
    expect(nextSortOrder([card('a', 'wait', { sort_order: 4 }), card('b', 'doing', { sort_order: 9 })], 'wait')).toBe(5)
    expect(nextSortOrder([], 'backlog')).toBe(1)
  })
})
