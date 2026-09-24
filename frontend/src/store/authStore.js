import { create } from 'zustand';
import api from '../api/axios';

const readUser = () => JSON.parse(localStorage.getItem('user') || 'null');
let loginPromise = null;

const useAuthStore = create((set) => ({
  user:    readUser(),
  loading: false,
  error:   null,

  login: async (email, password) => {
    if (loginPromise) return loginPromise;
    set({ loading: true, error: null });
    loginPromise = api.post('/auth/login', { email, password })
      .then((res) => {
        const { user, accessToken, refreshToken } = res.data;
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(user));
        set({ user, loading: false });
        return { ok: true };
      })
      .catch((err) => {
        const msg = err.response?.data?.error || 'Erreur de connexion';
        set({ error: msg, loading: false });
        return { ok: false, error: msg };
      })
      .finally(() => {
        loginPromise = null;
      });
    return loginPromise;
  },

  logout: async () => {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.clear();
    set({ user: null });
  },
}));

if (typeof window !== 'undefined') {
  const syncSession = () => useAuthStore.setState({ user: readUser(), error: null });
  window.addEventListener('storage', syncSession);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncSession();
  });
}

export default useAuthStore;