import { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Validate() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)
  const [comment,  setComment]  = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [action,   setAction]   = useState<'approved' | 'rejected' | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/requests?status=pending')
      setRequests(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openModal = (req: any, act: 'approved' | 'rejected') => {
    setSelected(req)
    setAction(act)
    setComment('')
    setMsg(null)
  }

  const handleConfirm = async () => {
    if (!selected || !action) return
    try {
      await api.patch(`/requests/${selected.id}/approve`, {
        action,
        comment: comment || undefined,
      })
      setMsg({
        type: 'success',
        text: action === 'approved'
          ? '✅ Demande approuvée avec succès !'
          : '❌ Demande rejetée.'
      })
      setSelected(null)
      setAction(null)
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur serveur' })
    }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Compteur */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">En attente</div>
          <div className="stat-val" style={{ color: 'var(--warn)' }}>
            {requests.length}
          </div>
          <div className="stat-sub">Demande(s) à traiter</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Urgences</div>
          <div className="stat-val" style={{ color: 'var(--danger)' }}>
            {requests.filter(r => r.is_emergency).length}
          </div>
          <div className="stat-sub">Priorité haute</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Ce mois</div>
          <div className="stat-val" style={{ color: 'var(--accent)' }}>
            {requests.filter(r => {
              const d = new Date(r.start_date)
              const now = new Date()
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).length}
          </div>
          <div className="stat-sub">Départs prévus</div>
        </div>
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-title">Demandes en attente de validation</div>

        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            🎉 Aucune demande en attente !
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Type</th>
                <th>Période</th>
                <th>Durée</th>
                <th>Motif</th>
                <th>Urgent</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r: any) => {
                const initials = r.user_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="avatar avatar-blue" style={{ width: 28, height: 28, fontSize: '.65rem' }}>
                          {initials}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{r.user_name}</div>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{r.department}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: r.color + '20', color: r.color }}>
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
                    <td style={{ textAlign: 'center' }}>
                      {r.is_emergency ? '🚨' : '—'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm btn-green"
                          onClick={() => openModal(r, 'approved')}
                        >
                          ✓ Valider
                        </button>
                        <button
                          className="btn btn-sm btn-red"
                          onClick={() => openModal(r, 'rejected')}
                        >
                          ✕ Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal confirmation */}
      {selected && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: 460 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>
              {action === 'approved' ? '✅ Confirmer la validation' : '❌ Confirmer le rejet'}
            </div>

            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              <div>
                <strong>{selected.user_name}</strong> — {selected.type_label}<br />
                <span style={{ fontSize: '.8rem' }}>
                  {new Date(selected.start_date).toLocaleDateString('fr-FR')} → {new Date(selected.end_date).toLocaleDateString('fr-FR')} ({selected.days_count} j)
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Commentaire {action === 'rejected' ? '(obligatoire)' : '(optionnel)'}
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder={action === 'rejected' ? 'Précisez le motif du rejet...' : 'Ajouter un commentaire...'}
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setSelected(null)}>
                Annuler
              </button>
              <button
                className={`btn ${action === 'approved' ? 'btn-green' : 'btn-red'}`}
                onClick={handleConfirm}
                disabled={action === 'rejected' && !comment}
              >
                {action === 'approved' ? '✓ Confirmer la validation' : '✕ Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}