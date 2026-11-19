import { useRef, useState, type PointerEvent, type RefObject } from 'react'

export interface DragState {
  group: string
  from: number
  over: number
}

/**
 * Pointer-based drag reordering (works for vertical lists and wrapped chip rows).
 * Items are the elements with `data-reorder="<group>"` inside the container, in DOM order.
 * threshold 0 = start dragging immediately (handles); > 0 = the item is also clickable.
 */
export function useDragReorder(container: RefObject<HTMLElement | null>, onDrop: (group: string, from: number, to: number) => void, threshold = 0) {
  const [state, setState] = useState<DragState | null>(null)
  const live = useRef<DragState | null>(null)
  const start = useRef<{ x: number; y: number; group: string; index: number } | null>(null)
  const dragged = useRef(false)

  const set = (s: DragState | null) => {
    live.current = s
    setState(s)
  }

  function nearest(group: string, x: number, y: number): number {
    const els = Array.from(container.current?.querySelectorAll<HTMLElement>(`[data-reorder="${group}"]`) ?? [])
    let best = 0
    let bestD = Infinity
    els.forEach((el, i) => {
      const r = el.getBoundingClientRect()
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2))
      if (d < bestD) [best, bestD] = [i, d]
    })
    return best
  }

  function bind(group: string, index: number) {
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        if (e.button !== 0) return
        if (threshold === 0) e.preventDefault()
        start.current = { x: e.clientX, y: e.clientY, group, index }
        dragged.current = false
        if (threshold === 0) {
          e.currentTarget.setPointerCapture(e.pointerId)
          set({ group, from: index, over: index })
        }
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        const s = start.current
        if (!s) return
        if (!live.current) {
          if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < threshold) return
          e.currentTarget.setPointerCapture(e.pointerId)
          set({ group: s.group, from: s.index, over: s.index })
        }
        const over = nearest(s.group, e.clientX, e.clientY)
        if (over !== live.current?.over) set({ group: s.group, from: s.index, over })
      },
      onPointerUp: () => {
        const d = live.current
        start.current = null
        if (!d) return
        dragged.current = true
        set(null)
        if (d.over !== d.from) onDrop(d.group, d.from, d.over)
      },
      onPointerCancel: () => {
        start.current = null
        set(null)
      },
    }
  }

  /** True right after a drag ended (use it to swallow the click that follows). */
  const consumeDragged = () => {
    const d = dragged.current
    dragged.current = false
    return d
  }

  return { state, bind, consumeDragged }
}
