import './index.css'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import NewRequest    from './pages/NewRequest'
import Validate      from './pages/Validate'
import Requests      from './pages/Requests'
import Notifications from './pages/Notifications'
import Calendar      from './pages/Calendar'
import Team          from './pages/Team'
import Users         from './pages/Users'
import LeaveTypes    from './pages/LeaveTypes'
import Holidays      from './pages/Holidays'
import Stats         from './pages/Stats'
import AuditLogs     from './pages/AuditLogs'
import Projects      from './pages/Projects'
import AdminPanel    from './pages/AdminPanel'
import Layout        from './components/Layout'
import useAuthStore  from './store/authStore'
import { canAccess } from './navigation'

// Connecté ET rôle autorisé pour cette page ; sinon retour au tableau de bord
function Page({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const { pathname } = useLocation()
  if (!user) return <Navigate to="/login" replace />
  if (!canAccess(user.role, pathname)) return <Navigate to="/dashboard" replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"         element={<Login />} />
        <Route path="/dashboard"     element={<Page><Dashboard /></Page>} />
        <Route path="/new-request"   element={<Page><NewRequest /></Page>} />
        <Route path="/validate"      element={<Page><Validate /></Page>} />
        <Route path="/requests"      element={<Page><Requests /></Page>} />
        <Route path="/notifications" element={<Page><Notifications /></Page>} />
        <Route path="/calendar"      element={<Page><Calendar /></Page>} />
        <Route path="/team"          element={<Page><Team /></Page>} />
        <Route path="/users"         element={<Page><Users /></Page>} />
        <Route path="/projects"      element={<Page><Projects /></Page>} />
        <Route path="/leave-types"   element={<Page><LeaveTypes /></Page>} />
        <Route path="/holidays"      element={<Page><Holidays /></Page>} />
        <Route path="/stats"         element={<Page><Stats /></Page>} />
        <Route path="/audit"         element={<Page><AuditLogs /></Page>} />
        <Route path="/admin"         element={<Page><AdminPanel /></Page>} />
        <Route path="*"              element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
