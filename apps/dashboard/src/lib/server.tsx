import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './auth';
import { ApiError } from './api';
import type { OverviewServer } from './types';

interface ServerState {
  servers: OverviewServer[];
  selectedGuildId: string | null;
  selectedServer: OverviewServer | null;
  loading: boolean;
  /** Set when the server list could not be loaded, so the UI can explain why. */
  error: string | null;
  /** True while an automatic retry is pending. */
  retrying: boolean;
  selectServer: (guildId: string) => void;
  refresh: () => Promise<void>;
}

const ServerContext = createContext<ServerState | null>(null);

const SELECTED_KEY = 'sentinel.selectedGuild';
const MAX_RETRIES = 5;

function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'The API is rate limiting requests, so the server list could not be loaded.';
    if (err.status === 401 || err.status === 403) return 'Your session is no longer authorized. Please sign in again.';
    if (err.status >= 500) return `The API failed to return the server list (HTTP ${err.status}).`;
    return err.message;
  }
  return 'Could not reach the API. Check your connection.';
}

function retryDelayMs(err: unknown, attempt: number): number {
  if (err instanceof ApiError && err.status === 429 && err.retryAfter) {
    return Math.min(err.retryAfter * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** attempt, 30_000);
}

export function ServerProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const [servers, setServers] = useState<OverviewServer[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(SELECTED_KEY) : null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const overview = await api.get<{ servers: OverviewServer[] }>('/api/overview');
        if (cancelled) return;
        setServers(overview.servers);
        setError(null);
        setRetrying(false);
        setSelectedGuildId((prev) => {
          if (prev && overview.servers.some((s) => s.id === prev)) return prev;
          return overview.servers[0]?.id ?? null;
        });
      } catch (err) {
        if (cancelled) return;
        // A failed load must never read as "you have no servers": keep the list
        // we already had and retry, since a rate limit or a sleeping Render
        // dyno recovers on its own.
        setError(describeError(err));
        if (attempt < MAX_RETRIES) {
          setRetrying(true);
          timer = setTimeout(() => setAttempt((a) => a + 1), retryDelayMs(err, attempt));
        } else {
          setRetrying(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [api, attempt, reloadToken]);

  const refresh = useCallback(async () => {
    setAttempt(0);
    setReloadToken((t) => t + 1);
  }, []);

  const selectServer = useCallback((guildId: string) => {
    setSelectedGuildId(guildId);
    window.localStorage.setItem(SELECTED_KEY, guildId);
  }, []);

  const selectedServer = servers.find((s) => s.id === selectedGuildId) ?? null;

  return (
    <ServerContext.Provider
      value={{ servers, selectedGuildId, selectedServer, loading, error, retrying, selectServer, refresh }}
    >
      {children}
    </ServerContext.Provider>
  );
}

export function useServer(): ServerState {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error('useServer must be used within ServerProvider');
  return ctx;
}
