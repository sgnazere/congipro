import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import api from '../api/axios'
import useAuthStore from '../store/authStore'
import { MENUS, ROLE_LABELS, PAGE_TITLES, COUNTERS_EVENT, type Role } from '../navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [unread,     setUnread]     = useState(0)
  const [toValidate, setToValidate] = useState(0)

  const menus = MENUS[user?.role as Role] || MENUS.employee
  const hasValidation = menus.some(m => m.badge === 'validate')

  const loadCounters = useCallback(async () => {
    try {
      const [n, v] = await Promise.all([
        api.get('/notifications/unread-count'),
        hasValidation ? api.get('/requests/to-validate') : Promise.resolve({ data: [] }),
      ])
      setUnread(n.data.count)
      setToValidate(v.data.length)
    } catch { /* compteurs non bloquants */ }
  }, [hasValidation])

  // Relecture à chaque changement de page, toutes les 60 s, et sur demande d'une page
  useEffect(() => { loadCounters() }, [loadCounters, location.pathname])
  useEffect(() => {
    const id = setInterval(loadCounters, 60000)
    window.addEventListener(COUNTERS_EVENT, loadCounters)
    return () => { clearInterval(id); window.removeEventListener(COUNTERS_EVENT, loadCounters) }
  }, [loadCounters])

  if (!user) return null

  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase()
  const avatarClass = user.role === 'rh' ? 'avatar avatar-green' : user.role === 'manager' ? 'avatar avatar-purple' : 'avatar avatar-blue'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-logo">
          ⟡ EcoGec
          <span>Gestion des congés</span>
        </div>

        <div className="sidebar-section">Navigation</div>

        {menus.map(m => (
          <button
            key={m.path}
            className={`nav-item ${location.pathname === m.path ? 'active' : ''}`}
            onClick={() => navigate(m.path)}
          >
            <span>{m.icon}</span>
            {m.label}
            {m.badge === 'validate' && toValidate > 0 && <span className="nav-count">{toValidate}</span>}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="user-info">
            <div className={avatarClass}>{initials}</div>
            <div>
              <div className="user-name">{user.first_name} {user.last_name}</div>
              <div className="user-role">{ROLE_LABELS[user.role]}</div>
            </div>
            <button className="logout-btn" onClick={handleLogout} title="Déconnexion">⏻</button>
          </div>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="main-content">
        <div className="topbar">
          <div className="page-title">{PAGE_TITLES[location.pathname] || 'EcoGec'}</div>
          <div className="topbar-right">
            <button className="notif-btn" onClick={() => navigate('/notifications')}
              title={unread > 0 ? `${unread} notification(s) non lue(s)` : 'Notifications'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unread > 0 && <span className="notif-count">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <span className="role-tag">
              🔒 {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>

        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  )
}
