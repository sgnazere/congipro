import { useState } from 'react'
import { LOGOUT_REASON_KEY } from '../components/IdleLogout'
import { IDLE_TIMEOUT_MS } from '../config'
import useAuthStore from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  // Message après une déconnexion automatique (lu une seule fois)
  const [idle] = useState(() => {
    try { const r = localStorage.getItem(LOGOUT_REASON_KEY) === 'idle'; localStorage.removeItem(LOGOUT_REASON_KEY); return r } catch { return false }
  })
  const { login, loading, error } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await login(email, password)
    if (result.ok) navigate('/dashboard')
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-logo">⟡ EcoGec</div>
        <div className="login-sub">Système de gestion des congés et absences</div>

        {idle && !error && (
          <div className="alert alert-warn">⏳ Vous avez été déconnecté après {IDLE_TIMEOUT_MS / 60000} minute(s) d’inactivité. Reconnectez-vous pour continuer.</div>
        )}
        {error && <div className="alert alert-danger">❌ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              className="form-control"
              type="email"
              placeholder="prenom.nom@ecogec.ci"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Mot de passe</label>
            <input
              className="form-control"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            className="btn btn-navy"
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: '11px', marginTop: '8px' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center' }}>
  🔒    EcoGec · JWT · RBAC · bcrypt · by gesmalyncs
        </div>
      </div>
    </div>
  )
}