// Daily Log window layout (Settings are per user, see data/preferences.ts → layout): the 30-min Log,
// Today, the quick tasks (빠른 등록) and Team (people you may read) can be moved and resized on a dot
// grid, and the side windows can live in a dock at the right edge of the screen. Pure helpers, tested
// in tests/layout.test.ts.

export type PanelId = 'log' | 'today' | 'quick' | 'team'
export const PANEL_IDS: PanelId[] = ['log', 'today', 'quick', 'team']
/** windows that can also go to the right-edge dock */
export type SidePanelId = Exclude<PanelId, 'log'>

export interface PanelRect {
  x: number
  y: number
  w: number
  h: number
}
export type PanelRects = Record<PanelId, PanelRect>

/** spacing of the dot grid; windows snap to it */
export const GRID = 24
export const MIN_SIZE: Record<PanelId, { w: number; h: number }> = {
  log: { w: 480, h: 312 },
  today: { w: 240, h: 168 },
  quick: { w: 240, h: 168 },
  team: { w: 240, h: 168 },
}
/** pointer within this many px of the screen's right edge = the window goes to the right-edge dock */
export const SNAP_ZONE = 96

export const snap = (v: number) => Math.round(v / GRID) * GRID

/** On release while moving a side window: into the right-edge dock (magnet on) or stay on the grid. */
export function dropTarget(pointerX: number, viewportWidth: number, magnet: boolean): 'edge' | 'grid' {
  return magnet && viewportWidth - pointerX <= SNAP_ZONE ? 'edge' : 'grid'
}

/** A moved window: snapped to the grid, inside the page's width, never above or left of it. */
export function moveRect(start: PanelRect, dx: number, dy: number, pageWidth: number): PanelRect {
  const x = Math.min(Math.max(snap(start.x + dx), 0), Math.max(snap(pageWidth - start.w), 0))
  return { ...start, x, y: Math.max(snap(start.y + dy), 0) }
}

/** A resized window (bottom-right corner): snapped, at least its minimum size, inside the page's width. */
export function resizeRect(id: PanelId, start: PanelRect, dx: number, dy: number, pageWidth: number): PanelRect {
  const min = MIN_SIZE[id]
  const maxW = Math.max(pageWidth - start.x, min.w)
  return { ...start, w: Math.min(Math.max(snap(start.w + dx), min.w), maxW), h: Math.max(snap(start.h + dy), min.h) }
}

/** Snap measured positions (the default arrangement on screen) to the grid when editing starts. */
export function snapRect(r: PanelRect, id: PanelId): PanelRect {
  const min = MIN_SIZE[id]
  return { x: Math.max(snap(r.x), 0), y: Math.max(snap(r.y), 0), w: Math.max(snap(r.w), min.w), h: Math.max(snap(r.h), min.h) }
}

/** How tall the page must be so every window on the grid fits (plus one grid step). */
export const canvasHeight = (rects: PanelRects, ids: PanelId[]) => Math.max(0, ...ids.map((id) => rects[id].y + rects[id].h)) + GRID

/**
 * Saved rects, read defensively: anything malformed → null (the default arrangement). Team came later:
 * a layout saved before it puts Team under the lowest of Today / quick tasks, as wide as quick tasks.
 */
export function readRects(v: unknown): PanelRects | null {
  if (!v || typeof v !== 'object') return null
  const out = {} as PanelRects
  for (const id of PANEL_IDS) {
    const r = (v as Record<string, unknown>)[id] as Record<string, unknown> | undefined
    const ok = r && ['x', 'y', 'w', 'h'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number))
    if (!ok) {
      if (id !== 'team') return null
      const y = Math.max(out.today.y + out.today.h, out.quick.y + out.quick.h) + GRID
      out.team = snapRect({ x: out.quick.x, y, w: out.quick.w, h: 264 }, 'team')
      continue
    }
    out[id] = snapRect({ x: r.x as number, y: r.y as number, w: r.w as number, h: r.h as number }, id)
  }
  return out
}
