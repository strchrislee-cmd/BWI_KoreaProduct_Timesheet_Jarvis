import { useEffect, useState, type CSSProperties } from 'react'
import { readPrefs } from '../data/preferences'
import { useStore } from '../data/StoreContext'
import { todayLocal } from '../domain/time'
import { FLOW_FACTOR, gradientScene } from '../lib/background'
import { LIQUID_FILTER_ID, REFRACTION_MAP, supportsRefraction } from '../lib/liquidGlass'

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

/** Gradient background whose blobs drift like waves and whose colours slowly shift (B4). */
function FlowingGradient({ seed, animate, factor, paused }: { seed: string; animate: boolean; factor: number; paused: boolean }) {
  const scene = gradientScene(seed)
  return (
    <div
      aria-hidden
      data-testid="app-background"
      data-mode="gradient"
      data-animated={animate}
      data-paused={paused}
      className="bg-flow fixed inset-0 -z-10 overflow-hidden"
      style={{ '--flow-k': factor } as CSSProperties}
    >
      <div className="bg-flow-hue absolute inset-0" style={{ backgroundImage: scene.base }}>
        {scene.blobs.map((b, i) => (
          <div key={i} className="bg-blob" style={{ left: `${b.x}%`, top: `${b.y}%`, backgroundImage: `radial-gradient(circle closest-side, ${b.color}, transparent)` }} />
        ))}
        <div className="bg-wave" />
      </div>
      {scene.pattern && <div className="absolute inset-0" style={{ backgroundImage: scene.pattern.image, backgroundSize: scene.pattern.size }} />}
    </div>
  )
}

/**
 * Full-screen background behind the glass UI: a random gradient (new every day unless a
 * pattern was pinned, flowing unless turned off), today's Unsplash photo, or the user's
 * uploaded photo. Also applies the UI style (blur / liquid glass) to the page.
 */
export function BackgroundLayer() {
  const { store, user } = useStore()
  const prefs = readPrefs(user?.preferences ?? {})
  const mode = user ? prefs.background.mode : 'gradient'
  const uiStyle = user ? prefs.uiStyle : 'blur'
  const [upload, setUpload] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Photo | null>(null)
  const [tick, setTick] = useState(0)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)

  useEffect(() => {
    const h = () => setTick((t) => t + 1)
    const v = () => setHidden(document.hidden)
    window.addEventListener(BACKGROUND_CHANGED, h)
    document.addEventListener('visibilitychange', v)
    return () => {
      window.removeEventListener(BACKGROUND_CHANGED, h)
      document.removeEventListener('visibilitychange', v)
    }
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.ui = uiStyle
    root.dataset.refraction = supportsRefraction() ? 'on' : 'off'
  }, [uiStyle])

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

  return (
    <>
      {image ? (
        <div
          aria-hidden
          data-testid="app-background"
          data-mode={mode}
          className="fixed inset-0 -z-10"
          style={{ backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' }}
        />
      ) : (
        <FlowingGradient
          seed={prefs.background.seed ?? todayLocal()}
          animate={!user || prefs.background.animate}
          factor={FLOW_FACTOR[prefs.background.speed]}
          paused={hidden}
        />
      )}
      <div aria-hidden className="fixed inset-0 -z-10 bg-white/20" />
      {uiStyle === 'liquid' && (
        <svg aria-hidden width="0" height="0" className="absolute">
          <filter id={LIQUID_FILTER_ID} x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            <feImage href={REFRACTION_MAP} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale="0.08" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
      {mode === 'unsplash' && photo && (
        <p className="glass fixed bottom-2 right-3 z-10 rounded-chip px-3 py-1 text-[11px] text-muted">
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
