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

const PATTERNS: { layers: string[]; sizes: string[] }[] = [
  { layers: ['radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1.6px)'], sizes: ['22px 22px'] }, // dots
  {
    layers: ['linear-gradient(rgba(255,255,255,0.22) 1px, transparent 1px)', 'linear-gradient(90deg, rgba(255,255,255,0.22) 1px, transparent 1px)'],
    sizes: ['32px 32px', '32px 32px'],
  }, // grid
  { layers: ['repeating-linear-gradient(45deg, rgba(255,255,255,0.14) 0 2px, transparent 2px 16px)'], sizes: ['auto'] }, // stripes
  { layers: [], sizes: [] }, // plain mesh
]

/** CSS background for a seed: soft mesh of 4 colour blobs over a light base, plus a subtle pattern. */
export function gradientBackground(seed: string): { backgroundImage: string; backgroundSize: string } {
  const rnd = seededRandom(seed)
  const hue = Math.floor(rnd() * 360)
  const pattern = PATTERNS[Math.floor(rnd() * PATTERNS.length)]
  const blobs = Array.from({ length: 4 }, (_, i) => {
    const h = Math.round((hue + i * (55 + rnd() * 50)) % 360)
    return `radial-gradient(at ${Math.round(rnd() * 100)}% ${Math.round(rnd() * 100)}%, hsla(${h}, 78%, 70%, 0.85) 0px, transparent 55%)`
  })
  const angle = Math.round(rnd() * 360)
  const base = `linear-gradient(${angle}deg, hsl(${hue}, 60%, 93%), hsl(${(hue + 50) % 360}, 55%, 86%))`
  return {
    backgroundImage: [...pattern.layers, ...blobs, base].join(', '),
    backgroundSize: [...pattern.sizes, ...blobs.map(() => '100% 100%'), '100% 100%'].join(', '),
  }
}
