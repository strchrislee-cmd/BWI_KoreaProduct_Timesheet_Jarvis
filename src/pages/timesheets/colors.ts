// User-chosen colors for categories and repeated tasks.
// Category colors and the saved palette live in profiles.preferences:
//   { categoryColors: { [groupProjectId | 'nonwork']: '#RRGGBB' }, palette: ['#RRGGBB', …] }
import type { GroupProject, Profile, SlotKind, TaskTemplate } from '../../domain/types'

/** Notion-like named colors (base tones; rows/chips show light tints of them). */
export const NAMED_COLORS = [
  { name: '회색', hex: '#787774' },
  { name: '갈색', hex: '#9F6B53' },
  { name: '주황색', hex: '#D9730D' },
  { name: '노란색', hex: '#CB912F' },
  { name: '초록색', hex: '#448361' },
  { name: '파란색', hex: '#337EA9' },
  { name: '보라색', hex: '#9065B0' },
  { name: '분홍색', hex: '#C14C8A' },
  { name: '빨간색', hex: '#D44C47' },
]

export function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return rgbToHex(f(0), f(8), f(4))
}

/** Vivid random color. */
export const randomColor = (rnd: () => number = Math.random) => hslToHex(Math.floor(rnd() * 360), 70, 48)
/** Soft random pastel. */
export const randomPastel = (rnd: () => number = Math.random) => hslToHex(Math.floor(rnd() * 360), 60, 74)

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

/**
 * A person's colour (Team, Daily Kanban): the one you gave them, else a named colour by their place in
 * `order` (the Org Chart, so neighbours differ), or from their id when they are not in it. Never gray:
 * that reads as "no colour".
 */
export const personColorKey = (id: string) => `person:${id}`
export function personColor(id: string, prefs: ColorPrefs, order: string[] = []): string {
  const own = prefs.categoryColors[personColorKey(id)]
  if (own) return own
  const named = NAMED_COLORS.slice(1)
  let i = order.indexOf(id)
  if (i < 0) for (const ch of id) i = ((i < 0 ? 0 : i) * 31 + ch.charCodeAt(0)) >>> 0
  return named[i % named.length].hex
}

export function templateColor(t: TaskTemplate, project: GroupProject | undefined, prefs: ColorPrefs): string {
  return t.color ?? categoryColor(t.kind, project, prefs)
}

/** Light tints so any chosen color keeps dark text readable. */
export const rowBg = (hex: string) => `color-mix(in srgb, ${hex} 28%, white)`
export const chipBg = (hex: string) => `color-mix(in srgb, ${hex} 42%, white)`
