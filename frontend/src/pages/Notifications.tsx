import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import useAuthStore from '../store/authStore'
import { canAccess, refreshCounters } from '../navigation'

const NOTIF_ICONS: Record<string, string> = {
  request_submitted: '📬',
  request_approved:  '✅',
  request_rejected:  '❌',
  reminder:          '⏰',
  system:            '🔔',
}

export default function Notifications() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [notifs,  setNotifs]  = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/notifications')
      setNotifs(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Page liée à la notification : à valider → Validation ; sinon → Mes demandes
  const targetOf = (n: any) => {
    const path = n.type === 'request_submitted' ? '/validate' : n.request_id ? '/requests' : null
    return path && canAccess(user?.role, path) ? path : null
  }

  const openNotif = async (n: any) => {
    if (!n.is_read) {
      await api.patch(`/notifications/${n.id}/read`)
      setNotifs(ns => ns.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      refreshCounters()
    }
    const target = targetOf(n)
    if (target) navigate(target)
  }

  const markAllRead = async () => {
    await api.patch('/notifications/read-all')
    setNotifs(ns => ns.map(n => ({ ...n, is_read: true })))
    refreshCounters()
  }

  const unreadCount = notifs.filter(n => !n.is_read).length

  if (loading) return <div className="loader-wrap"><div className="loader" /></div>

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        {unreadCount > 0 && (
          <span className="badge badge-pending">{unreadCount} non lue(s)</span>
        )}
        {unreadCount > 0 && (
          <button className="btn btn-outline btn-sm" onClick={markAllRead}>
            ✓ Tout marquer comme lu
          </button>
        )}
      </div>

      {/* Liste */}
      <div className="card">
        <div className="card-title">Mes notifications</div>

        {notifs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem' }}>
            🎉 Aucune notification pour le moment
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {notifs.map((n: any) => (
              <div
                key={n.id}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: n.is_read ? 'var(--light)' : '#EFF6FF',
                  border: n.is_read ? '1px solid var(--border)' : '1px solid #BFDBFE',
                  borderLeft: n.is_read ? '1px solid var(--border)' : '3px solid var(--accent)',
                  cursor: !n.is_read || targetOf(n) ? 'pointer' : 'default',
                }}
                onClick={() => openNotif(n)}
              >
                <span style={{ fontSize: '1.2rem' }}>
                  {NOTIF_ICONS[n.type] || '🔔'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{n.title}</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 2 }}>{n.message}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--muted)', marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </div>
                </div>
                {!n.is_read && (
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: 'var(--accent)', flexShrink: 0, marginTop: 4
                  }} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}