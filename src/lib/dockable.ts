// Docking windows (Daily Log → Today): drag a card out to float it; drop it near the right edge and
// it snaps back into its place like a magnet. Pure helpers, tested in tests/dockable.test.ts.

/** pointer within this many px of the window's right edge = dock on release */
export const SNAP_ZONE = 96
/** a floating window keeps at least this much of itself on screen (px) */
const KEEP = 48

export interface FloatPos {
  x: number
  y: number
}

/** On release: dock when the pointer is near the right edge, otherwise float where it is. */
export function dropTarget(pointerX: number, viewportWidth: number): 'dock' | 'float' {
  return viewportWidth - pointerX <= SNAP_ZONE ? 'dock' : 'float'
}

/** Keep a floating window reachable after a drop or a window resize. */
export function clampPos(p: FloatPos, size: { w: number; h: number }, viewport: { w: number; h: number }): FloatPos {
  return {
    x: Math.round(Math.min(Math.max(p.x, KEEP - size.w), viewport.w - KEEP)),
    y: Math.round(Math.min(Math.max(p.y, 0), viewport.h - KEEP)),
  }
}

/** Saved state of one window in this browser: null = docked. */
export function readFloat(key: string): FloatPos | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as FloatPos | null
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null
  } catch {
    return null
  }
}

export function saveFloat(key: string, pos: FloatPos | null) {
  try {
    if (pos) localStorage.setItem(key, JSON.stringify(pos))
    else localStorage.removeItem(key)
  } catch {
    // private window / blocked storage: the window just forgets its place
  }
}
