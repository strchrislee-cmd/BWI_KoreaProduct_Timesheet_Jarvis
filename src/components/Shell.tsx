import { Clock, House, LogOut, Settings, Shield } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useStore, useUser } from '../data/StoreContext'
import { BackgroundLayer } from './BackgroundLayer'
import { ReminderScheduler } from './ReminderScheduler'
import { cx } from './ui'

function NavItem({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive ? 'bg-primary text-white shadow-md' : 'text-ink hover:bg-white/60',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

/** Phones: the left navigation moves to a tab bar at the bottom of the screen. */
function MobileTabBar({ isAdmin }: { isAdmin: boolean }) {
  const items = [
    { to: '/', end: true, icon: <House size={20} />, label: 'Home' },
    { to: '/timesheets', icon: <Clock size={20} />, label: 'Timesheets' },
    ...(isAdmin ? [{ to: '/admin', icon: <Shield size={20} />, label: 'Admin' }] : []),
    { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
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
    <div className="flex min-h-full gap-5 p-3 pb-28 md:p-4">
      <BackgroundLayer />
      <ReminderScheduler />
      <nav className="glass sticky top-4 hidden h-[calc(100vh-2rem)] w-[168px] shrink-0 flex-col rounded-card p-3 md:flex">
        <div className="mb-6 flex items-start gap-2 px-1 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-chip bg-primary text-sm font-bold text-white">T</div>
          <div>
            <div className="font-display font-extrabold tracking-tight text-primary">TimeCrumbs</div>
            <div className="text-[11px] leading-tight text-muted">Internal Groupware Assistant</div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <NavItem to="/" end icon={<House size={18} />} label="Home" />
          <NavItem to="/timesheets" icon={<Clock size={18} />} label="Timesheets" />
        </div>
        <div className="mt-auto flex flex-col gap-1 border-t border-dashed border-black/10 pt-3">
          {user.role === 'admin' && <NavItem to="/admin" icon={<Shield size={18} />} label="Admin" />}
          <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
        </div>
        <div className="mt-3 flex items-center gap-2 border-t border-dashed border-black/10 px-1 pt-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage text-xs font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-[11px] text-muted">{user.role}</div>
          </div>
          {store.mode === 'supabase' && (
            <button onClick={() => void store.signOut()} aria-label="Sign out" className="rounded-control p-1 text-muted hover:bg-sage-light">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </nav>

      <main className="min-w-0 flex-1">
        {/* phones: small top bar instead of the side navigation */}
        <div className="mb-3 flex items-center gap-2 md:hidden">
          <div className="flex h-8 w-8 items-center justify-center rounded-chip bg-primary text-sm font-bold text-white">T</div>
          <div className="font-display font-extrabold tracking-tight text-primary">TimeCrumbs</div>
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
