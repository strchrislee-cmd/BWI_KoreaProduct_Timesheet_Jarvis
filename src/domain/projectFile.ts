// TimeCrumbs project list file (.json): Projects → Project mapping → 목록 저장 / 목록 불러오기.
// Keeps everything the table shows (대분류, No order, names, sheet names, local aliases, hidden),
// so a list edited in one place can be loaded in another browser, a phone, or later Supabase.
import { parseProjectCode, projectNameKey, projectNumbers, sheetNameAfterRename, sortProjects } from './projects.js'
import type { GroupProject, ProjectAlias, ProjectKind, SystemKey } from './types.js'

export const PROJECT_FILE_FORMAT = 'timecrumbs-projects'
const KINDS: ProjectKind[] = ['project', 'timelog', 'local_section']

export interface ProjectFileEntry {
  /** No in the table (null for hidden rows); the file order is what counts on loading */
  no: number | null
  kind: ProjectKind
  name: string
  sheet_name: string | null
  code: string | null
  manual: boolean
  hidden: boolean
  system_key: SystemKey | null
  aliases: string[]
}

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT
  version: 1
  exported_at: string
  projects: ProjectFileEntry[]
}

export function buildProjectFile(projects: GroupProject[], aliases: ProjectAlias[], now = new Date()): ProjectFile {
  const numbers = projectNumbers(projects)
  return {
    format: PROJECT_FILE_FORMAT,
    version: 1,
    exported_at: now.toISOString(),
    projects: sortProjects(projects).map((p) => ({
      no: numbers.get(p.id) ?? null,
      kind: p.kind,
      name: p.name,
      sheet_name: p.sheet_name,
      code: p.code,
      manual: p.manual,
      hidden: p.hidden,
      system_key: p.system_key,
      aliases: aliases.filter((a) => a.group_project_id === p.id).map((a) => a.alias),
    })),
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.replace(/\s+/g, ' ').trim() : null)

/** Read a project list file; throws a message the page can show as is. */
export function parseProjectFile(text: string): ProjectFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('TimeCrumbs 프로젝트 목록 파일(.json)이 아닙니다.')
  }
  const d = data as Partial<ProjectFile> | null
  if (!d || d.format !== PROJECT_FILE_FORMAT || !Array.isArray(d.projects)) throw new Error('TimeCrumbs 프로젝트 목록 파일(.json)이 아닙니다.')
  if (d.version !== 1) throw new Error(`지원하지 않는 파일 버전입니다 (${String(d.version)}).`)
  const projects = d.projects.map((raw, i): ProjectFileEntry => {
    const e = (raw ?? {}) as unknown as Record<string, unknown>
    const name = str(e.name)
    if (!name || !KINDS.includes(e.kind as ProjectKind)) throw new Error(`${i + 1}번째 항목의 이름이나 대분류가 올바르지 않습니다.`)
    return {
      no: typeof e.no === 'number' ? e.no : null,
      kind: e.kind as ProjectKind,
      name,
      sheet_name: str(e.sheet_name),
      code: str(e.code),
      manual: e.manual === true,
      hidden: e.hidden === true,
      system_key: (str(e.system_key) as SystemKey | null) ?? null,
      aliases: Array.isArray(e.aliases) ? e.aliases.map(str).filter((a): a is string => !!a) : [],
    }
  })
  return { format: PROJECT_FILE_FORMAT, version: 1, exported_at: typeof d.exported_at === 'string' ? d.exported_at : '', projects }
}

export interface ProjectUpdate {
  id: string
  sort_order: number
  name?: string
  sheet_name?: string | null
  hidden?: boolean
}
export interface ProjectInsert {
  kind: ProjectKind
  name: string
  code: string | null
  sheet_name: string | null
  manual: boolean
  hidden: boolean
  sort_order: number
  aliases: string[]
}

export interface ProjectImportPlan {
  updates: ProjectUpdate[]
  inserts: ProjectInsert[]
  aliasInserts: { projectId: string; alias: string }[]
  /** for the preview */
  renamed: { from: string; to: string }[]
  moved: number
  shown: string[]
  hiddenNow: string[]
  skipped: { name: string; reason: string }[]
  untouched: string[]
}

/**
 * What loading a file changes. Rows are matched by built-in key, then project code, then name or
 * sheet name (same matching key as everywhere else); matched rows take the file's name, order
 * and hidden state, unmatched rows are added, local aliases are added (never removed), and rows
 * the file does not list are left as they are (after the listed ones). The order is only
 * rewritten for a 대분류 whose order actually changes.
 */
export function planProjectImport(projects: GroupProject[], aliases: ProjectAlias[], file: ProjectFile): ProjectImportPlan {
  const plan: ProjectImportPlan = { updates: [], inserts: [], aliasInserts: [], renamed: [], moved: 0, shown: [], hiddenNow: [], skipped: [], untouched: [] }
  const taken = new Set<string>()
  const keysOf = (p: GroupProject) => [projectNameKey(p.name), p.sheet_name ? projectNameKey(p.sheet_name) : null]
  const usedAlias = new Set(aliases.map((a) => projectNameKey(a.alias)))
  const matched = new Map<ProjectFileEntry, GroupProject>()
  const added: ProjectFileEntry[] = []

  for (const e of file.projects) {
    const keys = [projectNameKey(e.name), e.sheet_name ? projectNameKey(e.sheet_name) : null].filter(Boolean)
    const free = projects.filter((p) => !taken.has(p.id))
    const match =
      (e.system_key && free.find((p) => p.system_key === e.system_key)) ||
      (e.code && free.find((p) => p.kind === e.kind && p.code?.toUpperCase() === e.code!.toUpperCase())) ||
      free.find((p) => keysOf(p).some((k) => k && keys.includes(k)))
    if (match && match.kind !== e.kind) {
      plan.skipped.push({ name: e.name, reason: '대분류가 다릅니다' })
    } else if (match) {
      matched.set(e, match)
      taken.add(match.id)
    } else if (projects.some((p) => keysOf(p).includes(projectNameKey(e.name))) || added.some((a) => projectNameKey(a.name) === projectNameKey(e.name))) {
      plan.skipped.push({ name: e.name, reason: '같은 이름이 이미 있습니다' })
    } else {
      added.push(e)
    }
  }

  for (const kind of KINDS) {
    const inFile = file.projects.filter((e) => e.kind === kind && (matched.has(e) || added.includes(e)))
    const now = sortProjects(projects.filter((p) => p.kind === kind))
    const rest = now.filter((p) => !taken.has(p.id))
    // the 대분류's order after loading: the file's rows, then the rows it does not list
    const desired: (GroupProject | ProjectFileEntry)[] = [...inFile.map((e) => matched.get(e) ?? e), ...rest]
    const existing = desired.filter((d): d is GroupProject => 'id' in d)
    const firstNew = desired.findIndex((d) => !('id' in d))
    const keep = existing.every((p, i) => p.id === now[i].id) && (firstNew < 0 || desired.slice(firstNew).every((d) => !('id' in d)))
    const top = Math.max(0, ...now.map((p) => p.sort_order))
    let next = top
    plan.moved += existing.filter((p, i) => p.id !== now[i].id).length

    desired.forEach((d, i) => {
      const sort_order = keep ? ('id' in d ? d.sort_order : ++next) : i + 1
      if (!('id' in d)) {
        const aliasesToAdd = d.aliases.filter((a) => !usedAlias.has(projectNameKey(a)))
        aliasesToAdd.forEach((a) => usedAlias.add(projectNameKey(a)))
        plan.inserts.push({
          kind,
          name: d.name,
          code: d.code ?? (kind === 'project' ? parseProjectCode(d.name) : null),
          sheet_name: d.sheet_name,
          manual: d.manual,
          hidden: d.hidden,
          sort_order,
          aliases: aliasesToAdd,
        })
        return
      }
      const p = d
      const u: ProjectUpdate = { id: p.id, sort_order }
      const e = inFile.find((x) => matched.get(x) === p)
      if (!e) {
        if (sort_order !== p.sort_order) plan.updates.push(u)
        plan.untouched.push(p.name)
        return
      }
      if (e.name !== p.name) {
        u.name = e.name
        u.sheet_name = e.sheet_name ?? sheetNameAfterRename(p, e.name)
        plan.renamed.push({ from: p.name, to: e.name })
      } else if (e.sheet_name && e.sheet_name !== p.sheet_name) {
        u.sheet_name = e.sheet_name
      }
      // built-in rows (휴가, 회의 …) are never hidden
      if (e.hidden !== p.hidden && !(e.hidden && p.system_key)) {
        u.hidden = e.hidden
        ;(e.hidden ? plan.hiddenNow : plan.shown).push(e.name)
      }
      if (Object.keys(u).length > 2 || sort_order !== p.sort_order) plan.updates.push(u)
      for (const a of e.aliases) {
        if (usedAlias.has(projectNameKey(a))) continue
        usedAlias.add(projectNameKey(a))
        plan.aliasInserts.push({ projectId: p.id, alias: a })
      }
    })
  }
  return plan
}
