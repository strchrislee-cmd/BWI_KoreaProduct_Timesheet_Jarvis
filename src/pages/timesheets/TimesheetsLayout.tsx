import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { TITLE_CLASS } from '../../components/Shell'
import { ErrorNote, Loading, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { sortProjects } from '../../domain/projects'
import { addDays, isoWeek, shortLabel, todayLocal } from '../../domain/time'
import type { GroupProject, MasterImport, Profile, ProjectAlias } from '../../domain/types'
import { useAsync } from '../../lib/hooks'

interface TimesheetsValue {
  date: string
  setDate: (d: string) => void
  /** The engineer being viewed (yourself unless an admin/viewer picked someone). */
  engineer: Profile
  profiles: Profile[]
  projects: GroupProject[]
  aliases: ProjectAlias[]
  latestImport: MasterImport | null
  reloadMaster: () => void
}

const Ctx = createContext<TimesheetsValue | null>(null)

export function useTimesheets(): TimesheetsValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTimesheets outside TimesheetsLayout')
  return v
}

const TABS = [
  { to: '/timesheets', label: 'Daily Log', end: true },
  { to: '/timesheets/weekly', label: 'Weekly Plan' },
  { to: '/timesheets/group', label: 'Group Timesheet' },
  { to: '/timesheets/projects', label: 'Projects' },
  { to: '/timesheets/leave', label: 'Leave' },
]

export function TimesheetsLayout() {
  const { store } = useStore()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const date = params.get('date') ?? todayLocal()
  const canPickEngineer = user.role === 'admin' || user.role === 'viewer'

  const master = useAsync(
    () => Promise.all([store.listProjects(), store.listAliases(), store.latestImport(), store.listProfiles()]),
    [store],
  )

  const value = useMemo<TimesheetsValue | null>(() => {
    if (!master.data) return null
    const [projects, aliases, latestImport, profiles] = master.data
    const engineerId = (canPickEngineer && params.get('eng')) || user.id
    return {
      date,
      setDate: (d) => setParams((p) => (p.set('date', d), p)),
      engineer: profiles.find((p) => p.id === engineerId) ?? user,
      profiles,
      projects: sortProjects(projects),
      aliases,
      latestImport,
      reloadMaster: master.reload,
    }
  }, [master.data, master.reload, date, params, setParams, user, canPickEngineer])

  const { week } = isoWeek(date)

  return (
    <div>
      {/* title, date and tabs on one line (all controls 36px high) to leave room for the 30-min log */}
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className={TITLE_CLASS}>Timesheets</h1>
        <div className="glass glass-sage flex h-9 items-center gap-0.5 rounded-control px-1 text-sm font-semibold">
          <button aria-label="Previous day" className="rounded-chip p-1 hover:bg-white" onClick={() => value?.setDate(addDays(date, -1))}>
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => e.target.value && value?.setDate(e.target.value)}
            className="h-7 bg-transparent px-1 outline-none"
          />
          <span className="pr-1">· {shortLabel(date).slice(0, 3)} · W{week}</span>
          <button aria-label="Next day" className="rounded-chip p-1 hover:bg-white" onClick={() => value?.setDate(addDays(date, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={{ pathname: t.to, search }}
              end={t.end}
              className={({ isActive }) =>
                cx('flex h-9 items-center rounded-control px-3.5 text-sm font-semibold', isActive ? 'bg-primary text-white shadow-md' : 'glass hover:bg-white/80')
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        {canPickEngineer && value && (
          <select
            aria-label="Engineer"
            className="field ml-auto !h-9 !w-auto !rounded-control !py-0 text-sm"
            value={value.engineer.id}
            onChange={(e) => setParams((p) => (p.set('eng', e.target.value), p))}
          >
            {value.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.engineer_code && `(${p.engineer_code})`}
              </option>
            ))}
          </select>
        )}
      </div>
      <ErrorNote error={master.error} />
      {value ? (
        <Ctx.Provider value={value}>
          <Outlet />
        </Ctx.Provider>
      ) : (
        !master.error && <Loading />
      )}
    </div>
  )
}
