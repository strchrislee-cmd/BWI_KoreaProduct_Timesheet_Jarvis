// Per-user settings stored in profiles.preferences (jsonb). Read defensively: older
// rows or hand-edited JSON must never break the app.
import type { Profile } from '../domain/types'
import { isSortMode, type SortMode } from '../lib/ordering'
import { readColorPrefs, type ColorPrefs } from '../pages/timesheets/colors'

export interface GridPrefs {
  timeWidth: number
  categoryWidth: number
  rowHeight: number
}

export type BackgroundMode = 'gradient' | 'unsplash' | 'upload'

export interface Prefs extends ColorPrefs {
  /** Personal manual order of category keys (project ids, "nw:<label>"). */
  categoryOrder: string[]
  sort: { category: SortMode; template: SortMode }
  grid: GridPrefs
  notifications: boolean
  /** seed null = a new random gradient every day */
  background: { mode: BackgroundMode; seed: string | null }
}

export const DEFAULT_GRID: GridPrefs = { timeWidth: 64, categoryWidth: 260, rowHeight: 36 }
export const GRID_LIMITS = { timeWidth: [52, 160], categoryWidth: [160, 520] } as const
export const ROW_HEIGHTS = [
  { label: '좁게', value: 30 },
  { label: '보통', value: 36 },
  { label: '넓게', value: 44 },
]

const num = (v: unknown, lo: number, hi: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : fallback

export function readPrefs(preferences: Profile['preferences']): Prefs {
  const p = (preferences ?? {}) as Record<string, unknown>
  const sort = (p.sort ?? {}) as Record<string, unknown>
  const grid = (p.grid ?? {}) as Record<string, unknown>
  const bg = (p.background ?? {}) as Record<string, unknown>
  return {
    ...readColorPrefs(preferences),
    categoryOrder: Array.isArray(p.categoryOrder) ? p.categoryOrder.filter((x): x is string => typeof x === 'string') : [],
    sort: {
      category: isSortMode(sort.category) ? sort.category : 'manual',
      template: isSortMode(sort.template) ? sort.template : 'manual',
    },
    grid: {
      timeWidth: num(grid.timeWidth, ...GRID_LIMITS.timeWidth, DEFAULT_GRID.timeWidth),
      categoryWidth: num(grid.categoryWidth, ...GRID_LIMITS.categoryWidth, DEFAULT_GRID.categoryWidth),
      rowHeight: ROW_HEIGHTS.some((r) => r.value === grid.rowHeight) ? (grid.rowHeight as number) : DEFAULT_GRID.rowHeight,
    },
    notifications: p.notifications === true,
    background: {
      mode: bg.mode === 'unsplash' || bg.mode === 'upload' ? bg.mode : 'gradient',
      seed: typeof bg.seed === 'string' ? bg.seed : null,
    },
  }
}
