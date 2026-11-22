import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** Run an async loader whenever deps change; `reload()` runs it again. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fn().then(
      (data) => alive && setState({ data, loading: false }),
      (error: Error) => alive && setState({ error, loading: false }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { ...state, reload }
}

/** Current time, refreshed at the start of every minute. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let t = 0
    const schedule = () => {
      t = window.setTimeout(() => {
        setNow(new Date())
        schedule()
      }, 60_000 - (Date.now() % 60_000) + 50)
    }
    schedule()
    return () => window.clearTimeout(t)
  }, [])
  return now
}

/**
 * Height that makes an element end where the left navigation ends (viewport bottom − gap),
 * on screens at least `minWidth` wide; undefined (natural height) on narrower screens.
 */
export function useFillToViewport(ref: RefObject<HTMLElement | null>, minWidth = 1280, gap = 16): number | undefined {
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      if (window.innerWidth < minWidth) return setHeight(undefined)
      const top = el.getBoundingClientRect().top + window.scrollY
      setHeight(Math.max(320, Math.floor(window.innerHeight - top - gap)))
    }
    measure()
    // what sits above (page header, notices) can change height, e.g. once fonts load
    const ro = new ResizeObserver(measure)
    for (const sib of Array.from(el.parentElement?.children ?? [])) if (sib !== el) ro.observe(sib)
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [ref, minWidth, gap])
  return height
}
