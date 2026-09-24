import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api, { downloadFile } from '../api/axios'
import useAuthStore from '../store/authStore'
import { generateLeavePDF, calcReturnDate } from '../utils/generatePDF'
import { fmtDate, STATUS_FR, RETURN_FR, REGULARIZATION_FR, awaitingReturn, todayIso } from '../utils/dates'
import ReturnModal from '../components/ReturnModal'
import { refreshCounters, ROLE_LABELS } from '../navigation'
import { ORG_CITY } from '../config'

export default function Requests() {
  const navigate = useNavigate()
  const { user }   = useAuthStore()
  const [requests, setRequests] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState('all')
  const [detail,   setDetail]   = useState<any | null>(null)
  const [steps,    setSteps]    = useState<any[] | null>(null)
  const [retInfo,  setRetInfo]  = useState<any | null>(null)
  const [returnFor, setReturnFor] = useState<any | null>(null)
  const [cancelling, setCancelling] = useState<any | null>(null)
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get('/requests/all')
      setRequests(r.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  const openDetail = async (r: any) => {
    setDetail(r)
    setSteps(null)
    setRetInfo(null)
    try {
      const [s, ret] = await Promise.all([api.get(`/requests/${r.id}/steps`), api.get(`/requests/${r.id}/return`)])
      setSteps(s.data); setRetInfo(ret.data)
    } catch { setSteps([]) }
  }

  const confirmCancel = async () => {
    if (!cancelling) return
    try {
      await api.delete(`/requests/${cancelling.id}`)
      setMsg({ type: 'success', text: 'Demande annulée. Les jours réservés ont été rendus à votre solde.' })
      refreshCounters()
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Annulation impossible' })
    } finally { setCancelling(null) }
  }

  const handlePDF = (r: any) => {
    generateLeavePDF({
      reference:     r.id,
      employee_name: user?.first_name + ' ' + user?.last_name,
      project_name:  r.department || '—',
      leave_type:    r.type_label,
      days_count:    parseFloat(r.days_count),
      start_date:    r.start_date,
      end_date:      r.end_date,
      return_date:   r.planned_return_date || calcReturnDate(r.end_date),
      reason:        r.reason || '—',
      status:        r.status,
      manager_name:  r.manager_name,
      director_name: r.director_name || '—',
      city:          ORG_CITY,
    })
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Compteurs cliquables = filtres */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { key: 'all',      label: 'Total',      color: 'var(--accent)'  },
          { key: 'pending',  label: 'En attente', color: 'var(--warn)'    },
          { key: 'approved', label: 'Approuvées', color: 'var(--success)' },
          { key: 'rejected', label: 'Rejetées',   color: 'var(--danger)'  },
        ].map(s => (
          <div key={s.key} className="stat-card"
            style={{ cursor: 'pointer', border: filter === s.key ? `2px solid ${s.color}` : '' }}
            onClick={() => setFilter(s.key)} title="Cliquer pour filtrer">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>
              {s.key === 'all' ? requests.length : requests.filter(r => r.status === s.key).length}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>Historique de mes demandes</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {filter !== 'all' && (
              <button className="btn btn-sm btn-outline" onClick={() => setFilter('all')}>✕ Effacer le filtre</button>
            )}
            <button className="btn btn-sm btn-navy" onClick={() => navigate('/new-request')}>+ Nouvelle demande</button>
          </div>
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
                <th>Soumise le</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span className="badge" style={{ background: r.color + '20', color: r.color }}>{r.type_label}</span>
                  </td>
                  <td style={{ fontSize: '.8rem' }}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                  <td><strong>{parseFloat(r.days_count)} j</strong></td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason}>
                    {r.reason || '—'}
                  </td>
                  <td>
                    {r.return_status ? (
                      <span className={`badge ${r.return_status === 'closed' ? 'badge-cancelled' : 'badge-pending'}`}
                        title={r.return_status === 'closed' && r.actual_return_date ? `Retour effectif le ${fmtDate(r.actual_return_date)}` : ''}>
                        {r.return_status === 'closed' ? '✓ Clôturée' : RETURN_FR[r.return_status]}
                      </span>
                    ) : awaitingReturn(r) && r.planned_return_date?.slice(0, 10) <= todayIso() ? (
                      <span className="badge badge-pending">↩ Retour à déclarer</span>
                    ) : (
                      <span className={`badge badge-${r.status}`}>{STATUS_FR[r.status] || r.status}</span>
                    )}
                    {r.return_status === 'closed' && parseFloat(r.gap_days) !== 0 && (
                      <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
                        Retour le {fmtDate(r.actual_return_date)} ({parseFloat(r.gap_days) > 0 ? '+' : ''}{parseFloat(r.gap_days)} j)
                      </div>
                    )}
                    {r.status === 'pending' && r.approval_levels > 1 && (
                      <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 2 }}>
                        {r.current_level === 1 ? 'Chez le superviseur' : 'Chez les RH'}
                      </div>
                    )}
                    {r.status === 'rejected' && r.rejection_note && (
                      <div style={{ fontSize: '.68rem', color: 'var(--danger)', marginTop: 2, maxWidth: 160 }} title={r.rejection_note}>
                        {r.rejection_note}
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: '.8rem', color: 'var(--muted)' }}>
                    {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openDetail(r)} title="Détail et suivi">🔍</button>
                      <button className="btn btn-sm btn-outline" onClick={() => handlePDF(r)} title="Télécharger le formulaire PDF">📄</button>
                      {awaitingReturn(r) && (
                        <button className="btn btn-sm btn-green" onClick={() => setReturnFor(r)} title="Déclarer mon retour de congé">
                          ↩ Je suis de retour
                        </button>
                      )}
                      {r.status === 'pending' && (
                        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }}
                          onClick={() => setCancelling(r)} title="Annuler la demande">✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Détail + suivi du circuit */}
      {detail && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)' }}>{detail.type_label}</div>
              <span className={`badge badge-${detail.status}`}>{STATUS_FR[detail.status]}</span>
            </div>
            <div style={{ fontSize: '.82rem', display: 'grid', gridTemplateColumns: '130px 1fr', gap: 6, marginBottom: '1rem' }}>
              <span style={{ color: 'var(--muted)' }}>Période</span>
              <span>{fmtDate(detail.start_date, { dateStyle: 'full' })} → {fmtDate(detail.end_date, { dateStyle: 'full' })}</span>
              <span style={{ color: 'var(--muted)' }}>Durée</span><span>{parseFloat(detail.days_count)} jour(s) ouvré(s)</span>
              <span style={{ color: 'var(--muted)' }}>Retour prévu</span><span>{fmtDate(detail.planned_return_date || calcReturnDate(detail.end_date), { dateStyle: 'full' })}</span>
              <span style={{ color: 'var(--muted)' }}>Motif</span><span>{detail.reason || '—'}</span>
              <span style={{ color: 'var(--muted)' }}>Superviseur</span><span>{detail.manager_name || '—'}</span>
              {detail.has_document && (<>
                <span style={{ color: 'var(--muted)' }}>Justificatif</span>
                <span><button className="btn btn-sm btn-outline"
                  onClick={() => downloadFile(`/requests/${detail.id}/document`, 'justificatif', { open: true })}>📎 Ouvrir</button></span>
              </>)}
            </div>

            <div className="card-title">Suivi</div>
            <div className="steps">
              <div className="step">
                <div className="step-dot" style={{ background: 'var(--success)' }}>✓</div>
                <div>Demande soumise le {new Date(detail.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</div>
              </div>
              {steps === null ? <div className="form-hint">Chargement…</div> : steps.map((s, i) => (
                <div key={i} className="step">
                  <div className="step-dot" style={{ background: s.action === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                    {s.action === 'approved' ? '✓' : '✕'}
                  </div>
                  <div>
                    <strong>{s.action === 'approved' ? 'Validée' : 'Rejetée'}</strong> par {s.approver_name}
                    <span style={{ color: 'var(--muted)' }}> ({ROLE_LABELS[s.role] || s.role}, étape {s.level})</span>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                      {new Date(s.acted_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                    {s.comment && <div style={{ fontStyle: 'italic' }}>« {s.comment} »</div>}
                  </div>
                </div>
              ))}
              {detail.status === 'pending' && (
                <div className="step">
                  <div className="step-dot" style={{ background: 'var(--warn)' }}>…</div>
                  <div>En attente {detail.current_level === 1 ? 'du superviseur' : 'des RH'}</div>
                </div>
              )}
              {retInfo && retInfo.regularization !== 'historique' && (<>
                {retInfo.declared_at && (
                  <div className="step">
                    <div className="step-dot" style={{ background: 'var(--accent)' }}>↩</div>
                    <div>
                      <strong>Retour déclaré</strong> {retInfo.declared_by_name ? `par ${retInfo.declared_by_name}` : ''} : reprise le {fmtDate(retInfo.actual_return_date)}
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                        {new Date(retInfo.declared_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      {retInfo.gap_reason && <div style={{ fontStyle: 'italic' }}>Motif de l’écart : « {retInfo.gap_reason} »</div>}
                    </div>
                  </div>
                )}
                {retInfo.confirmed_at && (
                  <div className="step">
                    <div className="step-dot" style={{ background: parseFloat(retInfo.gap_days) > 0 ? 'var(--warn)' : 'var(--success)' }}>✓</div>
                    <div>
                      <strong>Retour confirmé</strong> par {retInfo.confirmed_by_name} — {parseFloat(retInfo.gap_days) === 0 ? 'à la date prévue'
                        : parseFloat(retInfo.gap_days) < 0 ? `anticipé de ${-parseFloat(retInfo.gap_days)} j (rendus au solde)`
                        : `tardif de ${parseFloat(retInfo.gap_days)} j`}
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                        {new Date(retInfo.confirmed_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      {retInfo.confirmation_comment && <div style={{ fontStyle: 'italic' }}>« {retInfo.confirmation_comment} »</div>}
                    </div>
                  </div>
                )}
                {retInfo.regularized_at && (
                  <div className="step">
                    <div className="step-dot" style={{ background: 'var(--success)' }}>✓</div>
                    <div>
                      <strong>Régularisé</strong> par {retInfo.regularized_by_name} : {REGULARIZATION_FR[retInfo.regularization]}
                      <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                        {new Date(retInfo.regularized_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                      </div>
                      {retInfo.regularization_comment && <div style={{ fontStyle: 'italic' }}>« {retInfo.regularization_comment} »</div>}
                    </div>
                  </div>
                )}
              </>)}
              {retInfo?.status === 'closed' && (
                <div className="step">
                  <div className="step-dot" style={{ background: 'var(--navy)' }}>■</div>
                  <div><strong>Congé clôturé</strong>{retInfo.regularization === 'historique' ? ' (clôture automatique, antérieur au suivi des retours)' : ''} — {parseFloat(retInfo.charged_days)} j imputé(s) au solde</div>
                </div>
              )}
              {detail.status === 'approved' && !retInfo && detail.start_date.slice(0, 10) < todayIso() && (
                <div className="step">
                  <div className="step-dot" style={{ background: 'var(--warn)' }}>…</div>
                  <div>Retour à déclarer (prévu le {fmtDate(detail.planned_return_date)})</div>
                </div>
              )}
              {detail.status === 'approved' && steps?.length === 0 && (
                <div className="step">
                  <div className="step-dot" style={{ background: 'var(--success)' }}>✓</div>
                  <div>Enregistrée automatiquement (type sans validation)</div>
                </div>
              )}
            </div>

            <button className="btn btn-outline" style={{ width: '100%', marginTop: '1rem' }} onClick={() => setDetail(null)}>Fermer</button>
          </div>
        </div>
      )}

      {returnFor && (
        <ReturnModal request={returnFor} mode="declare" onClose={() => setReturnFor(null)}
          onDone={text => { setReturnFor(null); setMsg({ type: 'success', text }); refreshCounters(); load() }} />
      )}

      {/* Confirmation d'annulation */}
      {cancelling && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setCancelling(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 420 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)', marginBottom: '1rem' }}>Annuler cette demande ?</div>
            <div className="alert alert-warn">
              {cancelling.type_label} du {fmtDate(cancelling.start_date)} au {fmtDate(cancelling.end_date)} ({parseFloat(cancelling.days_count)} j).
              Cette action est définitive.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setCancelling(null)}>Non, garder</button>
              <button className="btn btn-red" onClick={confirmCancel}>Oui, annuler la demande</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
