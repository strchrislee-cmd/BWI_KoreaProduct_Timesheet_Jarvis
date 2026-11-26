import { Clock, House, LogOut, Settings, Shield } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useStore, useUser } from '../data/StoreContext'
import { roleLabel } from '../domain/roles'
import { useT } from '../lib/i18n'
import { useAutoHide } from '../lib/useAutoHide'
import { cx } from './ui'

/** icon box size at rest (px); hovered icons grow in the layout, so neighbours move aside */
const ICON = 48

interface DockItem {
  to: string
  end?: boolean
  icon: ReactNode
  label: string
  /** the god's name under the label */
  sub: string
}

/**
 * Desktop navigation: a floating dock at the bottom center (like the macOS / iOS Dock).
 * Hidden until the pointer reaches the bottom edge (or a key focuses it); the hovered icon and
 * its neighbours grow, and a label (name · god) shows above it. Phones keep the tab bar.
 */
export function Dock() {
  const { store } = useStore()
  const user = useUser()
  const tr = useT()
  const { pathname } = useLocation()
  const [hovered, setHovered] = useState<number | null>(null)
  // shown for a moment on load, so it is clear where the menu went
  const { shown, bind } = useAutoHide('bottom', { initiallyShown: true, onLeaveWindow: () => setHovered(null) })

  const items: DockItem[] = [
    { to: '/', end: true, icon: <House size={24} />, label: tr('Home'), sub: 'Olympus' },
    { to: '/timesheets', icon: <Clock size={24} />, label: 'Timesheets', sub: 'Chronos' },
    ...(user.role === 'admin' ? [{ to: '/admin', icon: <Shield size={24} />, label: tr('Admin'), sub: 'Zeus' }] : []),
    { to: '/settings', icon: <Settings size={24} />, label: tr('Settings'), sub: 'Hephaestus' },
  ]

  const scale = (i: number) => (hovered === null ? 1 : i === hovered ? 1.35 : Math.abs(i - hovered) === 1 ? 1.15 : 1)
  const initials = (user.engineer_code || user.name).slice(0, 2).toUpperCase()

  return (
    <div className="te-dock-root pointer-events-none fixed inset-x-0 bottom-0 z-40 hidden justify-center md:flex">
      {/* always-visible hint of where the dock lives */}
      <div aria-hidden className={cx('absolute bottom-1.5 h-1.5 w-24 rounded-full bg-black/20 transition-opacity', shown ? 'opacity-0' : 'opacity-100')} />
      <nav
        aria-label="Dock"
        data-testid="dock"
        data-shown={shown}
        className={cx(
          'glass-strong pointer-events-auto mb-3 flex items-end gap-1.5 rounded-[22px] px-3 pb-2 pt-2 shadow-xl transition-all duration-300 ease-out',
          shown ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%+12px)] opacity-0',
        )}
        onMouseEnter={bind.onMouseEnter}
        onMouseLeave={() => {
          setHovered(null)
          bind.onMouseLeave()
        }}
        onFocus={bind.onFocus}
        onBlur={bind.onBlur}
      >
        <div className="mr-1 self-center pr-2 text-left leading-tight">
          <div className="font-display text-sm font-extrabold tracking-tight text-primary">TeamEmbedded</div>
          <div className="text-[10px] text-muted">Gods of Team Embedded</div>
        </div>
        {items.map((it, i) => {
          const active = it.end ? pathname === it.to : pathname.startsWith(it.to)
          const size = Math.round(ICON * scale(i))
          return (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              aria-label={`${it.label} · ${it.sub}`}
              className="group relative flex flex-col items-center"
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
            >
              <span
                role="tooltip"
                className={cx(
                  'pointer-events-none absolute whitespace-nowrap rounded-chip bg-ink/85 px-2 py-1 text-center text-xs font-semibold leading-tight text-white transition-opacity',
                  hovered === i ? 'opacity-100' : 'opacity-0',
                )}
                style={{ bottom: `calc(100% + ${size - ICON + 8}px)` }}
              >
                {it.label}
                <span className="block text-[10px] font-normal opacity-75">{it.sub}</span>
              </span>
              {/* grows upward past the dock (negative top margin keeps the dock's height) and sideways in
                  the layout, so the neighbours move aside instead of being covered */}
              <span
                className={cx(
                  'flex items-center justify-center rounded-[14px] shadow-sm transition-all duration-150 ease-out',
                  active ? 'bg-primary text-white' : 'bg-white/80 text-ink',
                )}
                style={{ width: size, height: size, marginTop: ICON - size }}
                data-dock-icon
              >
                <span className="transition-transform duration-150 ease-out" style={{ transform: `scale(${scale(i)})` }}>
                  {it.icon}
                </span>
              </span>
              <span className={cx('mt-1 h-1 w-1 rounded-full', active ? 'bg-primary' : 'bg-transparent')} />
            </NavLink>
          )
        })}
        <span aria-hidden className="mx-1 h-10 w-px self-center bg-black/10" />
        <div className="flex items-center gap-2 self-center pl-1" title={`${user.name} · ${roleLabel(user.role)}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sage text-xs font-bold text-primary">{initials}</span>
          <span className="leading-tight">
            <span className="block max-w-28 truncate text-sm font-semibold">{user.name}</span>
            <span className="block text-[11px] text-muted">{roleLabel(user.role)}</span>
          </span>
          {store.mode === 'supabase' && (
            <button onClick={() => void store.signOut()} aria-label="Sign out" className="rounded-control p-1.5 text-muted hover:bg-black/5">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </nav>
    </div>
  )
}
