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

// Subtle overlays (no grid lines: the grid belongs to the timesheet table, not the background).
const PATTERNS: ({ image: string; size: string } | null)[] = [
  { image: 'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1.6px)', size: '22px 22px' }, // dots
  { image: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 16px)', size: 'auto' }, // stripes
  null, // plain mesh
]

export interface GradientScene {
  /** light linear base under the blobs */
  base: string
  /** 4 colour blobs, centre in % of the screen */
  blobs: { color: string; x: number; y: number }[]
  pattern: { image: string; size: string } | null
}

/** Today's (or a pinned seed's) colours: soft mesh of 4 blobs over a light base, plus an optional pattern. */
export function gradientScene(seed: string): GradientScene {
  const rnd = seededRandom(seed)
  const hue = Math.floor(rnd() * 360)
  const pattern = PATTERNS[Math.floor(rnd() * PATTERNS.length)]
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const h = Math.round((hue + i * (55 + rnd() * 50)) % 360)
    return { color: `hsla(${h}, 78%, 70%, 0.85)`, x: Math.round(rnd() * 100), y: Math.round(rnd() * 100) }
  })
  const angle = Math.round(rnd() * 360)
  const base = `linear-gradient(${angle}deg, hsl(${hue}, 60%, 93%), hsl(${(hue + 50) % 360}, 55%, 86%))`
  return { base, blobs, pattern }
}

/** The same scene as one static CSS background (Settings preview). */
export function gradientBackground(seed: string): { backgroundImage: string; backgroundSize: string } {
  const { base, blobs, pattern } = gradientScene(seed)
  const layers = blobs.map((b) => `radial-gradient(at ${b.x}% ${b.y}%, ${b.color} 0px, transparent 55%)`)
  return {
    backgroundImage: [...(pattern ? [pattern.image] : []), ...layers, base].join(', '),
    backgroundSize: [...(pattern ? [pattern.size] : []), ...layers.map(() => '100% 100%'), '100% 100%'].join(', '),
  }
}

/** Animation-duration multiplier per speed setting (smaller = faster). */
export const FLOW_FACTOR = { slow: 1, normal: 0.55, fast: 0.3 } as const
