import { useEffect, useState } from 'react'
import api from '../api/axios'

export default function NewRequest() {
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [balances,   setBalances]   = useState<any[]>([])
  const [loading,    setLoading]    = useState(false)
  const [msg,        setMsg]        = useState<{ type: string; text: string } | null>(null)

  const [form, setForm] = useState({
    leave_type_id: '',
    start_date:    '',
    end_date:      '',
    reason:        '',
    is_emergency:  false,
  })

  useEffect(() => {
    const load = async () => {
      const [t, b] = await Promise.all([
        api.get('/leave-types'),
        api.get('/balances/me'),
      ])
      setLeaveTypes(t.data)
      setBalances(b.data)
      if (t.data.length > 0) setForm(f => ({ ...f, leave_type_id: t.data[0].id }))
    }
    load()
  }, [])

  // Calcul jours ouvrés estimé (côté frontend, indicatif)
  // Calcul jours ouvrés côté frontend (indicatif, hors fériés)
const calcDays = () => {
  if (!form.start_date || !form.end_date) return 0
  const start = new Date(form.start_date)
  const end   = new Date(form.end_date)
  if (end < start) return 0
  let count = 0
  const d = new Date(start)
  while (d <= end) {
    const dow = d.getDay()
    if (dow >= 1 && dow <= 5) count++ // lundi à vendredi uniquement
    d.setDate(d.getDate() + 1)
  }
  return count
}

  const days = calcDays()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.start_date || !form.end_date || !form.reason) {
      setMsg({ type: 'danger', text: 'Veuillez remplir tous les champs obligatoires.' })
      return
    }
    if (days === 0) {
      setMsg({ type: 'danger', text: 'Aucun jour ouvré dans la période sélectionnée.' })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      await api.post('/requests', form)
      setMsg({ type: 'success', text: '✅ Demande soumise avec succès ! Votre manager sera notifié.' })
      setForm(f => ({ ...f, start_date: '', end_date: '', reason: '', is_emergency: false }))
    } catch (err: any) {
      const error = err.response?.data?.error || 'Erreur lors de la soumission'
      setMsg({ type: 'danger', text: '❌ ' + error })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>

      {/* Formulaire */}
      <div className="card">
        <div className="card-title">Nouvelle demande de congé</div>

        {msg && (
          <div className={`alert alert-${msg.type}`}>{msg.text}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Type de congé *</label>
            <select
              className="form-control"
              value={form.leave_type_id}
              onChange={e => setForm({ ...form, leave_type_id: e.target.value })}
            >
              {leaveTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date de début *</label>
              <input
                className="form-control"
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Date de fin *</label>
              <input
                className="form-control"
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Indicateur jours */}
          {days > 0 && (
  <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
    📅 <strong>{days} jour(s) ouvré(s)</strong> — du{' '}
    {new Date(form.start_date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
    {' '}au{' '}
    {new Date(form.end_date).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
    <br />
    <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
      ⚠️ Samedis et dimanches exclus
    </span>
  </div>
)}

{form.end_date && new Date(form.end_date) < new Date(form.start_date) && (
  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
    ❌ La date de fin doit être après la date de début
  </div>
)}

          <div className="form-group">
            <label className="form-label">Motif *</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Décrivez le motif de votre absence..."
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              required
            />
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              id="emergency"
              checked={form.is_emergency}
              onChange={e => setForm({ ...form, is_emergency: e.target.checked })}
              style={{ width: 'auto', cursor: 'pointer' }}
            />
            <label htmlFor="emergency" className="form-label"
              style={{ margin: 0, cursor: 'pointer' }}>
              🚨 Urgence médicale
            </label>
          </div>

          <button
            className="btn btn-navy"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px' }}
          >
            {loading ? 'Envoi en cours...' : 'Soumettre la demande'}
          </button>
        </form>
      </div>

      {/* Panneau droite */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Circuit validation */}
        <div className="card">
          <div className="card-title">Circuit de validation</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {[
              { label: 'Employé',    done: true  },
              { label: 'Manager',    done: false },
              { label: 'RH',         done: false },
              { label: 'Approuvé',   done: false },
            ].map((step, i, arr) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: step.done ? 'var(--success)' : i === 1 ? 'var(--accent)' : 'var(--border)',
                    color: step.done || i === 1 ? '#fff' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.75rem', fontWeight: 700
                  }}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center' }}>
                    {step.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, marginBottom: 18,
                    background: step.done ? 'var(--success)' : 'var(--border)'
                  }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Soldes */}
        <div className="card">
          <div className="card-title">Mes soldes disponibles</div>
          {balances.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
              Aucun solde configuré — contactez les RH
            </div>
          ) : (
            balances.map(b => {
              const available = parseFloat(b.total_days) - parseFloat(b.used_days) - parseFloat(b.pending_days)
              const pct = Math.min(100, Math.round((parseFloat(b.used_days) / parseFloat(b.total_days)) * 100))
              return (
                <div key={b.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 4 }}>
                    <span>{b.label}</span>
                    <span style={{ fontWeight: 700, color: b.color }}>
                      {available} j disponibles
                    </span>
                  </div>
                  <div className="prog-wrap">
                    <div className="prog-bar" style={{ width: pct + '%', background: b.color }} />
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
                    {b.used_days} utilisés / {b.total_days} total
                  </div>
                </div>
              )
            })
          )}
        </div>

      </div>
    </div>
  )
}