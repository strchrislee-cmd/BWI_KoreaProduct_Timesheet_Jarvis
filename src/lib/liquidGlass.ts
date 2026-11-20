// Liquid glass (B3): clear panels whose edges bend the background like a lens.
// The bend is an SVG displacement filter used in `backdrop-filter`, which only Chromium
// (Chrome, Edge) renders; other browsers get the same clear glass without the bend.

export const LIQUID_FILTER_ID = 'jarvis-liquid-glass'

// Displacement strength at the very edge: 0 at the centre, ±scale/2 of the panel size at the rim.
const RIM: [number, number][] = [
  [0, 1],
  [0.04, 0.82],
  [0.09, 0.64],
  [0.15, 0.53],
  [0.2, 0.5],
  [0.8, 0.5],
  [0.85, 0.47],
  [0.91, 0.36],
  [0.96, 0.18],
  [1, 0],
]

function gradient(id: string, channel: 'r' | 'g'): string {
  const stops = RIM.map(([o, v]) => {
    const c = Math.round(v * 255)
    return `<stop offset='${o}' stop-color='rgb(${channel === 'r' ? c : 0},${channel === 'g' ? c : 0},0)'/>`
  }).join('')
  return `<linearGradient id='${id}'${channel === 'g' ? " x2='0' y2='1'" : ''}>${stops}</linearGradient>`
}

/** Red = horizontal, green = vertical displacement; neutral (0.5) everywhere except near the edges. */
export const REFRACTION_MAP =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 1 1' preserveAspectRatio='none'><defs>${gradient('x', 'r')}${gradient('y', 'g')}</defs>` +
      `<rect width='1' height='1' fill='url(#x)'/><rect width='1' height='1' fill='url(#y)' style='mix-blend-mode:screen'/></svg>`,
  )

/** Chromium-based browsers (Chrome, Edge, …) render SVG filters inside backdrop-filter. */
export function supportsRefraction(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): boolean {
  return /Chrome\/\d+/.test(ua) && !/Firefox\//.test(ua)
}
