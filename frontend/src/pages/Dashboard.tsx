import { useEffect, useState } from 'react'
import api from '../api/axios'
import useAuthStore from '../store/authStore'

export default function Dashboard() {
  const { user } = useAuthStore()
  const [balances, setBalances] = useState<any[]>([])
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [b, r] = await Promise.all([
          api.get('/balances/me'),
          api.get('/requests?status=pending'),
        ])
        setBalances(b.data)
        setRequests(r.data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return (
    <div className="loader-wrap">
      <div className="loader"></div>
    </div>
  )

  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div>
      {/* Message bienvenue */}
      <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
        👋 Bonjour <strong> {user?.first_name} </strong> — Bienvenue sur EcoGec !
      </div>

      {/* Stat cards */}
      <div className="stat-grid">
        {balances.length > 0 ? balances.slice(0, 3).map(b => (
          <div key={b.id} className="stat-card">
            <div className="stat-label">{b.label}</div>
            <div className="stat-val" style={{ color: b.color }}>
              {parseFloat(b.total_days) - parseFloat(b.used_days) - parseFloat(b.pending_days)} j
            </div>
            <div className="prog-wrap">
              <div className="prog-bar" style={{
                width: `${Math.min(100, ((b.used_days / b.total_days) * 100))}%`,
                background: b.color
              }} />
            </div>
            <div className="stat-sub">Sur {b.max_days_per_year} jours/an</div>
          </div>
        )) : (
          <div className="stat-card">
            <div className="stat-label">Soldes</div>
            <div className="stat-val" style={{ color: 'var(--muted)', fontSize: '1rem' }}>
              Non configurés
            </div>
            <div className="stat-sub">Contactez les RH</div>
          </div>
        )}

        <div className="stat-card">
          <div className="stat-label">En attente</div>
          <div className="stat-val" style={{ color: 'var(--warn)' }}>{pendingCount}</div>
          <div className="stat-sub">
            {pendingCount === 0 ? 'Aucune demande en cours' : 'Demande(s) à traiter'}
          </div>
        </div>
      </div>

      {/* Dernières demandes */}
      <div className="card">
        <div className="card-title">Dernières demandes</div>
        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucune demande pour le moment
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Période</th>
                <th>Durée</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {requests.slice(0, 5).map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge" style={{ background: r.color + '20', color: r.color }}>
                      {r.type_label}
                    </span>
                  </td>
                  <td>{new Date(r.start_date).toLocaleDateString('fr-FR')} → {new Date(r.end_date).toLocaleDateString('fr-FR')}</td>
                  <td>{r.days_count} j</td>
                  <td><span className={`badge badge-${r.status}`}>
  {({ pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté', cancelled: 'Annulé' } as Record<string, string>)[r.status] || r.status}
</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}