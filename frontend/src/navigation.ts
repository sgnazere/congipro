// Source unique des menus par rôle : sert à la barre latérale ET à la protection des routes
export type Role = 'employee' | 'manager' | 'rh' | 'director' | 'board' | 'admin'

export interface MenuItem { path: string; icon: string; label: string; badge?: 'validate' }

export const MENUS: Record<Role, MenuItem[]> = {
  employee: [
    { path: '/dashboard',     icon: '🏠', label: 'Tableau de bord'  },
    { path: '/new-request',   icon: '➕', label: 'Nouvelle demande' },
    { path: '/requests',      icon: '📋', label: 'Mes demandes'     },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
  manager: [
    { path: '/dashboard',     icon: '🏠', label: 'Tableau de bord'  },
    { path: '/validate',      icon: '✅', label: 'Validation', badge: 'validate' },
    { path: '/team',          icon: '👥', label: 'Planning équipe'  },
    { path: '/new-request',   icon: '➕', label: 'Nouvelle demande' },
    { path: '/requests',      icon: '📋', label: 'Mes demandes'     },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
  // Conseil d'administration : valide les congés du Directeur exécutif, rien d'autre
  board: [
    { path: '/dashboard',     icon: '🏛️', label: 'Tableau de bord'  },
    { path: '/validate',      icon: '✅', label: 'Validation', badge: 'validate' },
    { path: '/team',          icon: '👥', label: 'Planning équipe'  },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
  director: [
    { path: '/dashboard',     icon: '🏛️', label: 'Tableau de bord'  },
    { path: '/validate',      icon: '✅', label: 'Validation', badge: 'validate' },
    { path: '/team',          icon: '👥', label: 'Planning équipe'  },
    { path: '/new-request',   icon: '➕', label: 'Nouvelle demande' },
    { path: '/requests',      icon: '📋', label: 'Mes demandes'     },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/stats',         icon: '📈', label: 'Statistiques'     },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
  rh: [
    { path: '/dashboard',     icon: '📊', label: 'Tableau de bord'  },
    { path: '/validate',      icon: '✅', label: 'Validation RH', badge: 'validate' },
    { path: '/new-request',   icon: '➕', label: 'Nouvelle demande' },
    { path: '/requests',      icon: '📋', label: 'Mes demandes'     },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/users',         icon: '👤', label: 'Utilisateurs'     },
    { path: '/projects',      icon: '🏗️', label: 'Projets'          },
    { path: '/leave-types',   icon: '🏷️', label: 'Types de congés'  },
    { path: '/holidays',      icon: '🗓️', label: 'Jours fériés'     },
    { path: '/stats',         icon: '📈', label: 'Statistiques'     },
    { path: '/audit',         icon: '🔒', label: 'Audit logs'       },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
  admin: [
    { path: '/dashboard',     icon: '🏠', label: 'Tableau de bord'  },
    { path: '/admin',         icon: '⚙️', label: 'Administration'   },
    { path: '/validate',      icon: '✅', label: 'Validation', badge: 'validate' },
    { path: '/users',         icon: '👤', label: 'Utilisateurs'     },
    { path: '/projects',      icon: '🏗️', label: 'Projets'          },
    { path: '/leave-types',   icon: '🏷️', label: 'Types de congés'  },
    { path: '/holidays',      icon: '🗓️', label: 'Jours fériés'     },
    { path: '/stats',         icon: '📈', label: 'Statistiques'     },
    { path: '/audit',         icon: '🔒', label: 'Audit logs'       },
    { path: '/calendar',      icon: '📅', label: 'Calendrier'       },
    { path: '/new-request',   icon: '➕', label: 'Nouvelle demande' },
    { path: '/requests',      icon: '📋', label: 'Mes demandes'     },
    { path: '/notifications', icon: '🔔', label: 'Notifications'    },
  ],
}

export const ROLE_LABELS: Record<string, string> = {
  employee: 'Employé',
  manager:  'Manager',
  rh:       'Ressources humaines',
  admin:    'Super administrateur',
  director: 'Directeur exécutif',
  board:    'Conseil d’administration',
}

export const PAGE_TITLES: Record<string, string> = {
  '/admin':         'Administration système',
  '/dashboard':     'Tableau de bord',
  '/projects':      'Gestion des projets',
  '/new-request':   'Nouvelle demande',
  '/validate':      'Validation des demandes',
  '/requests':      'Mes demandes',
  '/calendar':      'Calendrier des absences',
  '/notifications': 'Notifications',
  '/users':         'Gestion des utilisateurs',
  '/leave-types':   'Types de congés',
  '/holidays':      'Jours fériés',
  '/stats':         'Rapports & statistiques',
  '/audit':         "Journal d'audit",
  '/team':          'Planning équipe',
}

export const canAccess = (role: string | undefined, path: string) =>
  (MENUS[role as Role] || MENUS.employee).some(m => m.path === path)

// Événement émis quand les compteurs (notifications, validations) doivent être relus
export const COUNTERS_EVENT = 'ecogec:counters-changed'
export const refreshCounters = () => window.dispatchEvent(new Event(COUNTERS_EVENT))
