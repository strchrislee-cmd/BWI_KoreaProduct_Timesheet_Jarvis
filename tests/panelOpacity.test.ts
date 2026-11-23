import { describe, expect, it } from 'vitest'
import { readPrefs } from '../src/data/preferences'
import { PANEL_OPACITY_DEFAULT, panelBackgrounds, scaleAlpha } from '../src/lib/panelOpacity'

describe('panel opacity', () => {
  it('keeps the designed alpha at the default, is solid at 100% and clear at 0%', () => {
    expect(scaleAlpha(0.36, 22, 22)).toBe(0.36)
    expect(scaleAlpha(0.1, 100, 22)).toBe(1)
    expect(scaleAlpha(0.58, 0, 58)).toBe(0)
  })

  it('only ever grows with the slider', () => {
    let prev = -1
    for (let o = 0; o <= 100; o++) {
      const a = scaleAlpha(0.1, o, 22)
      expect(a).toBeGreaterThanOrEqual(prev)
      prev = a
    }
  })

  it('blur panels use the slider value as their alpha', () => {
    expect(panelBackgrounds('blur', 58).glass).toBe('rgba(255, 255, 255, 0.58)')
    expect(panelBackgrounds('blur', 90).glass).toBe('rgba(255, 255, 255, 0.9)')
    expect(panelBackgrounds('blur', 58).sage).toBe('rgba(220, 229, 218, 0.62)')
  })

  it('liquid panels keep their sheen and become solid at 100%', () => {
    expect(panelBackgrounds('liquid', 22).glass).toBe(
      'linear-gradient(135deg, rgba(255, 255, 255, 0.36), rgba(255, 255, 255, 0.1) 45%, rgba(255, 255, 255, 0.22))',
    )
    expect(panelBackgrounds('liquid', 100).glass).toBe('linear-gradient(135deg, rgba(255, 255, 255, 1), rgba(255, 255, 255, 1) 45%, rgba(255, 255, 255, 1))')
  })

  it('reads per-style values defensively', () => {
    expect(readPrefs({}).panelOpacity).toEqual(PANEL_OPACITY_DEFAULT)
    expect(readPrefs({ panelOpacity: { blur: 80, liquid: 45 } }).panelOpacity).toEqual({ blur: 80, liquid: 45 })
    expect(readPrefs({ panelOpacity: { blur: 3, liquid: 400 } }).panelOpacity).toEqual({ blur: 10, liquid: 100 })
    expect(readPrefs({ panelOpacity: { blur: 'x' } }).panelOpacity).toEqual(PANEL_OPACITY_DEFAULT)
  })
})
