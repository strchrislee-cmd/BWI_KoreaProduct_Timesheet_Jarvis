import { shortProjectName } from '../../domain/projects'
import type { GroupProject, ProjectAlias } from '../../domain/types'

/** Shorter display for long group names ("00.Timelog--Leave(…)" → "Leave(…)"). */
export const displayName = (p: GroupProject): string => shortProjectName(p)

/** Label stored on a slot when the user picks a project: first alias, else the display name. */
export function labelFor(p: GroupProject, aliases: ProjectAlias[]): string {
  return aliases.find((a) => a.group_project_id === p.id)?.alias ?? displayName(p)
}

export const KIND_LABEL = { project: 'Project', timelog: 'Timelog', local_section: 'Section' } as const
