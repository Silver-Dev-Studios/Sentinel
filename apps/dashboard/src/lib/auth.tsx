import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { createApi, setToken, clearToken, type Api } from './api';
import type { AuthUser } from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * The OAuth callback redirects here with the session token in the URL fragment
 * (`#/auth?token=...`). Capture it before the router mounts, store it, and
 * rewrite the address bar to /overview so the token never lingers in history.
 * Runs at module load, which is before React renders the HashRouter.
 */
function captureTokenFromHash(): void {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (!hash.startsWith('#/auth') || queryIndex === -1) return;
  const token = new URLSearchParams(hash.slice(queryIndex + 1)).get('token');
  if (token) setToken(token);
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#/overview`,
  );
}

captureTokenFromHash();

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
    onUnauthorized: () => {
      clearToken();
      setUser(null);
    },
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
      // Send while the token is still attached so the server revokes the session.
      await api.post('/api/auth/logout', {});
    } catch {
      // ignore
    }
    clearToken();
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