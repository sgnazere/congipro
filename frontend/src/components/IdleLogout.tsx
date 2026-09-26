import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import { IDLE_TIMEOUT_MS } from '../config'

// Dernière activité partagée entre les onglets (localStorage) : travailler dans un onglet
// garde les autres connectés ; la déconnexion d'un onglet ferme la session partout.
export const LAST_ACTIVITY_KEY = 'ecogec:last-activity'
export const LOGOUT_REASON_KEY = 'ecogec:logout-reason'
const WARNING_MS = 20 * 1000
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

const readLast = () => { try { return parseInt(localStorage.getItem(LAST_ACTIVITY_KEY) || '0') || 0 } catch { return 0 } }
export const markActivity = () => { try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())) } catch { /* stockage indisponible */ } }

export default function IdleLogout() {
  const { logout } = useAuthStore()
  const navigate = useNavigate()
  const [remaining, setRemaining] = useState<number | null>(null)
  const lastWrite = useRef(0)
  const done = useRef(false)

  useEffect(() => {
    // Session reprise après une longue absence (ordinateur en veille, onglet rouvert)
    if (!readLast()) markActivity()

    const onActivity = () => {
      const now = Date.now()
      if (now - lastWrite.current > 5000) { lastWrite.current = now; markActivity() }  // écriture limitée
    }
    EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true, capture: true }))

    const tick = setInterval(async () => {
      if (done.current) return
      const left = IDLE_TIMEOUT_MS - (Date.now() - readLast())
      if (left <= 0) {
        done.current = true
        await logout()
        try { localStorage.setItem(LOGOUT_REASON_KEY, 'idle') } catch { /* ignoré */ }
        navigate('/login', { replace: true })
      } else {
        setRemaining(left <= WARNING_MS ? Math.ceil(left / 1000) : null)
      }
    }, 1000)

    return () => {
      clearInterval(tick)
      EVENTS.forEach(e => window.removeEventListener(e, onActivity, { capture: true }))
    }
  }, [logout, navigate])

  if (remaining === null) return null
  return (
    <div className="modal-backdrop" style={{ zIndex: 2000 }}>
      <div className="card" style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: '2rem' }}>⏳</div>
        <div style={{ fontWeight: 700, color: 'var(--navy)', margin: '.5rem 0' }}>Vous êtes inactif</div>
        <div style={{ fontSize: '.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Par sécurité, vous serez déconnecté dans <strong style={{ color: 'var(--danger)' }}>{remaining} s</strong>.
        </div>
        <button className="btn btn-navy" onClick={() => { markActivity(); setRemaining(null) }}>Rester connecté</button>
      </div>
    </div>
  )
}
