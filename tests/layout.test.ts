import { describe, expect, it } from 'vitest'
import { readPrefs } from '../src/data/preferences'
import { GRID, MIN_SIZE, SNAP_ZONE, canvasHeight, dropTarget, moveRect, readRects, resizeRect, snap, snapRect } from '../src/lib/layout'
import { donutSlices, percent } from '../src/pages/timesheets/TodayDonut'

describe('window layout on the dot grid', () => {
  it('snaps to the grid', () => {
    expect(GRID).toBe(24)
    expect(snap(11)).toBe(0)
    expect(snap(13)).toBe(24)
    expect(snap(250)).toBe(240)
  })

  it('moves inside the page width and never above or left of it', () => {
    const r = { x: 48, y: 48, w: 336, h: 240 }
    expect(moveRect(r, 30, 10, 1200)).toEqual({ ...r, x: 72, y: 48 })
    expect(moveRect(r, -500, -500, 1200)).toEqual({ ...r, x: 0, y: 0 })
    expect(moveRect(r, 5000, 0, 1200).x).toBe(snap(1200 - 336))
  })

  it('resizes from the corner, not below the minimum, not past the page', () => {
    const r = { x: 0, y: 0, w: 480, h: 312 }
    expect(resizeRect('log', r, 100, 50, 1200)).toEqual({ x: 0, y: 0, w: 576, h: 360 })
    expect(resizeRect('log', r, -400, -400, 1200)).toEqual({ x: 0, y: 0, w: MIN_SIZE.log.w, h: MIN_SIZE.log.h })
    expect(resizeRect('today', { x: 960, y: 0, w: 240, h: 168 }, 500, 0, 1200).w).toBe(240)
  })

  it('magnet: dropping at the right edge docks the window only when the magnet is on', () => {
    expect(dropTarget(1440 - 10, 1440, true)).toBe('edge')
    expect(dropTarget(1440 - SNAP_ZONE, 1440, true)).toBe('edge')
    expect(dropTarget(1440 - SNAP_ZONE - 1, 1440, true)).toBe('grid')
    expect(dropTarget(1440 - 10, 1440, false)).toBe('grid')
  })

  it('snaps measured positions and sizes the page to fit', () => {
    expect(snapRect({ x: 1101, y: 3, w: 340, h: 150 }, 'today')).toEqual({ x: 1104, y: 0, w: 336, h: MIN_SIZE.today.h })
    const rects = { log: { x: 0, y: 0, w: 960, h: 720 }, today: { x: 984, y: 0, w: 336, h: 240 }, quick: { x: 984, y: 264, w: 336, h: 600 }, team: { x: 984, y: 888, w: 336, h: 264 } }
    expect(canvasHeight(rects, ['log', 'today', 'quick'])).toBe(864 + GRID)
    expect(canvasHeight(rects, ['log', 'today', 'quick', 'team'])).toBe(1152 + GRID)
    expect(canvasHeight(rects, ['log'])).toBe(720 + GRID)
  })

  it('reads saved layouts defensively', () => {
    const saved = { log: { x: 0, y: 0, w: 960, h: 720 }, today: { x: 984, y: 0, w: 336, h: 240 }, quick: { x: 984, y: 264, w: 336, h: 600 } }
    // saved before the Team window existed: Team goes under the lowest side window, as wide as quick tasks
    const rects = { ...saved, team: { x: 984, y: 888, w: 336, h: 264 } }
    expect(readRects(saved)).toEqual(rects)
    expect(readRects(rects)).toEqual(rects)
    expect(readRects({ ...rects, quick: { x: 'a' } })).toBeNull()
    expect(readRects(null)).toBeNull()
    const p = readPrefs({ layout: { rects, edge: { today: true }, magnet: false }, todayView: 'graph' })
    expect(p.layout).toEqual({ rects, edge: { today: true, quick: false, team: false }, magnet: false })
    expect(p.todayView).toBe('graph')
    expect(readPrefs({}).layout).toEqual({ rects: null, edge: { today: false, quick: false, team: false }, magnet: true })
    expect(readPrefs({}).todayView).toBe('list')
  })

  it('Team window: checked people in check order, read defensively', () => {
    expect(readPrefs({}).teamView).toEqual([])
    expect(readPrefs({ teamView: ['b', 'a', 'b', 3] }).teamView).toEqual(['b', 'a'])
    expect(readPrefs({ teamView: 'a' }).teamView).toEqual([])
  })

  it('auto-wrap is on unless turned off', () => {
    expect(readPrefs({}).grid.wrap).toBe(true)
    expect(readPrefs({ grid: { wrap: false } }).grid.wrap).toBe(false)
  })
})

describe('Today donut', () => {
  it('largest first, at most 6 slices with the rest as 기타, % of the logged hours', () => {
    const items = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((name, i) => ({ name, hours: 7 - i, color: '#000000' }))
    const s = donutSlices(items)
    expect(s.map((x) => x.name)).toEqual(['A', 'B', 'C', 'D', 'E', '기타'])
    expect(s[5].hours).toBe(2 + 1)
    expect(donutSlices([{ name: 'X', hours: 0, color: '#000000' }])).toEqual([])
    expect(percent(1.5, 6)).toBe(25)
    expect(percent(1, 0)).toBe(0)
  })
})
