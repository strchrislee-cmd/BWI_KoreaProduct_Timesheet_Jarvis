import type { GroupProject, MasterImport, MasterRow, ProjectAlias, ProjectKind } from './types.js'

const KIND_ORDER: Record<ProjectKind, number> = { project: 0, timelog: 1, local_section: 2 }

/** "1341--Commercial Work Lamps" → "1341", "1453A--…" → "1453A", "1252 - …" → "1252", "OMEGA Redesign" → null */
export function parseProjectCode(name: string): string | null {
  const m = name.trim().match(/^(\d{3,5}[A-Za-z]?)\s*(?:--|-|–|—)\s*\S/)
  return m ? m[1].toUpperCase() : null
}

/** Display name without the "00.Timelog--" prefix ("00.Timelog--Leave(…)" → "Leave(…)"). */
export function shortProjectName(p: Pick<GroupProject, 'name' | 'kind'>): string {
  return p.kind === 'timelog' ? p.name.replace(/^00\.?\s*Timelog\s*-+\s*/i, '') : p.name
}

export function classifyKind(name: string): 'project' | 'timelog' {
  return /^00\.?\s*timelog/i.test(name.trim()) ? 'timelog' : 'project'
}

/**
 * Matching key for project names. MUST stay identical to SQL public.project_name_key()
 * (supabase/migrations/0001_init.sql) — both are checked against the same samples in tests.
 */
export function projectNameKey(name: string): string {
  return name
    .normalize('NFKC')
    .replace(/[–—]/g, '-')
    .replace(/\s*(-+)\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Name and code of a project added by hand: tidy spaces, "00.Timelog--" prefix for timelog rows. */
export function manualProjectRow(name: string, kind: ProjectKind): { name: string; code: string | null } {
  let clean = name.replace(/\s+/g, ' ').trim()
  if (kind === 'timelog' && clean && classifyKind(clean) !== 'timelog') clean = `00.Timelog--${clean}`
  return { name: clean, code: kind === 'project' ? parseProjectCode(clean) : null }
}

export function toMasterRow(name: string): MasterRow {
  const clean = name.replace(/\s+/g, ' ').trim()
  return { name: clean, code: parseProjectCode(clean), kind: classifyKind(clean) }
}

export interface MasterDiff {
  matched: { project: GroupProject; row: MasterRow; order: number }[]
  added: { row: MasterRow; order: number }[]
  missing: GroupProject[]
}

/**
 * sheet_name after renaming a project to `next`: a master-sheet row remembers the name the sheet
 * uses, so importing the original sheet again still finds it; forgotten once the names match
 * again. Same rules as the SQL trigger remember_sheet_name() (0008).
 */
export function sheetNameAfterRename(p: Pick<GroupProject, 'kind' | 'manual' | 'name' | 'sheet_name'>, next: string): string | null {
  const sheet = p.sheet_name ?? (p.kind !== 'local_section' && !p.manual && projectNameKey(next) !== projectNameKey(p.name) ? p.name : null)
  return sheet && projectNameKey(sheet) === projectNameKey(next) ? null : sheet
}

/** Same matching rules as SQL public.apply_master_import(): code first, then name key, then sheet name. */
export function diffMaster(existing: GroupProject[], rows: MasterRow[]): MasterDiff {
  const pool = existing.filter((p) => p.kind !== 'local_section')
  const seen = new Set<string>()
  const diff: MasterDiff = { matched: [], added: [], missing: [] }

  rows.forEach((row, i) => {
    const order = i + 1
    const free = (p: GroupProject) => !seen.has(p.id)
    let match: GroupProject | undefined
    if (row.code) match = pool.find((p) => free(p) && p.code?.toUpperCase() === row.code!.toUpperCase())
    if (!match) {
      const key = projectNameKey(row.name)
      match = pool.find((p) => free(p) && projectNameKey(p.name) === key)
      // renamed in the app: still found by the sheet's name
      if (!match) match = pool.find((p) => free(p) && !!p.sheet_name && projectNameKey(p.sheet_name) === key)
    }
    if (match) {
      seen.add(match.id)
      diff.matched.push({ project: match, row, order })
    } else {
      diff.added.push({ row, order })
    }
  })
  // projects added by hand are not expected in the master sheet, so they are never "missing"
  diff.missing = pool.filter((p) => !seen.has(p.id) && p.status !== 'missing' && !p.manual)
  return diff
}

/**
 * Give a project another No (admins, Projects → Project mapping): it moves to that place and the
 * rows in between shift by one. It stays inside its 대분류, so a number outside the group's range
 * is clamped to the group's first / last No (hidden rows keep their place). Returns the changed
 * sort orders of that 대분류, the No it ends up with, and whether the number was clamped.
 */
export function moveProjectTo(
  projects: GroupProject[],
  id: string,
  target: number,
): { updates: { id: string; sort_order: number }[]; no: number; clamped: boolean } | null {
  const p = projects.find((x) => x.id === id)
  if (!p || p.hidden || !Number.isFinite(target)) return null
  const numbers = projectNumbers(projects)
  const group = sortProjects(projects.filter((x) => x.kind === p.kind))
  const visible = group.filter((x) => !x.hidden)
  const first = numbers.get(visible[0].id)!
  const no = Math.min(first + visible.length - 1, Math.max(first, Math.round(target)))
  const clamped = no !== Math.round(target)
  if (no === numbers.get(id)) return { updates: [], no, clamped }
  const rest = group.filter((x) => x.id !== id)
  const restVisible = visible.filter((x) => x.id !== id)
  const anchor = restVisible[no - first] // the row now at that No moves down one
  rest.splice(anchor ? rest.indexOf(anchor) : rest.indexOf(restVisible[restVisible.length - 1]) + 1, 0, p)
  const before = new Map(group.map((x) => [x.id, x.sort_order]))
  const updates = rest.map((x, i) => ({ id: x.id, sort_order: i + 1 })).filter((u) => before.get(u.id) !== u.sort_order)
  return { updates, no, clamped }
}

/**
 * Throws when a new alias would clash: a team alias (owner null) with another team alias, a
 * personal alias with the owner's own aliases or with a team alias (which already applies to them).
 */
export function aliasConflict(aliases: ProjectAlias[], text: string, owner: string | null): void {
  const key = projectNameKey(text)
  const same = aliases.filter((a) => projectNameKey(a.alias) === key)
  if (same.some((a) => !a.user_id)) throw new Error(`“${text}”은(는) 이미 팀 별칭입니다.`)
  if (owner && same.some((a) => a.user_id === owner)) throw new Error(`“${text}”은(는) 이미 내 별칭에 있습니다.`)
}

/** Offered in dropdowns and pickers: listed in the master sheet (or added by hand) and not hidden. */
export function isSelectable(p: GroupProject): boolean {
  return p.status === 'active' && !p.hidden
}

/** A project is NEW when the latest (non-baseline) import introduced it. */
export function isNewProject(p: GroupProject, latest: MasterImport | null): boolean {
  return !!latest && !latest.is_baseline && p.first_seen_import_id === latest.id
}

export function sortProjects(projects: GroupProject[]): GroupProject[] {
  return [...projects].sort(
    (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.sort_order - b.sort_order || a.name.localeCompare(b.name),
  )
}

/**
 * "No" of every listed project (Projects → Project mapping, Daily Log dropdown): one running
 * number in table order (대분류, then sort order); hidden projects get none.
 */
export function projectNumbers(projects: GroupProject[]): Map<string, number> {
  return new Map(sortProjects(projects.filter((p) => !p.hidden)).map((p, i) => [p.id, i + 1]))
}
