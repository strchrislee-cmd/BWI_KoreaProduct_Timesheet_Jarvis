import { useEffect, useMemo, useRef, useState } from 'react'
import type { FlowSpeed } from '../data/preferences'
import { gradientBackground, gradientScene } from '../lib/background'
import { FLOW_RATE, startFlow, type FlowHandle } from '../lib/flowGradient'

function usePrefersReducedMotion(): boolean {
  const query = typeof window !== 'undefined' ? window.matchMedia?.('(prefers-reduced-motion: reduce)') : undefined
  const [reduced, setReduced] = useState(() => !!query?.matches)
  useEffect(() => {
    if (!query) return
    const on = () => setReduced(query.matches)
    query.addEventListener('change', on)
    return () => query.removeEventListener('change', on)
  }, [query])
  return reduced
}

/**
 * Today's gradient, flowing like water (B4). Used full-screen behind the app and as the live
 * preview in Settings. Falls back to the static CSS gradient when WebGL is unavailable.
 */
export function FlowCanvas({
  seed,
  speed,
  animate,
  paused = false,
  scale,
  className,
  testId,
}: {
  seed: string
  speed: FlowSpeed
  animate: boolean
  paused?: boolean
  /** backing-store pixels per CSS pixel (a soft gradient looks the same at half resolution) */
  scale: number
  className?: string
  testId?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const handle = useRef<FlowHandle | null>(null)
  const [failed, setFailed] = useState(false)
  const reduced = usePrefersReducedMotion()
  const scene = useMemo(() => gradientScene(seed), [seed])
  const moving = animate && !reduced
  const opts = { scene, rate: FLOW_RATE[speed], animate: moving, paused }
  const latest = useRef(opts)
  latest.current = opts

  useEffect(() => {
    if (!ref.current) return
    const h = startFlow(ref.current, latest.current, { scale, fps: 30 })
    if (!h) return setFailed(true)
    handle.current = h
    return () => {
      h.destroy()
      handle.current = null
    }
  }, [scale])

  useEffect(() => {
    handle.current?.update(latest.current)
  }, [scene, speed, moving, paused])

  const data = { 'data-testid': testId, 'data-mode': 'gradient', 'data-seed': seed, 'data-speed': speed, 'data-animated': moving, 'data-paused': paused }
  if (failed) return <div aria-hidden className={className} style={gradientBackground(seed)} data-renderer="css" {...data} />
  return <canvas ref={ref} aria-hidden className={className} data-renderer="webgl" {...data} />
}
