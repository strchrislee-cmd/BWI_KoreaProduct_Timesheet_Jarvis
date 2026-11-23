import { describe, expect, it } from 'vitest'
import { resolveLabel } from '../src/domain/labels'
import { aliasConflict } from '../src/domain/projects'
import { normalizeRole, roleLabel } from '../src/domain/roles'
import type { ProjectAlias } from '../src/domain/types'
import { project, seededProjects } from './helpers'

describe('user levels', () => {
  it('old roles map like migration 0009: member → L1, viewer → L2', () => {
    expect(['member', 'viewer', 'l3', 'admin', 'x'].map(normalizeRole)).toEqual(['l1', 'l2', 'l3', 'admin', 'l1'])
    expect(roleLabel('l2')).toBe('L2')
  })
})

describe('personal aliases', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Work Lamp' }), project({ id: 'bc', name: '2042--Beacon' })]
  const team: ProjectAlias = { id: 't', alias: '램프', group_project_id: 'wl', created_by: 'admin', user_id: null }
  const mine: ProjectAlias = { id: 'm', alias: '비콘이', group_project_id: 'bc', created_by: 'u1', user_id: 'u1' }

  it('a personal alias maps your own labels', () => {
    expect(resolveLabel('비콘이', [team, mine], projects)?.group_project_id).toBe('bc')
    expect(resolveLabel('비콘이', [team], projects)?.group_project_id).toBeNull() // not someone else's
  })

  it('your own alias wins over a team alias with the same text', () => {
    const override: ProjectAlias = { ...mine, id: 'o', alias: '램프' }
    expect(resolveLabel('램프', [team, override], projects)?.group_project_id).toBe('bc')
  })

  it('refuses clashes: team vs team, personal vs team, personal vs your own', () => {
    expect(() => aliasConflict([team], ' 램프', null)).toThrow('팀 별칭')
    expect(() => aliasConflict([team], '램프', 'u1')).toThrow('팀 별칭')
    expect(() => aliasConflict([mine], '비콘이', 'u1')).toThrow('내 별칭')
    expect(() => aliasConflict([mine], '비콘이', 'u2')).not.toThrow() // another user's alias is theirs
  })
})
