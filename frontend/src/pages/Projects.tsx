import { useEffect, useState } from 'react'
import api from '../api/axios'

const emptyForm = {
  name: '', code: '', description: '',
  manager_id: '', start_date: '', end_date: '',
}

export default function Projects() {
  const [projects,  setProjects]  = useState<any[]>([])
  const [managers,  setManagers]  = useState<any[]>([])
  const [members,   setMembers]   = useState<any[]>([])
  const [selProject,setSelProject]= useState<any | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [showAdd,   setShowAdd]   = useState(false)
  const [showEdit,  setShowEdit]  = useState<any | null>(null)
  const [form,      setForm]      = useState(emptyForm)
  const [msg,       setMsg]       = useState<{ type: string; text: string } | null>(null)
  const [saving,    setSaving]    = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [p, u] = await Promise.all([
        api.get('/projects'),
        api.get('/users', { params: { roles: 'manager,rh,admin,director' } }),
      ])
      setProjects(p.data)
      setManagers(u.data.filter((u: any) => ['manager', 'rh', 'admin', 'director'].includes(u.role)))
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const loadMembers = async (projectId: string) => {
    try {
      const res = await api.get(`/projects/${projectId}/members`)
      setMembers(res.data)
    } catch (err) { console.error(err) }
  }

  const handleSelectProject = (p: any) => {
    setSelProject(p)
    loadMembers(p.id)
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.code) {
      setMsg({ type: 'danger', text: 'Nom et code obligatoires.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.post('/projects', form)
      setMsg({ type: 'success', text: '✅ Projet créé avec succès !' })
      setForm(emptyForm)
      setShowAdd(false)
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    } finally { setSaving(false) }
  }

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!showEdit) return
    setSaving(true)
    try {
      await api.patch(`/projects/${showEdit.id}`, {
        name:        showEdit.name,
        description: showEdit.description,
        manager_id:  showEdit.manager_id,
        start_date:  showEdit.start_date,
        end_date:    showEdit.end_date,
        is_active:   showEdit.is_active,
      })
      setMsg({ type: 'success', text: '✅ Projet mis à jour !' })
      setShowEdit(null)
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur') })
    } finally { setSaving(false) }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Total projets', val: projects.length,                            color: 'var(--accent)'  },
          { label: 'Actifs',        val: projects.filter(p => p.is_active).length,   color: 'var(--success)' },
          { label: 'Membres total', val: projects.reduce((a, p) => a + parseInt(p.employee_count || 0), 0), color: '#8B5CF6' },
          { label: 'Sans manager',  val: projects.filter(p => !p.manager_id).length, color: 'var(--warn)'    },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-navy" onClick={() => { setShowAdd(true); setMsg(null) }}>
          + Nouveau projet
        </button>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>

        {/* Liste projets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {projects.map((p: any) => (
            <div
              key={p.id}
              className="card"
              style={{
                cursor: 'pointer',
                borderLeft: `4px solid ${p.is_active ? 'var(--accent)' : 'var(--border)'}`,
                outline: selProject?.id === p.id ? '2px solid var(--accent)' : 'none',
                outlineOffset: 2,
              }}
              onClick={() => handleSelectProject(p)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '.95rem' }}>{p.name}</span>
                    <code style={{ fontSize: '.7rem', background: 'var(--light)', padding: '2px 8px', borderRadius: 4 }}>
                      {p.code}
                    </code>
                    <span className={`badge ${p.is_active ? 'badge-approved' : 'badge-rejected'}`}
                      style={{ fontSize: '.65rem' }}>
                      {p.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>

                  {p.description && (
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 8 }}>
                      {p.description}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 16, fontSize: '.78rem', color: 'var(--muted)' }}>
                    <span>👥 {p.employee_count} membre(s)</span>
                    {p.manager_name && <span>👤 Manager : <strong>{p.manager_name}</strong></span>}
                    {p.start_date && (
                      <span>📅 {new Date(p.start_date).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-sm btn-outline"
                  onClick={e => { e.stopPropagation(); setShowEdit({ ...p }); setMsg(null) }}
                >
                  ✏️ Éditer
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Détail projet sélectionné */}
        <div className="card">
          {selProject ? (
            <>
              <div className="card-title">
                👥 Membres — {selProject.name}
              </div>

              {members.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '1.5rem', fontSize: '.82rem' }}>
                  Aucun membre assigné à ce projet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {members.map((m: any) => {
                    const initials = `${m.first_name?.[0] || ''}${m.last_name?.[0] || ''}`.toUpperCase()
                    const roleColors: Record<string, string> = {
                      employee: '#3B82F6', manager: '#8B5CF6',
                      rh: '#10B981', admin: '#EF4444', director: '#F59E0B'
                    }
                    const color = roleColors[m.role] || '#64748B'
                    return (
                      <div key={m.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8,
                        background: 'var(--light)', border: '1px solid var(--border)'
                      }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: '50%',
                          background: color + '20', color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '.7rem', flexShrink: 0
                        }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: '.83rem' }}>
                            {m.first_name} {m.last_name}
                          </div>
                          <div style={{ fontSize: '.72rem', color: 'var(--muted)' }}>
                            {m.email}
                          </div>
                        </div>
                        <span className="badge" style={{ background: color + '20', color, fontSize: '.68rem' }}>
                          {({ employee: 'Employé', manager: 'Manager', rh: 'RH', admin: 'Admin', director: 'Directeur' } as Record<string, string>)[m.role] || m.role}
                        </span>
                        <span className={`badge ${m.is_active ? 'badge-approved' : 'badge-rejected'}`}
                          style={{ fontSize: '.65rem' }}>
                          {m.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '3rem', fontSize: '.85rem' }}>
              👈 Sélectionnez un projet pour voir ses membres
            </div>
          )}
        </div>
      </div>

      {/* Modal création projet */}
      {showAdd && (
        <div
          className="modal-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 520 }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              🏗️ Nouveau projet
            </div>
            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nom du projet *</label>
                  <input className="form-control" value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Projet Alpha" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Code * (ex: ALPHA)</label>
                  <input className="form-control" value={form.code}
                    onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    placeholder="ALPHA" maxLength={20} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" rows={2} value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Description du projet..." />
              </div>

              <div className="form-group">
                <label className="form-label">Manager du projet</label>
                <select className="form-control" value={form.manager_id}
                  onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                  <option value="">— Sélectionner un manager —</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name} ({m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date de début</label>
                  <input className="form-control" type="date" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date de fin</label>
                  <input className="form-control" type="date" value={form.end_date}
                    onChange={e => setForm({ ...form, end_date: e.target.value })} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline"
                  onClick={() => { setShowAdd(false); setMsg(null) }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-navy" disabled={saving}>
                  {saving ? 'Création...' : 'Créer le projet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal édition projet */}
      {showEdit && (
        <div
          className="modal-backdrop"
          onClick={e => { if (e.target === e.currentTarget) setShowEdit(null) }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 520 }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              ✏️ Modifier — {showEdit.name}
            </div>
            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label className="form-label">Nom du projet *</label>
                <input className="form-control" value={showEdit.name}
                  onChange={e => setShowEdit({ ...showEdit, name: e.target.value })} required />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-control" rows={2} value={showEdit.description || ''}
                  onChange={e => setShowEdit({ ...showEdit, description: e.target.value })} />
              </div>

              <div className="form-group">
                <label className="form-label">Manager du projet</label>
                <select className="form-control" value={showEdit.manager_id || ''}
                  onChange={e => setShowEdit({ ...showEdit, manager_id: e.target.value })}>
                  <option value="">— Aucun manager —</option>
                  {managers.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.first_name} {m.last_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Date de début</label>
                  <input className="form-control" type="date"
                    value={showEdit.start_date?.slice(0, 10) || ''}
                    onChange={e => setShowEdit({ ...showEdit, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Date de fin</label>
                  <input className="form-control" type="date"
                    value={showEdit.end_date?.slice(0, 10) || ''}
                    onChange={e => setShowEdit({ ...showEdit, end_date: e.target.value })} />
                </div>
              </div>

              <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="proj_active"
                  checked={showEdit.is_active}
                  onChange={e => setShowEdit({ ...showEdit, is_active: e.target.checked })}
                  style={{ width: 'auto' }} />
                <label htmlFor="proj_active" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                  Projet actif
                </label>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-outline"
                  onClick={() => { setShowEdit(null); setMsg(null) }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-navy" disabled={saving}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}