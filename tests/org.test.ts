import { describe, expect, it } from 'vitest'
import { below, canPropose, canRequest, managerOptions, orgRows, requestState, visibleIds, wouldLoop, type AccessRequest } from '../src/domain/org'
import type { Role } from '../src/domain/types'

const p = (id: string, role: Role, manager_id: string | null = null) => ({ id, name: id, role, manager_id })
// lead (L3) → mgr (L2) → a, b (L1); lead → mgr2 (L2) → c (L1); admin on its own
const team = [p('admin', 'admin'), p('lead', 'l3'), p('mgr', 'l2', 'lead'), p('a', 'l1', 'mgr'), p('b', 'l1', 'mgr'), p('mgr2', 'l2', 'lead'), p('c', 'l1', 'mgr2')]
const now = new Date('2026-11-27T10:00:00Z')
const req = (r: Partial<AccessRequest>): AccessRequest => ({ id: 'r', requester_id: 'a', owner_id: 'mgr2', status: 'pending', created_at: '2026-11-27T09:00:00Z', decided_at: null, expires_at: null, ...r })
const ids = (s: Set<string>) => [...s].sort()

describe('org chart', () => {
  it('who is below someone, at any depth', () => {
    expect(below(team, 'lead').map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'mgr', 'mgr2'])
    expect(below(team, 'mgr').map((x) => x.id).sort()).toEqual(['a', 'b'])
    expect(below(team, 'a')).toEqual([])
  })

  it('the line never loops; managers are a higher level and not below the person', () => {
    expect(wouldLoop(team, 'lead', 'a')).toBe(true)
    expect(wouldLoop(team, 'mgr', 'mgr')).toBe(true)
    expect(wouldLoop(team, 'a', 'mgr2')).toBe(false)
    expect(wouldLoop(team, 'a', null)).toBe(false)
    expect(managerOptions(team, p('a', 'l1', 'mgr')).map((x) => x.id).sort()).toEqual(['admin', 'lead', 'mgr', 'mgr2'])
    expect(managerOptions(team, p('mgr', 'l2', 'lead')).map((x) => x.id)).toEqual(['admin', 'lead']) // highest level first
  })

  it('rows: people without a manager first (higher level first), each followed by the people below them', () => {
    expect(orgRows(team).map((r) => `${'-'.repeat(r.depth)}${r.person.id}`)).toEqual(['admin', 'lead', '-mgr', '--a', '--b', '-mgr2', '--c'])
    // a manager who is not in the list (e.g. deleted) → shown at the top level
    expect(orgRows([p('x', 'l1', 'gone')]).map((r) => r.depth)).toEqual([0])
  })

  it('reading by level: L1 own, L2 + L1s below, L3 + L2s and L1s below, admin everyone', () => {
    expect(ids(visibleIds(p('a', 'l1', 'mgr'), team, [], now))).toEqual(['a'])
    expect(ids(visibleIds(p('mgr', 'l2', 'lead'), team, [], now))).toEqual(['a', 'b', 'mgr'])
    expect(ids(visibleIds(p('lead', 'l3'), team, [], now))).toEqual(['a', 'b', 'c', 'lead', 'mgr', 'mgr2'])
    expect(visibleIds(p('admin', 'admin'), team, [], now).size).toBe(team.length)
    // someone of the same or a higher level below you stays private
    expect(ids(visibleIds(p('mgr', 'l2'), [p('mgr', 'l2'), p('peer', 'l2', 'mgr')], [], now))).toEqual(['mgr'])
  })

  it('an L1 reads an L2 only while an approved request lasts', () => {
    const a = p('a', 'l1', 'mgr')
    expect(visibleIds(a, team, [req({})], now).has('mgr2')).toBe(false)
    expect(visibleIds(a, team, [req({ status: 'approved', expires_at: '2026-11-27T11:00:00Z' })], now).has('mgr2')).toBe(true)
    expect(visibleIds(a, team, [req({ status: 'approved', expires_at: '2026-11-27T09:59:00Z' })], now).has('mgr2')).toBe(false)
    expect(visibleIds(a, team, [req({ status: 'denied' })], now).has('mgr2')).toBe(false)
  })

  it('who may send correction proposals: admins to anyone, otherwise to lower levels below you', () => {
    expect(canPropose(p('mgr', 'l2', 'lead'), p('a', 'l1', 'mgr'), team)).toBe(true)
    expect(canPropose(p('lead', 'l3'), p('c', 'l1', 'mgr2'), team)).toBe(true)
    expect(canPropose(p('mgr', 'l2', 'lead'), p('c', 'l1', 'mgr2'), team)).toBe(false) // another team
    expect(canPropose(p('mgr', 'l2', 'lead'), p('lead', 'l3'), team)).toBe(false)
    expect(canPropose(p('a', 'l1', 'mgr'), p('b', 'l1', 'mgr'), team)).toBe(false)
    expect(canPropose(p('admin', 'admin'), p('lead', 'l3'), team)).toBe(true)
    expect(canPropose(p('admin', 'admin'), p('admin', 'admin'), team)).toBe(false)
  })

  it('who may ask whom, and where a request stands', () => {
    expect(canRequest(p('a', 'l1'), p('mgr', 'l2'))).toBe(true)
    expect(canRequest(p('a', 'l1'), p('lead', 'l3'))).toBe(false)
    expect(canRequest(p('mgr', 'l2'), p('mgr2', 'l2'))).toBe(false)
    expect(requestState([], 'a', 'mgr2', now)).toEqual({ state: 'none' })
    expect(requestState([req({})], 'a', 'mgr2', now)).toEqual({ state: 'pending' })
    expect(requestState([req({ status: 'approved', expires_at: '2026-11-28T10:00:00Z' })], 'a', 'mgr2', now)).toEqual({ state: 'approved', until: '2026-11-28T10:00:00Z' })
    expect(requestState([req({ status: 'approved', expires_at: '2026-11-27T09:30:00Z' })], 'a', 'mgr2', now)).toEqual({ state: 'expired' })
    expect(requestState([req({ status: 'denied' })], 'a', 'mgr2', now)).toEqual({ state: 'denied' })
  })
})
