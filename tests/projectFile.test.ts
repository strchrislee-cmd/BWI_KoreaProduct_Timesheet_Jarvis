import { describe, expect, it } from 'vitest'
import { buildProjectFile, parseProjectFile, planProjectImport, type ProjectFile } from '../src/domain/projectFile'
import type { GroupProject, ProjectAlias } from '../src/domain/types'
import { project } from './helpers'

function current(): GroupProject[] {
  return [
    project({ id: 'a', name: '2041--Work Lamp', sort_order: 1 }),
    project({ id: 'b', name: '2042--Beacon', sort_order: 2 }),
    project({ id: 'h', name: '2043--Old', sort_order: 3, hidden: true }),
    project({ id: 'x', name: '00.Timelog--X', kind: 'timelog', sort_order: 4 }),
    project({ id: 'm', name: '금형 Support', kind: 'local_section', system_key: 'mold_support', sort_order: 201 }),
  ]
}
const aliases: ProjectAlias[] = [{ id: 'al1', group_project_id: 'a', alias: '램프', created_by: null, user_id: null }]

describe('TimeCrumbs project list file', () => {
  it('saves every row in table order with its No, sheet name and aliases, and reads it back', () => {
    const file = buildProjectFile(current(), aliases, new Date('2026-11-23T00:00:00Z'))
    expect(file.projects.map((p) => [p.no, p.name])).toEqual([
      [1, '2041--Work Lamp'],
      [2, '2042--Beacon'],
      [null, '2043--Old'],
      [3, '00.Timelog--X'],
      [4, '금형 Support'],
    ])
    expect(file.projects[0].aliases).toEqual(['램프'])
    expect(parseProjectFile(JSON.stringify(file))).toEqual(file)
  })

  it('refuses other files with a readable message', () => {
    expect(() => parseProjectFile('not json')).toThrow('TimeCrumbs 프로젝트 목록 파일')
    expect(() => parseProjectFile('{"format":"x","projects":[]}')).toThrow('TimeCrumbs 프로젝트 목록 파일')
    expect(() => parseProjectFile('{"format":"timecrumbs-projects","version":2,"projects":[]}')).toThrow('버전')
    expect(() => parseProjectFile('{"format":"timecrumbs-projects","version":1,"projects":[{"name":"A","kind":"x"}]}')).toThrow('1번째 항목')
  })

  it('loading the same list changes nothing', () => {
    const plan = planProjectImport(current(), aliases, buildProjectFile(current(), aliases))
    expect(plan.updates).toEqual([])
    expect(plan.inserts).toEqual([])
    expect(plan.aliasInserts).toEqual([])
  })

  it('applies names, order, hidden state and aliases; adds new rows; keeps unlisted rows', () => {
    const file: ProjectFile = buildProjectFile(current(), aliases)
    const [a, b, , x, m] = file.projects
    file.projects = [
      { ...b, aliases: ['비콘'] }, // moved to No 1, new alias
      { ...a, name: '2041--Work Lamp Pro', sheet_name: '2041--Work Lamp' }, // renamed elsewhere (the export carries the sheet name)
      { ...a, no: 3, name: '2050--Brand New', aliases: ['램프', '신규'], manual: true }, // added; 램프 is taken
      { ...x, kind: 'project', name: '00.Timelog--X' }, // kind differs: skipped
      { ...m, name: '금형 Support (사내)', hidden: true }, // built-in: renamed, never hidden
    ]
    const plan = planProjectImport(current(), aliases, file)
    expect(plan.renamed).toEqual([
      { from: '2041--Work Lamp', to: '2041--Work Lamp Pro' },
      { from: '금형 Support', to: '금형 Support (사내)' },
    ])
    expect(plan.updates).toContainEqual({ id: 'b', sort_order: 1 })
    expect(plan.updates).toContainEqual({ id: 'a', sort_order: 2, name: '2041--Work Lamp Pro', sheet_name: '2041--Work Lamp' })
    expect(plan.updates.find((u) => u.id === 'm')).toEqual({ id: 'm', sort_order: 201, name: '금형 Support (사내)', sheet_name: null }) // order unchanged
    expect(plan.inserts).toEqual([
      { kind: 'project', name: '2050--Brand New', code: '2050', sheet_name: null, manual: true, hidden: false, sort_order: 3, aliases: ['신규'] },
    ])
    expect(plan.aliasInserts).toEqual([{ projectId: 'b', alias: '비콘' }])
    expect(plan.skipped).toEqual([{ name: '00.Timelog--X', reason: '대분류가 다릅니다' }])
    expect(plan.untouched).toEqual(['2043--Old', '00.Timelog--X']) // not in the file (X only under another 대분류)
    expect(plan.updates).toContainEqual({ id: 'h', sort_order: 4 }) // unlisted rows go after the listed ones
    expect(plan.hiddenNow).toEqual([])
  })

  it('matches by project code too', () => {
    const here = [project({ id: 'a', name: '2041--Work Lamp', code: '2041', sort_order: 1 })]
    const file = buildProjectFile([project({ id: 'z', name: '2041--Lamp (new name)', code: '2041', sort_order: 1 })], [])
    const plan = planProjectImport(here, [], file)
    expect(plan.inserts).toEqual([])
    expect(plan.renamed).toEqual([{ from: '2041--Work Lamp', to: '2041--Lamp (new name)' }])
  })

  it('new rows at the end keep the current order and numbers', () => {
    const file = buildProjectFile(current(), aliases)
    file.projects.splice(3, 0, { ...file.projects[0], name: '2060--Appended', aliases: [] }) // after the last RND row
    const plan = planProjectImport(current(), aliases, file)
    expect(plan.inserts.map((i) => [i.name, i.sort_order])).toEqual([['2060--Appended', 4]])
    expect(plan.updates).toEqual([])
  })

  it('finds a row renamed on either side by its sheet name', () => {
    const renamedHere = [project({ id: 'a', name: '2041--Work Lamp Pro', sheet_name: '2041--Work Lamp', sort_order: 1 })]
    const file = buildProjectFile([project({ id: 'z', name: '2041--Work Lamp', sort_order: 1 })], [])
    expect(planProjectImport(renamedHere, [], file).inserts).toEqual([])
  })
})
