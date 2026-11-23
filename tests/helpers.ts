import type { GroupProject, TimeSlot } from '../src/domain/types'
import { SEED_PROJECTS } from '../src/domain/seed'

let n = 0
export function project(p: Partial<GroupProject> & { name: string }): GroupProject {
  n += 1
  return {
    id: p.id ?? `p${n}`,
    code: p.code ?? null,
    name: p.name,
    kind: p.kind ?? 'project',
    system_key: p.system_key ?? null,
    counts_toward_total: p.counts_toward_total ?? true,
    sort_order: p.sort_order ?? n,
    status: p.status ?? 'active',
    hidden: p.hidden ?? false,
    manual: p.manual ?? false,
    sheet_name: p.sheet_name ?? null,
    first_seen_import_id: p.first_seen_import_id ?? null,
    last_seen_import_id: p.last_seen_import_id ?? null,
    created_at: p.created_at ?? `2026-01-${String(n % 28 + 1).padStart(2, '0')}T00:00:00.000Z`,
  }
}

export function seededProjects(): GroupProject[] {
  return SEED_PROJECTS.map((s, i) => project({ ...s, id: s.system_key ?? `seed${i}` }))
}

export function slot(date: string, index: number, s: Partial<TimeSlot> = {}): TimeSlot {
  return {
    user_id: 'u1',
    work_date: date,
    slot_index: index,
    kind: s.kind ?? 'work',
    group_project_id: s.group_project_id ?? null,
    label: s.label ?? '',
    description: s.description ?? '',
    details: s.details ?? '',
    focus: s.focus ?? null,
  }
}
