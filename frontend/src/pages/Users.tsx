import { useEffect, useState } from 'react'
import api from '../api/axios'

const ROLES: Record<string, string> = {
  employee: 'Employé',
  manager:  'Manager',
  rh:       'RH / Admin',
}
const ROLE_COLORS: Record<string, string> = {
  employee: '#3B82F6',
  manager:  '#8B5CF6',
  rh:       '#10B981',
}

const emptyForm = {
  first_name: '', last_name: '', email: '',
  password: '', role: 'employee', project_id: '', manager_id: '',
}

export default function Users() {
  const [users,   setUsers]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form,    setForm]    = useState(emptyForm)
  const [msg,     setMsg]     = useState<{ type: string; text: string } | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const u = await api.get('/users')
      setUsers(u.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.first_name || !form.last_name || !form.email || !form.password) {
      setMsg({ type: 'danger', text: 'Veuillez remplir tous les champs obligatoires.' })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.post('/users', {
        ...form,
        project_id:    form.project_id    || undefined,
        manager_id: form.manager_id || undefined,
      })
      setMsg({ type: 'success', text: '✅ Utilisateur créé avec succès !' })
      setForm(emptyForm)
      setShowAdd(false)
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur serveur') })
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (userId: string, current: boolean) => {
    try {
      await api.patch(`/users/${userId}`, { is_active: !current })
      setUsers(us => us.map(u => u.id === userId ? { ...u, is_active: !current } : u))
    } catch (err) {
      console.error(err)
    }
  }

  const assignManager = async (userId: string, managerId: string) => {
    try {
      await api.patch(`/users/${userId}`, { manager_id: managerId })
      setUsers(us => us.map(u => u.id === userId
        ? { ...u, manager_id: managerId, manager_name: managers.find(m => m.id === managerId)?.first_name + ' ' + managers.find(m => m.id === managerId)?.last_name }
        : u
      ))
      setMsg({ type: 'success', text: 'Superviseur affecté avec succès.' })
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur lors de l’affectation du superviseur' })
    }
  }

  const filtered = users.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const managers = users.filter(u => u.role === 'manager' || u.role === 'rh')

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Stats */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Total',      val: users.length,                                    color: 'var(--accent)'  },
          { label: 'Employés',   val: users.filter(u => u.role === 'employee').length, color: '#3B82F6'        },
          { label: 'Managers',   val: users.filter(u => u.role === 'manager').length,  color: '#8B5CF6'        },
          { label: 'Actifs',     val: users.filter(u => u.is_active).length,           color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', alignItems: 'center' }}>
        <input
          className="form-control"
          placeholder="🔍 Rechercher un utilisateur..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <button className="btn btn-navy" onClick={() => { setShowAdd(true); setMsg(null) }}>
          + Ajouter un utilisateur
        </button>
      </div>

      {/* Tableau */}
      <div className="card">
        <div className="card-title">Liste des utilisateurs ({filtered.length})</div>
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Project</th>
              <th>Manager</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => {
              const initials = `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase()
              const color = ROLE_COLORS[u.role] || '#64748B'
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: color + '20', color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '.72rem', flexShrink: 0
                      }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>
                          {u.first_name} {u.last_name}
                        </div>
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>
                          Depuis {u.hire_date ? new Date(u.hire_date).toLocaleDateString('fr-FR') : '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '.82rem' }}>{u.email}</td>
                  <td>
                    <span className="badge" style={{ background: color + '20', color }}>
                      {ROLES[u.role] || u.role}
                    </span>
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {u.department || '—'}
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {u.role === 'employee' ? (
                      <select
                        className="form-control"
                        value={u.manager_id || ''}
                        onChange={e => assignManager(u.id, e.target.value)}
                        style={{ minWidth: 170, padding: '5px 8px' }}
                      >
                        <option value="" disabled>Choisir un superviseur</option>
                        {managers.map(m => (
                          <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                        ))}
                      </select>
                    ) : (u.manager_name || '—')}
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-green'}`}
                      onClick={() => toggleActive(u.id, u.is_active)}
                    >
                      {u.is_active ? 'Désactiver' : 'Activer'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal ajout */}
      {showAdd && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem'
          }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              👤 Nouvel utilisateur
            </div>

            {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Prénom *</label>
                  <input className="form-control" value={form.first_name}
                    onChange={e => setForm({ ...form, first_name: e.target.value })}
                    placeholder="Sophie" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" value={form.last_name}
                    onChange={e => setForm({ ...form, last_name: e.target.value })}
                    placeholder="Martin" required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email *</label>
                <input className="form-control" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="sophie.martin@congipro.fr" required />
              </div>

              <div className="form-group">
                <label className="form-label">Mot de passe *</label>
                <input className="form-control" type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 8 caractères" required />
                <div className="form-hint">Minimum 8 caractères</div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Rôle *</label>
                  <select className="form-control" value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="employee">Employé</option>
                    <option value="manager">Manager</option>
                    <option value="rh">RH / Admin</option>
                  </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Superviseur *</label>
                  <select className="form-control" value={form.manager_id}
                    onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                    <option value="" disabled>Choisir un superviseur</option>
                    {managers.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline"
                  onClick={() => { setShowAdd(false); setMsg(null) }}>
                  Annuler
                </button>
                <button type="submit" className="btn btn-navy" disabled={saving}>
                  {saving ? 'Création...' : 'Créer l\'utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}