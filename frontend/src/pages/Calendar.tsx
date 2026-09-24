import { useEffect, useState } from 'react'
import api from '../api/axios'
import { fmtDate } from '../utils/dates'

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
]
const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']

export default function Calendar() {
  const [requests, setRequests] = useState<any[]>([])
  const [holidays, setHolidays] = useState<any[]>([])
  const [month,    setMonth]    = useState(new Date().getMonth())
  const [year,     setYear]     = useState(new Date().getFullYear())
  const [tooltip,  setTooltip]  = useState<any | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [r, h] = await Promise.all([
          api.get('/requests'),
          api.get(`/holidays?year=${year}`),
        ])
        setRequests(r.data)
        setHolidays(h.data)
      } catch (err) { console.error(err) }
    }
    load()
  }, [year])

  const pad = (n: number) => String(n).padStart(2, '0')
  const dateStr = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`

  // Premier jour du mois (lundi = 0)
  const firstDay    = new Date(year, month, 1).getDay()
  const startDay    = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today       = new Date()

  const isWeekend = (d: number) => {
    const dow = new Date(year, month, d).getDay()
    return dow === 0 || dow === 6 // dimanche ou samedi
  }

  const getInfo = (d: number) => {
    const ds = dateStr(d)
    const holiday = holidays.find(h => h.date.slice(0, 10) === ds)
    const dayRequests = requests.filter(r => {
      const start = r.start_date?.slice(0, 10)
      const end   = r.end_date?.slice(0, 10)
      return ds >= start && ds <= end
    })
    return { holiday, dayRequests }
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const cells: (number | null)[] = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      {/* Légende */}
      <div style={{ display: 'flex', gap: 16, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[
          { color: '#DCFCE7', border: '#10B981', label: 'Approuvé'   },
          { color: '#FEF9C3', border: '#F59E0B', label: 'En attente' },
          { color: '#FEE2E2', border: '#EF4444', label: 'Férié'      },
          { color: '#F1F5F9', border: '#CBD5E1', label: 'Week-end'   },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem' }}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: l.color, border: `1.5px solid ${l.border}` }} />
            {l.label}
          </div>
        ))}
      </div>

      <div className="card">
        {/* Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <button className="btn btn-outline btn-sm" onClick={prevMonth}>◀</button>
          <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--navy)' }}>
            {MONTHS[month]} {year}
          </span>
          <button className="btn btn-outline btn-sm" onClick={nextMonth}>▶</button>
        </div>

        {/* En-têtes jours */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
          {DAYS.map((d, i) => (
            <div key={d} style={{
              textAlign: 'center',
              fontSize: '.68rem',
              fontWeight: 700,
              color: i >= 5 ? '#CBD5E1' : 'var(--muted)', // Sam/Dim plus clairs
              padding: '4px 0',
              textTransform: 'uppercase'
            }}>
              {d}
            </div>
          ))}
        </div>

        {/* Grille jours */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />

            const weekend = isWeekend(d)
            const { holiday, dayRequests } = getInfo(d)
            const isToday = (
              today.getDate()     === d     &&
              today.getMonth()    === month &&
              today.getFullYear() === year
            )

            const approved = dayRequests.filter(r => r.status === 'approved')
            const pending  = dayRequests.filter(r => r.status === 'pending')
            const hasEvent = holiday || dayRequests.length > 0

            // Couleurs selon priorité
            let bg      = '#ffffff'
            let border  = '1px solid var(--border)'
            let textCol = 'var(--text)'

            if (weekend) {
              bg      = '#F8FAFC'
              border  = '1px solid #E2E8F0'
              textCol = '#CBD5E1' // très clair pour les weekends
            } else if (holiday) {
              bg      = '#FEE2E2'
              border  = '1.5px solid #EF4444'
              textCol = '#991B1B'
            } else if (approved.length > 0) {
              bg      = '#DCFCE7'
              border  = '1.5px solid #10B981'
              textCol = '#166534'
            } else if (pending.length > 0) {
              bg      = '#FEF9C3'
              border  = '1.5px solid #F59E0B'
              textCol = '#854D0E'
            }

            return (
              <div
                key={d}
                onClick={() => {
                  if (!weekend && hasEvent) setTooltip({ d, holiday, dayRequests })
                }}
                style={{
                  minHeight: 54,
                  borderRadius: 8,
                  border,
                  background: isToday ? (bg === '#ffffff' ? '#EFF6FF' : bg) : bg,
                  outline: isToday ? '2px solid var(--accent)' : 'none',
                  outlineOffset: -2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  padding: '5px 3px',
                  cursor: (!weekend && hasEvent) ? 'pointer' : 'default',
                  transition: '.15s',
                  opacity: weekend ? 0.5 : 1, // weekends semi-transparents
                }}
              >
                {/* Numéro du jour */}
                <span style={{
                  fontSize: '.8rem',
                  fontWeight: isToday ? 700 : 500,
                  color: textCol,
                }}>
                  {d}
                </span>

                {/* Indicateur week-end */}
                {weekend && (
                  <span style={{ fontSize: '.5rem', color: '#CBD5E1', marginTop: 2 }}>
                    W-E
                  </span>
                )}

                {/* Pastilles absences (jours ouvrés seulement) */}
                {!weekend && approved.slice(0, 2).map((r: any, ri: number) => (
                  <div key={ri} style={{
                    fontSize: '.52rem',
                    background: r.color || '#10B981',
                    color: '#fff',
                    borderRadius: 3,
                    padding: '1px 4px',
                    marginTop: 2,
                    width: '100%',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {r.user_name?.split(' ')[0]}
                  </div>
                ))}

                {!weekend && pending.slice(0, 1).map((r: any, ri: number) => (
                  <div key={`p${ri}`} style={{
                    fontSize: '.52rem',
                    background: '#F59E0B',
                    color: '#fff',
                    borderRadius: 3,
                    padding: '1px 4px',
                    marginTop: 2,
                    width: '100%',
                    textAlign: 'center',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {r.user_name?.split(' ')[0]} ?
                  </div>
                ))}

                {/* Jour férié */}
                {!weekend && holiday && (
                  <span style={{ fontSize: '.55rem', marginTop: 2 }}>🏖️</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Résumé du mois */}
        <div style={{
          marginTop: 16, padding: '10px 14px',
          background: 'var(--light)', borderRadius: 8,
          display: 'flex', gap: 24, fontSize: '.78rem', color: 'var(--muted)'
        }}>
          <span>📅 <strong>{daysInMonth}</strong> jours au total</span>
          <span>💼 <strong>
            {Array.from({ length: daysInMonth }, (_, i) => i + 1)
              .filter(d => !isWeekend(d)).length}
          </strong> jours ouvrés</span>
          <span>🏖️ <strong>
            {holidays.filter(h => h.date.slice(0, 7) === `${year}-${pad(month + 1)}`).length}
          </strong> jour(s) férié(s) ce mois</span>
          <span>✅ <strong>
            {requests.filter(r => r.status === 'approved'
              && r.start_date.slice(0, 7) <= `${year}-${pad(month + 1)}`
              && r.end_date.slice(0, 7) >= `${year}-${pad(month + 1)}`).length}
          </strong> absence(s) approuvée(s) ce mois</span>
        </div>
      </div>

      {/* Modal détail jour */}
      {tooltip && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: '1rem'
          }}
          onClick={() => setTooltip(null)}
        >
          <div
            className="card"
            style={{ maxWidth: 400, width: '100%' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--navy)', marginBottom: '1rem' }}>
              📅 {tooltip.d} {MONTHS[month]} {year}
              <span style={{ fontSize: '.72rem', fontWeight: 400, color: 'var(--muted)', marginLeft: 8 }}>
                (Jour ouvré)
              </span>
            </div>

            {tooltip.holiday && (
              <div className="alert alert-danger" style={{ marginBottom: 8 }}>
                🏖️ <strong>Jour férié :</strong> {tooltip.holiday.label}
              </div>
            )}

            {tooltip.dayRequests.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {tooltip.dayRequests.map((r: any) => (
                  <div key={r.id} style={{
                    padding: '10px 12px', borderRadius: 8,
                    background: 'var(--light)', border: '1px solid var(--border)',
                    borderLeft: `3px solid ${r.color || '#3B82F6'}`
                  }}>
                    <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{r.user_name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--muted)', marginTop: 2 }}>
                      {r.type_label} · {parseFloat(r.days_count)} jour(s) ouvré(s)
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 2 }}>
                      Du {fmtDate(r.start_date)} au {fmtDate(r.end_date)}
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <span className={`badge badge-${r.status}`} style={{ fontSize: '.68rem' }}>
                        {({ pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' } as Record<string, string>)[r.status] || r.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '1rem', fontSize: '.82rem' }}>
                Aucune absence ce jour
              </div>
            )}

            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={() => setTooltip(null)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}