// Paramètres propres au déploiement (fichier .env du frontend, préfixe VITE_)
export const API_URL  = import.meta.env.VITE_API_URL  || '/api'
export const ORG_NAME = import.meta.env.VITE_ORG_NAME || 'EcoGec SARL'
export const ORG_CITY = import.meta.env.VITE_ORG_CITY || 'Abidjan'
// Déconnexion automatique après inactivité (minutes)
export const IDLE_TIMEOUT_MS = (parseFloat(import.meta.env.VITE_IDLE_TIMEOUT_MIN) || 2) * 60 * 1000
