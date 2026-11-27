import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router'
import { Shell } from './components/Shell'
import { Loading } from './components/ui'
import { useStore } from './data/StoreContext'
import { Admin } from './pages/Admin'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { DailyKanban } from './pages/timesheets/DailyKanban'
import { DailyLog } from './pages/timesheets/DailyLog'
import { GroupTimesheetPage } from './pages/timesheets/GroupTimesheet'
import { LeavePage } from './pages/timesheets/Leave'
import { ProjectsPage } from './pages/timesheets/Projects'
import { TimesheetsLayout } from './pages/timesheets/TimesheetsLayout'
import { WeeklyPlanPage } from './pages/timesheets/WeeklyPlan'
import { takeLinkSignIn } from './lib/authLink'

/** After signing in with an e-mail link (invite, forgotten password): go to Settings to set a password. */
function AfterLinkSignIn() {
  const navigate = useNavigate()
  useEffect(() => {
    if (takeLinkSignIn()) navigate('/settings', { replace: true })
  }, [navigate])
  return null
}

export function App() {
  const { user } = useStore()
  if (user === undefined) return <Loading />

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route
        element={
          <>
            <AfterLinkSignIn />
            <Shell />
          </>
        }
      >
        <Route index element={<Home />} />
        <Route path="timesheets" element={<TimesheetsLayout />}>
          <Route index element={<DailyLog />} />
          <Route path="kanban" element={<DailyKanban />} />
          <Route path="weekly" element={<WeeklyPlanPage />} />
          <Route path="group" element={<GroupTimesheetPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="leave" element={<LeavePage />} />
        </Route>
        <Route path="settings" element={<Settings />} />
        <Route path="admin" element={user.role === 'admin' ? <Admin /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
