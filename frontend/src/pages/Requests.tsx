import { useEffect, useState } from 'react'
import api from '../api/axios'
import useAuthStore from '../store/authStore'
import { generateLeavePDF, calcReturnDate } from '../utils/generatePDF'

const STATUS_FR: Record<string, string> = {
  pending:   'En attente',
  approved:  'Approuvé',
  rejected:  'Rejeté',
  cancelled: 'Annulé',
}

export default function Requests() {
  const { user }   = useAuthStore()
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [director, setDirector] = useState<any>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [r, u] = await Promise.all([
          api.get('/requests/all'),
          api.get('/users').catch(() => ({ data: [] })),
        ])
        setRequests(r.data)
        const dir = u.data.find((x: any) => x.role === 'director')
        setDirector(dir)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const filtered = filter === 'all'
    ? requests
    : requests.filter(r => r.status === filter)

  const handlePDF = (r: any) => {
    generateLeavePDF({
      employee_name: user?.first_name + ' ' + user?.last_name,
      project_name:  r.department || '—',
      days_count:    r.days_count,
      start_date:    r.start_date,
      end_date:      r.end_date,
      return_date:   calcReturnDate(r.end_date),
      reason:        r.reason || '—',
      status:        r.status,
      manager_name:  r.manager_name,
      director_name: director ? director.first_name + ' ' + director.last_name : '—',
      city:          'Abidjan',
    })
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {/* Compteurs cliquables */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { key: 'all',      label: 'Total',      color: 'var(--accent)'  },
          { key: 'pending',  label: 'En attente', color: 'var(--warn)'    },
          { key: 'approved', label: 'Approuvées', color: 'var(--success)' },
          { key: 'rejected', label: 'Rejetées',   color: 'var(--danger)'  },
        ].map(s => (
          <div key={s.key} className="stat-card"
            style={{ cursor: 'pointer', border: filter === s.key ? `2px solid ${s.color}` : '' }}
            onClick={() => setFilter(s.key)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>
              {s.key === 'all' ? requests.length : requests.filter(r => r.status === s.key).length}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>Historique des demandes</div>
          {filter !== 'all' && (
            <button className="btn btn-sm btn-outline" onClick={() => setFilter('all')}>
              ✕ Effacer le filtre
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucune demande trouvée
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Période</th>
                <th>Durée</th>
                <th>Motif</th>
                <th>Statut</th>
                <th>Date soumission</th>
                <th>PDF</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge" style={{ background: r.color+'20', color: r.color }}>
                      {r.type_label}
                    </span>
                  </td>
                  <td style={{ fontSize: '.8rem' }}>
                    {new Date(r.start_date).toLocaleDateString('fr-FR')}
                    {' → '}
                    {new Date(r.end_date).toLocaleDateString('fr-FR')}
                  </td>
                  <td><strong>{r.days_count} j</strong></td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.reason || '—'}
                  </td>
                  <td>
                    <span className={`badge badge-${r.status}`}>
                      {STATUS_FR[r.status] || r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                    {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => handlePDF(r)}
                      title="Télécharger le PDF"
                      style={{ fontSize: '1rem', padding: '4px 8px' }}
                    >
                      📄
                    </button>
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