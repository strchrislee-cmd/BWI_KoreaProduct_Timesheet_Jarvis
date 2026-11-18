import { describe, expect, it } from 'vitest'
import { defaultEndTime, minutesToTime, timeOptions, timeToMinutes } from '../src/domain/time'
import {
  addToPalette,
  categoryColor,
  defaultCategoryColor,
  hexToRgb,
  normalizeHex,
  readColorPrefs,
  rgbToHex,
  templateColor,
  UNMAPPED_COLOR,
} from '../src/pages/timesheets/colors'
import type { TaskTemplate } from '../src/domain/types'
import { project, seededProjects } from './helpers'

describe('work hours', () => {
  it('default end = start + 8h work + lunch when lunch falls inside', () => {
    expect(defaultEndTime('07:30', 8, '12:00', '13:00')).toBe('16:30')
    expect(defaultEndTime('09:00', 8, '12:00', '13:00')).toBe('18:00')
    expect(defaultEndTime('13:00', 8, '12:00', '13:00')).toBe('21:00') // lunch before start
    expect(defaultEndTime('04:00', 8, '12:00', '13:00')).toBe('12:00') // lunch starts at the end → not inside
    expect(defaultEndTime('18:00', 8, '12:00', '13:00')).toBe('24:00') // capped
    expect(defaultEndTime('08:00', 7.5, '12:00', '13:00')).toBe('16:30')
  })

  it('time options and conversions', () => {
    expect(timeOptions()).toHaveLength(49)
    expect(timeOptions(timeToMinutes('16:30'))[0]).toBe('16:30')
    expect(timeOptions().at(-1)).toBe('24:00')
    expect(minutesToTime(995)).toBe('16:35')
  })
})

describe('colors', () => {
  const projects = [...seededProjects(), project({ id: 'wl', name: '2041--Utility Work Lamps' })]
  const wl = projects.find((p) => p.id === 'wl')!
  const meeting = projects.find((p) => p.system_key === 'meeting')!

  it('hex ↔ rgb', () => {
    expect(hexToRgb('#1F4D3A')).toEqual([31, 77, 58])
    expect(rgbToHex(31, 77, 58)).toBe('#1F4D3A')
    expect(rgbToHex(300, -5, Number.NaN)).toBe('#FF0000')
    expect(normalizeHex('1f4d3a')).toBe('#1F4D3A')
    expect(normalizeHex('#12345')).toBeNull()
  })

  it('reads preferences defensively', () => {
    expect(readColorPrefs({})).toEqual({ categoryColors: {}, palette: [] })
    expect(readColorPrefs({ categoryColors: { wl: '#112233', bad: 'red' }, palette: ['#ABCDEF', 7] })).toEqual({
      categoryColors: { wl: '#112233' },
      palette: ['#ABCDEF'],
    })
  })

  it('saved palette: newest first, no duplicates, max 16', () => {
    expect(addToPalette(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    expect(addToPalette(Array.from({ length: 16 }, (_, i) => rgbToHex(i, i, i)), '#FFFFFF')).toHaveLength(16)
  })

  it('custom category colors override defaults; unmapped stays the warning color', () => {
    const prefs = { categoryColors: { wl: '#112233', nonwork: '#445566' }, palette: [] }
    expect(categoryColor('work', wl, prefs)).toBe('#112233')
    expect(categoryColor('work', meeting, prefs)).toBe(defaultCategoryColor('work', meeting))
    expect(categoryColor('nonwork', undefined, prefs)).toBe('#445566')
    expect(categoryColor('work', undefined, prefs)).toBe(UNMAPPED_COLOR)
  })

  it('templates use their own color, else their category color', () => {
    const t: TaskTemplate = { id: 't', user_id: 'u', kind: 'work', group_project_id: 'wl', label: '', description: 'x', sort_order: 1, color: null }
    const prefs = { categoryColors: { wl: '#112233' }, palette: [] }
    expect(templateColor(t, wl, prefs)).toBe('#112233')
    expect(templateColor({ ...t, color: '#ABCDEF' }, wl, prefs)).toBe('#ABCDEF')
  })
})
