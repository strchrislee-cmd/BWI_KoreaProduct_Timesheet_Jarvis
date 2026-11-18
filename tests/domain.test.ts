import { describe, expect, it } from 'vitest'
import nameKeys from './fixtures/name-keys.json'
import { addDays, isoWeek, mondayOf, slotToTime, timeToSlot, weekDates } from '../src/domain/time'
import {
  classifyKind,
  diffMaster,
  isNewProject,
  parseProjectCode,
  projectNameKey,
  sortProjects,
} from '../src/domain/projects'
import { resolveLabel } from '../src/domain/labels'
import { buildGroupTimesheet, buildWeeklyPlan } from '../src/domain/aggregate'
import type { MasterImport, ProjectAlias } from '../src/domain/types'
import { project, seededProjects, slot } from './helpers'

describe('time', () => {
  it('converts slots and times', () => {
    expect(slotToTime(0)).toBe('00:00')
    expect(slotToTime(15)).toBe('07:30')
    expect(slotToTime(47)).toBe('23:30')
    expect(timeToSlot('07:28')).toBe(14)
    expect(timeToSlot('16:30')).toBe(33)
  })

  it('computes ISO weeks and week ranges', () => {
    // 2026-11-02..06 is week 45 in the reference weekly sheet
    expect(isoWeek('2026-11-02').week).toBe(45)
    expect(isoWeek('2026-11-06').week).toBe(45)
    expect(isoWeek('2026-11-16').week).toBe(47)
    expect(isoWeek('2027-01-01')).toEqual({ year: 2026, week: 53 })
    expect(mondayOf('2026-11-22')).toBe('2026-11-16')
    expect(weekDates('2026-11-18')).toHaveLength(7)
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('project names', () => {
  it('parses codes and kinds', () => {
    expect(parseProjectCode('2041--Utility Work Lamps')).toBe('2041')
    expect(parseProjectCode('2053A--Trail Kit')).toBe('2053A')
    expect(parseProjectCode('2052 - Model 80')).toBe('2052')
    expect(parseProjectCode('LED Bar Redesign')).toBeNull()
    expect(parseProjectCode('00.Timelog--Leave')).toBeNull()
    expect(classifyKind('00.Timelog--Leave(휴가 및 휴무)')).toBe('timelog')
    expect(classifyKind('2041--Utility Work Lamps')).toBe('project')
  })

  it.each(nameKeys as [string, string][])('name key %s', (input, expected) => {
    expect(projectNameKey(input)).toBe(expected)
  })
})

describe('diffMaster', () => {
  const existing = [
    project({ id: 'a', name: '2041--Utility Work Lamps', code: '2041' }),
    project({ id: 'b', name: 'LED Bar Redesign' }),
    project({ id: 'c', name: '2001--Old Program', code: '2001' }),
    project({ id: 'g', name: '일반업무', kind: 'local_section', system_key: 'general' }),
  ]

  it('matches by code, then by name, and reports added/missing', () => {
    const diff = diffMaster(existing, [
      { name: '2041--Utility Work Lamp Series', code: '2041', kind: 'project' }, // renamed, same code
      { name: 'led  bar redesign', code: null, kind: 'project' },
      { name: '2071--Marine Flood Light', code: '2071', kind: 'project' },
    ])
    expect(diff.matched.map((m) => m.project.id)).toEqual(['a', 'b'])
    expect(diff.added.map((a) => a.row.name)).toEqual(['2071--Marine Flood Light'])
    expect(diff.missing.map((p) => p.id)).toEqual(['c']) // local sections are never "missing"
  })

  it('flags NEW only for non-baseline imports', () => {
    const p = project({ name: 'X', first_seen_import_id: 'imp2' })
    const imp = (id: string, is_baseline: boolean) => ({ id, is_baseline }) as MasterImport
    expect(isNewProject(p, imp('imp2', false))).toBe(true)
    expect(isNewProject(p, imp('imp2', true))).toBe(false)
    expect(isNewProject(p, imp('imp3', false))).toBe(false)
  })

  it('sorts projects → timelog → local sections', () => {
    const sorted = sortProjects([...seededProjects(), project({ name: 'Z project', sort_order: 999 })])
    expect(sorted[0].name).toBe('Z project')
    expect(sorted.at(-1)!.system_key).toBe('biz_trip')
  })
})

describe('resolveLabel', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps', code: '2041' })]
  const aliases: ProjectAlias[] = [
    { id: '1', alias: '워크램프', group_project_id: 'wl', created_by: null },
    { id: '2', alias: '일반', group_project_id: 'general', created_by: null },
  ]

  it('resolves non-work, alias, name/code and unmapped labels', () => {
    expect(resolveLabel('', aliases, projects)).toBeNull()
    expect(resolveLabel('점심', aliases, projects)).toEqual({ kind: 'nonwork', group_project_id: null })
    expect(resolveLabel('퇴근 후', aliases, projects)).toEqual({ kind: 'nonwork', group_project_id: null })
    expect(resolveLabel(' 워크램프 ', aliases, projects)).toEqual({ kind: 'work', group_project_id: 'wl' })
    expect(resolveLabel('2041', aliases, projects)).toEqual({ kind: 'work', group_project_id: 'wl' })
    expect(resolveLabel('플루드', aliases, projects)).toEqual({ kind: 'work', group_project_id: null })
  })
})

describe('weekly plan', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps' })]

  it('merges consecutive identical slots and splits on change/gap', () => {
    const d = '2026-11-02'
    const rows = buildWeeklyPlan(
      [
        slot(d, 15, { group_project_id: 'general', label: '일반', description: '이메일 및 일반업무' }),
        slot(d, 16, { group_project_id: 'general', label: '일반', description: '이메일 및 일반업무' }),
        slot(d, 17, { group_project_id: 'meeting', label: '회의', description: 'INT | Daily_Scrum' }),
        slot(d, 18, { group_project_id: 'wl', label: '워크램프', description: '개발 | 하우징' }),
        slot(d, 19, { group_project_id: 'wl', label: '워크램프', description: '개발 | 하우징' }),
        slot(d, 24, { kind: 'nonwork', label: '점심' }),
        slot(d, 26, { group_project_id: 'wl', label: '워크램프', description: '개발 | 하우징' }), // gap → new row
        slot(d, 27, { label: '플루드', description: '견적' }), // unmapped
      ],
      projects,
    )
    expect(rows.map((r) => [r.localProject, r.work, r.item, r.hours])).toEqual([
      ['일반업무', '기타', '이메일 및 일반업무', 1],
      ['일반업무', '회의', 'INT | Daily_Scrum', 0.5],
      ['워크램프', '기타', '개발 | 하우징', 1],
      ['워크램프', '기타', '개발 | 하우징', 0.5],
      ['플루드', '기타', '견적', 0.5],
    ])
    expect(rows[0].week).toBe(45)
    expect(rows[4].groupProjectId).toBeNull()
  })
})

describe('group timesheet', () => {
  const projects = [
    ...seededProjects(),
    project({ id: 'wl', name: '2041--Utility Work Lamps', sort_order: 1 }),
    project({ id: 'old', name: 'Old', status: 'missing' }),
  ]
  const dates = weekDates('2026-11-16') // Mon..Sun

  it('sums slots, adds leave on weekdays, and validates each day', () => {
    const slots = [
      ...Array.from({ length: 16 }, (_, i) => slot('2026-11-16', 15 + i, { group_project_id: 'wl' })), // 8h
      ...Array.from({ length: 10 }, (_, i) => slot('2026-11-17', 15 + i, { group_project_id: 'general' })), // 5h
      slot('2026-11-17', 30, { label: '플루드' }), // 0.5h unmapped
      slot('2026-11-17', 24, { kind: 'nonwork', label: '점심' }),
    ]
    const leaves = [
      { id: 'l1', user_id: 'u1', leave_type: 'annual' as const, start_date: '2026-11-18', end_date: '2026-11-22', hours_per_day: 8, note: '' },
      { id: 'l2', user_id: 'u1', leave_type: 'biz_trip' as const, start_date: '2026-11-19', end_date: '2026-11-19', hours_per_day: 8, note: '' },
    ]
    const gt = buildGroupTimesheet({ slots, leaves, projects, dates, targetHours: 8 })

    const row = (id: string) => gt.rows.find((r) => r.project.id === id)!
    expect(row('wl').hours.slice(0, 2)).toEqual([8, 0])
    expect(row('leave').hours).toEqual([0, 0, 8, 8, 8, 0, 0]) // weekend excluded
    expect(row('biz_trip').total).toBe(8)
    expect(gt.rows.some((r) => r.project.id === 'old')).toBe(false) // missing & unused → hidden
    expect(gt.unmapped[1]).toBe(0.5)
    expect(gt.daily.slice(0, 5)).toEqual([8, 5.5, 8, 8, 8]) // biz trip does not count toward the day
    expect(gt.projectSubtotal[0]).toBe(8)
    expect(gt.issues).toEqual([
      { date: '2026-11-17', type: 'unmapped', hours: 0.5 },
      { date: '2026-11-17', type: 'under', hours: 5.5 },
    ])
  })
})
