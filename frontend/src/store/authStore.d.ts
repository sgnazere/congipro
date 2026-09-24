import type { StoreApi, UseBoundStore } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  project?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
}

declare const useAuthStore: UseBoundStore<StoreApi<AuthState>>;

export default useAuthStore;
