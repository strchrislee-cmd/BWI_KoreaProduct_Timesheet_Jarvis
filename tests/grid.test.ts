import { describe, expect, it } from 'vitest'
import {
  applyTemplate,
  applyText,
  buildChanges,
  cellText,
  effectiveSlot,
  isLunchDefault,
  parseClipboard,
  planPaste,
  toRange,
  toTsv,
  type GridContext,
} from '../src/pages/timesheets/grid/gridModel'
import type { ProjectAlias, TaskTemplate, TimeSlot, WorkType } from '../src/domain/types'
import { project, seededProjects, slot } from './helpers'

const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps' })]
const aliases: ProjectAlias[] = [{ id: 'a1', alias: '워크램프', group_project_id: 'wl', created_by: null, user_id: null }]
const D = '2026-11-16'
const wt = (id: string, name: string, sort_order: number, hidden = false): WorkType => ({ id, name, sort_order, color: null, hidden, created_at: '' })
const workTypes = [wt('w-new', '개발-신규', 1), wt('w-8d', '지원-8D', 2), wt('w-int', '회의-INT', 3), wt('w-old', '지원-옛날', 4, true)]

function ctx(saved: TimeSlot[] = []): GridContext {
  return {
    projects,
    aliases,
    byId: new Map(projects.map((p) => [p.id, p])),
    workTypes,
    workTypeById: new Map(workTypes.map((w) => [w.id, w])),
    saved: new Map(saved.map((s) => [s.slot_index, s])),
    lunch: new Set([24, 25]),
    blank: (i) => slot(D, i),
    color: () => '#000000',
  }
}

describe('clipboard TSV', () => {
  it('parses Excel/Sheets clipboard text', () => {
    expect(parseClipboard('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd']])
    expect(parseClipboard('only')).toEqual([['only']])
    expect(parseClipboard('x\t\ty')).toEqual([['x', '', 'y']])
    expect(parseClipboard('"line1\nline2"\t"say ""hi"""')).toEqual([['line1\nline2', 'say "hi"']])
    expect(parseClipboard('')).toEqual([])
  })

  it('round-trips through toTsv', () => {
    const m = [['회의', 'INT | Daily_Scrum', '2'], ['', 'tab\there', '']]
    expect(parseClipboard(toTsv(m))).toEqual(m)
  })
})

describe('cell edits', () => {
  const c = ctx()

  it('category text resolves aliases, short timelog names, non-work words and unknown labels', () => {
    expect(applyText(undefined, 15, 'category', '워크램프', c)).toMatchObject({ kind: 'work', group_project_id: 'wl', label: '워크램프' })
    expect(applyText(undefined, 15, 'category', 'Leave(휴가 및 휴무)', c)).toMatchObject({ group_project_id: 'leave' })
    expect(applyText(undefined, 15, 'category', '점심', c)).toMatchObject({ kind: 'nonwork', group_project_id: null, label: '점심' })
    expect(applyText(undefined, 15, 'category', '플루드', c)).toMatchObject({ kind: 'work', group_project_id: null, label: '플루드' })
  })

  it('clearing a category deletes an empty slot but keeps one with a task', () => {
    expect(applyText(undefined, 15, 'category', '', c)).toBeUndefined()
    expect(applyText(slot(D, 15, { group_project_id: 'wl' }), 15, 'category', '', c)).toBeNull()
    expect(applyText(slot(D, 15, { group_project_id: 'wl', description: 'x' }), 15, 'category', '', c)).toMatchObject({
      group_project_id: null,
      description: 'x',
    })
  })

  it('MID text picks a MID from the list (spacing/case-insensitive); unknown or hidden names change nothing', () => {
    expect(applyText(undefined, 15, 'mid', ' 지원 - 8d ', c)).toMatchObject({ work_type_id: 'w-8d' })
    expect(applyText(slot(D, 15, { label: '회의' }), 15, 'mid', '없는 분류', c)).toBeUndefined()
    expect(applyText(undefined, 15, 'mid', '지원-옛날', c)).toBeUndefined()
    expect(cellText(slot(D, 15, { work_type_id: 'w-old' }), 'mid', c.byId, c.workTypeById)).toBe('지원-옛날') // old slots still show it
  })

  it('clearing the MID keeps the rest, and a slot with only a MID is deleted when cleared', () => {
    expect(applyText(slot(D, 15, { label: '회의', work_type_id: 'w-int' }), 15, 'mid', '', c)).toMatchObject({ label: '회의', work_type_id: null })
    expect(applyText(slot(D, 15, { work_type_id: 'w-int' }), 15, 'mid', '', c)).toBeNull()
  })

  it('task and 업무내용 (details) edits', () => {
    expect(applyText(undefined, 15, 'task', '  메일 ', c)).toMatchObject({ description: '메일', group_project_id: null })
    expect(applyText(slot(D, 15, { description: 'x' }), 15, 'task', '', c)).toBeNull() // nothing left
    expect(applyText(slot(D, 15, { group_project_id: 'wl', description: 'x' }), 15, 'task', '', c)).toMatchObject({ description: '' })
    expect(applyText(undefined, 15, 'details', ' 고객 견적 회신 ', c)).toMatchObject({ details: '고객 견적 회신', group_project_id: null })
    expect(applyText(slot(D, 15, { group_project_id: 'wl' }), 15, 'details', '하우징 도면 검토', c)).toMatchObject({ group_project_id: 'wl', details: '하우징 도면 검토' })
    expect(applyText(slot(D, 15, { details: 'x' }), 15, 'details', '', c)).toBeNull() // nothing left
    expect(applyText(undefined, 15, 'details', '', c)).toBeUndefined()
    // a row that still has details is not deleted when its task or category is cleared
    expect(applyText(slot(D, 15, { description: 'x', details: 'memo' }), 15, 'task', '', c)).toMatchObject({ description: '', details: 'memo' })
    expect(applyText(slot(D, 15, { group_project_id: 'wl', details: 'memo' }), 15, 'category', '', c)).toMatchObject({ group_project_id: null, details: 'memo' })
    expect(cellText(slot(D, 15, { details: '메모' }), 'details', c.byId)).toBe('메모')
  })

  it('shows display names, so copied text pastes back to the same project', () => {
    const s = applyText(undefined, 15, 'category', '00.Timelog--Leave(휴가 및 휴무)', c)!
    const text = cellText(s, 'category', c.byId)
    expect(text).toBe('Leave(휴가 및 휴무)')
    expect(applyText(undefined, 16, 'category', text, c)).toMatchObject({ group_project_id: 'leave' })
  })
})

describe('lunch default', () => {
  it('lunch rows show 점심 until something else is saved', () => {
    const c = ctx([slot(D, 25, { group_project_id: 'wl', label: '워크램프' })])
    expect(effectiveSlot(c, 24)).toMatchObject({ kind: 'nonwork', label: '점심' })
    expect(isLunchDefault(c, 24)).toBe(true)
    expect(isLunchDefault(c, 25)).toBe(false)
    expect(effectiveSlot(c, 23)).toBeUndefined()
  })

  it('typing a task on a lunch row keeps 점심; clearing an override returns to the default', () => {
    const c = ctx([slot(D, 25, { group_project_id: 'wl', label: '워크램프' })])
    expect(buildChanges([{ index: 24, col: 'task', text: '도시락' }], c)).toEqual([
      { index: 24, slot: expect.objectContaining({ kind: 'nonwork', label: '점심', description: '도시락' }) },
    ])
    expect(buildChanges([{ index: 25, col: 'category', text: '' }], c)).toEqual([{ index: 25, slot: null }])
  })
})

describe('paste planning', () => {
  const rows = [15, 16, 17, 18, 46, 47]

  it('a single value fills the whole selection', () => {
    const ops = planPaste([['회의']], toRange({ r: 0, c: 0 }, { r: 2, c: 0 }), rows)
    expect(ops).toEqual([15, 16, 17].map((index) => ({ index, col: 'category', text: '회의' })))
  })

  it('a block is placed from the top-left cell and clipped to the grid', () => {
    const ops = planPaste([['a', 'b', '1', 'extra'], ['c', 'd', '2', 'extra']], toRange({ r: 1, c: 2 }, { r: 1, c: 2 }), rows)
    expect(ops).toEqual([
      { index: 16, col: 'task', text: 'a' },
      { index: 16, col: 'details', text: 'b' },
      { index: 17, col: 'task', text: 'c' },
      { index: 17, col: 'details', text: 'd' },
    ])
    // rows past the end continue with the next slots, never past 23:30
    const tail = planPaste([['x'], ['y'], ['z']], toRange({ r: 5, c: 1 }, { r: 5, c: 1 }), rows)
    expect(tail.map((o) => o.index)).toEqual([47])
  })

  const isMid = (t: string) => workTypes.some((w) => w.name === t)
  const at = (c: number) => toRange({ r: 0, c }, { r: 0, c })

  it('2 columns pasted into Category are category + sub category, as before MID', () => {
    expect(planPaste([['회의', 'INT | Daily_Scrum'], ['워크램프', '개발 | 하우징']], at(0), rows, isMid).map((o) => o.col)).toEqual(['category', 'task', 'category', 'task'])
    expect(planPaste([['회의', '회의-INT']], at(0), rows, isMid).map((o) => o.col)).toEqual(['category', 'mid'])
  })

  it('3 columns pasted into Category keep the layout from before MID: category, sub category, content', () => {
    expect(planPaste([['워크램프', 'INT | Daily_Scrum', '메모']], at(0), rows, isMid)).toEqual([
      { index: 15, col: 'category', text: '워크램프' },
      { index: 15, col: 'task', text: 'INT | Daily_Scrum' },
      { index: 15, col: 'details', text: '메모' },
    ])
  })

  it('3 columns whose second column holds MID names, and 4 columns, go in order with MID', () => {
    expect(planPaste([['워크램프', '지원-8D', '보고서'], ['워크램프', '', '보고서']], at(0), rows, isMid).map((o) => o.col)).toEqual(
      ['category', 'mid', 'task', 'category', 'mid', 'task'],
    )
    expect(planPaste([['워크램프', '개발-신규', '설계', '도면']], at(0), rows, isMid).map((o) => o.col)).toEqual(['category', 'mid', 'task', 'details'])
    // copied from this grid (columns known): back in order even with an empty MID
    expect(planPaste([['워크램프', '', '설계']], at(0), rows, isMid, true).map((o) => o.col)).toEqual(['category', 'mid', 'task'])
    // starting in another column: plain order from there
    expect(planPaste([['개발-신규', '설계', '도면']], at(1), rows, isMid).map((o) => o.col)).toEqual(['mid', 'task', 'details'])
  })

  it('combines several columns of one row into one change', () => {
    const changes = buildChanges(
      [
        { index: 15, col: 'details', text: '도면 검토' },
        { index: 15, col: 'category', text: '워크램프' },
        { index: 15, col: 'task', text: '개발 | 하우징' },
      ],
      ctx(),
    )
    expect(changes).toEqual([
      { index: 15, slot: expect.objectContaining({ group_project_id: 'wl', description: '개발 | 하우징', details: '도면 검토' }) },
    ])
  })
})

it('a repeated task with a MID sets it; one without keeps the row\'s MID', () => {
  const t: TaskTemplate = { id: 't', user_id: 'u1', kind: 'work', group_project_id: 'meeting', label: '회의', description: 'INT', work_type_id: 'w-int', sort_order: 1, color: null, created_at: '' }
  expect(applyTemplate(slot(D, 15, { work_type_id: 'w-8d' }), 15, t, ctx()).work_type_id).toBe('w-int')
  expect(applyTemplate(slot(D, 15, { work_type_id: 'w-8d' }), 15, { ...t, work_type_id: null }, ctx()).work_type_id).toBe('w-8d')
})

it('templates set category and task together', () => {
  const t: TaskTemplate = { id: 't', user_id: 'u1', kind: 'work', group_project_id: 'meeting', label: '회의', description: 'INT | Daily_Scrum', work_type_id: null, sort_order: 1, color: null, created_at: '2026-01-01T00:00:00Z' }
  expect(applyTemplate(slot(D, 15, { details: '메모', focus: 2 }), 15, t, ctx())).toMatchObject({
    group_project_id: 'meeting',
    label: '회의',
    description: 'INT | Daily_Scrum',
    details: '메모', // a template keeps what was written in 업무내용
    focus: 2,
  })
})
