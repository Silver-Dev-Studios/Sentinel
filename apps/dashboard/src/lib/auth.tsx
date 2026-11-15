import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createApi, getToken, setToken, clearToken, type Api } from './api';
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

  // Must be referentially stable: every data hook keys its effects on `api`,
  // so a fresh object per render re-fires each request on every render and
  // floods the API until the rate limiter rejects everything.
  const api = useMemo(
    () =>
      createApi({
        baseUrl: API_BASE,
        onUnauthorized: () => {
          clearToken();
          setUser(null);
        },
      }),
    [],
  );

  const refresh = useCallback(async () => {
    // Without a stored token the dashboard has no way to authenticate state-
    // changing requests (the API's cookie is cross-origin and CSRF cannot be
    // satisfied), so treat this as logged out instead of half-authenticated via
    // a stale cookie.
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
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

  const value = useMemo<AuthState>(
    () => ({ user, loading, api, refresh, logout }),
    [user, loading, api, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}