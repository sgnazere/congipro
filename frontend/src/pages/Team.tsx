import { useEffect, useState } from 'react'
import api from '../api/axios'

const DAYS = 28
const iso  = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }

// Lundi de la semaine courante (UTC, pour rester aligné avec les dates ISO)
const mondayOf = (d: Date) => {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dow = x.getUTCDay()
  return addDays(x, dow === 0 ? -6 : 1 - dow)
}

export default function Team() {
  const [start,   setStart]   = useState(() => mondayOf(new Date()))
  const [data,    setData]    = useState<{ members: any[]; leaves: any[] } | null>(null)
  const [holidays,setHolidays]= useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i))
  const from = iso(days[0])
  const to   = iso(days[DAYS - 1])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])]
        const [t, ...h] = await Promise.all([
          api.get('/users/team', { params: { from, to } }),
          ...years.map(y => api.get(`/holidays?year=${y}`)),
        ])
        setData(t.data)
        setHolidays(h.flatMap(r => r.data.map((x: any) => x.date.slice(0, 10))))
      } catch (err) { console.error(err) }
      finally { setLoading(false) }
    }
    load()
  }, [from, to])

  const todayIso = iso(new Date())
  const leaveOn = (userId: string, day: string) =>
    data?.leaves.find(l => l.user_id === userId && l.start_date.slice(0, 10) <= day && l.end_date.slice(0, 10) >= day)

  const absentToday = data ? new Set(data.leaves
    .filter(l => l.status === 'approved' && l.start_date.slice(0, 10) <= todayIso && l.end_date.slice(0, 10) >= todayIso)
    .map(l => l.user_id)).size : 0

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div className="stat-card">
          <div className="stat-label">Collaborateurs directs</div>
          <div className="stat-val" style={{ color: 'var(--accent)' }}>{data?.members.length ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Absents aujourd'hui</div>
          <div className="stat-val" style={{ color: 'var(--danger)' }}>{data ? absentToday : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Absences sur la période</div>
          <div className="stat-val" style={{ color: 'var(--success)' }}>{data?.leaves.length ?? '—'}</div>
          <div className="stat-sub">Approuvées ou en attente</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setStart(s => addDays(s, -DAYS))}>◀ Période précédente</button>
          <span style={{ fontWeight: 700, color: 'var(--navy)' }}>
            Du {days[0].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', timeZone: 'UTC' })}
            {' au '}{days[DAYS - 1].toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setStart(mondayOf(new Date()))}>Aujourd'hui</button>
            <button className="btn btn-outline btn-sm" onClick={() => setStart(s => addDays(s, DAYS))}>Période suivante ▶</button>
          </div>
        </div>

        {loading ? <div className="loader-wrap"><div className="loader" /></div>
        : !data || data.members.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            Aucun collaborateur ne vous est rattaché. Les RH affectent les superviseurs depuis « Utilisateurs ».
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: '.72rem' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 160, position: 'sticky', left: 0, zIndex: 1 }}>Collaborateur</th>
                  {days.map(d => {
                    const we = [0, 6].includes(d.getUTCDay())
                    return (
                      <th key={iso(d)} style={{ padding: '4px 0', textAlign: 'center', minWidth: 26,
                        color: iso(d) === todayIso ? 'var(--accent)' : we ? '#CBD5E1' : undefined }}>
                        {'DLMMJVS'[d.getUTCDay()]}<br />{d.getUTCDate()}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {data.members.map(m => (
                  <tr key={m.id}>
                    <td style={{ position: 'sticky', left: 0, background: '#fff', padding: '6px 8px' }}>
                      <div style={{ fontWeight: 600 }}>{m.first_name} {m.last_name}</div>
                      <div style={{ color: 'var(--muted)', fontSize: '.65rem' }}>{m.project || '—'}</div>
                    </td>
                    {days.map(d => {
                      const ds = iso(d)
                      const we = [0, 6].includes(d.getUTCDay())
                      const holiday = holidays.includes(ds)
                      const l = !we && !holiday ? leaveOn(m.id, ds) : null
                      const bg = we ? '#F8FAFC' : holiday ? '#FEE2E2'
                        : l ? (l.status === 'approved' ? l.color : '#FEF9C3') : '#fff'
                      return (
                        <td key={ds}
                          title={l ? `${l.type_label} — ${l.status === 'approved' ? 'approuvé' : 'en attente'}` : holiday ? 'Jour férié' : ''}
                          style={{ padding: 0, height: 30, borderRadius: 4, background: bg,
                            border: l?.status === 'pending' ? '1.5px dashed #F59E0B' : '1px solid var(--border)',
                            outline: ds === todayIso ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }} />
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: '.75rem', color: 'var(--muted)', flexWrap: 'wrap' }}>
          <span>▮ Couleur du type = absence approuvée</span>
          <span style={{ color: '#854D0E' }}>▯ Pointillés jaunes = en attente</span>
          <span style={{ color: '#991B1B' }}>▮ Rouge clair = jour férié</span>
          <span>▮ Gris = week-end</span>
        </div>
      </div>
    </div>
  )
}
