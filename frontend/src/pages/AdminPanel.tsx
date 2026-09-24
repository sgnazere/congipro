import { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Admin() {
  const [dbStats, setDbStats]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [msg,     setMsg]       = useState<{ type: string; text: string } | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get('/admin/db-stats')
        setDbStats(res.data)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  const handleCleanAudit = async () => {
    if (!confirm('Supprimer les logs de plus de 90 jours ?')) return
    try {
      await api.delete('/admin/audit-logs/clean')
      setMsg({ type: 'success', text: '✅ Anciens logs supprimés avec succès.' })
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur') })
    }
  }

  const handleResetBalances = async () => {
    if (!confirm('Réinitialiser tous les soldes pour la nouvelle année ?')) return
    try {
      await api.post('/admin/balances/reset')
      setMsg({ type: 'success', text: '✅ Soldes réinitialisés pour ' + (new Date().getFullYear()) })
    } catch (err: any) {
      setMsg({ type: 'danger', text: '❌ ' + (err.response?.data?.error || 'Erreur') })
    }
  }

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* KPIs base de données */}
      <div className="stat-grid">
        {[
          { label: 'Utilisateurs',  val: dbStats?.users        || 0, color: '#3B82F6', icon: '👤' },
          { label: 'Demandes',      val: dbStats?.requests     || 0, color: '#8B5CF6', icon: '📋' },
          { label: 'Notifications', val: dbStats?.notifications|| 0, color: '#F59E0B', icon: '🔔' },
          { label: 'Audit logs',    val: dbStats?.audit_logs   || 0, color: '#10B981', icon: '🔒' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.icon} {s.label}</div>
            <div className="stat-val" style={{ color: s.color }}>{s.val}</div>
            <div className="stat-sub">Enregistrements en base</div>
          </div>
        ))}
      </div>

      <div className="grid-2">

        {/* Maintenance */}
        <div className="card">
          <div className="card-title">🛠️ Maintenance base de données</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Nettoyer audit logs */}
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--light)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 4 }}>
                🧹 Nettoyage des audit logs
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10 }}>
                Supprime les logs de plus de 90 jours pour libérer de l'espace.
              </div>
              <button className="btn btn-sm btn-red" onClick={handleCleanAudit}>
                Nettoyer les anciens logs
              </button>
            </div>

            {/* Reset soldes annuels */}
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--light)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 4 }}>
                🔄 Réinitialisation des soldes annuels
              </div>
              <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 10 }}>
                Crée les soldes de congés pour la nouvelle année pour tous les employés actifs.
              </div>
              <button className="btn btn-sm btn-accent" onClick={handleResetBalances}>
                Réinitialiser les soldes
              </button>
            </div>

            {/* Health check */}
            <div style={{ padding: '14px', borderRadius: 10, background: 'var(--light)', border: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '.85rem', marginBottom: 4 }}>
                💓 Santé du système
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                {[
                  { label: 'API Backend',   status: true  },
                  { label: 'Base PostgreSQL', status: true },
                  { label: 'JWT Auth',      status: true  },
                  { label: 'Audit logs',    status: true  },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem' }}>
                    <span>{s.label}</span>
                    <span className={`badge ${s.status ? 'badge-approved' : 'badge-rejected'}`}>
                      {s.status ? '✓ Opérationnel' : '✕ Erreur'}
                    </span>
                  </div>
                ))}
              </div>
              <button className="btn btn-sm btn-outline" onClick={() => window.open('http://localhost:3001/health')}>
                Vérifier le health check
              </button>
            </div>
          </div>
        </div>

        {/* Infos système */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          <div className="card">
            <div className="card-title">⚙️ Informations système</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Application',    val: 'EcoGec v1.0.0'      },
                { label: 'Backend',        val: 'Node.js 20 + Express'  },
                { label: 'Base de données',val: 'PostgreSQL 16'          },
                { label: 'Authentification',val: 'JWT + bcrypt (coût 12)'},
                { label: 'Frontend',       val: 'React 18 + Vite'       },
                { label: 'Environnement',  val: import.meta.env.MODE    },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '7px 0', borderBottom: '1px solid var(--border)',
                  fontSize: '.82rem'
                }}>
                  <span style={{ color: 'var(--muted)' }}>{row.label}</span>
                  <span style={{ fontWeight: 600 }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title">🔐 Sécurité</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'RBAC',         val: '4 rôles (employee, manager, rh, admin)' },
                { label: 'Token JWT',    val: 'Access 15min + Refresh 7j'               },
                { label: 'Rate limiting',val: '100 req/15min · Auth : 10/15min'         },
                { label: 'Audit trail',  val: 'Trigger PostgreSQL + logs applicatifs'   },
                { label: 'Chiffrement',  val: 'bcrypt coût 12'                          },
              ].map(row => (
                <div key={row.label} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  padding: '7px 0', borderBottom: '1px solid var(--border)',
                  fontSize: '.8rem', gap: 8
                }}>
                  <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{row.label}</span>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}