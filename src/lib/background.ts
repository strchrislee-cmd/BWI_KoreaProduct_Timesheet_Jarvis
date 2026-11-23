// Random gradient + pattern backgrounds, deterministic per seed (default seed = today).

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function seededRandom(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type Hsl = [h: number, s: number, l: number]

export interface GradientScene {
  /** light linear base under the blobs: two colours along `angle` (degrees, CSS convention) */
  baseHsl: [Hsl, Hsl]
  angle: number
  /** 4 colour blobs, centre in % of the screen (x from the left, y from the top) */
  blobs: { hsl: Hsl; x: number; y: number }[]
  /**
   * The "sea seen from above" texture that drifts right → left: where in the (endless) noise
   * field this pattern starts, and how large its currents are. Differs per pattern.
   */
  sea: { offset: [number, number]; scale: number }
}

/** Today's (or a pinned seed's) colours: soft mesh of 4 blobs over a light base. No overlay patterns. */
export function gradientScene(seed: string): GradientScene {
  const rnd = seededRandom(seed)
  const hue = Math.floor(rnd() * 360)
  const blobs = Array.from({ length: 4 }, (_, i) => ({
    hsl: [Math.round((hue + i * (55 + rnd() * 50)) % 360), 78, 70] as Hsl,
    x: Math.round(rnd() * 100),
    y: Math.round(rnd() * 100),
  }))
  const angle = Math.round(rnd() * 360)
  // drawn after the colours so a seed keeps the colours it had before
  const sea = {
    offset: [round(rnd() * 100), round(rnd() * 100)] as [number, number],
    scale: round(2 + rnd() * 1.2), // 2–3.2: size of the gentle currents (bigger = finer)
  }
  return { baseHsl: [[hue, 60, 93], [(hue + 50) % 360, 55, 86]], angle, blobs, sea }
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** Colours of the bands from bottom to top (base, the 4 blob colours, base). */
export function bandColors(scene: GradientScene): Hsl[] {
  return [scene.baseHsl[0], ...scene.blobs.map((b) => b.hsl), scene.baseHsl[1]]
}

const css = ([h, s, l]: Hsl, a = 1) => (a === 1 ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${a})`)

/** The same colour bands as one still CSS background (fallback when WebGL is unavailable). */
export function gradientBackground(seed: string): { backgroundImage: string; backgroundSize: string } {
  const scene = gradientScene(seed)
  const stops = bandColors(scene).map((c) => css(c, 0.95))
  return { backgroundImage: `linear-gradient(to top, ${stops.join(', ')})`, backgroundSize: '100% 100%' }
}
