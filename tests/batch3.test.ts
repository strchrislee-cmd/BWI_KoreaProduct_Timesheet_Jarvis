import { describe, expect, it, vi } from 'vitest'
import { startTimeOptions } from '../src/domain/time'
import { msUntilNextBoundary, reminderFor } from '../src/domain/reminders'
import { NAMED_COLORS, hslToHex, isHex, randomColor, randomPastel } from '../src/pages/timesheets/colors'
import { moveItem, sortItems } from '../src/lib/ordering'
import { gradientBackground, seededRandom } from '../src/lib/background'
import { DEFAULT_GRID, readPrefs } from '../src/data/preferences'
import { dailyPhoto, secondsUntilKstMidnight } from '../api/_lib/backgroundCore'

describe('A1 start time range', () => {
  it('07:00 … 10:00 in 30-min steps; keeps a saved value outside the range', () => {
    expect(startTimeOptions()).toEqual(['07:00', '07:30', '08:00', '08:30', '09:00', '09:30', '10:00'])
    expect(startTimeOptions('06:30')[0]).toBe('06:30')
    expect(startTimeOptions('08:00')).toHaveLength(7)
  })
})

describe('A2 colors', () => {
  it('named and random colors are valid hex', () => {
    expect(NAMED_COLORS.map((c) => c.name)).toEqual(['회색', '갈색', '주황색', '노란색', '초록색', '파란색', '보라색', '분홍색', '빨간색'])
    expect(hslToHex(0, 100, 50)).toBe('#FF0000')
    const rnd = seededRandom('x')
    for (let i = 0; i < 20; i++) {
      expect(isHex(randomColor(rnd))).toBe(true)
      expect(isHex(randomPastel(rnd))).toBe(true)
    }
    expect(randomPastel(() => 0.5)).not.toBe(randomColor(() => 0.5)) // pastel is lighter
  })
})

describe('A5/A6 ordering', () => {
  const items = [
    { k: 'a', n: '다', c: '2026-01-03' },
    { k: 'b', n: '가', c: '2026-01-01' },
    { k: 'c', n: '나', c: '2026-01-02' },
  ]
  const get = { key: (x: (typeof items)[0]) => x.k, name: (x: (typeof items)[0]) => x.n, created: (x: (typeof items)[0]) => x.c }
  const keys = (xs: typeof items) => xs.map((x) => x.k).join('')

  it('sorts by name / created / manual', () => {
    expect(keys(sortItems(items, 'name', get))).toBe('bca')
    expect(keys(sortItems(items, 'name_desc', get))).toBe('acb')
    expect(keys(sortItems(items, 'created', get))).toBe('bca')
    expect(keys(sortItems(items, 'created_desc', get))).toBe('acb')
    expect(keys(sortItems(items, 'manual', get, ['c', 'a']))).toBe('cab') // unlisted keep fallback order after
    expect(keys(sortItems(items, 'manual', get))).toBe('abc')
  })

  it('moves an item', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('A4 reminders', () => {
  const opts = { start: '07:30', end: '16:30', lunch: new Set([24, 25]), filled: new Set([18]) }
  const at = (iso: string) => new Date(iso) // local time (tests run with TZ of the machine)

  it('reminds for the half hour that just ended, within hours, not lunch, not logged', () => {
    expect(reminderFor(at('2026-11-16T10:00:00'), opts)).toEqual({ slot: 19, text: '09:30–10:00 업무를 기록해 주세요' })
    expect(reminderFor(at('2026-11-16T09:30:00'), opts)).toBeNull() // 09:00–09:30 already logged
    expect(reminderFor(at('2026-11-16T12:30:00'), opts)).toBeNull() // lunch
    expect(reminderFor(at('2026-11-16T07:30:00'), opts)).toBeNull() // 07:00–07:30 before start
    expect(reminderFor(at('2026-11-16T16:30:00'), opts)).toMatchObject({ slot: 32 }) // 16:00–16:30 last slot
    expect(reminderFor(at('2026-11-16T17:00:00'), opts)).toBeNull() // after end
    expect(reminderFor(at('2026-11-21T10:00:00'), opts)).toBeNull() // Saturday
  })

  it('schedules to the next :00 / :30', () => {
    expect(msUntilNextBoundary(at('2026-11-16T09:59:30'))).toBe(31_000)
    expect(msUntilNextBoundary(at('2026-11-16T10:00:00'))).toBe(30 * 60_000 + 1000)
  })
})

describe('A7/A8 preferences and backgrounds', () => {
  it('reads preferences with safe defaults and clamps', () => {
    const p = readPrefs({})
    expect(p.grid).toEqual(DEFAULT_GRID)
    expect(p.sort).toEqual({ category: 'manual', template: 'manual' })
    expect(p.background).toEqual({ mode: 'gradient', seed: null })
    expect(p.notifications).toBe(false)
    const q = readPrefs({ grid: { timeWidth: 999, categoryWidth: 'x', rowHeight: 44 }, sort: { category: 'name' }, background: { mode: 'upload', seed: 7 }, categoryOrder: ['a', 1] })
    expect(q.grid).toEqual({ timeWidth: 160, categoryWidth: DEFAULT_GRID.categoryWidth, rowHeight: 44 })
    expect(q.sort.category).toBe('name')
    expect(q.background).toEqual({ mode: 'upload', seed: null })
    expect(q.categoryOrder).toEqual(['a'])
  })

  it('gradient backgrounds are deterministic per seed with matching layer sizes', () => {
    const a = gradientBackground('2026-11-19')
    expect(gradientBackground('2026-11-19')).toEqual(a)
    expect(gradientBackground('2026-11-20')).not.toEqual(a)
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const g = gradientBackground(seed)
      const layers = g.backgroundImage.split(/,\s*(?=(?:radial|linear|repeating)-gradient)/).length
      expect(g.backgroundSize.split(',').length).toBe(layers)
    }
  })
})

describe('A8 /api/background core', () => {
  it('falls back when no key is configured', async () => {
    const fetchFn = vi.fn()
    const out = await dailyPhoto({ key: undefined, query: 'nature', fetchFn, now: new Date() })
    expect(out.body).toEqual({ configured: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns the photo with credits, triggers the download event, caches until KST midnight', async () => {
    const photo = {
      color: '#335577',
      urls: { raw: 'https://images.unsplash.com/photo-1?ixid=abc' },
      links: { html: 'https://unsplash.com/photos/1', download_location: 'https://api.unsplash.com/photos/1/download' },
      user: { name: 'Jane Doe', links: { html: 'https://unsplash.com/@jane' } },
    }
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, json: async () => photo }))
    const now = new Date('2026-11-19T14:00:00Z') // 23:00 KST
    const out = await dailyPhoto({ key: 'k', query: 'nature landscape', fetchFn, now })
    expect(out.status).toBe(200)
    expect(out.body).toMatchObject({ configured: true, author: 'Jane Doe', url: 'https://images.unsplash.com/photo-1?ixid=abc&w=2400&q=80&fm=jpg&fit=max' })
    expect((out.body as { authorUrl: string }).authorUrl).toContain('utm_source=jarvis_timesheet')
    expect(fetchFn).toHaveBeenNthCalledWith(1, expect.stringContaining('query=nature%20landscape'), { headers: expect.objectContaining({ Authorization: 'Client-ID k' }) })
    expect(fetchFn).toHaveBeenNthCalledWith(2, photo.links.download_location, expect.anything())
    expect(out.cacheControl).toContain('s-maxage=3600')
    expect(secondsUntilKstMidnight(new Date('2026-11-19T15:00:00Z'))).toBe(86400)
  })

  it('reports Unsplash errors without caching', async () => {
    const out = await dailyPhoto({ key: 'k', query: 'q', fetchFn: async () => ({ ok: false, status: 403, json: async () => ({}) }), now: new Date() })
    expect(out).toMatchObject({ status: 502, cacheControl: 'no-store' })
  })
})
