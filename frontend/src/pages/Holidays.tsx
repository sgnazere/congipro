import { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Holidays() {
  const [holidays, setHolidays] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [year,     setYear]     = useState(new Date().getFullYear())
  const [form,     setForm]     = useState({ date: '', label: '' })
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)
  const [saving,   setSaving]   = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/holidays?year=${year}`)
      setHolidays(res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.date || !form.label) {
      setMsg({ type: 'danger', text: 'Date et libellé obligatoires.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.post('/holidays', form)
      setMsg({ type: 'success', text: '✅ Jour férié ajouté !' })
      setForm({ date: '', label: '' })
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/holidays/${id}`)
      setHolidays(hs => hs.filter(h => h.id !== id))
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>

      {/* Liste */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>
            Jours fériés — {year}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-outline" onClick={() => setYear(y => y - 1)}>◀ {year - 1}</button>
            <button className="btn btn-sm btn-outline" onClick={() => setYear(y => y + 1)}>{year + 1} ▶</button>
          </div>
        </div>

        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {holidays.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucun jour férié pour {year}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Jour</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {holidays.map((h: any) => {
                const d = new Date(h.date)
                const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
                return (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>
                      {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                    </td>
                    <td>{h.label}</td>
                    <td>
                      <span className="badge badge-pending">{jours[d.getDay()]}</span>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-red"
                        onClick={() => handleDelete(h.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--light)', borderRadius: 8, fontSize: '.78rem', color: 'var(--muted)' }}>
          📌 {holidays.length} jours fériés en {year}
        </div>
      </div>

      {/* Formulaire ajout */}
      <div className="card">
        <div className="card-title">Ajouter un jour férié</div>
        <form onSubmit={handleAdd}>
          <div className="form-group">
            <label className="form-label">Date *</label>
            <input className="form-control" type="date" value={form.date}
              onChange={e => setForm({ ...form, date: e.target.value })} required />
          </div>
          <div className="form-group">
            <label className="form-label">Libellé *</label>
            <input className="form-control" value={form.label}
              onChange={e => setForm({ ...form, label: e.target.value })}
              placeholder="Ex: Pont du 8 mai" required />
          </div>
          <button type="submit" className="btn btn-navy" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Ajout...' : '+ Ajouter'}
          </button>
        </form>

        {/* Fériés nationaux rapides */}
        <div style={{ marginTop: '1.5rem' }}>
          <div className="card-title">Jours fériés nationaux {year}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { date: `${year}-01-01`, label: "Jour de l'An" },
              { date: `${year}-05-01`, label: 'Fête du Travail' },
              { date: `${year}-05-08`, label: 'Victoire 1945' },
              { date: `${year}-07-14`, label: 'Fête Nationale' },
              { date: `${year}-08-15`, label: 'Assomption' },
              { date: `${year}-11-01`, label: 'Toussaint' },
              { date: `${year}-11-11`, label: 'Armistice' },
              { date: `${year}-12-25`, label: 'Noël' },
            ].map(h => {
              const exists = holidays.some(x => x.date?.slice(0, 10) === h.date)
              return (
                <div key={h.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.82rem' }}>
                    <span style={{ color: 'var(--muted)', marginRight: 8 }}>
                      {new Date(h.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                    {h.label}
                  </div>
                  {exists ? (
                    <span className="badge badge-approved" style={{ fontSize: '.68rem' }}>✓ Ajouté</span>
                  ) : (
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => { setForm(h); }}
                    >
                      + Ajouter
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}