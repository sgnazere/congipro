import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import useAuthStore from '../store/authStore'
import { canAccess } from '../navigation'
import { fmtDate, STATUS_FR, awaitingReturn, todayIso } from '../utils/dates'

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [balances,   setBalances]   = useState<any[]>([])
  const [mine,       setMine]       = useState<any[]>([])
  const [toValidate, setToValidate] = useState<any[]>([])
  const [orgPending, setOrgPending] = useState<number | null>(null)
  const [returns,    setReturns]    = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)

  const isValidator = canAccess(user?.role, '/validate')
  const seesOrg     = ['rh', 'admin', 'director'].includes(user?.role || '')
  // Le Conseil d'administration valide mais ne pose pas de congés
  const canRequest  = canAccess(user?.role, '/new-request')

  useEffect(() => {
    const load = async () => {
      try {
        const [b, r, v, o, rt] = await Promise.all([
          api.get('/balances/me'),
          api.get('/requests/all'),
          isValidator ? api.get('/requests/to-validate') : Promise.resolve({ data: [] }),
          seesOrg ? api.get('/requests', { params: { status: 'pending' } }) : Promise.resolve({ data: null }),
          isValidator ? api.get('/returns/to-process') : Promise.resolve({ data: [] }),
        ])
        setReturns(rt.data)
        setBalances(b.data)
        setMine(r.data)
        setToValidate(v.data)
        setOrgPending(o.data ? o.data.length : null)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isValidator, seesOrg])

  if (loading) return <div className="loader-wrap"><div className="loader"></div></div>

  const myPending = mine.filter(r => r.status === 'pending').length
  const toDeclare = mine.filter(r => awaitingReturn(r) && r.planned_return_date?.slice(0, 10) <= todayIso())
  const next = mine
    .filter(r => r.status === 'approved' && r.end_date.slice(0, 10) >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0]

  return (
    <div>
      <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>
        👋 Bonjour <strong>{user?.first_name}</strong> — Bienvenue sur EcoGec !
        {next && <span> Prochaine absence : <strong>{next.type_label}</strong> du {fmtDate(next.start_date)} au {fmtDate(next.end_date)}.</span>}
      </div>

      {toDeclare.length > 0 && (
        <div className="alert alert-warn" style={{ marginBottom: '1.25rem' }}>
          <span style={{ flex: 1 }}>
            ↩ Votre congé <strong>{toDeclare[0].type_label}</strong> s’est terminé le {fmtDate(toDeclare[0].end_date)} :
            déclarez votre retour pour le clôturer.
          </span>
          <button className="btn btn-sm btn-green" onClick={() => navigate('/requests')}>Déclarer mon retour</button>
        </div>
      )}

      <div className="stat-grid">
        {isValidator && (
          <div className="stat-card" style={{ cursor: 'pointer', borderColor: toValidate.length ? 'var(--warn)' : undefined }}
            onClick={() => navigate('/validate')}>
            <div className="stat-label">À traiter</div>
            <div className="stat-val" style={{ color: 'var(--warn)' }}>{toValidate.length + returns.length}</div>
            <div className="stat-sub">
              {toValidate.length + returns.length === 0 ? 'Rien en attente de votre décision'
                : `${toValidate.length} demande(s) · ${returns.length} retour(s) →`}
              {toValidate.some(r => r.is_emergency) && ' 🚨'}
            </div>
          </div>
        )}

        {orgPending !== null && (
          <div className="stat-card">
            <div className="stat-label">En attente (organisation)</div>
            <div className="stat-val" style={{ color: 'var(--accent)' }}>{orgPending}</div>
            <div className="stat-sub">Toutes étapes confondues</div>
          </div>
        )}

        {canRequest && (<>
        <div className="stat-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/requests')}>
          <div className="stat-label">Mes demandes en attente</div>
          <div className="stat-val" style={{ color: 'var(--warn)' }}>{myPending}</div>
          <div className="stat-sub">{myPending === 0 ? 'Aucune demande en cours' : 'En cours de validation'}</div>
        </div>

        {balances.length > 0 ? balances.slice(0, isValidator ? (seesOrg ? 1 : 2) : 3).map(b => (
          <div key={b.id} className="stat-card">
            <div className="stat-label">{b.label} disponibles</div>
            <div className="stat-val" style={{ color: b.color }}>
              {parseFloat(b.total_days) - parseFloat(b.used_days) - parseFloat(b.pending_days)} j
            </div>
            <div className="prog-wrap">
              <div className="prog-bar" style={{
                width: `${Math.min(100, (b.used_days / b.total_days) * 100)}%`,
                background: b.color
              }} />
            </div>
            <div className="stat-sub">{parseFloat(b.used_days)} pris sur {parseFloat(b.total_days)} j</div>
          </div>
        )) : (
          <div className="stat-card">
            <div className="stat-label">Soldes</div>
            <div className="stat-val" style={{ color: 'var(--muted)', fontSize: '1rem' }}>Non initialisés</div>
            <div className="stat-sub">Créés automatiquement à la première demande</div>
          </div>
        )}
        </>)}
      </div>

      {canRequest && <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>Mes dernières demandes</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-outline" onClick={() => navigate('/requests')}>Tout voir</button>
            <button className="btn btn-sm btn-navy" onClick={() => navigate('/new-request')}>+ Nouvelle demande</button>
          </div>
        </div>
        {mine.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucune demande pour le moment
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Type</th><th>Période</th><th>Durée</th><th>Statut</th></tr>
            </thead>
            <tbody>
              {mine.slice(0, 5).map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge" style={{ background: r.color + '20', color: r.color }}>{r.type_label}</span>
                  </td>
                  <td>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                  <td>{parseFloat(r.days_count)} j</td>
                  <td>
                    {r.return_status === 'closed' ? <span className="badge badge-cancelled">✓ Clôturée</span>
                      : r.return_status ? <span className="badge badge-pending">Retour en cours de traitement</span>
                      : awaitingReturn(r) && r.planned_return_date?.slice(0, 10) <= todayIso() ? <span className="badge badge-pending">↩ Retour à déclarer</span>
                      : <span className={`badge badge-${r.status}`}>{STATUS_FR[r.status] || r.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>}
    </div>
  )
}
