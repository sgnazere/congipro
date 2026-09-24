import { useEffect, useState } from 'react'
import api from '../api/axios'
import { fmtDate } from '../utils/dates'

type Mode = 'declare' | 'confirm' | 'record'

const TITLES: Record<Mode, string> = {
  declare: '↩ Déclarer mon retour',
  confirm: '✓ Confirmer le retour',
  record:  '↩ Enregistrer le retour',
}

const todayIso = () => new Date().toISOString().slice(0, 10)

// Jours ouvrés dans [a, b] (lundi-vendredi hors fériés), même règle que le serveur
function businessDays(a: string, b: string, holidays: string[]) {
  if (b < a) return 0
  let n = 0
  const d = new Date(a + 'T00:00:00Z'), end = new Date(b + 'T00:00:00Z')
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10)
    if (d.getUTCDay() >= 1 && d.getUTCDay() <= 5 && !holidays.includes(iso)) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}
const dayBefore = (iso: string) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

export default function ReturnModal({ request, mode, onClose, onDone }: {
  request: any, mode: Mode, onClose: () => void, onDone: (message: string) => void
}) {
  const planned = request.planned_return_date?.slice(0, 10)
  const initial = request.actual_return_date?.slice(0, 10) || (todayIso() < planned ? todayIso() : planned)
  const [date,     setDate]     = useState(initial)
  const [reason,   setReason]   = useState(request.gap_reason || '')
  const [comment,  setComment]  = useState('')
  const [holidays, setHolidays] = useState<string[]>([])
  const [error,    setError]    = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)

  useEffect(() => {
    const years = [...new Set([request.start_date.slice(0, 4), todayIso().slice(0, 4)])]
    Promise.all(years.map(y => api.get(`/holidays?year=${y}`)))
      .then(rs => setHolidays(rs.flatMap(r => r.data.map((h: any) => h.date.slice(0, 10)))))
  }, [request.start_date])

  const valid = date > request.start_date.slice(0, 10) && date <= todayIso()
  const actual = valid ? businessDays(request.start_date.slice(0, 10), dayBefore(date), holidays) : 0
  const gap = actual - parseFloat(request.days_count)

  const submit = async () => {
    if (!valid) { setError('Date invalide : après le début du congé et au plus tard aujourd’hui.'); return }
    if (gap !== 0 && !reason.trim()) { setError('Indiquez le motif de l’écart.'); return }
    setSaving(true); setError(null)
    try {
      const body = { actual_return_date: date, reason: reason.trim() || undefined, comment: comment.trim() || undefined }
      const res = mode === 'confirm'
        ? await api.patch(`/requests/${request.id}/return/confirm`, body)
        : await api.post(`/requests/${request.id}/return`, body)
      const st = res.data.status
      onDone(st === 'declared' ? '✅ Retour déclaré. Votre superviseur va le confirmer.'
        : st === 'closed' ? `✅ Retour confirmé : congé clôturé${gap < 0 ? ` (${-gap} j rendus au solde)` : ''}.`
        : `Retour confirmé avec ${gap} j de dépassement : transmis aux RH pour régularisation.`)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur serveur')
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="card" style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)', marginBottom: '1rem' }}>{TITLES[mode]}</div>

        <div className="alert alert-info">
          <div>
            {request.user_name && <><strong>{request.user_name}</strong> — </>}{request.type_label}<br />
            <span style={{ fontSize: '.8rem' }}>
              Congé du {fmtDate(request.start_date)} au {fmtDate(request.end_date)} ({parseFloat(request.days_count)} j) ·
              retour prévu le <strong>{fmtDate(planned, { weekday: 'long', day: '2-digit', month: 'long' })}</strong>
            </span>
            {request.declaration_comment && <div style={{ fontSize: '.78rem', marginTop: 4 }}>Commentaire de l’employé : « {request.declaration_comment} »</div>}
          </div>
        </div>

        {error && <div className="alert alert-danger">❌ {error}</div>}

        <div className="form-group">
          <label className="form-label">Date de retour effective *</label>
          <input className="form-control" type="date" value={date} max={todayIso()}
            min={request.start_date.slice(0, 10)} onChange={e => setDate(e.target.value)} />
          <div className="form-hint">Premier jour de reprise du travail.</div>
        </div>

        {valid && (
          <div className={`alert ${gap > 0 ? 'alert-warn' : gap < 0 ? 'alert-info' : 'alert-success'}`}>
            {gap === 0 && '✓ Retour à la date prévue.'}
            {gap < 0 && `Retour anticipé : ${actual} j pris sur ${parseFloat(request.days_count)} — ${-gap} j seront rendus au solde.`}
            {gap > 0 && `Retour tardif : ${gap} jour(s) ouvré(s) de dépassement — régularisation par les RH.`}
          </div>
        )}

        {gap !== 0 && (
          <div className="form-group">
            <label className="form-label">Motif de l’écart *</label>
            <textarea className="form-control" rows={2} value={reason} onChange={e => setReason(e.target.value)}
              placeholder={gap > 0 ? 'Ex : prolongation pour raison médicale, retard de transport…' : 'Ex : besoin du service, fin anticipée…'} />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Commentaire (facultatif)</label>
          <textarea className="form-control" rows={2} value={comment} onChange={e => setComment(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn btn-outline" onClick={onClose}>Annuler</button>
          <button className="btn btn-green" onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement…' : mode === 'declare' ? 'Déclarer mon retour' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
