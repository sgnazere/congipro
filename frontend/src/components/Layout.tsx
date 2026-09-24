import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import useAuthStore from '../store/authStore'

const MENUS = {
    director: [
    { path: '/dashboard',    icon: '🏛️', label: 'Tableau de bord'  },
    { path: '/validate',     icon: '✅', label: 'Validation'        },
    { path: '/new-request',  icon: '➕', label: 'Nouvelle demande'  },
    { path: '/requests',     icon: '📋', label: 'Mes demandes'      },
    { path: '/calendar',     icon: '📅', label: 'Calendrier'        },
    { path: '/stats',        icon: '📈', label: 'Statistiques'      },
    { path: '/notifications',icon: '🔔', label: 'Notifications'     },
  ],
    admin: [
    { path: '/dashboard',    icon: '🏠', label: 'Tableau de bord'  },
    { path: '/admin',        icon: '⚙️', label: 'Administration'   },
    { path: '/projects', icon: '🏗️', label: 'Projets' },
    { path: '/new-request',  icon: '➕', label: 'Nouvelle demande'  },
    { path: '/users',        icon: '👤', label: 'Utilisateurs'     },
    { path: '/validate',     icon: '✅', label: 'Validation'       },
    { path: '/leave-types',  icon: '🏷️', label: 'Types de congés'  },
    { path: '/holidays',     icon: '🗓️', label: 'Jours fériés'     },
    { path: '/stats',        icon: '📈', label: 'Statistiques'     },
    { path: '/audit',        icon: '🔒', label: 'Audit logs'       },
    { path: '/calendar',     icon: '📅', label: 'Calendrier'       },
    { path: '/notifications',icon: '🔔', label: 'Notifications'    },
  ],
    rh: [
    { path: '/dashboard',   icon: '📊', label: 'Tableau de bord'  },
    { path: '/projects', icon: '🏗️', label: 'Projets' },
    { path: '/new-request', icon: '➕', label: 'Nouvelle demande'  },
    { path: '/validate',    icon: '✅', label: 'Validation RH'    },
    { path: '/users',       icon: '👤', label: 'Utilisateurs'     },
    { path: '/leave-types', icon: '🏷️', label: 'Types de congés'  },
    { path: '/holidays',    icon: '🗓️', label: 'Jours fériés'     },
    { path: '/stats',       icon: '📈', label: 'Statistiques'     },
    { path: '/audit',       icon: '🔒', label: 'Audit logs'       },
    { path: '/notifications',icon: '🔔',label: 'Notifications'    },
  ],
  manager: [
    { path: '/dashboard',    icon: '🏠', label: 'Tableau de bord' },
    { path: '/validate',     icon: '✅', label: 'Validation'      },
    { path: '/team',         icon: '👥', label: 'Planning équipe' },
    { path: '/requests',     icon: '📋', label: 'Historique'      },
    { path: '/calendar',     icon: '📅', label: 'Calendrier'      },
    { path: '/notifications',icon: '🔔', label: 'Notifications'   },
  ],
  employee: [
    { path: '/dashboard',    icon: '🏠', label: 'Tableau de bord' },
    { path: '/new-request',  icon: '➕', label: 'Nouvelle demande'},
    { path: '/requests',     icon: '📋', label: 'Mes demandes'    },
    { path: '/calendar',     icon: '📅', label: 'Calendrier'      },
    { path: '/notifications',icon: '🔔', label: 'Notifications'   },
  ],
}

const ROLE_LABELS: Record<string, string> = {
  employee: 'Employé',
  manager:  'Manager',
  rh:       'RH / Admin',
  admin:    'Super Administrateur',
  director: 'Directeur Exécutif',
}

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Administration système',
  '/dashboard':    'Tableau de bord',
  '/projects': 'Gestion des projets',
  '/new-request':  'Nouvelle demande',
  '/validate':     'Validation des demandes',
  '/requests':     'Mes demandes',
  '/calendar':     'Calendrier des absences',
  '/notifications':'Notifications',
  '/users':        'Gestion utilisateurs',
  '/leave-types':  'Types de congés',
  '/holidays':     'Jours fériés',
  '/stats':        'Rapports & Statistiques',
  '/audit':        'Journal d\'audit',
  '/team':         'Planning équipe',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuthStore()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [notifs]  = useState(3)

  if (!user) return null

  const menus  = MENUS[user.role as keyof typeof MENUS] || MENUS.employee
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
        {/* Topbar */}
        <div className="topbar">
          <div className="page-title">{PAGE_TITLES[location.pathname] || 'EcoGec'}</div>
          <div className="topbar-right">
           {/* Icône SVG moderne */}
              <button className="notif-btn" onClick={() => navigate('/notifications')}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {notifs > 0 && <span className="notif-count">{notifs}</span>}
              </button>
            <span className="role-tag">
              🔒 {ROLE_LABELS[user.role]}
            </span>
          </div>
        </div>

        {/* Page */}
        <div className="page-content">
          {children}
        </div>
      </div>
    </div>
  )
}