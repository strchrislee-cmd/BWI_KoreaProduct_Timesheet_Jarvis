import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createContext, useContext, useMemo } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router'
import { TITLE_CLASS } from '../../components/Shell'
import { ErrorNote, Loading, cx } from '../../components/ui'
import { useStore, useUser } from '../../data/StoreContext'
import { visibleIds, type AccessRequest } from '../../domain/org'
import { sortProjects } from '../../domain/projects'
import { addDays, isoWeek, shortLabel, todayLocal } from '../../domain/time'
import type { GroupProject, MasterImport, Profile, ProjectAlias, WorkType } from '../../domain/types'
import { sortWorkTypes } from '../../domain/workTypes'
import { useAsync } from '../../lib/hooks'
import { useT, type TextKey } from '../../lib/i18n'

interface TimesheetsValue {
  date: string
  setDate: (d: string) => void
  /** The engineer being viewed (yourself unless an admin picked someone). */
  engineer: Profile
  profiles: Profile[]
  /** whose time you may read (Org Chart rules; admins: everyone) */
  visible: Set<string>
  /** access requests you made or received (admins: all) */
  requests: AccessRequest[]
  /** false until migration 0013 (org chart, access requests) has been run on the database */
  orgReady: boolean
  projects: GroupProject[]
  aliases: ProjectAlias[]
  /** MID (중분류) list in the admin's order, hidden ones included */
  workTypes: WorkType[]
  latestImport: MasterImport | null
  reloadMaster: () => void
}

const Ctx = createContext<TimesheetsValue | null>(null)

export function useTimesheets(): TimesheetsValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useTimesheets outside TimesheetsLayout')
  return v
}

// The native date field is wider than its text; size it to the browser's date format
// (11/16/2026, 2026. 11. 16., …) plus the calendar icon, so the header stays on one line.
const DATE_FIELD_WIDTH = `calc(${new Intl.DateTimeFormat(undefined).format(new Date(2026, 10, 16)).length}ch + 2rem)`

const TABS: { to: string; label: TextKey; end?: boolean }[] = [
  { to: '/timesheets', label: 'Daily Log', end: true },
  { to: '/timesheets/kanban', label: 'Daily Kanban' },
  { to: '/timesheets/weekly', label: 'Weekly Result' },
  { to: '/timesheets/group', label: 'Group Timesheet' },
  { to: '/timesheets/projects', label: 'Projects' },
  { to: '/timesheets/leave', label: 'Leave' },
  { to: '/timesheets/org', label: 'Org Chart' },
]

export function TimesheetsLayout() {
  const tr = useT()
  const { store } = useStore()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const { search } = useLocation()
  const date = params.get('date') ?? todayLocal()
  // only admins pick someone here; L1–L3 read the people below them in the Team window / Kanban team row
  const canPickEngineer = user.role === 'admin'

  const master = useAsync(
    () =>
      Promise.all([
        store.listProjects(),
        store.listAliases(),
        store.latestImport(),
        store.listProfiles(),
        store.listWorkTypes(),
        // before migration 0013 there are no requests: everyone reads their own time only
        store.listAccessRequests().then(
          (r) => ({ ok: true, list: r }),
          () => ({ ok: false, list: [] as AccessRequest[] }),
        ),
      ]),
    [store],
  )

  const value = useMemo<TimesheetsValue | null>(() => {
    if (!master.data) return null
    const [projects, aliases, latestImport, profiles, workTypes, requests] = master.data
    const me = profiles.find((p) => p.id === user.id) ?? user
    const visible = visibleIds(me, profiles, requests.list, new Date())
    const engineerId = (canPickEngineer && params.get('eng')) || user.id
    return {
      date,
      setDate: (d) => setParams((p) => (p.set('date', d), p)),
      engineer: profiles.find((p) => p.id === engineerId) ?? user,
      profiles,
      visible,
      requests: requests.list,
      orgReady: requests.ok,
      projects: sortProjects(projects),
      // team aliases + the viewed person's personal ones (theirs decide how their own labels map)
      aliases: aliases.filter((a) => !a.user_id || a.user_id === engineerId),
      workTypes: sortWorkTypes(workTypes),
      latestImport,
      reloadMaster: master.reload,
    }
  }, [master.data, master.reload, date, params, setParams, user, canPickEngineer])

  const { week } = isoWeek(date)

  return (
    <div>
      {/* title, date and tabs on one line (all controls 36px high) to leave room for the 30-min log */}
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <h1 className={TITLE_CLASS}>Timesheets</h1>
        <div className="glass glass-sage flex h-9 items-center gap-0.5 rounded-control px-1 text-sm font-semibold max-md:w-full max-md:justify-between">
          <button aria-label="Previous day" className="rounded-chip p-1 hover:bg-white" onClick={() => value?.setDate(addDays(date, -1))}>
            <ChevronLeft size={16} />
          </button>
          <input
            type="date"
            aria-label="Date"
            value={date}
            onChange={(e) => e.target.value && value?.setDate(e.target.value)}
            className="h-7 bg-transparent px-1 outline-none"
            style={{ width: DATE_FIELD_WIDTH }}
          />
          <span className="pr-1">· {shortLabel(date).slice(0, 3)} · W{week}</span>
          <button aria-label="Next day" className="rounded-chip p-1 hover:bg-white" onClick={() => value?.setDate(addDays(date, 1))}>
            <ChevronRight size={16} />
          </button>
          <button
            className={cx('rounded-chip px-1.5 py-0.5 text-xs font-bold', date === todayLocal() ? 'text-muted' : 'bg-white/70 text-primary hover:bg-white')}
            aria-label="Go to today"
            disabled={date === todayLocal()}
            onClick={() => value?.setDate(todayLocal())}
          >
            {tr('Today')}
          </button>
        </div>
        {/* phones: one row of tabs you can swipe sideways */}
        <nav className="no-scrollbar flex gap-1 max-md:-mx-3 max-md:w-[calc(100%+1.5rem)] max-md:overflow-x-auto max-md:px-3 md:flex-wrap">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={{ pathname: tab.to, search }}
              end={tab.end}
              className={({ isActive }) =>
                cx('flex h-9 shrink-0 items-center rounded-control px-2.5 text-sm font-semibold', isActive ? 'bg-primary text-white shadow-md' : 'glass hover:bg-white/80')
              }
            >
              {tr(tab.label)}
            </NavLink>
          ))}
        </nav>
        {canPickEngineer && value && (
          <select
            aria-label="Engineer"
            className="field !h-9 !rounded-control !py-0 text-sm max-md:!w-full md:ml-auto md:!w-auto"
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
