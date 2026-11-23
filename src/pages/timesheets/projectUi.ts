import { shortProjectName } from '../../domain/projects'
import type { GroupProject, ProjectAlias } from '../../domain/types'

/** Shorter display for long group names ("00.Timelog--Leave(…)" → "Leave(…)"). */
export const displayName = (p: GroupProject): string => shortProjectName(p)

/** Label stored on a slot when the user picks a project: first alias, else the display name. */
export function labelFor(p: GroupProject, aliases: ProjectAlias[]): string {
  return aliases.find((a) => a.group_project_id === p.id)?.alias ?? displayName(p)
}

/** 대분류 (major group) names; each project / timelog row / section is a 소분류 under one of them. */
export const KIND_LABEL = { project: 'PROJECT RND', timelog: 'PROJECT CO-WORK', local_section: 'PROJECT NON-RND' } as const
