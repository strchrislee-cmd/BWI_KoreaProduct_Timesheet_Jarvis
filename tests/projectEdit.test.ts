import { describe, expect, it } from 'vitest'
import { diffMaster, moveProjectTo, projectNumbers, sheetNameAfterRename, sortProjects } from '../src/domain/projects'
import type { GroupProject } from '../src/domain/types'
import { project } from './helpers'

// RND a b c d (one hidden between b and c), CO-WORK x y, Section s
function list(): GroupProject[] {
  return [
    project({ id: 'a', name: 'A', sort_order: 1 }),
    project({ id: 'b', name: 'B', sort_order: 2 }),
    project({ id: 'h', name: 'H', sort_order: 3, hidden: true }),
    project({ id: 'c', name: 'C', sort_order: 4 }),
    project({ id: 'd', name: 'D', sort_order: 5 }),
    project({ id: 'x', name: '00.Timelog--X', kind: 'timelog', sort_order: 6 }),
    project({ id: 'y', name: '00.Timelog--Y', kind: 'timelog', sort_order: 7 }),
    project({ id: 's', name: 'S', kind: 'local_section', sort_order: 201 }),
  ]
}
const apply = (ps: GroupProject[], r: ReturnType<typeof moveProjectTo>) =>
  ps.map((p) => ({ ...p, sort_order: r!.updates.find((u) => u.id === p.id)?.sort_order ?? p.sort_order }))
const order = (ps: GroupProject[]) => sortProjects(ps).map((p) => p.id).join('')

describe('No (Projects → Project mapping)', () => {
  it('numbers every listed project straight through, hidden ones get none', () => {
    expect([...projectNumbers(list())]).toEqual([['a', 1], ['b', 2], ['c', 3], ['d', 4], ['x', 5], ['y', 6], ['s', 7]])
  })

  it('moving to a No shifts the rows in between', () => {
    const r = moveProjectTo(list(), 'd', 1)!
    expect(r).toMatchObject({ no: 1, clamped: false })
    const next = apply(list(), r)
    expect(order(next)).toBe('dabhcxys')
    expect([...projectNumbers(next)].slice(0, 4)).toEqual([['d', 1], ['a', 2], ['b', 3], ['c', 4]])
    expect(order(apply(list(), moveProjectTo(list(), 'a', 3)))).toBe('bhcadxys')
  })

  it('stays inside its 대분류 (clamped) and leaves other groups alone', () => {
    const r = moveProjectTo(list(), 'a', 6)! // 6 is in CO-WORK
    expect(r).toMatchObject({ no: 4, clamped: true })
    expect(r.updates.every((u) => 'abhcd'.includes(u.id))).toBe(true)
    expect(moveProjectTo(list(), 'x', 1)).toMatchObject({ no: 5, clamped: true })
    expect(moveProjectTo(list(), 'h', 1)).toBeNull() // hidden rows have no No
  })

  it('changing to its own number changes nothing', () => {
    expect(moveProjectTo(list(), 'b', 2)!.updates).toEqual([])
  })
})

describe('sheet name memory', () => {
  const master = project({ name: '2041--Utility Lamp' })
  it('a master-sheet row remembers the sheet name on rename and forgets it when they match again', () => {
    expect(sheetNameAfterRename(master, '2041--Work Lamp')).toBe('2041--Utility Lamp')
    expect(sheetNameAfterRename({ ...master, name: '2041--Work Lamp', sheet_name: '2041--Utility Lamp' }, '2041--Work Lamp 2')).toBe('2041--Utility Lamp')
    expect(sheetNameAfterRename({ ...master, name: '2041--Work Lamp', sheet_name: '2041--Utility Lamp' }, '2041 -- utility lamp')).toBeNull()
    expect(sheetNameAfterRename(master, '2041 -- utility  lamp')).toBeNull() // same matching key: not a rename
  })
  it('Sections and hand-added rows never get one', () => {
    expect(sheetNameAfterRename(project({ name: 'S', kind: 'local_section' }), 'S2')).toBeNull()
    expect(sheetNameAfterRename(project({ name: 'M', manual: true }), 'M2')).toBeNull()
  })
  it('importing the original sheet finds a renamed row by its sheet name', () => {
    const renamed = project({ name: '00.Timelog--Training (교육)', kind: 'timelog', sheet_name: '00.Timelog--Training & Self Development' })
    const d = diffMaster([renamed], [{ name: '00.Timelog--Training & Self Development', code: null, kind: 'timelog' }])
    expect(d.matched.map((m) => m.project.id)).toEqual([renamed.id])
    expect(d.added).toEqual([])
  })
})
