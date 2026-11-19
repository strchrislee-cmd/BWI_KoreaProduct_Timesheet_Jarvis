// Framework-free core of GET /api/background: today's random Unsplash photo (one call per
// day thanks to CDN caching), or { configured: false } so the app falls back to gradients.

export interface DailyPhoto {
  configured: true
  url: string
  color: string | null
  author: string
  authorUrl: string
  photoUrl: string
}

export interface BackgroundOutput {
  status: number
  body: DailyPhoto | { configured: false } | { configured: true; error: string }
  cacheControl: string
}

const UTM = 'utm_source=jarvis_timesheet&utm_medium=referral'

/** Seconds until the next midnight in Korea (UTC+9, no DST). */
export function secondsUntilKstMidnight(now: Date): number {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000)
  const secondsToday = kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds()
  return Math.max(60, 86400 - secondsToday)
}

type FetchFn = (url: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export async function dailyPhoto(opts: { key: string | undefined; query: string; fetchFn: FetchFn; now: Date }): Promise<BackgroundOutput> {
  if (!opts.key) return { status: 200, body: { configured: false }, cacheControl: 'public, s-maxage=3600' }
  const headers = { Authorization: `Client-ID ${opts.key}`, 'Accept-Version': 'v1' }
  const res = await opts.fetchFn(
    `https://api.unsplash.com/photos/random?orientation=landscape&content_filter=high&query=${encodeURIComponent(opts.query)}`,
    { headers },
  )
  if (!res.ok) return { status: 502, body: { configured: true, error: `Unsplash responded ${res.status}` }, cacheControl: 'no-store' }

  const p = (await res.json()) as {
    color?: string
    urls: { raw: string }
    links: { html: string; download_location: string }
    user: { name: string; links: { html: string } }
  }
  // Unsplash guidelines: count the use via download_location, hotlink images.unsplash.com, credit with UTM links.
  await opts.fetchFn(p.links.download_location, { headers }).catch(() => undefined)
  return {
    status: 200,
    body: {
      configured: true,
      url: `${p.urls.raw}&w=2400&q=80&fm=jpg&fit=max`,
      color: p.color ?? null,
      author: p.user.name,
      authorUrl: `${p.user.links.html}?${UTM}`,
      photoUrl: `https://unsplash.com/?${UTM}`,
    },
    cacheControl: `public, s-maxage=${secondsUntilKstMidnight(opts.now)}, stale-while-revalidate=600`,
  }
}
