import { useEffect, useState } from 'react'
import api, { downloadFile } from '../api/axios'
import { refreshCounters } from '../navigation'
import { fmtDate, parseDay } from '../utils/dates'

const LEVEL_LABELS: Record<number, string> = { 1: 'Étape 1 — Superviseur', 2: 'Étape 2 — RH' }

export default function Validate() {
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)
  const [comment,  setComment]  = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [action,   setAction]   = useState<'approved' | 'rejected' | null>(null)
  const [saving,   setSaving]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/requests/to-validate')
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
    setSaving(true)
    try {
      const res = await api.patch(`/requests/${selected.id}/approve`, {
        action,
        comment: comment.trim() || undefined,
      })
      const next = res.data.status === 'pending'
      setMsg({
        type: action === 'approved' ? 'success' : 'warn',
        text: action === 'rejected' ? `Demande de ${selected.user_name} rejetée. L'employé a été notifié.`
          : next ? `✅ Validée. La demande de ${selected.user_name} passe à l'étape RH.`
          : `✅ Demande de ${selected.user_name} approuvée. L'employé a été notifié.`,
      })
      setSelected(null)
      setAction(null)
      refreshCounters()
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur serveur' })
      setSelected(null)
    } finally {
      setSaving(false)
    }
  }

  const openDocument = (r: any) =>
    downloadFile(`/requests/${r.id}/document`, 'justificatif', { open: true })
      .catch(() => setMsg({ type: 'danger', text: 'Justificatif introuvable' }))

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  const now = new Date()

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">À traiter</div>
          <div className="stat-val" style={{ color: 'var(--warn)' }}>{requests.length}</div>
          <div className="stat-sub">Demande(s) qui attendent votre décision</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Urgences</div>
          <div className="stat-val" style={{ color: 'var(--danger)' }}>
            {requests.filter(r => r.is_emergency).length}
          </div>
          <div className="stat-sub">Affichées en premier</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Départs ce mois-ci</div>
          <div className="stat-val" style={{ color: 'var(--accent)' }}>
            {requests.filter(r => {
              const d = parseDay(r.start_date)
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            }).length}
          </div>
          <div className="stat-sub">Parmi les demandes à traiter</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Demandes en attente de votre validation</div>

        {requests.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            🎉 Aucune demande en attente de votre validation.
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
                <th>Étape</th>
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
                          <div style={{ fontWeight: 600, fontSize: '.82rem' }}>
                            {r.user_name} {r.is_emergency && <span title="Urgence">🚨</span>}
                          </div>
                          <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{r.department || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: r.color + '20', color: r.color }}>
                        {r.type_label}
                      </span>
                    </td>
                    <td style={{ fontSize: '.8rem' }}>
                      {fmtDate(r.start_date)}
                      {' → '}
                      {fmtDate(r.end_date)}
                    </td>
                    <td>
                      <strong>{parseFloat(r.days_count)} j</strong>
                      {r.balance_after !== null && (
                        <div style={{ fontSize: '.68rem', color: parseFloat(r.balance_after) < 0 ? 'var(--danger)' : 'var(--muted)' }}
                          title="Solde disponible du collaborateur pour ce type, cette demande incluse">
                          Solde après : {parseFloat(r.balance_after)} j{parseFloat(r.balance_after) < 0 ? ' ⚠️' : ''}
                        </div>
                      )}
                    </td>
                    <td style={{ maxWidth: 170 }}>
                      <div title={r.reason} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason || '—'}
                      </div>
                      {r.has_document && (
                        <button className="btn btn-sm btn-outline" style={{ marginTop: 4 }} onClick={() => openDocument(r)}>
                          📎 Justificatif
                        </button>
                      )}
                    </td>
                    <td style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                      {LEVEL_LABELS[r.current_level] || `Étape ${r.current_level}`}
                      {r.approval_levels > 1 && <div>sur {r.approval_levels}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-green" onClick={() => openModal(r, 'approved')}>
                          ✓ Valider
                        </button>
                        <button className="btn btn-sm btn-red" onClick={() => openModal(r, 'rejected')}>
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

      {selected && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 460 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem' }}>
              {action === 'approved' ? '✅ Confirmer la validation' : '❌ Confirmer le rejet'}
            </div>

            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
              <div>
                <strong>{selected.user_name}</strong> — {selected.type_label}<br />
                <span style={{ fontSize: '.8rem' }}>
                  {fmtDate(selected.start_date)} → {fmtDate(selected.end_date)} ({parseFloat(selected.days_count)} j)
                </span>
                {action === 'approved' && selected.balance_after !== null && parseFloat(selected.balance_after) < 0 && (
                  <div style={{ fontSize: '.75rem', marginTop: 4, color: 'var(--danger)', fontWeight: 600 }}>
                    ⚠️ Cette demande dépasse le solde du collaborateur ({parseFloat(selected.balance_after)} j après approbation).
                  </div>
                )}
                {action === 'approved' && selected.current_level < selected.approval_levels && (
                  <div style={{ fontSize: '.75rem', marginTop: 4 }}>
                    Après votre validation, la demande sera transmise aux RH.
                  </div>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Commentaire {action === 'rejected' ? '(obligatoire, transmis à l’employé)' : '(optionnel)'}
              </label>
              <textarea
                className="form-control"
                rows={3}
                placeholder={action === 'rejected' ? 'Précisez le motif du rejet...' : 'Ajouter un commentaire...'}
                value={comment}
                onChange={e => setComment(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setSelected(null)}>
                Annuler
              </button>
              <button
                className={`btn ${action === 'approved' ? 'btn-green' : 'btn-red'}`}
                onClick={handleConfirm}
                disabled={saving || (action === 'rejected' && !comment.trim())}
              >
                {saving ? 'Envoi...' : action === 'approved' ? '✓ Confirmer la validation' : '✕ Confirmer le rejet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
