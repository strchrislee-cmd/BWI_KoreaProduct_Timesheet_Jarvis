import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildWeeklyPlan } from '../src/domain/aggregate'
import type { WorkType } from '../src/domain/types'
import { DEFAULT_WORK_TYPES, findWorkType, selectableWorkTypes, workTypeNameProblem } from '../src/domain/workTypes'
import { project, seededProjects, slot } from './helpers'

const wt = (id: string, name: string, sort_order: number, hidden = false): WorkType => ({ id, name, sort_order, color: null, hidden, created_at: '' })
const list = [wt('b', '지원-8D', 2), wt('a', '개발-신규', 1), wt('h', '지원-옛날', 3, true)]

describe('MID (중분류) list', () => {
  it('the demo starting list is the same as the one migration 0011 inserts', () => {
    const sql = readFileSync('supabase/migrations/0011_work_types.sql', 'utf8')
    const seeded = [...sql.matchAll(/\('([^']+)', (\d+), '(#[0-9A-F]{6})'\)/g)].map((m) => ({ name: m[1], color: m[3] }))
    expect(seeded).toEqual(DEFAULT_WORK_TYPES)
    expect(DEFAULT_WORK_TYPES.map((w) => w.name)).toEqual([
      '개발-신규', '개발-파생', '개발-설계변경', '개발-선행검토', '검증-시험·인증', '검증-시제품',
      '지원-생산', '지원-8D', '지원-견적', '회의-INT', '회의-EXT', '일반-이메일 및 일반업무',
    ])
  })

  it('dropdowns offer the visible ones in the admin order; names match with any spacing/case', () => {
    expect(selectableWorkTypes(list).map((w) => w.id)).toEqual(['a', 'b'])
    expect(findWorkType(' 지원 - 8d', list)?.id).toBe('b')
    expect(findWorkType('지원-옛날', list)).toBeUndefined() // hidden
    expect(findWorkType('', list)).toBeUndefined()
  })

  it('names must be filled in and unique (hidden ones too)', () => {
    expect(workTypeNameProblem('  ', list)).toMatch('입력')
    expect(workTypeNameProblem('개발 - 신규', list)).toMatch('이미 있는 MID')
    expect(workTypeNameProblem('지원-옛날', list)).toMatch('숨긴 MID')
    expect(workTypeNameProblem('개발-신규', list, 'a')).toBeNull() // renaming itself
    expect(workTypeNameProblem('개발-파생', list)).toBeNull()
  })
})

describe('Weekly Result with MID', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps' })]
  const D = '2026-11-16'
  const base = { group_project_id: 'wl', label: '워크램프', description: '하우징 설계' }

  it('the Work column shows the MID; without one it stays 회의 / 기타', () => {
    const rows = buildWeeklyPlan(
      [slot(D, 18, { ...base, work_type_id: 'a' }), slot(D, 19, { group_project_id: 'meeting', label: '회의', description: 'INT' })],
      projects,
      list,
    )
    expect(rows.map((r) => [r.work, r.workTypeId])).toEqual([['개발-신규', 'a'], ['회의', null]])
  })

  it('the same task with a different MID is a new row', () => {
    const rows = buildWeeklyPlan(
      [slot(D, 18, { ...base, work_type_id: 'a' }), slot(D, 19, { ...base, work_type_id: 'a' }), slot(D, 20, { ...base, work_type_id: 'b' })],
      projects,
      list,
    )
    expect(rows.map((r) => [r.work, r.hours])).toEqual([['개발-신규', 1], ['지원-8D', 0.5]])
  })
})
