import { useEffect, useState } from 'react'
import api from '../api/axios'

const ACTION_COLORS: Record<string, string> = {
  LOGIN:            '#10B981',
  LOGOUT:           '#64748B',
  CREATE_REQUEST:   '#3B82F6',
  APPROVED_REQUEST: '#10B981',
  REJECTED_REQUEST: '#EF4444',
  CANCEL_REQUEST:   '#F59E0B',
  CREATE_USER:      '#8B5CF6',
  UPDATE_USER:      '#F59E0B',
}

export default function AuditLogs() {
  const [logs,    setLogs]    = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState('all')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get('/audit-logs')
        setLogs(res.data)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const actions = ['all', ...Array.from(new Set(logs.map(l => l.action)))]

  const filtered = logs.filter(l => {
    const matchSearch = search === '' ||
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.user_name?.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || l.action === filter
    return matchSearch && matchFilter
  })

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Total événements', val: logs.length,                                              color: 'var(--accent)'  },
          { label: 'Connexions',        val: logs.filter(l => l.action === 'LOGIN').length,           color: 'var(--success)' },
          { label: 'Demandes créées',   val: logs.filter(l => l.action === 'CREATE_REQUEST').length,  color: '#3B82F6'        },
          { label: 'Approbations',      val: logs.filter(l => l.action === 'APPROVED_REQUEST').length,color: '#10B981'        },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          className="form-control"
          placeholder="🔍 Rechercher..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 250 }}
        />
        <select className="form-control" style={{ maxWidth: 200 }}
          value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">Toutes les actions</option>
          {actions.filter(a => a !== 'all').map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <span style={{ alignSelf: 'center', fontSize: '.8rem', color: 'var(--muted)' }}>
          {filtered.length} événement(s)
        </span>
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-title">Journal d'audit complet</div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucun événement trouvé
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date / Heure</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Entité</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l.id}>
                  <td style={{ fontSize: '.78rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {new Date(l.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })}
                  </td>
                  <td style={{ fontSize: '.82rem', fontWeight: 600 }}>
                    {l.user_name || '—'}
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: (ACTION_COLORS[l.action] || '#64748B') + '20',
                      color: ACTION_COLORS[l.action] || '#64748B'
                    }}>
                      {l.action}
                    </span>
                  </td>
                  <td style={{ fontSize: '.78rem', color: 'var(--muted)' }}>
                    {l.entity_type || '—'}
                  </td>
                  <td style={{ fontSize: '.75rem', color: 'var(--muted)', fontFamily: 'monospace' }}>
                    {l.ip_address || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}