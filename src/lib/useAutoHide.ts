import { useEffect, useRef, useState, type FocusEvent } from 'react'

/** how close to the screen edge the pointer must come to bring the panel out (px) */
export const EDGE = 28
/** how long the panel stays after the pointer leaves it (ms) */
export const HIDE_DELAY = 700

/**
 * A panel that hides at a screen edge (the bottom Dock, the right-edge dock): it comes out when the
 * pointer reaches that edge or focus moves into it, and goes away a moment after the pointer leaves
 * it, leaves the window (e.g. down onto the taskbar) or another app takes focus.
 */
export function useAutoHide(side: 'bottom' | 'right', opts: { initiallyShown?: boolean; onLeaveWindow?: () => void } = {}) {
  const [shown, setShown] = useState(opts.initiallyShown ?? false)
  const over = useRef(false)
  const timer = useRef(0)
  const onLeaveWindow = useRef(opts.onLeaveWindow)
  onLeaveWindow.current = opts.onLeaveWindow

  const hideLater = () => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => !over.current && setShown(false), HIDE_DELAY)
  }

  useEffect(() => {
    // the right edge is measured inside the page's scrollbar, so reaching for it does not count
    const distance = (e: MouseEvent) => (side === 'bottom' ? window.innerHeight - e.clientY : document.documentElement.clientWidth - e.clientX)
    const onMove = (e: MouseEvent) => {
      if (distance(e) <= EDGE) {
        window.clearTimeout(timer.current)
        setShown(true)
      } else if (!over.current) hideLater()
    }
    // no more mouse moves will come once the pointer has left the window: hide now
    const onOut = (e: MouseEvent) => {
      if (e.relatedTarget) return
      over.current = false
      onLeaveWindow.current?.()
      hideLater()
    }
    const onBlur = () => {
      over.current = false
      hideLater()
    }
    if (opts.initiallyShown) hideLater() // shown for a moment, so it is clear where it lives
    window.addEventListener('mousemove', onMove)
    document.addEventListener('mouseout', onOut)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseout', onOut)
      window.removeEventListener('blur', onBlur)
      window.clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once per side
  }, [side])

  const bind = {
    onMouseEnter: () => {
      over.current = true
      window.clearTimeout(timer.current)
      setShown(true)
    },
    onMouseLeave: () => {
      over.current = false
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setShown(false), HIDE_DELAY)
    },
    onFocus: () => setShown(true),
    onBlur: (e: FocusEvent<HTMLElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !over.current) setShown(false)
    },
  }
  return { shown, bind }
}
