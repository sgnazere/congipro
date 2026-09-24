import axios from 'axios';
import { API_URL } from '../config';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

const GET_CACHE_TTL = 15000;
const getCache = new Map();
const pendingGets = new Map();
let refreshPromise = null;

const getCacheKey = (url, config = {}) => `${url}?${JSON.stringify(config.params || {})}`;

const clearGetCache = () => {
  getCache.clear();
};

const notifyCacheInvalidation = () => {
  clearGetCache();
  if (typeof window !== 'undefined') {
    localStorage.setItem('ecogec:api-cache-invalidated', String(Date.now()));
  }
};

const waitUntilVisible = (config) => {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') {
    return Promise.resolve(config);
  }

  return new Promise((resolve) => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      resolve(config);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
  });
};

const rawGet = api.get.bind(api);
api.get = (url, config = {}) => {
  const key = getCacheKey(url, config);
  const cached = getCache.get(key);
  if (cached && Date.now() - cached.timestamp < GET_CACHE_TTL) {
    return Promise.resolve(cached.response);
  }

  if (pendingGets.has(key)) return pendingGets.get(key);

  const request = rawGet(url, config)
    .then((response) => {
      getCache.set(key, { response, timestamp: Date.now() });
      return response;
    })
    .finally(() => pendingGets.delete(key));

  pendingGets.set(key, request);
  return request;
};

// Injecter le token JWT automatiquement
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.method?.toLowerCase() === 'get') return waitUntilVisible(config);
  return config;
});

// Gérer l'expiration du token
api.interceptors.response.use(
  (response) => {
    if (response.config.method?.toLowerCase() !== 'get') notifyCacheInvalidation();
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) clearGetCache();
    const original = error.config;
    if (error.response?.status === 401 &&
        error.response?.data?.error === 'TOKEN_EXPIRED' &&
        !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          const refresh = localStorage.getItem('refreshToken');
          refreshPromise = api.post('/auth/refresh', { refreshToken: refresh });
        }
        const res = await refreshPromise;
        localStorage.setItem('accessToken',  res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        original.headers.Authorization = `Bearer ${res.data.accessToken}`;
        return api(original);
      } catch {
        localStorage.clear();
        window.location.href = '/login';
      } finally {
        refreshPromise = null;
      }
    }
    return Promise.reject(error);
  }
);

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'ecogec:api-cache-invalidated') clearGetCache();
  });
}

// Télécharge (ou ouvre) un fichier protégé par le token : un simple lien <a> n'enverrait pas l'en-tête Authorization
export async function downloadFile(url, filename, { open = false } = {}) {
  const res  = await rawGet(url, { responseType: 'blob' });
  const href = URL.createObjectURL(res.data);
  if (open) {
    window.open(href, '_blank');
  } else {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(href), 60000);
}

export default api;