import { projectNameKey } from './projects.js'
import type { GroupProject, ProjectAlias, SlotKind } from './types.js'

/** Labels from personal 30-min sheets that are not work (CONTEXT.md §4-C). */
export const NONWORK_LABELS = [
  '출근전', '출근 전', '출근', '퇴근', '퇴근후', '퇴근 후', '점심', '저녁', '식사', '간식',
  '수면', '휴식', '정비', '여가', '폰', '셀폰', '독서', '공부', '운동',
]
const NONWORK = new Set(NONWORK_LABELS.map((l) => l.replace(/\s+/g, '')))

export interface ResolvedLabel {
  kind: SlotKind
  group_project_id: string | null
}

/**
 * Resolve a free-text category label to a group project.
 * Order: non-work words → alias → exact project name/code → unmapped work.
 */
export function resolveLabel(
  label: string,
  aliases: ProjectAlias[],
  projects: GroupProject[],
): ResolvedLabel | null {
  const text = label.trim()
  if (!text) return null
  if (NONWORK.has(text.replace(/\s+/g, ''))) return { kind: 'nonwork', group_project_id: null }

  const key = projectNameKey(text)
  const alias = aliases.find((a) => projectNameKey(a.alias) === key)
  if (alias) return { kind: 'work', group_project_id: alias.group_project_id }

  const project = projects.find((p) => projectNameKey(p.name) === key || (p.code && p.code.toLowerCase() === key))
  if (project) return { kind: 'work', group_project_id: project.id }

  return { kind: 'work', group_project_id: null }
}
