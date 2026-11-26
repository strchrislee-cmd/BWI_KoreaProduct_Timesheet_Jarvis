import { Clock, House, LogOut, Settings, Shield } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useStore, useUser } from '../data/StoreContext'
import { useT } from '../lib/i18n'
import { BackgroundLayer } from './BackgroundLayer'
import { Dock } from './Dock'
import { ReminderScheduler } from './ReminderScheduler'
import { cx } from './ui'

/** Phones: the navigation is a tab bar at the bottom of the screen. */
function MobileTabBar({ isAdmin }: { isAdmin: boolean }) {
  const tr = useT()
  const items = [
    { to: '/', end: true, icon: <House size={20} />, label: tr('Home') },
    { to: '/timesheets', icon: <Clock size={20} />, label: 'Timesheets' },
    ...(isAdmin ? [{ to: '/admin', icon: <Shield size={20} />, label: tr('Admin') }] : []),
    { to: '/settings', icon: <Settings size={20} />, label: tr('Settings') },
  ]
  return (
    <nav
      aria-label="Mobile navigation"
      className="glass-strong fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-card p-1.5 md:hidden"
      style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          end={i.end}
          className={({ isActive }) =>
            cx(
              'flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-control py-1.5 text-[11px] font-semibold transition-colors',
              isActive ? 'bg-primary text-white' : 'text-ink',
            )
          }
        >
          {i.icon}
          {i.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function Shell() {
  const { store } = useStore()
  const user = useUser()
  const initials = (user.engineer_code || user.name).slice(0, 2).toUpperCase()

  return (
    <div className="flex min-h-full p-3 pb-28 md:p-4">
      <BackgroundLayer />
      <ReminderScheduler />
      {/* PC: the navigation is a dock at the bottom (appears at the bottom edge); phones: tab bar */}
      <Dock />

      <main className="min-w-0 flex-1">
        {/* phones: small top bar (the dock is PC only) */}
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <div className="font-display font-extrabold tracking-tight text-primary">TeamEmbedded</div>
          <div className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-sage text-xs font-bold text-primary" title={user.name}>
            {initials}
          </div>
          {store.mode === 'supabase' && (
            <button onClick={() => void store.signOut()} aria-label="Sign out" className="rounded-control p-1.5 text-muted hover:bg-sage-light">
              <LogOut size={16} />
            </button>
          )}
        </div>
        {store.mode === 'demo' && (
          <div className="glass mb-3 rounded-control px-4 py-2 text-sm text-[#9a3a0e]">
            <strong>Demo mode</strong>
            <span className="hidden md:inline"> — Supabase is not configured, so data is saved in this browser only. See README → Setup.</span>
            <span className="md:hidden"> — saved in this browser only</span>
          </div>
        )}
        <Outlet />
      </main>
      <MobileTabBar isAdmin={user.role === 'admin'} />
    </div>
  )
}

export const TITLE_CLASS = 'text-on-glass font-display text-3xl font-extrabold tracking-tight md:text-4xl'

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className={TITLE_CLASS}>{children}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
