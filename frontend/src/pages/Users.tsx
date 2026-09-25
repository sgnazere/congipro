import { useEffect, useState } from 'react'
import api from '../api/axios'
import useAuthStore from '../store/authStore'
import { ROLE_LABELS } from '../navigation'
import { fmtDate } from '../utils/dates'
import { Pager } from '../components/Pager'

const PAGE_SIZE = 50

const ROLE_COLORS: Record<string, string> = {
  employee: '#3B82F6',
  manager:  '#8B5CF6',
  rh:       '#10B981',
  director: '#F59E0B',
  board:    '#0F2447',
  admin:    '#EF4444',
}
const SUPERVISOR_ROLES = ['manager', 'rh', 'director', 'board', 'admin']
const NEEDS_SUPERVISOR = ['employee', 'manager']
// Sans superviseur, ces rôles ne peuvent pas poser de congé soumis à validation
const SHOULD_HAVE_SUPERVISOR = ['employee', 'manager', 'rh']

const emptyForm = {
  first_name: '', last_name: '', email: '', password: '',
  role: 'employee', project_id: '', manager_id: '', hire_date: '',
}

export default function Users() {
  const { user: me } = useAuthStore()
  // Page courante (côté serveur : 1000 comptes ne sont jamais chargés d'un bloc)
  const [users,    setUsers]    = useState<any[]>([])
  const [total,    setTotal]    = useState(0)
  const [stats,    setStats]    = useState<any>({})
  const [page,     setPage]     = useState(1)
  const [supervisors, setSupervisors] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showAdd,  setShowAdd]  = useState(false)
  const [form,     setForm]     = useState(emptyForm)
  const [msg,      setMsg]      = useState<{ type: string; text: string } | null>(null)
  const [formMsg,  setFormMsg]  = useState<string | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const load = async () => {
    try {
      const [u, s, p] = await Promise.all([
        api.get('/users', { params: { page, limit: PAGE_SIZE, search: search.trim() || undefined, role: roleFilter === 'all' ? undefined : roleFilter } }),
        api.get('/users', { params: { roles: SUPERVISOR_ROLES.join(',') } }),
        api.get('/projects'),
      ])
      setUsers(u.data.rows)
      setTotal(u.data.total)
      setStats(u.data.stats)
      setSupervisors(s.data.filter((x: any) => x.is_active))
      setProjects(p.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Recherche envoyée au serveur 300 ms après la dernière frappe
  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [page, search, roleFilter])

  const nameOf = (id: string) => { const s = supervisors.find(u => u.id === id); return s ? `${s.first_name} ${s.last_name}` : '' }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (NEEDS_SUPERVISOR.includes(form.role) && !form.manager_id) {
      setFormMsg('Choisissez un superviseur : il validera les demandes de cette personne.')
      return
    }
    if (form.password.length < 8) { setFormMsg('Le mot de passe doit contenir au moins 8 caractères.'); return }
    setSaving(true)
    setFormMsg(null)
    try {
      await api.post('/users', {
        ...form,
        project_id: form.project_id || undefined,
        manager_id: form.manager_id || undefined,
        hire_date:  form.hire_date  || undefined,
      })
      setMsg({ type: 'success', text: `✅ Compte de ${form.first_name} ${form.last_name} créé. Ses soldes ${new Date().getFullYear()} ont été initialisés.` })
      setForm(emptyForm)
      setShowAdd(false)
      load()
    } catch (err: any) {
      setFormMsg(err.response?.data?.error || 'Erreur serveur')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: any) => {
    try {
      await api.patch(`/users/${u.id}`, { is_active: !u.is_active })
      setUsers(us => us.map(x => x.id === u.id ? { ...x, is_active: !u.is_active } : x))
      setMsg({ type: 'success', text: `${u.first_name} ${u.last_name} : compte ${u.is_active ? 'désactivé' : 'réactivé'}.` })
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur' })
    }
  }

  const [editing, setEditing] = useState<any | null>(null)

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing) return
    setSaving(true); setFormMsg(null)
    try {
      await api.patch(`/users/${editing.id}`, {
        first_name: editing.first_name.trim(), last_name: editing.last_name.trim(), email: editing.email.trim(),
        role: editing.role, project_id: editing.project_id || null,
        ...(editing.hire_date ? { hire_date: editing.hire_date.slice(0, 10) } : {}),
      })
      setMsg({ type: 'success', text: `✅ Compte de ${editing.first_name} ${editing.last_name} mis à jour.` })
      setEditing(null)
      load()
    } catch (err: any) {
      setFormMsg(err.response?.data?.error || 'Erreur serveur')
    } finally { setSaving(false) }
  }

  const assignManager = async (userId: string, managerId: string) => {
    try {
      await api.patch(`/users/${userId}`, { manager_id: managerId })
      setUsers(us => us.map(u => u.id === userId ? { ...u, manager_id: managerId, manager_name: nameOf(managerId) } : u))
      setMsg({ type: 'success', text: 'Superviseur affecté avec succès.' })
    } catch (err: any) {
      setMsg({ type: 'danger', text: err.response?.data?.error || 'Erreur lors de l’affectation du superviseur' })
    }
  }

  const filtered = users
  const withoutSupervisor = stats.without_supervisor || 0

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}
      {withoutSupervisor > 0 && (
        <div className="alert alert-warn">
          ⚠️ {withoutSupervisor} utilisateur(s) sans superviseur : ils ne peuvent pas soumettre de demande soumise à validation.
        </div>
      )}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        {[
          { label: 'Total',       val: stats.total ?? '—',       color: 'var(--accent)'  },
          { label: 'Employés',    val: stats.employees ?? '—',   color: '#3B82F6'        },
          { label: 'Encadrants',  val: stats.supervisors ?? '—', color: '#8B5CF6'        },
          { label: 'Actifs',      val: stats.active ?? '—',      color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="🔍 Nom, email ou projet..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ maxWidth: 280 }} />
        <select className="form-control" value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1) }} style={{ maxWidth: 200 }}>
          <option value="all">Tous les rôles</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="btn btn-navy" style={{ marginLeft: 'auto' }} onClick={() => { setShowAdd(true); setFormMsg(null) }}>
          + Ajouter un utilisateur
        </button>
      </div>

      <div className="card">
        <div className="card-title">Liste des utilisateurs ({total})</div>
        <table>
          <thead>
            <tr>
              <th>Utilisateur</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Projet</th>
              <th>Superviseur</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u: any) => {
              const initials = `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase()
              const color = ROLE_COLORS[u.role] || '#64748B'
              const locked = u.role === 'admin' && me?.role !== 'admin'
              return (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : .55 }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: color + '20', color, display: 'flex',
                        alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '.72rem', flexShrink: 0 }}>
                        {initials}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{u.first_name} {u.last_name}</div>
                        <div style={{ fontSize: '.7rem', color: 'var(--muted)' }}>Embauche : {fmtDate(u.hire_date)}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontSize: '.82rem' }}>{u.email}</td>
                  <td>
                    <span className="badge" style={{ background: color + '20', color }}>{ROLE_LABELS[u.role] || u.role}</span>
                  </td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>{u.project || '—'}</td>
                  <td style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
                    {SHOULD_HAVE_SUPERVISOR.includes(u.role) ? (
                      <select className="form-control" value={u.manager_id || ''}
                        onChange={e => assignManager(u.id, e.target.value)}
                        style={{ minWidth: 170, padding: '5px 8px', borderColor: u.manager_id ? undefined : 'var(--warn)' }}>
                        <option value="" disabled>Choisir un superviseur</option>
                        {supervisors.filter(m => m.id !== u.id).map(m => (
                          <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({ROLE_LABELS[m.role]})</option>
                        ))}
                      </select>
                    ) : (u.manager_name || '—')}
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                      {u.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-sm btn-outline" disabled={locked} style={{ marginRight: 4 }}
                      title={locked ? 'Réservé au super administrateur' : 'Modifier nom, email, rôle, projet'}
                      onClick={() => { setEditing({ ...u }); setFormMsg(null) }}>✎</button>
                    {u.id === me?.id ? <span className="form-hint">Vous</span> : (
                      <button className={`btn btn-sm ${u.is_active ? 'btn-outline' : 'btn-green'}`}
                        disabled={locked} title={locked ? 'Réservé au super administrateur' : ''}
                        onClick={() => toggleActive(u)}>
                        {u.is_active ? 'Désactiver' : 'Activer'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <Pager page={page} total={total} limit={PAGE_SIZE} onPage={setPage} />
      </div>

      {editing && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setEditing(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              ✎ Modifier le compte
            </div>
            {formMsg && <div className="alert alert-danger">❌ {formMsg}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Prénom *</label>
                  <input className="form-control" value={editing.first_name} required
                    onChange={e => setEditing({ ...editing, first_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" value={editing.last_name} required
                    onChange={e => setEditing({ ...editing, last_name: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Email (identifiant de connexion) *</label>
                <input className="form-control" type="email" value={editing.email} required
                  onChange={e => setEditing({ ...editing, email: e.target.value })} />
                <div className="form-hint">La personne se connectera désormais avec cette adresse ; son mot de passe ne change pas.</div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Rôle *</label>
                  <select className="form-control" value={editing.role} disabled={editing.id === me?.id}
                    onChange={e => setEditing({ ...editing, role: e.target.value })}>
                    {Object.entries(ROLE_LABELS).filter(([k]) => k !== 'admin' || me?.role === 'admin').map(([k, v]) =>
                      <option key={k} value={k}>{v}</option>)}
                  </select>
                  {editing.id === me?.id && <div className="form-hint">Vous ne pouvez pas changer votre propre rôle.</div>}
                </div>
                <div className="form-group">
                  <label className="form-label">Projet</label>
                  <select className="form-control" value={editing.project_id || ''}
                    onChange={e => setEditing({ ...editing, project_id: e.target.value || null })}>
                    <option value="">— Aucun —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Date d'embauche</label>
                <input className="form-control" type="date" value={editing.hire_date?.slice(0, 10) || ''}
                  onChange={e => setEditing({ ...editing, hire_date: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Annuler</button>
                <button type="submit" className="btn btn-navy" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAdd && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div className="card" style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--navy)', marginBottom: '1.25rem' }}>
              👤 Nouvel utilisateur
            </div>

            {formMsg && <div className="alert alert-danger">❌ {formMsg}</div>}

            <form onSubmit={handleAdd}>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Prénom *</label>
                  <input className="form-control" value={form.first_name}
                    onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="Aya" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Nom *</label>
                  <input className="form-control" value={form.last_name}
                    onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="KOUASSI" required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Email *</label>
                  <input className="form-control" type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })} placeholder="prenom.nom@ecogec.ci" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Mot de passe provisoire *</label>
                  <input className="form-control" type="password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })} placeholder="8 caractères minimum" required />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Rôle *</label>
                  <select className="form-control" value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}>
                    <option value="employee">Employé</option>
                    <option value="manager">Manager</option>
                    <option value="rh">Ressources humaines</option>
                    <option value="director">Directeur exécutif</option>
                    <option value="board">Conseil d’administration</option>
                    {me?.role === 'admin' && <option value="admin">Super administrateur</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Superviseur {NEEDS_SUPERVISOR.includes(form.role) ? '*' : '(facultatif)'}</label>
                  <select className="form-control" value={form.manager_id}
                    onChange={e => setForm({ ...form, manager_id: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {supervisors.map(m => (
                      <option key={m.id} value={m.id}>{m.first_name} {m.last_name} ({ROLE_LABELS[m.role]})</option>
                    ))}
                  </select>
                  <div className="form-hint">Valide les demandes de congé (étape 1)</div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Projet</label>
                  <select className="form-control" value={form.project_id}
                    onChange={e => setForm({ ...form, project_id: e.target.value })}>
                    <option value="">— Aucun —</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Date d'embauche</label>
                  <input className="form-control" type="date" value={form.hire_date}
                    onChange={e => setForm({ ...form, hire_date: e.target.value })} />
                  <div className="form-hint">Par défaut : aujourd'hui</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAdd(false)}>Annuler</button>
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
