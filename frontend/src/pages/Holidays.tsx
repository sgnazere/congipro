import { useEffect, useState } from 'react'
import api from '../api/axios'
import { fmtDate } from '../utils/dates'

// Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien)
function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}
const plus = (d: Date, n: number) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10)

// Jours fériés légaux de Côte d'Ivoire à date fixe ou calculable
function ivorianHolidays(year: number) {
  const e = easter(year)
  return [
    { date: `${year}-01-01`, label: "Jour de l'An" },
    { date: plus(e, 1),      label: 'Lundi de Pâques' },
    { date: `${year}-05-01`, label: 'Fête du Travail' },
    { date: plus(e, 39),     label: 'Ascension' },
    { date: plus(e, 50),     label: 'Lundi de Pentecôte' },
    { date: `${year}-08-07`, label: "Fête de l'Indépendance" },
    { date: `${year}-08-15`, label: 'Assomption' },
    { date: `${year}-11-01`, label: 'Toussaint' },
    { date: `${year}-11-15`, label: 'Journée nationale de la Paix' },
    { date: `${year}-12-25`, label: 'Noël' },
  ].sort((a, b) => a.date.localeCompare(b.date))
}

export default function Holidays() {
  const [holidays, setHolidays] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [year,     setYear]     = useState(new Date().getFullYear())
  const [form,     setForm]     = useState({ date: '', label: '' })
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get(`/holidays?year=${year}`)
      setHolidays(res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [year])

  const add = async (h: { date: string; label: string }) => {
    await api.post('/holidays', h)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.date || !form.label.trim()) {
      setMsg({ type: 'danger', text: 'Date et libellé obligatoires.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await add(form)
      setMsg({ type: 'success', text: `✅ ${form.label} ajouté.` })
      setForm({ date: '', label: '' })
      if (form.date.slice(0, 4) !== String(year)) setYear(parseInt(form.date.slice(0, 4)))
      else load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    } finally { setSaving(false) }
  }

  const reference = ivorianHolidays(year)
  const missing   = reference.filter(h => !holidays.some(x => x.date?.slice(0, 10) === h.date))

  const addReference = async (list: { date: string; label: string }[]) => {
    setSaving(true)
    setMsg(null)
    try {
      for (const h of list) await add(h)
      setMsg({ type: 'success', text: `✅ ${list.length} jour(s) férié(s) ajouté(s) pour ${year}.` })
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
    } finally { setToDelete(null) }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>Jours fériés — {year}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm btn-outline" onClick={() => setYear(y => y - 1)}>◀ {year - 1}</button>
            <button className="btn btn-sm btn-outline" onClick={() => setYear(y => y + 1)}>{year + 1} ▶</button>
          </div>
        </div>

        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {holidays.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucun jour férié saisi pour {year}. Tant qu'ils ne sont pas saisis, ils sont décomptés comme des jours de congé.
          </div>
        ) : (
          <table>
            <thead>
              <tr><th>Date</th><th>Libellé</th><th>Jour</th><th></th></tr>
            </thead>
            <tbody>
              {holidays.map((h: any) => (
                <tr key={h.id}>
                  <td style={{ fontWeight: 600 }}>{fmtDate(h.date, { day: '2-digit', month: 'long' })}</td>
                  <td>{h.label}</td>
                  <td><span className="badge badge-pending">{fmtDate(h.date, { weekday: 'short' })}</span></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {toDelete === h.id ? (<>
                      <button className="btn btn-sm btn-red" onClick={() => handleDelete(h.id)}>Supprimer</button>{' '}
                      <button className="btn btn-sm btn-outline" onClick={() => setToDelete(null)}>Non</button>
                    </>) : (
                      <button className="btn btn-sm btn-outline" onClick={() => setToDelete(h.id)} title="Supprimer">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--light)', borderRadius: 8, fontSize: '.78rem', color: 'var(--muted)' }}>
          📌 {holidays.length} jour(s) férié(s) en {year} — exclus automatiquement du décompte des congés.
        </div>
      </div>

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
              placeholder="Ex : Tabaski, pont décrété…" required />
          </div>
          <button type="submit" className="btn btn-navy" style={{ width: '100%' }} disabled={saving}>
            {saving ? 'Ajout...' : '+ Ajouter'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="card-title" style={{ margin: 0 }}>Fériés légaux Côte d'Ivoire {year}</div>
            {missing.length > 0 && (
              <button className="btn btn-sm btn-accent" disabled={saving} onClick={() => addReference(missing)}>
                Tout ajouter ({missing.length})
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {reference.map(h => {
              const exists = holidays.some(x => x.date?.slice(0, 10) === h.date)
              return (
                <div key={h.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '.82rem' }}>
                    <span style={{ color: 'var(--muted)', marginRight: 8, display: 'inline-block', minWidth: 80 }}>
                      {fmtDate(h.date, { weekday: 'short', day: '2-digit', month: 'short' })}
                    </span>
                    {h.label}
                  </div>
                  {exists ? (
                    <span className="badge badge-approved" style={{ fontSize: '.68rem' }}>✓ Ajouté</span>
                  ) : (
                    <button className="btn btn-sm btn-outline" disabled={saving} onClick={() => addReference([h])}>+ Ajouter</button>
                  )}
                </div>
              )
            })}
          </div>
          <div className="alert alert-info" style={{ marginTop: 12, fontSize: '.75rem' }}>
            Les fêtes musulmanes (lendemain de la Nuit du Destin, Korité, Tabaski, lendemain du Maouloud) suivent le
            calendrier lunaire : leurs dates sont fixées chaque année par décret. Saisissez-les avec le formulaire ci-dessus.
          </div>
        </div>
      </div>
    </div>
  )
}
