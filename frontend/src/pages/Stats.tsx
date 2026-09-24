import { useEffect, useState } from 'react'
import api, { downloadFile } from '../api/axios'

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']

export default function Stats() {
  const [stats,   setStats]   = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [year,    setYear]    = useState(new Date().getFullYear())
  const [exporting, setExporting] = useState(false)

  const exportCsv = async () => {
    setExporting(true)
    try { await downloadFile(`/stats/export?year=${year}`, `ecogec_absences_${year}.csv`) }
    finally { setExporting(false) }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await api.get(`/stats?year=${year}`)
        setStats(res.data)
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [year])

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>
  if (!stats)  return <div className="alert alert-danger">Erreur de chargement</div>

  const totalRequests = stats.byStatus.reduce((a: number, s: any) => a + parseInt(s.count), 0)
  const approved = stats.byStatus.find((s: any) => s.status === 'approved')
  const pending  = stats.byStatus.find((s: any) => s.status === 'pending')
  const rejected = stats.byStatus.find((s: any) => s.status === 'rejected')

  // Données graphique mensuel
  const monthData = Array.from({ length: 12 }, (_, i) => {
    const found = stats.byMonth.find((m: any) => parseInt(m.month) === i + 1)
    return found ? parseInt(found.count) : 0
  })
  const maxMonth = Math.max(...monthData, 1)

  return (
    <div>
      {/* Sélecteur année */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1.25rem' }}>
        <button className="btn btn-outline btn-sm no-print" onClick={() => setYear(y => y - 1)}>◀</button>
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Année {year}</span>
        <button className="btn btn-outline btn-sm no-print" onClick={() => setYear(y => y + 1)}>▶</button>
        <div className="no-print" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-outline" onClick={exportCsv} disabled={exporting}
            title="Toutes les demandes de l'année, une ligne par demande">
            {exporting ? 'Export…' : '📊 Export Excel (CSV)'}
          </button>
          <button className="btn btn-sm btn-outline" onClick={() => window.print()} title="Imprimer ou enregistrer en PDF">
            📄 Export PDF
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total demandes</div>
          <div className="stat-val" style={{ color: 'var(--accent)' }}>{totalRequests}</div>
          <div className="stat-sub">En {year}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approuvées</div>
          <div className="stat-val" style={{ color: 'var(--success)' }}>{approved?.count || 0}</div>
          <div className="stat-sub">
            {totalRequests ? Math.round((approved?.count || 0) / totalRequests * 100) : 0}% du total
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">En attente</div>
          <div className="stat-val" style={{ color: 'var(--warn)' }}>{pending?.count || 0}</div>
          <div className="stat-sub">À traiter</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rejetées</div>
          <div className="stat-val" style={{ color: 'var(--danger)' }}>{rejected?.count || 0}</div>
          <div className="stat-sub">
            {totalRequests ? Math.round((rejected?.count || 0) / totalRequests * 100) : 0}% du total
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Graphique mensuel */}
        <div className="card">
          <div className="card-title">Demandes approuvées par mois</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginTop: 8 }}>
            {monthData.map((val, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontWeight: 600 }}>
                  {val > 0 ? val : ''}
                </span>
                <div style={{
                  width: '100%', borderRadius: '4px 4px 0 0',
                  height: `${Math.round((val / maxMonth) * 80) + 4}px`,
                  background: val > 0 ? 'var(--accent)' : 'var(--border)',
                  transition: '.3s'
                }} />
                <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>{MONTHS_FR[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Par type */}
        <div className="card">
          <div className="card-title">Jours par type de congé</div>
          {stats.byType.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: '.82rem' }}>Aucune donnée</div>
          ) : (
            stats.byType.map((t: any) => {
              const maxDays = Math.max(...stats.byType.map((x: any) => parseFloat(x.total_days)), 1)
              const pct = Math.round((parseFloat(t.total_days) / maxDays) * 100)
              return (
                <div key={t.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 4 }}>
                    <span>{t.label} <span style={{ color: 'var(--muted)' }}>({t.count} dem.)</span></span>
                    <span style={{ fontWeight: 700, color: t.color }}>{parseFloat(t.total_days).toFixed(1)} j</span>
                  </div>
                  <div className="prog-wrap">
                    <div className="prog-bar" style={{ width: pct + '%', background: t.color }} />
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Top utilisateurs */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div className="card-title" style={{ margin: 0 }}>Top absences par employé</div>
        </div>

        {stats.topUsers.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '1rem' }}>Aucune donnée</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Employé</th>
                <th>Jours pris</th>
                <th>Proportion</th>
              </tr>
            </thead>
            <tbody>
              {stats.topUsers.map((u: any, i: number) => {
                const maxDays = parseFloat(stats.topUsers[0]?.total_days || 1)
                const pct = Math.round((parseFloat(u.total_days) / maxDays) * 100)
                return (
                  <tr key={u.name}>
                    <td style={{ fontWeight: 700, color: i === 0 ? '#F59E0B' : 'var(--muted)' }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </td>
                    <td style={{ fontWeight: 600 }}>{u.name}</td>
                    <td><strong>{parseFloat(u.total_days).toFixed(1)} j</strong></td>
                    <td style={{ width: '40%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="prog-wrap" style={{ flex: 1, marginBottom: 0 }}>
                          <div className="prog-bar" style={{ width: pct + '%', background: 'var(--accent)' }} />
                        </div>
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)', minWidth: 35 }}>{pct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}