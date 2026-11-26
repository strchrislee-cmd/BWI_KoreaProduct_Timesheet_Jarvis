import { describe, expect, it } from 'vitest'
import { SNAP_ZONE, clampPos, dropTarget } from '../src/lib/dockable'

describe('docking window', () => {
  it('docks when released near the right edge, floats elsewhere', () => {
    expect(dropTarget(1440 - 10, 1440)).toBe('dock')
    expect(dropTarget(1440 - SNAP_ZONE, 1440)).toBe('dock')
    expect(dropTarget(1440 - SNAP_ZONE - 1, 1440)).toBe('float')
    expect(dropTarget(300, 1440)).toBe('float')
  })

  it('a floating window stays reachable', () => {
    const size = { w: 340, h: 260 }
    const vp = { w: 1440, h: 900 }
    expect(clampPos({ x: 500, y: 200 }, size, vp)).toEqual({ x: 500, y: 200 })
    expect(clampPos({ x: -1000, y: -50 }, size, vp)).toEqual({ x: 48 - 340, y: 0 })
    expect(clampPos({ x: 5000, y: 5000 }, size, vp)).toEqual({ x: 1440 - 48, y: 900 - 48 })
  })
})
