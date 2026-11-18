// User-chosen colors for categories and repeated tasks.
// Category colors and the saved palette live in profiles.preferences:
//   { categoryColors: { [groupProjectId | 'nonwork']: '#RRGGBB' }, palette: ['#RRGGBB', …] }
import type { GroupProject, Profile, SlotKind, TaskTemplate } from '../../domain/types'

export const PRESET_COLORS = [
  '#5AB4E5', '#6C9BE8', '#9B8AFB', '#E879A6', '#F26B6B', '#F28C38',
  '#F0B429', '#E8D44D', '#7BC47F', '#3FB8A9', '#8C9BAB', '#A3A3A3',
]
export const UNMAPPED_COLOR = '#F26B2A'
export const NONWORK_KEY = 'nonwork'
const MAX_SAVED = 16

export interface ColorPrefs {
  categoryColors: Record<string, string>
  palette: string[]
}

export const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

export function normalizeHex(v: string): string | null {
  const h = '#' + v.trim().replace(/^#/, '')
  return isHex(h) ? h.toUpperCase() : null
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase()
}

export function readColorPrefs(preferences: Profile['preferences']): ColorPrefs {
  const p = (preferences ?? {}) as { categoryColors?: unknown; palette?: unknown }
  const raw = p.categoryColors && typeof p.categoryColors === 'object' ? (p.categoryColors as Record<string, unknown>) : {}
  return {
    categoryColors: Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => isHex(e[1]))),
    palette: Array.isArray(p.palette) ? p.palette.filter(isHex) : [],
  }
}

/** Newest first, no duplicates, at most 16. */
export function addToPalette(palette: string[], hex: string): string[] {
  const h = hex.toUpperCase()
  return [h, ...palette.filter((x) => x.toUpperCase() !== h)].slice(0, MAX_SAVED)
}

export function defaultCategoryColor(kind: SlotKind, project?: GroupProject): string {
  if (kind === 'nonwork') return '#A3A3A3'
  if (!project) return UNMAPPED_COLOR
  if (project.system_key === 'meeting') return '#F0B429'
  if (project.system_key === 'general') return '#6C9BE8'
  if (project.kind === 'timelog') return project.system_key === 'leave' ? '#7BC47F' : '#E8D44D'
  if (project.kind === 'local_section') return '#7BC47F'
  return '#5AB4E5'
}

/** Preference key of a category, or null for unmapped work (always the warning color). */
export function categoryKey(kind: SlotKind, projectId: string | null): string | null {
  return kind === 'nonwork' ? NONWORK_KEY : projectId
}

export function categoryColor(kind: SlotKind, project: GroupProject | undefined, prefs: ColorPrefs): string {
  const key = categoryKey(kind, project?.id ?? null)
  return (key && prefs.categoryColors[key]) || defaultCategoryColor(kind, project)
}

export function templateColor(t: TaskTemplate, project: GroupProject | undefined, prefs: ColorPrefs): string {
  return t.color ?? categoryColor(t.kind, project, prefs)
}

/** Light tints so any chosen color keeps dark text readable. */
export const rowBg = (hex: string) => `color-mix(in srgb, ${hex} 28%, white)`
export const chipBg = (hex: string) => `color-mix(in srgb, ${hex} 42%, white)`
