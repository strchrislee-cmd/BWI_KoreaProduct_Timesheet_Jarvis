import { GripVertical, PanelRightClose } from 'lucide-react'
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { clampPos, dropTarget, readFloat, saveFloat, type FloatPos } from '../lib/dockable'
import { cx } from './ui'

const DEFAULT_SIZE = { w: 340, h: 200 }

/**
 * A card that can be pulled out of its column and float over the page (drag its title bar).
 * Released near the right edge it snaps back into its place, like a magnet; the dock button does
 * the same. Where it floats is remembered in this browser. Phones: always docked.
 */
export function DockablePanel({
  storageKey,
  title,
  children,
  testId,
  action,
}: {
  storageKey: string
  title: string
  children: ReactNode
  testId?: string
  /** a button in the title bar (it does not start a drag) */
  action?: ReactNode
}) {
  const [floating, setFloating] = useState<FloatPos | null>(() => readFloat(storageKey))
  const [drag, setDrag] = useState<(FloatPos & { near: boolean }) | null>(null)
  const ref = useRef<HTMLElement>(null)
  const size = useRef(DEFAULT_SIZE)

  // the docked card unmounts when the drag starts, so follow the pointer on the window
  function onPointerDown(e: ReactPointerEvent<HTMLElement>) {
    if (e.button !== 0 || !ref.current || window.matchMedia('(max-width: 767px)').matches) return
    e.preventDefault()
    const r = ref.current.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    size.current = { w: r.width, h: r.height }
    setDrag({ x: r.left, y: r.top, near: false })
    const move = (ev: PointerEvent) => setDrag({ x: ev.clientX - dx, y: ev.clientY - dy, near: dropTarget(ev.clientX, window.innerWidth) === 'dock' })
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const next =
        dropTarget(ev.clientX, window.innerWidth) === 'dock'
          ? null
          : clampPos({ x: ev.clientX - dx, y: ev.clientY - dy }, size.current, { w: window.innerWidth, h: window.innerHeight })
      setFloating(next)
      saveFloat(storageKey, next)
      setDrag(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const dock = () => {
    setFloating(null)
    saveFloat(storageKey, null)
  }

  const out = drag ?? floating // shown as a floating window
  const pos = drag ?? (floating && clampPos(floating, size.current, { w: window.innerWidth, h: window.innerHeight }))

  const header = (
    <header
      className={cx('mb-3 flex items-center gap-2 md:touch-none md:select-none', drag ? 'md:cursor-grabbing' : 'md:cursor-grab')}
      onPointerDown={onPointerDown}
      title="끌어서 떼어 내기 · 오른쪽 끝에 놓으면 다시 붙습니다"
      data-testid={testId && `${testId}-handle`}
    >
      <GripVertical size={16} className="-ml-1 text-muted max-md:hidden" aria-hidden />
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {action && (
        <span className="ml-auto" onPointerDown={(e) => e.stopPropagation()}>
          {action}
        </span>
      )}
      {out && !drag && (
        <button
          aria-label="Dock to the right"
          title="오른쪽에 다시 붙이기"
          className={cx('rounded-control p-1 text-muted hover:bg-black/5', !action && 'ml-auto')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={dock}
        >
          <PanelRightClose size={16} />
        </button>
      )}
    </header>
  )

  return (
    <>
      {out ? (
        // its place in the column while dragging: lights up when a drop would dock it
        drag && (
          <div
            aria-hidden
            data-testid={testId && `${testId}-slot`}
            data-near={drag.near}
            className={cx('rounded-card border-2 border-dashed transition-colors max-md:hidden', drag.near ? 'border-primary bg-primary/10' : 'border-black/15')}
            style={{ height: size.current.h }}
          />
        )
      ) : (
        <section ref={ref} className="glass min-w-0 rounded-card p-4 md:p-5" data-testid={testId} data-docked="true">
          {header}
          {children}
        </section>
      )}
      {out &&
        pos &&
        createPortal(
          <>
            {drag?.near && <div aria-hidden className="pointer-events-none fixed inset-y-0 right-0 z-40 w-24 bg-gradient-to-l from-primary/25 to-transparent" />}
            <section
              ref={ref}
              role="dialog"
              aria-label={title}
              data-testid={testId}
              data-docked="false"
              className={cx('glass-strong fixed z-40 min-w-0 rounded-card p-4 shadow-2xl md:p-5', drag && 'opacity-95')}
              style={{ left: pos.x, top: pos.y, width: size.current.w }}
            >
              {header}
              {children}
            </section>
          </>,
          document.body,
        )}
    </>
  )
}
