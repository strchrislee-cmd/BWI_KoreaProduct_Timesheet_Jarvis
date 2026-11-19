import { useEffect, useState } from 'react'
import { readPrefs } from '../data/preferences'
import { useStore } from '../data/StoreContext'
import { todayLocal } from '../domain/time'
import { gradientBackground } from '../lib/background'

export const BACKGROUND_CHANGED = 'jarvis:background'

interface Photo {
  url: string
  author: string
  authorUrl: string
  photoUrl: string
}

/** Today's Unsplash photo from /api/background, or null when not configured / unreachable. */
export async function fetchDailyPhoto(): Promise<Photo | null> {
  try {
    const res = await fetch('/api/background')
    if (!res.ok) return null
    const body = (await res.json()) as { configured?: boolean; url?: string } & Partial<Photo>
    return body.configured && body.url ? (body as Photo) : null
  } catch {
    return null
  }
}

/**
 * Full-screen background behind the glass UI: a random gradient pattern (new every day unless
 * a pattern was pinned), today's Unsplash photo, or the user's uploaded photo.
 */
export function BackgroundLayer() {
  const { store, user } = useStore()
  const prefs = readPrefs(user?.preferences ?? {})
  const mode = user ? prefs.background.mode : 'gradient'
  const [upload, setUpload] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    window.addEventListener(BACKGROUND_CHANGED, h)
    return () => window.removeEventListener(BACKGROUND_CHANGED, h)
  }, [])

  useEffect(() => {
    if (mode !== 'upload' || !user) return
    let alive = true
    store.getBackground(user.id).then(
      (img) => alive && setUpload(img),
      () => alive && setUpload(null),
    )
    return () => {
      alive = false
    }
  }, [mode, user, store, tick])

  useEffect(() => {
    if (mode !== 'unsplash') return
    let alive = true
    void fetchDailyPhoto().then((p) => alive && setPhoto(p))
    return () => {
      alive = false
    }
  }, [mode])

  const image = mode === 'upload' ? upload : mode === 'unsplash' ? photo?.url : null
  const style = image
    ? { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : gradientBackground(prefs.background.seed ?? todayLocal())

  return (
    <>
      <div aria-hidden data-testid="app-background" data-mode={image ? mode : 'gradient'} className="fixed inset-0 -z-10" style={style} />
      <div aria-hidden className="fixed inset-0 -z-10 bg-white/20" />
      {mode === 'unsplash' && photo && (
        <p className="glass fixed bottom-2 right-3 z-10 rounded-full px-3 py-1 text-[11px] text-muted">
          Photo by{' '}
          <a href={photo.authorUrl} target="_blank" rel="noreferrer" className="underline">
            {photo.author}
          </a>{' '}
          on{' '}
          <a href={photo.photoUrl} target="_blank" rel="noreferrer" className="underline">
            Unsplash
          </a>
        </p>
      )}
    </>
  )
}
