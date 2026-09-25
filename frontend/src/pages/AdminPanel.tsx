import { useEffect, useState } from 'react'
import api from '../api/axios'
import { fmtDate } from '../utils/dates'

const thisYear = new Date().getFullYear()

// Actions de POST /api/admin/maintenance
const ACTIONS = [
  { action: 'generate_balances', icon: '🔄', label: 'Générer les soldes annuels', btn: 'btn-accent', withYear: true,
    desc: 'Crée les soldes manquants (plafond du type) pour tous les utilisateurs actifs. Les soldes existants ne sont pas modifiés.' },
  { action: 'recompute_balances', icon: '🧮', label: 'Recalculer les soldes', btn: 'btn-outline',
    desc: 'Aligne « pris » et « en attente » sur les demandes (les ajustements de reprise sont conservés) et crée les soldes manquants.' },
  { action: 'archive_logs', icon: '🧹', label: 'Purger le journal d’audit', btn: 'btn-red',
    desc: 'Supprime définitivement les événements d’audit de plus de 90 jours.' },
  { action: 'clean_notifications', icon: '🔕', label: 'Nettoyer les notifications', btn: 'btn-outline',
    desc: 'Supprime les notifications lues depuis plus de 30 jours.' },
  { action: 'clean_tokens', icon: '🔑', label: 'Nettoyer les sessions inactives', btn: 'btn-outline',
    desc: 'Invalide les sessions des comptes désactivés.' },
  { action: 'revoke_all_sessions', icon: '⛔', label: 'Déconnecter tout le monde', btn: 'btn-red',
    desc: 'Révoque toutes les sessions : chacun devra se reconnecter (y compris vous, sous 15 minutes).' },
  { action: 'vacuum', icon: '🗄️', label: 'Optimiser la base (VACUUM)', btn: 'btn-outline',
    desc: 'Récupère l’espace disque et met à jour les statistiques PostgreSQL.' },
]

export default function Admin() {
  const [dbStats, setDbStats] = useState<any>(null)
  const [license, setLicense] = useState<any>(null)
  const [health,  setHealth]  = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [msg,     setMsg]     = useState<{ type: string; text: string } | null>(null)
  const [pending, setPending] = useState<typeof ACTIONS[number] | null>(null)
  const [year,    setYear]    = useState(thisYear + 1)
  const [running, setRunning] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [s, l] = await Promise.all([api.get('/admin/db-stats'), api.get('/license/status')])
      setDbStats(s.data)
      setLicense(l.data)
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  const checkHealth = async () => {
    setHealth({ checking: true })
    try { setHealth({ ...(await api.get('/health')).data, ok: true }) }
    catch { setHealth({ ok: false }) }
  }

  useEffect(() => { load(); checkHealth() }, [])

  const run = async () => {
    if (!pending) return
    setRunning(true)
    try {
      const res = await api.post('/admin/maintenance', { action: pending.action, year })
      setMsg({ type: 'success', text: '✅ ' + res.data.message })
      load()
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur') })
    } finally {
      setRunning(false)
      setPending(null)
    }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  const row = (label: string, val: React.ReactNode) => (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '.82rem' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{val}</span>
    </div>
  )

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="stat-grid">
        {[
          { label: 'Utilisateurs',    val: dbStats?.users_count,    color: '#3B82F6', icon: '👤' },
          { label: 'Demandes',        val: dbStats?.requests_count, color: '#8B5CF6', icon: '📋' },
          { label: 'Types de congés', val: dbStats?.types_count,    color: '#F59E0B', icon: '🏷️' },
          { label: 'Événements audit',val: dbStats?.audit_count,    color: '#10B981', icon: '🔒' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.icon} {s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val ?? '—'}</div>
            <div className="stat-sub">Enregistrements en base</div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title">🛠️ Maintenance</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ACTIONS.map(a => (
              <div key={a.action} style={{ padding: 12, borderRadius: 10, background: 'var(--light)', border: '1px solid var(--border)',
                display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{a.icon} {a.label}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{a.desc}</div>
                </div>
                <button className={`btn btn-sm ${a.btn}`} onClick={() => { setPending(a); setMsg(null) }}>Exécuter</button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card">
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>💓 Santé du système</span>
              <button className="btn btn-sm btn-outline" onClick={checkHealth}>Revérifier</button>
            </div>
            {row('API', health?.checking ? '…' : <span className={`badge ${health?.ok ? 'badge-approved' : 'badge-rejected'}`}>{health?.ok ? '✓ Opérationnelle' : '✕ Injoignable'}</span>)}
            {row('Base PostgreSQL', health?.checking ? '…' : <span className={`badge ${health?.db === 'connected' ? 'badge-approved' : 'badge-rejected'}`}>{health?.db === 'connected' ? '✓ Connectée' : '✕ Déconnectée'}</span>)}
            {row('Connexions actives', dbStats?.active_connections)}
            {row('Démarrée depuis', dbStats?.uptime)}
          </div>

          <div className="card">
            <div className="card-title">📜 Licence</div>
            {license ? <>
              {row('Titulaire', license.clientName)}
              {row('Expire le', <span style={{ color: license.warning ? 'var(--danger)' : undefined }}>{fmtDate(license.expiresAt?.slice(0, 10))} ({license.daysLeft} j)</span>)}
              {row('Utilisateurs actifs', `${license.activeUsers} / ${license.maxUsers}`)}
              {row('Modules', (license.features || []).join(', '))}
            </> : <div className="form-hint">Statut indisponible</div>}
          </div>

          <div className="card">
            <div className="card-title">⚙️ Informations système</div>
            {row('Environnement', dbStats?.env)}
            {row('Node.js', dbStats?.node_version)}
            {row('PostgreSQL', dbStats?.pg_version)}
            {row('Base', `${dbStats?.db_name} (${dbStats?.db_size})`)}
            {row('Frontend', `React · Vite (${import.meta.env.MODE})`)}
            {row('Sécurité', 'JWT 15 min + refresh 7 j · bcrypt 12 · RBAC 5 rôles')}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">🧮 Cohérence des soldes</div>
        {!dbStats?.balance_anomalies?.length ? (
          <div className="alert alert-success" style={{ margin: 0 }}>✓ Tous les soldes correspondent aux demandes.</div>
        ) : (
          <table>
            <thead><tr><th>Employé</th><th>Type</th><th>Année</th><th>Anomalie</th><th>Pris (dont reprise)</th><th>En attente</th><th>Attendu</th></tr></thead>
            <tbody>
              {dbStats.balance_anomalies.map((a: any, i: number) => (
                <tr key={i}>
                  <td>{a.user_name}</td><td>{a.type_label}</td><td>{a.year}</td>
                  <td><span className={`badge ${a.anomalie === 'solde_negatif' ? 'badge-rejected' : 'badge-pending'}`}>
                    {({ solde_absent: 'Solde absent', pris_incoherent: '« Pris » incohérent', attente_incoherent: '« En attente » incohérent', solde_negatif: 'Solde négatif' } as Record<string, string>)[a.anomalie]}
                  </span></td>
                  <td>{a.used_days ?? '—'} {a.adjusted_days > 0 && `(${a.adjusted_days})`}</td>
                  <td>{a.pending_days ?? '—'}</td>
                  <td style={{ fontSize: '.75rem', color: 'var(--muted)' }}>
                    {a.anomalie === 'solde_negatif' ? `Dépassement de ${-(parseFloat(a.total_days) + parseFloat(a.carried_days || 0) - parseFloat(a.used_days) - parseFloat(a.pending_days))} j sans solde l’an prochain : générer les soldes` : `pris ${parseFloat(a.approved_days) + parseFloat(a.adjusted_days || 0)} · attente ${a.pending_calc}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dbStats?.tables?.length > 0 && (
        <div className="card">
          <div className="card-title">🗄️ Tables</div>
          <table>
            <thead><tr><th>Table</th><th>Lignes</th><th>Taille</th></tr></thead>
            <tbody>
              {dbStats.tables.map((t: any) => (
                <tr key={t.table_name}><td><code>{t.table_name}</code></td><td>{t.row_count}</td><td>{t.size}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setPending(null) }}>
          <div className="card" style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--navy)', marginBottom: '1rem' }}>
              {pending.icon} {pending.label}
            </div>
            <div className="alert alert-warn">{pending.desc}</div>
            {pending.withYear && (
              <div className="form-group">
                <label className="form-label">Année</label>
                <select className="form-control" value={year} onChange={e => setYear(parseInt(e.target.value))}>
                  <option value={thisYear}>{thisYear} (année en cours)</option>
                  <option value={thisYear + 1}>{thisYear + 1} (année suivante)</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setPending(null)}>Annuler</button>
              <button className={`btn ${pending.btn === 'btn-red' ? 'btn-red' : 'btn-navy'}`} onClick={run} disabled={running}>
                {running ? 'Exécution…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
