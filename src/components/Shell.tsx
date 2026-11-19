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
          'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-colors',
          isActive ? 'bg-primary text-white shadow-md' : 'text-ink hover:bg-white/60',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

export function Shell() {
  const { store } = useStore()
  const user = useUser()

  return (
    <div className="flex min-h-full gap-5 p-4">
      <BackgroundLayer />
      <ReminderScheduler />
      <nav className="glass sticky top-4 flex h-[calc(100vh-2rem)] w-[168px] shrink-0 flex-col rounded-[var(--radius-card)] p-3">
        <div className="mb-6 flex items-start gap-2 px-1 pt-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-white">J</div>
          <div>
            <div className="font-extrabold tracking-tight text-primary">JARVIS</div>
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
            {(user.engineer_code || user.name).slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-[11px] text-muted">{user.role}</div>
          </div>
          {store.mode === 'supabase' && (
            <button onClick={() => void store.signOut()} aria-label="Sign out" className="rounded-full p-1 text-muted hover:bg-sage-light">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </nav>

      <main className="min-w-0 flex-1">
        {store.mode === 'demo' && (
          <div className="glass mb-3 rounded-2xl px-4 py-2 text-sm text-[#9a3a0e]">
            <strong>Demo mode</strong> — Supabase is not configured, so data is saved in this browser only. See README → Setup.
          </div>
        )}
        <Outlet />
      </main>
    </div>
  )
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-on-glass text-4xl font-extrabold tracking-tight">{children}</h1>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
