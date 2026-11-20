import type { GroupProject, MasterImport, MasterRow, ProjectKind } from './types.js'

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

/** Same matching rules as SQL public.apply_master_import(): code first, then name key. */
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
