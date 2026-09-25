import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { refreshCounters } from '../navigation'

const MAX_FILE = 3 * 1024 * 1024
const ACCEPTED = ['application/pdf', 'image/jpeg', 'image/png']

const readAsBase64 = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload  = () => resolve(String(reader.result).split(',')[1])
  reader.onerror = reject
  reader.readAsDataURL(file)
})

const emptyForm = { leave_type_id: '', start_date: '', end_date: '', reason: '', is_emergency: false }

export default function NewRequest() {
  const navigate = useNavigate()
  const [leaveTypes, setLeaveTypes] = useState<any[]>([])
  const [balances,   setBalances]   = useState<any[]>([])
  const [holidays,   setHolidays]   = useState<string[]>([])
  const [loading,    setLoading]    = useState(false)
  const [msg,        setMsg]        = useState<{ type: string; text: string } | null>(null)
  const [file,       setFile]       = useState<File | null>(null)
  const [form,       setForm]       = useState(emptyForm)

  // Soldes de l'année de la demande (droits attribués par année)
  const [balanceYear, setBalanceYear] = useState(new Date().getFullYear())
  const loadBalances = (y = balanceYear) => api.get('/balances/me', { params: { year: y } }).then(b => setBalances(b.data))

  useEffect(() => {
    const load = async () => {
      const [t] = await Promise.all([api.get('/leave-types'), loadBalances()])
      // Aucun type présélectionné : l'ancien choix par défaut (1er par ordre alphabétique = Arrêt maladie)
      // a fait enregistrer des congés payés en arrêt maladie
      setLeaveTypes(t.data)
    }
    load()
  }, [])

  // Jours fériés de l'année de la demande, pour un décompte identique à celui du serveur
  const year = form.start_date.slice(0, 4)
  useEffect(() => {
    if (!year) return
    api.get(`/holidays?year=${year}`).then(r => setHolidays(r.data.map((h: any) => h.date.slice(0, 10))))
    setBalanceYear(parseInt(year))
    loadBalances(parseInt(year))
  }, [year])

  const type    = leaveTypes.find(t => t.id === form.leave_type_id)
  const balance = balances.find(b => b.code === type?.code)
  const levels  = type ? (type.requires_approval ? type.approval_levels : 0) : 1

  const calcDays = () => {
    if (!form.start_date || !form.end_date || form.end_date < form.start_date) return 0
    let count = 0
    const d   = new Date(form.start_date + 'T00:00:00Z')
    const end = new Date(form.end_date + 'T00:00:00Z')
    while (d <= end) {
      const dow = d.getUTCDay()
      if (dow >= 1 && dow <= 5 && !holidays.includes(d.toISOString().slice(0, 10))) count++
      d.setUTCDate(d.getUTCDate() + 1)
    }
    return count
  }
  const days = calcDays()
  const holidaysInRange = holidays.filter(h => h >= form.start_date && h <= form.end_date).length
  const available = balance ? parseFloat(balance.available_days) : null

  const onFile = (f: File | null) => {
    setMsg(null)
    if (f && !ACCEPTED.includes(f.type)) { setMsg({ type: 'danger', text: 'Format non accepté : PDF, JPG ou PNG.' }); return }
    if (f && f.size > MAX_FILE)          { setMsg({ type: 'danger', text: 'Fichier trop volumineux (3 Mo maximum).' }); return }
    setFile(f)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.leave_type_id) {
      setMsg({ type: 'danger', text: 'Choisissez le type de congé.' })
      return
    }
    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      setMsg({ type: 'danger', text: 'Veuillez remplir tous les champs obligatoires.' })
      return
    }
    if (days === 0) {
      setMsg({ type: 'danger', text: 'Aucun jour ouvré dans la période sélectionnée.' })
      return
    }
    if (type?.requires_document && !file) {
      setMsg({ type: 'danger', text: `Un justificatif est obligatoire pour « ${type.label} ».` })
      return
    }
    setLoading(true)
    setMsg(null)
    try {
      const document = file ? { name: file.name, type: file.type, data: await readAsBase64(file) } : undefined
      const res = await api.post('/requests', { ...form, document })
      setMsg({
        type: 'success',
        text: res.data.auto_approved
          ? '✅ Absence enregistrée (ce type ne nécessite pas de validation). Votre superviseur est informé.'
          : '✅ Demande soumise ! Votre superviseur a été notifié. Suivez son avancement dans « Mes demandes ».',
      })
      setForm(emptyForm)
      setFile(null)
      loadBalances()
      refreshCounters()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur lors de la soumission') })
    } finally {
      setLoading(false)
    }
  }

  const circuit = [
    { label: 'Vous',        on: true },
    ...(levels >= 1 ? [{ label: 'Superviseur', on: false }] : []),
    ...(levels >= 2 ? [{ label: 'RH',          on: false }] : []),
    { label: levels === 0 ? 'Enregistré' : 'Approuvé', on: false },
  ]

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>

      <div className="card">
        <div className="card-title">Nouvelle demande de congé</div>

        {msg && (
          <div className={`alert alert-${msg.type}`}>
            <span style={{ flex: 1 }}>{msg.text}</span>
            {msg.type === 'success' && (
              <button className="btn btn-sm btn-outline" onClick={() => navigate('/requests')}>Voir mes demandes</button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Type de congé *</label>
            <select
              className="form-control"
              value={form.leave_type_id}
              onChange={e => { setForm({ ...form, leave_type_id: e.target.value }); setMsg(null) }}
              required
            >
              <option value="" disabled>— Choisissez un type de congé —</option>
              {leaveTypes.map(t => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {available !== null && (
              <div className="form-hint">Solde disponible : <strong>{available} j</strong></div>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Date de début *</label>
              <input className="form-control" type="date" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label className="form-label">Date de fin *</label>
              <input className="form-control" type="date" value={form.end_date} min={form.start_date || undefined}
                onChange={e => setForm({ ...form, end_date: e.target.value })} required />
            </div>
          </div>

          {days > 0 && (
            <div className={`alert ${available !== null && days > available ? 'alert-warn' : 'alert-info'}`} style={{ marginBottom: '1rem' }}>
              <div>
                📅 <strong>{days} jour(s) ouvré(s)</strong> — du{' '}
                {new Date(form.start_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                {' '}au{' '}
                {new Date(form.end_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                <br />
                <span style={{ fontSize: '.75rem' }}>
                  Week-ends exclus{holidaysInRange > 0 ? `, ${holidaysInRange} jour(s) férié(s) exclu(s)` : ''}.
                  {available !== null && days > available && ' ⚠️ Dépasse votre solde disponible.'}
                </span>
              </div>
            </div>
          )}

          {form.end_date && form.start_date && form.end_date < form.start_date && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              ❌ La date de fin doit être après la date de début
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Motif *</label>
            <textarea className="form-control" rows={3} placeholder="Décrivez le motif de votre absence..."
              value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required />
          </div>

          <div className="form-group">
            <label className="form-label">
              Justificatif {type?.requires_document ? '*' : '(facultatif)'}
            </label>
            <input className="form-control" type="file" accept=".pdf,.jpg,.jpeg,.png"
              key={file ? 'with-file' : 'no-file'}
              onChange={e => onFile(e.target.files?.[0] || null)} />
            <div className="form-hint">
              {file ? `📎 ${file.name} (${Math.round(file.size / 1024)} Ko)` : 'PDF, JPG ou PNG — 3 Mo maximum'}
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="emergency" checked={form.is_emergency}
              onChange={e => setForm({ ...form, is_emergency: e.target.checked })}
              style={{ width: 'auto', cursor: 'pointer' }} />
            <label htmlFor="emergency" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
              🚨 Urgence (la demande est traitée en priorité)
            </label>
          </div>

          <button className="btn btn-navy" type="submit" disabled={loading} style={{ width: '100%', padding: '11px' }}>
            {loading ? 'Envoi en cours...' : 'Soumettre la demande'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        <div className="card">
          <div className="card-title">Circuit de validation{type ? ` — ${type.label}` : ''}</div>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {circuit.map((step, i, arr) => (
              <div key={step.label} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: step.on ? 'var(--success)' : i === 1 ? 'var(--accent)' : 'var(--border)',
                    color: step.on || i === 1 ? '#fff' : 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '.75rem', fontWeight: 700
                  }}>
                    {step.on ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '.65rem', color: 'var(--muted)', textAlign: 'center' }}>{step.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ flex: 1, height: 2, marginBottom: 18, background: step.on ? 'var(--success)' : 'var(--border)' }} />
                )}
              </div>
            ))}
          </div>
          {levels === 0 && (
            <div className="form-hint" style={{ marginTop: 8 }}>
              Ce type d'absence est enregistré immédiatement, sans validation. Votre superviseur est informé.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Mes soldes {balanceYear}</div>
          {balances.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>
              Aucun solde configuré — il sera créé automatiquement à votre première demande.
            </div>
          ) : (
            balances.map(b => {
              const avail = parseFloat(b.available_days)
              const pct = Math.min(100, Math.round((parseFloat(b.used_days) / parseFloat(b.total_days)) * 100))
              return (
                <div key={b.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 4 }}>
                    <span>{b.label}</span>
                    <span style={{ fontWeight: 700, color: b.color }}>{avail} j disponibles</span>
                  </div>
                  <div className="prog-wrap">
                    <div className="prog-bar" style={{ width: pct + '%', background: b.color }} />
                  </div>
                  <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
                    {parseFloat(b.used_days)} pris · {parseFloat(b.pending_days)} en attente · {parseFloat(b.total_days)} acquis
                    {parseFloat(b.carried_days) < 0 && (
                      <span title={`Jours pris en trop en ${balanceYear - 1}, déduits de ${balanceYear}`}> · {parseFloat(b.carried_days)} j reportés de {balanceYear - 1}</span>
                    )}
                    {avail < 0 && parseFloat(b.total_days) + parseFloat(b.carried_days) - parseFloat(b.used_days) < 0 && (
                      <span style={{ color: 'var(--danger)' }}> · dépassement à déduire sur {balanceYear + 1}</span>
                    )}
                    {parseFloat(b.adjusted_days) > 0 && (
                      <span title={b.adjustment_note || ''}> · dont {parseFloat(b.adjusted_days)} j de reprise</span>
                    )}
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
