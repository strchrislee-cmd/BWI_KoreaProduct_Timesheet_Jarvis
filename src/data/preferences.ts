// Per-user settings stored in profiles.preferences (jsonb). Read defensively: older
// rows or hand-edited JSON must never break the app.
import type { Profile } from '../domain/types'
import { isSortMode, type SortMode } from '../lib/ordering'
import { isFontChoice, type FontChoice } from '../lib/fonts'
import type { Lang } from '../lib/i18n'
import { readRects, type PanelRects } from '../lib/layout'
import { PANEL_OPACITY_DEFAULT, PANEL_OPACITY_MIN } from '../lib/panelOpacity'
import { readColorPrefs, type ColorPrefs } from '../pages/timesheets/colors'

export interface GridPrefs {
  timeWidth: number
  categoryWidth: number
  /** MID (중분류) column */
  midWidth: number
  rowHeight: number
  /** 자동 줄바꿈: long text wraps and the row grows (default); off = one line, cut with … */
  wrap: boolean
}

export type BackgroundMode = 'gradient' | 'unsplash' | 'upload'
export type FlowSpeed = 'slow' | 'normal' | 'fast'
export type UiStyle = 'blur' | 'liquid'

export const FLOW_SPEEDS: { value: FlowSpeed; label: string }[] = [
  { value: 'slow', label: '느리게' },
  { value: 'normal', label: '보통' },
  { value: 'fast', label: '빠르게' },
]

export interface Prefs extends ColorPrefs {
  /** Personal manual order of category keys (project ids, "nw:<label>"). */
  categoryOrder: string[]
  sort: { category: SortMode; template: SortMode; type: SortMode }
  /** Personal manual order of Type ids (empty = the admin's order in Projects). */
  typeOrder: string[]
  grid: GridPrefs
  notifications: boolean
  /** seed null = a new random gradient every day; animate = gradient flows like water */
  background: { mode: BackgroundMode; seed: string | null; animate: boolean; speed: FlowSpeed }
  /** blur = frosted glass (default), liquid = clear glass with refracting edges */
  uiStyle: UiStyle
  /** panel opacity in % per UI style (higher = less background shows through) */
  panelOpacity: Record<UiStyle, number>
  /** body font (Settings → 화면 스타일 → 글꼴) */
  font: FontChoice
  /** screen language for menus, tabs, titles and table headers */
  language: Lang
  /** Daily Log windows (30-min Log, Today, 빠른 등록): where they sit and how big they are */
  layout: LayoutPrefs
  /** Today window: list of hours or the donut graph */
  todayView: 'list' | 'graph'
}

export interface LayoutPrefs {
  /** null = the default arrangement (30-min Log on the left, Today and quick tasks on the right) */
  rects: PanelRects | null
  /** windows kept in the dock at the right edge of the screen (slides in at the edge) */
  edge: { today: boolean; quick: boolean }
  /** while moving Today / quick tasks, dropping at the right edge puts them in that dock */
  magnet: boolean
}

export const DEFAULT_LAYOUT: LayoutPrefs = { rects: null, edge: { today: false, quick: false }, magnet: true }

// 좁게 (30px) by default so a whole working day fits on one screen
export const DEFAULT_GRID: GridPrefs = { timeWidth: 64, categoryWidth: 240, midWidth: 130, rowHeight: 30, wrap: true }
export const GRID_LIMITS = { timeWidth: [52, 160], categoryWidth: [160, 520], midWidth: [90, 320] } as const
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
  const opacity = (p.panelOpacity ?? {}) as Record<string, unknown>
  const layout = (p.layout ?? {}) as Record<string, unknown>
  const edge = (layout.edge ?? {}) as Record<string, unknown>
  return {
    ...readColorPrefs(preferences),
    categoryOrder: Array.isArray(p.categoryOrder) ? p.categoryOrder.filter((x): x is string => typeof x === 'string') : [],
    sort: {
      category: isSortMode(sort.category) ? sort.category : 'manual',
      template: isSortMode(sort.template) ? sort.template : 'manual',
      type: isSortMode(sort.type) && sort.type !== 'number' ? sort.type : 'manual',
    },
    typeOrder: Array.isArray(p.typeOrder) ? p.typeOrder.filter((x): x is string => typeof x === 'string') : [],
    grid: {
      timeWidth: num(grid.timeWidth, ...GRID_LIMITS.timeWidth, DEFAULT_GRID.timeWidth),
      categoryWidth: num(grid.categoryWidth, ...GRID_LIMITS.categoryWidth, DEFAULT_GRID.categoryWidth),
      midWidth: num(grid.midWidth, ...GRID_LIMITS.midWidth, DEFAULT_GRID.midWidth),
      rowHeight: ROW_HEIGHTS.some((r) => r.value === grid.rowHeight) ? (grid.rowHeight as number) : DEFAULT_GRID.rowHeight,
      wrap: grid.wrap !== false,
    },
    notifications: p.notifications === true,
    background: {
      mode: bg.mode === 'unsplash' || bg.mode === 'upload' ? bg.mode : 'gradient',
      seed: typeof bg.seed === 'string' ? bg.seed : null,
      animate: bg.animate !== false,
      speed: FLOW_SPEEDS.some((x) => x.value === bg.speed) ? (bg.speed as FlowSpeed) : 'normal',
    },
    uiStyle: p.uiStyle === 'liquid' ? 'liquid' : 'blur',
    panelOpacity: {
      blur: num(opacity.blur, PANEL_OPACITY_MIN, 100, PANEL_OPACITY_DEFAULT.blur),
      liquid: num(opacity.liquid, PANEL_OPACITY_MIN, 100, PANEL_OPACITY_DEFAULT.liquid),
    },
    font: isFontChoice(p.font) ? p.font : 'pretendard',
    language: p.language === 'ko' ? 'ko' : 'en',
    layout: {
      rects: readRects(layout.rects),
      edge: { today: edge.today === true, quick: edge.quick === true },
      magnet: layout.magnet !== false,
    },
    todayView: p.todayView === 'graph' ? 'graph' : 'list',
  }
}
