import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createApi, type Api } from './api';
import type { AuthUser } from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  api: Api;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const api = createApi({
    baseUrl: API_BASE,
    onUnauthorized: () => setUser(null),
  });

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<AuthUser>('/api/auth/me');
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout', {});
    } catch {
      // ignore
    }
    setUser(null);
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, api, refresh, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}