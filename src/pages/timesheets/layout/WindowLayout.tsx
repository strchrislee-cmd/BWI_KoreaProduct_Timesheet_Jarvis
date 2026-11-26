import { GripVertical, Info, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../../components/ui'
import { DEFAULT_LAYOUT, type LayoutPrefs } from '../../../data/preferences'
import { PANEL_IDS, dropTarget, moveRect, resizeRect, snapRect, type PanelId, type PanelRect, type PanelRects, type SidePanelId } from '../../../lib/layout'
import { useAutoHide } from '../../../lib/useAutoHide'

/** the pointer must move this far before a press on a title bar becomes a move (px) */
const DRAG_THRESHOLD = 4
const SIDE_DEFAULT = { w: 336, h: 264 }

export interface WindowLayout {
  /** false on phones: the windows keep their places */
  enabled: boolean
  /** windows sit on the dot grid at their own place and size (a saved layout, or while editing) */
  canvas: boolean
  editing: boolean
  /** current layout: the draft while editing, the saved one otherwise */
  cur: LayoutPrefs
  rects: PanelRects | null
  /** window being moved or resized */
  active: PanelId | null
  /** the window moved or resized last stays on top of the others */
  front: PanelId | null
  /** a side window is over the right edge and would go to the right-edge dock */
  near: boolean
  register: (id: PanelId) => (el: HTMLElement | null) => void
  startMove: (id: PanelId, e: ReactPointerEvent<HTMLElement>) => void
  startResize: (id: PanelId, e: ReactPointerEvent<HTMLElement>) => void
  beginEdit: () => void
  save: () => void
  cancel: () => void
  reset: () => void
  setMagnet: (on: boolean) => void
  /** put a side window in the right-edge dock, or take it out (saved at once unless editing) */
  setEdge: (id: SidePanelId, on: boolean) => void
}

/**
 * Moving and resizing the Daily Log windows. Dragging a title bar (or 배치 편집) starts editing: the
 * page shows a dot grid, the windows jiggle and snap to the grid, and a toast asks to save, cancel
 * or go back to the default arrangement. The layout is saved per user (profiles.preferences).
 */
export function useWindowLayout({
  saved,
  onSave,
  page,
  enabled,
}: {
  saved: LayoutPrefs
  onSave: (next: LayoutPrefs) => void
  page: RefObject<HTMLElement | null>
  enabled: boolean
}): WindowLayout {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<LayoutPrefs>(saved)
  const draftRef = useRef(draft)
  const [active, setActive] = useState<PanelId | null>(null)
  const [front, setFront] = useState<PanelId | null>(null)
  const [near, setNear] = useState(false)
  const els = useRef(new Map<PanelId, HTMLElement>())

  // Saving goes to the user's profile and comes back a moment later. Until it does, keep showing
  // what was just arranged; otherwise the old layout flashes before the new one appears.
  const [pending, setPending] = useState<LayoutPrefs | null>(null)
  useEffect(() => setPending(null), [saved])
  const shown = pending ?? saved
  const cur = editing ? draft : shown
  const commit = (next: LayoutPrefs) => {
    setPending(next)
    onSave(next)
  }
  const update = (next: LayoutPrefs) => {
    draftRef.current = next
    setDraft(next)
  }

  const register = useCallback(
    (id: PanelId) => (el: HTMLElement | null) => {
      if (el) els.current.set(id, el)
      else els.current.delete(id)
    },
    [],
  )

  /** Where the windows are now (saved rects, or measured from the default arrangement), on the grid. */
  function startingRects(): PanelRects {
    if (shown.rects) return shown.rects
    const box = page.current?.getBoundingClientRect()
    const width = page.current?.clientWidth ?? 1200
    const out = {} as PanelRects
    let sideY = 0
    for (const id of PANEL_IDS) {
      const el = els.current.get(id)
      const inPage = el && box && page.current?.contains(el)
      if (inPage) {
        const r = el.getBoundingClientRect()
        out[id] = snapRect({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height }, id)
      } else {
        // in the right-edge dock: its place on the grid is the right column
        out[id] = snapRect({ x: width - SIDE_DEFAULT.w, y: sideY, ...SIDE_DEFAULT }, id)
      }
      if (id !== 'log') sideY = out[id].y + out[id].h + 24
    }
    return out
  }

  function enterEdit(): LayoutPrefs {
    const next = { ...shown, rects: startingRects() }
    update(next)
    setEditing(true)
    return next
  }

  function track(onMove: (dx: number, dy: number, ev: PointerEvent) => void, onUp: (ev: PointerEvent, moved: boolean) => void, e: ReactPointerEvent) {
    const x0 = e.clientX
    const y0 = e.clientY
    let moved = false
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - x0
      const dy = ev.clientY - y0
      if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      moved = true
      onMove(dx, dy, ev)
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      onUp(ev, moved)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const setRect = (id: PanelId, rect: PanelRect) => update({ ...draftRef.current, rects: { ...draftRef.current.rects!, [id]: rect } })

  function startMove(id: PanelId, e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || e.button !== 0) return
    e.preventDefault()
    const el = els.current.get(id)
    const box = page.current?.getBoundingClientRect()
    if (!el || !box) return
    const side = id !== 'log'
    const fromEdge = side && cur.edge[id as SidePanelId]
    const er = el.getBoundingClientRect()
    const grab = { x: e.clientX - er.left, y: e.clientY - er.top }
    let start: PanelRect | null = null
    track(
      (dx, dy, ev) => {
        if (!start) {
          let d = editing ? draftRef.current : enterEdit()
          if (fromEdge) {
            // pulled out of the right-edge dock: it lands on the grid under the pointer
            const r = d.rects![id]
            d = { ...d, edge: { ...d.edge, [id]: false }, rects: { ...d.rects!, [id]: { ...r, x: ev.clientX - box.left - grab.x - dx, y: ev.clientY - box.top - grab.y - dy } } }
            update(d)
          }
          start = d.rects![id]
          setActive(id)
          setFront(id)
        }
        setRect(id, moveRect(start, dx, dy, page.current?.clientWidth ?? 1200))
        if (side) setNear(dropTarget(ev.clientX, document.documentElement.clientWidth, draftRef.current.magnet) === 'edge')
      },
      (ev, moved) => {
        if (moved && side && dropTarget(ev.clientX, document.documentElement.clientWidth, draftRef.current.magnet) === 'edge') {
          update({ ...draftRef.current, edge: { ...draftRef.current.edge, [id]: true } })
        }
        setActive(null)
        setNear(false)
      },
      e,
    )
  }

  function startResize(id: PanelId, e: ReactPointerEvent<HTMLElement>) {
    if (!enabled || !editing || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = draftRef.current.rects![id]
    setActive(id)
    setFront(id)
    track(
      (dx, dy) => setRect(id, resizeRect(id, start, dx, dy, page.current?.clientWidth ?? 1200)),
      () => setActive(null),
      e,
    )
  }

  return {
    enabled,
    canvas: enabled && (editing || shown.rects !== null),
    editing,
    cur,
    rects: cur.rects,
    active,
    front,
    near,
    register,
    startMove,
    startResize,
    beginEdit: () => enabled && !editing && enterEdit(),
    save: () => {
      commit(draftRef.current)
      setEditing(false)
    },
    cancel: () => setEditing(false),
    reset: () => {
      commit({ ...DEFAULT_LAYOUT })
      setEditing(false)
    },
    setMagnet: (on) => update({ ...draftRef.current, magnet: on }),
    setEdge: (id, on) => {
      if (editing) update({ ...draftRef.current, edge: { ...draftRef.current.edge, [id]: on } })
      else commit({ ...shown, edge: { ...shown.edge, [id]: on } })
    },
  }
}

/** One window: in the normal page flow, or at its own place and size on the dot grid. */
export function LayoutWindow({ id, layout, children, flowClassName }: { id: PanelId; layout: WindowLayout; children: ReactNode; flowClassName?: string }) {
  if (!layout.canvas || !layout.rects) {
    return (
      <div ref={layout.register(id)} className={cx('min-w-0', flowClassName)} data-window={id}>
        {children}
      </div>
    )
  }
  const r = layout.rects[id]
  const moving = layout.active === id
  return (
    <div
      ref={layout.register(id)}
      data-window={id}
      data-jiggle={layout.editing && !moving}
      className={cx('absolute min-w-0', layout.editing && !moving && 'te-jiggle', moving ? 'z-30 drop-shadow-2xl' : layout.front === id ? 'z-[2]' : 'z-[1]')}
      style={{ left: r.x, top: r.y, width: r.w, height: r.h, animationDelay: `${PANEL_IDS.indexOf(id) * -0.07}s` }}
    >
      {children}
      {layout.editing && (
        <div
          role="separator"
          aria-label={`Resize ${id}`}
          title="끌어서 크기 조절"
          data-testid={`${id}-resize`}
          className="absolute -bottom-1 -right-1 z-10 flex h-6 w-6 cursor-nwse-resize touch-none items-end justify-end rounded-br-card p-1"
          onPointerDown={(e) => layout.startResize(id, e)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className="text-primary">
            <path d="M11 3 3 11M11 7 7 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  )
}

/** Today / quick tasks: a card whose title bar moves it and whose button sends it to the right-edge dock. */
export function SidePanel({
  id,
  layout,
  title,
  testId,
  actions,
  children,
}: {
  id: SidePanelId
  layout: WindowLayout
  title: string
  testId: string
  actions?: ReactNode
  children: ReactNode
}) {
  const inEdge = layout.enabled && layout.cur.edge[id]
  const fixedSize = layout.canvas && !inEdge
  return (
    <section
      className={cx('glass @container min-w-0 rounded-card p-4 md:p-5', fixedSize && 'h-full overflow-auto')}
      data-testid={testId}
      data-place={inEdge ? 'edge' : layout.canvas ? 'grid' : 'column'}
    >
      <header
        className={cx('mb-3 flex items-center gap-2', layout.enabled && 'cursor-grab touch-none select-none', layout.active === id && 'cursor-grabbing')}
        onPointerDown={(e) => layout.startMove(id, e)}
        title={layout.enabled ? '끌어서 옮기기 · 오른쪽 끝에 놓으면 오른쪽 Dock으로' : undefined}
        data-testid={`${testId}-handle`}
      >
        {layout.enabled && <GripVertical size={16} className="-ml-1 shrink-0 text-muted" aria-hidden />}
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <span className="ml-auto flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {actions}
          {layout.enabled && (
            <button
              type="button"
              aria-label={inEdge ? `Take ${title} out of the right dock` : `Put ${title} in the right dock`}
              title={inEdge ? '오른쪽 Dock에서 꺼내기' : '오른쪽 Dock에 넣기 (평소엔 숨고 마우스를 오른쪽 끝에 가져가면 나타남)'}
              className="rounded-control p-1 text-muted hover:bg-black/5"
              onClick={() => layout.setEdge(id, !inEdge)}
            >
              {inEdge ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}
            </button>
          )}
        </span>
      </header>
      {children}
    </section>
  )
}

/** The dots shown behind the windows while editing (every GRID px). */
export function DotGrid() {
  return <div aria-hidden data-testid="dot-grid" className="te-dot-grid pointer-events-none absolute inset-0 z-0 rounded-card" />
}

/** Right edge highlight while a side window would drop into the right-edge dock. */
export function EdgeDropHint() {
  return createPortal(
    <div aria-hidden data-testid="edge-drop-hint" className="pointer-events-none fixed inset-y-0 right-0 z-40 flex w-28 items-center justify-end bg-gradient-to-l from-primary/30 to-transparent pr-2">
      <span className="rounded-chip bg-primary px-2 py-1 text-xs font-semibold text-white shadow">오른쪽 Dock</span>
    </div>,
    document.body,
  )
}

/** The 배치를 저장하겠습니까? bar: one small line at the very bottom, so it does not get in the way. */
export function LayoutToast({ layout }: { layout: WindowLayout }) {
  // the bottom Dock would come up under the bar: keep it hidden while editing
  useEffect(() => {
    document.body.dataset.layoutEditing = 'true'
    return () => {
      delete document.body.dataset.layoutEditing
    }
  }, [])
  const btn = 'rounded-control px-2.5 py-1 text-xs font-semibold'
  return createPortal(
    <div
      role="dialog"
      aria-label="Save layout"
      data-testid="layout-toast"
      className="glass-strong fixed bottom-2 left-1/2 z-50 flex max-w-[calc(100vw-16px)] -translate-x-1/2 flex-wrap items-center gap-x-3 gap-y-1 whitespace-nowrap rounded-full py-1 pl-4 pr-1.5 text-xs shadow-xl"
    >
      <span className="font-semibold">배치를 저장하겠습니까?</span>
      <span title="제목줄을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿉니다. 점 간격에 맞춰 놓입니다." className="text-muted">
        <Info size={13} aria-label="도움말" />
      </span>
      <label className="flex cursor-pointer items-center gap-1" title="Today · 빠른 등록을 오른쪽 끝에 놓으면 오른쪽 Dock으로">
        <input type="checkbox" checked={layout.cur.magnet} onChange={(e) => layout.setMagnet(e.target.checked)} />
        자석처럼 붙이기
      </label>
      <span className="flex items-center gap-1">
        <button type="button" className={cx(btn, 'text-muted hover:bg-black/5')} onClick={layout.reset}>
          기본 설정으로
        </button>
        <button type="button" className={cx(btn, 'border border-primary/30 bg-white/70 text-primary hover:bg-white')} onClick={layout.cancel}>
          취소
        </button>
        <button type="button" className={cx(btn, 'bg-primary text-white hover:opacity-90')} onClick={layout.save}>
          저장
        </button>
      </span>
    </div>,
    document.body,
  )
}

/**
 * The right-edge dock: windows put there stay out of the way and slide in when the pointer reaches
 * the right edge of the screen, like the bottom Dock.
 */
export function EdgeDock({ children }: { children: ReactNode }) {
  const { shown, bind } = useAutoHide('right', { initiallyShown: true })
  return createPortal(
    <div className="pointer-events-none fixed inset-y-0 right-0 z-40 hidden items-center md:flex">
      <div aria-hidden className={cx('absolute right-1.5 top-1/2 h-24 w-1.5 -translate-y-1/2 rounded-full bg-black/20 transition-opacity', shown ? 'opacity-0' : 'opacity-100')} />
      <aside
        aria-label="Right dock"
        data-testid="edge-dock"
        data-shown={shown}
        className={cx(
          'pointer-events-auto mr-3 flex max-h-[calc(100vh-24px)] w-[352px] flex-col gap-3 overflow-y-auto rounded-card transition-all duration-300 ease-out',
          shown ? 'translate-x-0 opacity-100' : 'translate-x-[calc(100%+12px)] opacity-0',
        )}
        {...bind}
      >
        {children}
      </aside>
    </div>,
    document.body,
  )
}

