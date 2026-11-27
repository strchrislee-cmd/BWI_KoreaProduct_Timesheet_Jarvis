import { describe, expect, it } from 'vitest'
import { boardColumns, dayBoard, planKanbanSync, replayDay, taskKey, teamBlocks, nextSortOrder, type KanbanCard, type KanbanMove } from '../src/domain/kanban'
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

  it('replaying a day: Doing follows the Daily Log half hour by half hour; moves by hand count when made', () => {
    const day = new Date('2026-11-27T00:00:00')
    const at = (hhmm: string) => new Date(day.getTime() + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))) * 60_000).toISOString()
    const move = (card_id: string, from: KanbanCard['status'] | null, to: KanbanCard['status'], reason: 'log' | 'manual', time: string): KanbanMove => ({ id: 1, card_id, user_id: 'u', from_status: from, to_status: to, reason, moved_at: at(time) })
    const cards = [
      card('old', 'wait', { label: '회의', description: '지난주 회의' }),
      card('B', 'doing', { label: '설계', description: '도면' }),
      card('C', 'done', { label: '품질', description: '8D' }),
      card('D', 'backlog', { description: '다음 할 일' }),
      card('Y', 'doing', { description: '어제 하던 일' }),
      card('N', 'backlog', { description: '오늘 만든 할 일' }),
    ]
    const moves = [move('B', 'wait', 'doing', 'log', '09:05'), move('C', 'wait', 'done', 'manual', '15:10'), move('N', null, 'backlog', 'manual', '10:05')]
    const daySlots = [
      slot(18, { label: '설계', description: '도면' }),
      slot(19, { label: '설계', description: '도면' }),
      slot(20, { label: '품질', description: '8D' }),
      slot(24, { kind: 'nonwork', label: '점심' }),
      slot(26, { label: '설계', description: '도면' }),
      slot(28, { label: '지원', description: '지운 카드' }),
    ]
    const r = replayDay(cards, moves, daySlots, day, 'u')
    const statusAt = (i: number, id: string) => r.at[i].find((x) => x.card.id === id)?.status
    expect([statusAt(17, 'B'), statusAt(18, 'B'), statusAt(18, 'C')]).toEqual(['wait', 'doing', 'wait']) // the day starts before B's first move
    expect(statusAt(0, 'Y')).toBe('wait') // left Doing from yesterday: the day starts with nothing in Doing
    expect(r.at[18].find((x) => x.card.id === 'B')?.moved).toBe(true)
    expect(r.at[19].find((x) => x.card.id === 'B')?.moved).toBe(false)
    expect([statusAt(20, 'C'), statusAt(20, 'B'), statusAt(24, 'C')]).toEqual(['doing', 'wait', 'doing']) // lunch keeps Doing
    expect([statusAt(26, 'B'), statusAt(26, 'C')]).toEqual(['doing', 'wait'])
    expect(statusAt(30, 'C')).toBe('done') // moved to Done by hand at 15:10
    const gone = r.at[28].find((x) => x.card.id.startsWith('day:'))
    expect([gone?.card.description, gone?.status]).toEqual(['지운 카드', 'doing']) // its card was deleted, the day still shows it
    expect([...r.since]).toEqual([['B', 18], ['C', 20], ['N', 20], [gone!.card.id, 28]])
    // the day's board: the Doing card and what changed in that half hour; never another day's card
    const ids = (xs: { card: { id: string } }[]) => xs.map((x) => x.card.id)
    expect(ids(dayBoard(r, 18, false))).toEqual(['B'])
    expect(ids(dayBoard(r, 20, false))).toEqual(['B', 'C', 'N']) // Doing switched to C (B waits), N made by hand
    expect(ids(dayBoard(r, 21, false))).toEqual(['C'])
    expect(ids(dayBoard(r, 21, true))).toEqual(['B', 'C', 'N']) // 지난 카드도 보기: the day's cards so far
    expect(ids(dayBoard(r, 21, false, 20))).toEqual(['B', 'C', 'N']) // live board: changes since the last logged half hour
    expect(ids(dayBoard(r, 30, false))).toEqual(['C', gone!.card.id]) // C moved to Done by hand at 15:10
    expect(ids(dayBoard(r, 47, true))).toEqual(['B', 'C', 'N', gone!.card.id]) // not last week's, nor yesterday's, nor an old Backlog card
    expect(dayBoard(undefined, 20, true)).toEqual([])
  })

  it('team board: my cards everywhere, teammates only while Doing, one block per task with everyone Doing it', () => {
    const mine = { ...card('m1', 'doing', { label: '회의', description: '주간 회의' }), user_id: 'me' }
    const myWait = { ...card('m2', 'wait', { description: '도면' }), user_id: 'me' }
    const dhSame = { ...card('d1', 'doing', { label: '회의', description: '주간 회의' }), user_id: 'dh' }
    const jiaOther = { ...card('j1', 'doing', { description: '시험 지원' }), user_id: 'jia' }
    const kangSame = { ...card('k1', 'doing', { description: '시험 지원' }), user_id: 'kang' }
    const jiaWait = { ...card('j2', 'wait', { description: '데이터' }), user_id: 'jia' }
    const blocks = teamBlocks([mine, myWait, dhSame, jiaOther, kangSame, jiaWait], 'me', ['me', 'jia', 'dh', 'kang'])
    expect(blocks.map((b) => [b.id, b.status, b.people.join('+')])).toEqual([
      ['m1', 'doing', 'me+dh'],
      ['m2', 'wait', 'me'],
      ['j1', 'doing', 'jia+kang'],
    ])
    // filtered out by colour: not shown, nor counted on a shared block
    expect(teamBlocks([mine, dhSame], 'me', ['me']).map((b) => b.people.join('+'))).toEqual(['me'])
    expect(teamBlocks([mine, dhSame], 'me', ['dh']).map((b) => [b.id, b.people.join('+')])).toEqual([['d1', 'dh']])
  })

  it('new cards go to the end of their column', () => {
    expect(nextSortOrder([card('a', 'wait', { sort_order: 4 }), card('b', 'doing', { sort_order: 9 })], 'wait')).toBe(5)
    expect(nextSortOrder([], 'backlog')).toBe(1)
  })
})
