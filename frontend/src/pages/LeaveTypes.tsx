import { useEffect, useState } from 'react'
import api from '../api/axios'

const emptyForm = {
  code: '', label: '', color: '#3B82F6',
  max_days_per_year: 25, requires_approval: true,
  requires_document: false, approval_levels: 1,
}

export default function LeaveTypes() {
  const [types,   setTypes]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(emptyForm)
  const [msg,     setMsg]     = useState<{ type: string; text: string } | null>(null)
  const [saving,  setSaving]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/leave-types')
      setTypes(res.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.code || !form.label) {
      setMsg({ type: 'danger', text: 'Code et libellé obligatoires.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.post('/leave-types', form)
      setMsg({ type: 'success', text: '✅ Type de congé créé avec succès !' })
      setForm(emptyForm)
      setShowAdd(false)
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    } finally { setSaving(false) }
  }

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await api.patch(`/leave-types/${id}`, { is_active: !current })
      setTypes(ts => ts.map(t => t.id === id ? { ...t, is_active: !current } : t))
    } catch (err) { console.error(err) }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Total types</div>
          <div className="stat-val" style={{ color: 'var(--accent)' }}>{types.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avec validation</div>
          <div className="stat-val" style={{ color: 'var(--success)' }}>
            {types.filter(t => t.requires_approval && t.approval_levels > 0).length}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Multi-niveaux</div>
          <div className="stat-val" style={{ color: '#8B5CF6' }}>
            {types.filter(t => t.approval_levels >= 2).length}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-navy" onClick={() => { setShowAdd(true); setMsg(null) }}>
          + Ajouter un type
        </button>
      </div>

      {/* Cards types */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1rem' }}>
        {types.map((t: any) => (
          <div key={t.id} className="card" style={{ borderTop: `3px solid ${t.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: t.color }} />
                <span style={{ fontWeight: 700, fontSize: '.9rem' }}>{t.label}</span>
              </div>
              <code style={{ fontSize: '.7rem', background: 'var(--light)', padding: '2px 8px', borderRadius: 4 }}>
                {t.code}
              </code>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                { label: 'Max / an',         val: `${t.max_days_per_year} jours` },
                { label: 'Validation', val: !t.requires_approval || t.approval_levels === 0 ? 'Automatique' : t.approval_levels === 1 ? 'Superviseur' : 'Superviseur + RH' },
                { label: 'Justificatif',     val: t.requires_document ? 'Oui' : 'Non' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>{row.val}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              <span className={`badge ${t.requires_approval ? 'badge-approved' : 'badge-cancelled'}`}>
                {t.requires_approval && t.approval_levels > 0 ? 'Validation requise' : 'Enregistrement direct'}
              </span>
              <span className={`badge ${t.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                {t.is_active ? 'Actif' : 'Inactif'}
              </span>
            </div>

            <button
              className={`btn btn-sm ${t.is_active ? 'btn-outline' : 'btn-green'}`}
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => toggleActive(t.id, t.is_active)}
            >
              {t.is_active ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        ))}
      </div>

      {/* Modal ajout */}
      {showAdd && (
        <div
          className="modal-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 480 }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              🏷️ Nouveau type de congé
            </div>
            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Code * (ex: CP)</label>
                  <input className="form-control" value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="CP" maxLength={20} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Couleur</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={form.color}
                      onChange={e => setForm({ ...form, color: e.target.value })}
                      style={{ width: 44, height: 38, borderRadius: 8, border: '1.5px solid var(--border)', cursor: 'pointer', padding: 2 }} />
                    <input className="form-control" value={form.color}
                      onChange={e => setForm({ ...form, color: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Libellé *</label>
                <input className="form-control" value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })}
                  placeholder="Congés Payés" required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Max jours / an</label>
                  <input className="form-control" type="number" min={1} max={365}
                    value={form.max_days_per_year}
                    onChange={e => setForm({ ...form, max_days_per_year: parseInt(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Niveaux validation</label>
                  <select className="form-control" value={form.approval_levels}
                    onChange={e => setForm({ ...form, approval_levels: parseInt(e.target.value) })}>
                    <option value={0}>Aucune (enregistrement direct)</option>
                    <option value={1}>1 — Manager</option>
                    <option value={2}>2 — Manager + RH</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 16, marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.83rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.requires_document}
                    onChange={e => setForm({ ...form, requires_document: e.target.checked })}
                    style={{ width: 'auto' }} />
                  Justificatif obligatoire (PDF/image joint à la demande)
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Annuler</button>
                <button type="submit" className="btn btn-navy" disabled={saving}>
                  {saving ? 'Création...' : 'Créer le type'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}