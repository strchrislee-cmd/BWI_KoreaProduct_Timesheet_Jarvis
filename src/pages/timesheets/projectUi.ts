import { shortProjectName } from '../../domain/projects'
import type { GroupProject, ProjectAlias, SlotKind, TimeSlot } from '../../domain/types'

/** Shorter display for long group names ("00.Timelog--Leave(…)" → "Leave(…)"). */
export const displayName = (p: GroupProject): string => shortProjectName(p)

/** Label stored on a slot when the user picks a project: first alias, else the display name. */
export function labelFor(p: GroupProject, aliases: ProjectAlias[]): string {
  return aliases.find((a) => a.group_project_id === p.id)?.alias ?? displayName(p)
}

/** Tailwind background class for a slot row / chip. */
export function slotTone(slot: TimeSlot | undefined, project: GroupProject | undefined): string {
  return slot ? categoryTone(slot.kind, project) : ''
}

export function categoryTone(kind: SlotKind, project: GroupProject | undefined): string {
  if (kind === 'nonwork') return 'bg-cat-nonwork/60'
  if (!project) return 'bg-accent-soft'
  if (project.system_key === 'meeting') return 'bg-cat-meeting/50'
  if (project.system_key === 'general') return 'bg-cat-general/40'
  if (project.kind === 'timelog') return 'bg-cat-timelog'
  if (project.kind === 'local_section') return 'bg-band-local'
  return 'bg-cat-project/50'
}

export const KIND_LABEL = { project: 'Project', timelog: 'Timelog', local_section: 'Section' } as const
