// Org chart and who may read whose time. Mirrors supabase/migrations/0013_org_access.sql
// (visible_user_ids, decide_access_request) so the demo and the screens follow the database rules.
import type { Profile, Role } from './types.js'

export const LEVEL_RANK: Record<Role, number> = { l1: 1, l2: 2, l3: 3, admin: 4 }

/** An L1 asking an L2 to see their time; approved for 1 hour, 1 day or 1 week. */
export interface AccessRequest {
  id: string
  requester_id: string
  owner_id: string
  status: 'pending' | 'approved' | 'denied'
  created_at: string
  decided_at: string | null
  expires_at: string | null
}

export const GRANT_HOURS = [
  { hours: 1, label: '1시간' },
  { hours: 24, label: '하루' },
  { hours: 168, label: '1주' },
] as const

type OrgPerson = Pick<Profile, 'id' | 'name' | 'role' | 'manager_id'>

/** Everyone below this person in the reporting line (any depth). */
export function below<P extends OrgPerson>(profiles: P[], id: string): P[] {
  const out: P[] = []
  const seen = new Set([id])
  let level = [id]
  while (level.length) {
    const next = profiles.filter((p) => p.manager_id && level.includes(p.manager_id) && !seen.has(p.id))
    for (const p of next) seen.add(p.id)
    out.push(...next)
    level = next.map((p) => p.id)
  }
  return out
}

/** Would making `managerId` this person's manager make the line loop back to them? */
export function wouldLoop(profiles: OrgPerson[], id: string, managerId: string | null): boolean {
  if (!managerId) return false
  return managerId === id || below(profiles, id).some((p) => p.id === managerId)
}

const byLevelThenName = (a: OrgPerson, b: OrgPerson) => LEVEL_RANK[b.role] - LEVEL_RANK[a.role] || a.name.localeCompare(b.name)

/** Who can be this person's manager: a higher level (highest first), and not someone below them. */
export function managerOptions<P extends OrgPerson>(profiles: P[], person: OrgPerson): P[] {
  return profiles.filter((p) => LEVEL_RANK[p.role] > LEVEL_RANK[person.role] && !wouldLoop(profiles, person.id, p.id)).sort(byLevelThenName)
}

/** The chart as indented rows: people without a manager first, each followed by the people below them. */
export function orgRows<P extends OrgPerson>(profiles: P[]): { person: P; depth: number }[] {
  const ids = new Set(profiles.map((p) => p.id))
  const out: { person: P; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (p: P, depth: number) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push({ person: p, depth })
    for (const c of profiles.filter((x) => x.manager_id === p.id).sort(byLevelThenName)) walk(c, depth + 1)
  }
  for (const root of profiles.filter((p) => !p.manager_id || !ids.has(p.manager_id)).sort(byLevelThenName)) walk(root, 0)
  for (const p of profiles) walk(p, 0) // a loop saved before the rule existed still shows everyone
  return out
}

const isActive = (r: AccessRequest, now: Date) => r.status === 'approved' && !!r.expires_at && new Date(r.expires_at) > now

/** Whose time `me` can read: yourself, everyone (admins), lower levels below you, approved requests until they end. */
export function visibleIds(me: OrgPerson, profiles: OrgPerson[], requests: AccessRequest[], now: Date): Set<string> {
  if (me.role === 'admin') return new Set([me.id, ...profiles.map((p) => p.id)])
  const ids = new Set([me.id])
  for (const p of below(profiles, me.id)) if (LEVEL_RANK[me.role] > LEVEL_RANK[p.role]) ids.add(p.id)
  for (const r of requests) if (r.requester_id === me.id && isActive(r, now)) ids.add(r.owner_id)
  return ids
}

/** Who may send correction proposals to whom (0014 → can_propose): admins to anyone, otherwise to someone of a lower level below you. */
export function canPropose(author: OrgPerson, owner: OrgPerson, profiles: OrgPerson[]): boolean {
  if (author.id === owner.id) return false
  if (author.role === 'admin') return true
  return LEVEL_RANK[author.role] > LEVEL_RANK[owner.role] && below(profiles, author.id).some((p) => p.id === owner.id)
}

/** An L1 may ask an L2. */
export const canRequest = (me: OrgPerson, owner: OrgPerson) => me.role === 'l1' && owner.role === 'l2' && me.id !== owner.id

/** Where `me` stands with an L2: nothing asked, waiting, can read until …, or the last answer was no / ran out. */
export function requestState(requests: AccessRequest[], me: string, owner: string, now: Date): { state: 'none' | 'pending' | 'approved' | 'denied' | 'expired'; until?: string } {
  const mine = requests.filter((r) => r.requester_id === me && r.owner_id === owner).sort((a, b) => b.created_at.localeCompare(a.created_at))
  if (mine.some((r) => r.status === 'pending')) return { state: 'pending' }
  const active = mine.find((r) => isActive(r, now))
  if (active) return { state: 'approved', until: active.expires_at! }
  const last = mine[0]
  if (!last) return { state: 'none' }
  return { state: last.status === 'denied' ? 'denied' : 'expired' }
}
