// Batch B (2026-11-20): flowing gradient, liquid glass, now line, project add/hide.
import { describe, expect, it } from 'vitest'
import { readPrefs } from '../src/data/preferences'
import { buildGroupTimesheet } from '../src/domain/aggregate'
import { diffMaster, isSelectable, manualProjectRow } from '../src/domain/projects'
import { currentSlot } from '../src/domain/time'
import { bandColors, gradientBackground, gradientScene } from '../src/lib/background'
import { FLOW_RATE, crossSeconds, hslToRgb } from '../src/lib/flowGradient'
import { REFRACTION_MAP, supportsRefraction } from '../src/lib/liquidGlass'
import { project, slot } from './helpers'

describe('B2/B4 gradient background', () => {
  it('never adds an overlay pattern (no grid, dots or stripes — 11-22)', () => {
    for (let i = 0; i < 200; i++) {
      const g = gradientBackground(`seed-${i}`)
      expect(g.backgroundImage).not.toMatch(/repeating-|rgba\(255,\s*255,\s*255/)
      expect(g.backgroundImage.startsWith('linear-gradient(to top,')).toBe(true)
      expect(Object.keys(gradientScene(`seed-${i}`)).sort()).toEqual(['angle', 'baseHsl', 'blobs', 'wave'])
    }
  })

  it('scene is deterministic; the still fallback shows the same 6 bands', () => {
    const a = gradientScene('2026-11-20')
    expect(gradientScene('2026-11-20')).toEqual(a)
    expect(bandColors(a)).toHaveLength(6)
    for (const [h, s, l] of bandColors(a)) expect(gradientBackground('2026-11-20').backgroundImage).toContain(`hsla(${h}, ${s}%, ${l}%`)
  })

  it('each pattern has its own wave shape, and it repeats seamlessly while flowing (11-23)', () => {
    const shapes = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const { wave } = gradientScene(`seed-${i}`)
      const [k1, k2] = wave.counts
      expect(Number.isInteger(k1) && Number.isInteger(k2) && k1 >= 1 && k2 > k1).toBe(true) // whole waves per screen
      expect(wave.heights[0]).toBeGreaterThanOrEqual(0.06)
      expect(wave.heights[0]).toBeLessThanOrEqual(0.14)
      expect(Math.abs(wave.tilt)).toBeLessThanOrEqual(0.25)
      shapes.add(JSON.stringify(wave))
    }
    expect(shapes.size).toBe(100)
  })

  it('flow speeds: seconds for the waves to cross the screen right → left', () => {
    expect(FLOW_RATE.slow).toBeLessThan(FLOW_RATE.normal)
    expect(FLOW_RATE.normal).toBeLessThan(FLOW_RATE.fast)
    expect([crossSeconds('slow'), crossSeconds('normal'), crossSeconds('fast')]).toEqual([24, 12, 6])
  })

  it('HSL → RGB for the shader matches CSS', () => {
    const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.005)
    expect(close(hslToRgb([0, 100, 50]), [1, 0, 0])).toBe(true)
    expect(close(hslToRgb([120, 100, 25]), [0, 0.5, 0])).toBe(true)
    expect(close(hslToRgb([210, 60, 93]), [0.888, 0.93, 0.972])).toBe(true)
  })

  it('preferences: flowing on + slow + blur by default, invalid values fall back', () => {
    const p = readPrefs({})
    expect(p.background.animate).toBe(true)
    expect(p.background.speed).toBe('normal')
    expect(p.grid.rowHeight).toBe(30) // 좁게 by default (11-22)
    expect(p.font).toBe('pretendard')
    expect(readPrefs({ font: 'plex' }).font).toBe('plex')
    expect(readPrefs({ font: 'comic-sans' }).font).toBe('pretendard')
    expect(p.uiStyle).toBe('blur')
    const q = readPrefs({ background: { animate: false, speed: 'fast' }, uiStyle: 'liquid' })
    expect([q.background.animate, q.background.speed, q.uiStyle]).toEqual([false, 'fast', 'liquid'])
    const r = readPrefs({ background: { animate: 'no', speed: 'warp' }, uiStyle: 'chrome' })
    expect([r.background.animate, r.background.speed, r.uiStyle]).toEqual([true, 'normal', 'blur'])
  })
})

describe('B3 liquid glass', () => {
  it('refraction only in Chromium-based browsers', () => {
    const chrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
    expect(supportsRefraction(chrome)).toBe(true)
    expect(supportsRefraction(chrome + ' Edg/142.0.0.0')).toBe(true)
    expect(supportsRefraction('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36')).toBe(true)
    expect(supportsRefraction('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15')).toBe(false)
    expect(supportsRefraction('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0')).toBe(false)
    expect(supportsRefraction('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1')).toBe(false)
  })

  it('refraction map is an SVG with a horizontal (red) and vertical (green) rim', () => {
    const svg = decodeURIComponent(REFRACTION_MAP.replace('data:image/svg+xml,', ''))
    expect(svg).toContain("<linearGradient id='x'>")
    expect(svg).toContain("<linearGradient id='y' x2='0' y2='1'>")
    expect(svg).toContain("stop-color='rgb(128,0,0)'") // neutral (no bend) in the middle
  })
})

describe('B6 now line', () => {
  it('finds the slot and how far into it', () => {
    const at = (h: number, m: number) => new Date(2026, 10, 20, h, m)
    expect(currentSlot(at(10, 17))).toEqual({ slot: 20, frac: 17 / 30, time: '10:17' })
    expect(currentSlot(at(0, 0))).toEqual({ slot: 0, frac: 0, time: '00:00' })
    expect(currentSlot(at(23, 59))).toEqual({ slot: 47, frac: 29 / 30, time: '23:59' })
  })
})

describe('B5 projects added by hand and hidden', () => {
  it('tidies names: spaces, timelog prefix, project code', () => {
    expect(manualProjectRow('  2045--Compact   Work Lamp ', 'project')).toEqual({ name: '2045--Compact Work Lamp', code: '2045' })
    expect(manualProjectRow('Safety Audit', 'timelog')).toEqual({ name: '00.Timelog--Safety Audit', code: null })
    expect(manualProjectRow('00.Timelog--Safety Audit', 'timelog').name).toBe('00.Timelog--Safety Audit')
    expect(manualProjectRow('2045--Team Day', 'local_section')).toEqual({ name: '2045--Team Day', code: null })
  })

  it('master diff: manual rows are merged when listed and never "missing"; hidden rows are matched, not re-added', () => {
    const manualListed = project({ name: '2045--Compact Work Lamp', code: '2045', manual: true })
    const manualOnly = project({ name: '2046--Draft', code: '2046', manual: true })
    const hidden = project({ name: '2041--Utility Work Lamp Series', code: '2041', hidden: true })
    const masterGone = project({ name: '1999--Old', code: '1999' })
    const d = diffMaster([manualListed, manualOnly, hidden, masterGone], [
      { name: '2045--Compact Work Lamp', code: '2045', kind: 'project' },
      { name: '2041--Utility Work Lamp Series', code: '2041', kind: 'project' },
    ])
    expect(d.matched.map((m) => m.project.id).sort()).toEqual([hidden.id, manualListed.id].sort())
    expect(d.added).toEqual([])
    expect(d.missing.map((p) => p.id)).toEqual([masterGone.id])
  })

  it('hidden projects are not offered, but stay in the group timesheet while they have hours', () => {
    const shown = project({ name: '2045--A' })
    const hiddenUsed = project({ name: '2046--B', hidden: true })
    const hiddenUnused = project({ name: '2047--C', hidden: true })
    expect([shown, hiddenUsed, hiddenUnused].filter(isSelectable)).toEqual([shown])
    expect(isSelectable(project({ name: 'x', status: 'missing' }))).toBe(false)
    const gt = buildGroupTimesheet({
      slots: [slot('2026-11-16', 20, { group_project_id: hiddenUsed.id })],
      leaves: [],
      projects: [shown, hiddenUsed, hiddenUnused],
      dates: ['2026-11-16'],
      targetHours: 8,
    })
    const ids = gt.rows.map((r) => r.project.id)
    expect(ids).toContain(shown.id)
    expect(ids).toContain(hiddenUsed.id)
    expect(ids).not.toContain(hiddenUnused.id)
  })
})
