import { useEffect, useState } from 'react'
import api, { downloadFile } from '../api/axios'
import { refreshCounters } from '../navigation'
import { fmtDate, parseDay, REGULARIZATION_FR } from '../utils/dates'
import ReturnModal from '../components/ReturnModal'
import useAuthStore from '../store/authStore'

const LEVEL_LABELS: Record<number, string> = { 1: 'Étape 1 — Superviseur', 2: 'Étape 2 — RH' }

export default function Validate() {
  const { user } = useAuthStore()
  const [tab,      setTab]      = useState<'requests' | 'returns'>('requests')
  const [returns,  setReturns]  = useState<any[]>([])
  const [retAction, setRetAction] = useState<{ row: any, mode: 'confirm' | 'record' } | null>(null)
  const [regul,    setRegul]    = useState<any | null>(null)
  const [regChoice, setRegChoice] = useState('')
  const [regComment, setRegComment] = useState('')
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
      const [res, ret] = await Promise.all([api.get('/requests/to-validate'), api.get('/returns/to-process')])
      setRequests(res.data)
      setReturns(ret.data)
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

  const submitRegularization = async () => {
    if (!regul || !regChoice) return
    setSaving(true)
    try {
      await api.patch(`/requests/${regul.id}/return/regularize`, { regularization: regChoice, comment: regComment.trim() || undefined })
      setMsg({ type: 'success', text: `✅ Retour de ${regul.user_name} régularisé : congé clôturé.` })
      setRegul(null)
      refreshCounters()
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur serveur' })
    } finally { setSaving(false) }
  }

  const runReminders = async () => {
    try { setMsg({ type: 'info', text: (await api.post('/returns/run-reminders')).data.message }); load() }
    catch (err: any) { setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur' }) }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  const now = new Date()
  const RET_LABEL: Record<string, string> = { confirm: 'Déclaré — à confirmer', record: 'Non déclaré', regularize: 'Retour tardif — à régulariser' }

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="tab-bar" style={{ display: 'inline-flex' }}>
        <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>
          Demandes ({requests.length})
        </button>
        <button className={`tab ${tab === 'returns' ? 'active' : ''}`} onClick={() => setTab('returns')}>
          Retours de congé ({returns.length})
        </button>
      </div>

      {tab === 'returns' && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div className="card-title" style={{ margin: 0 }}>Retours à confirmer, enregistrer ou régulariser</div>
            {['rh', 'admin'].includes(user?.role || '') && (
              <button className="btn btn-sm btn-outline" onClick={runReminders} title="Envoie maintenant les relances dues (J+1, J+3)">⏰ Lancer les relances</button>
            )}
          </div>
          {returns.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>🎉 Aucun retour en attente.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Employé</th><th>Congé</th><th>Retour prévu</th><th>Retour déclaré</th><th>Écart</th><th>Suivi</th><th>Action</th></tr>
              </thead>
              <tbody>
                {returns.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{r.user_name}</div>
                      <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>{r.department || '—'}</div>
                    </td>
                    <td style={{ fontSize: '.8rem' }}>
                      <span className="badge" style={{ background: r.color + '20', color: r.color }}>{r.type_label}</span>
                      <div style={{ marginTop: 2 }}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)} ({parseFloat(r.days_count)} j)</div>
                    </td>
                    <td style={{ fontSize: '.8rem' }}>
                      {fmtDate(r.planned_return_date)}
                      {r.action === 'record' && r.overdue_days > 0 && (
                        <div style={{ fontSize: '.68rem', color: 'var(--danger)' }}>+{r.overdue_days} j ouvré(s)</div>
                      )}
                    </td>
                    <td style={{ fontSize: '.8rem' }}>{r.actual_return_date ? fmtDate(r.actual_return_date) : '—'}</td>
                    <td style={{ fontSize: '.8rem' }}>
                      {r.gap_days === null || r.gap_days === undefined ? '—'
                        : parseFloat(r.gap_days) === 0 ? 'À l’heure'
                        : <span style={{ color: parseFloat(r.gap_days) > 0 ? 'var(--danger)' : 'var(--accent)' }}>
                            {parseFloat(r.gap_days) > 0 ? `+${parseFloat(r.gap_days)} j` : `${parseFloat(r.gap_days)} j`}
                          </span>}
                      {r.gap_reason && <div style={{ fontSize: '.68rem', color: 'var(--muted)', maxWidth: 160 }} title={r.gap_reason}>{r.gap_reason}</div>}
                    </td>
                    <td>
                      <span className={`badge ${r.action === 'regularize' ? 'badge-rejected' : 'badge-pending'}`}>{RET_LABEL[r.action]}</span>
                      {r.return_reminder_level > 0 && <div style={{ fontSize: '.68rem', color: 'var(--muted)' }}>⏰ relancé ({r.return_reminder_level})</div>}
                    </td>
                    <td>
                      {r.action === 'regularize' ? (
                        <button className="btn btn-sm btn-navy" onClick={() => { setRegul(r); setRegChoice(''); setRegComment(''); setMsg(null) }}>Régulariser</button>
                      ) : (
                        <button className="btn btn-sm btn-green" onClick={() => { setRetAction({ row: r, mode: r.action }); setMsg(null) }}>
                          {r.action === 'confirm' ? '✓ Confirmer' : '↩ Enregistrer'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'requests' && (<>
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

      </>)}

      {retAction && (
        <ReturnModal request={retAction.row} mode={retAction.mode} onClose={() => setRetAction(null)}
          onDone={text => { setRetAction(null); setMsg({ type: 'success', text }); refreshCounters(); load() }} />
      )}

      {regul && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setRegul(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 480 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)', marginBottom: '1rem' }}>Régulariser un retour tardif</div>
            <div className="alert alert-warn">
              <div>
                <strong>{regul.user_name}</strong> — {regul.type_label}<br />
                <span style={{ fontSize: '.8rem' }}>
                  Retour prévu le {fmtDate(regul.planned_return_date)}, effectif le {fmtDate(regul.actual_return_date)} :
                  <strong> {parseFloat(regul.gap_days)} jour(s) ouvré(s) de dépassement</strong>
                </span>
                {regul.gap_reason && <div style={{ fontSize: '.78rem', marginTop: 4 }}>Motif : « {regul.gap_reason} »</div>}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Traitement des jours de dépassement *</label>
              {['deduire_conge', 'sans_solde', 'maladie', 'injustifiee'].map(k => (
                <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.83rem', padding: '4px 0', cursor: 'pointer' }}>
                  <input type="radio" name="regul" checked={regChoice === k} onChange={() => setRegChoice(k)} style={{ width: 'auto' }} />
                  {REGULARIZATION_FR[k]}
                  {k === 'deduire_conge' && <span className="form-hint" style={{ margin: 0 }}>(décompté du solde {regul.type_label})</span>}
                </label>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Commentaire (transmis à l’employé et au superviseur)</label>
              <textarea className="form-control" rows={2} value={regComment} onChange={e => setRegComment(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setRegul(null)}>Annuler</button>
              <button className="btn btn-navy" onClick={submitRegularization} disabled={!regChoice || saving}>
                {saving ? 'Enregistrement…' : 'Clôturer le congé'}
              </button>
            </div>
          </div>
        </div>
      )}

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
