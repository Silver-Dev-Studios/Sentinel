import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import type { OverviewServer } from './types';

interface ServerState {
  servers: OverviewServer[];
  selectedGuildId: string | null;
  selectedServer: OverviewServer | null;
  loading: boolean;
  selectServer: (guildId: string) => void;
  refresh: () => Promise<void>;
}

const ServerContext = createContext<ServerState | null>(null);

const SELECTED_KEY = 'sentinel.selectedGuild';

export function ServerProvider({ children }: { children: ReactNode }) {
  const { api } = useAuth();
  const [servers, setServers] = useState<OverviewServer[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem(SELECTED_KEY) : null,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const overview = await api.get<{ servers: OverviewServer[] }>('/api/overview');
      setServers(overview.servers);
      setLoading(false);
      setSelectedGuildId((prev) => {
        if (prev && overview.servers.some((s) => s.id === prev)) return prev;
        return overview.servers[0]?.id ?? null;
      });
    } catch {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectServer = useCallback((guildId: string) => {
    setSelectedGuildId(guildId);
    window.localStorage.setItem(SELECTED_KEY, guildId);
  }, []);

  const selectedServer = servers.find((s) => s.id === selectedGuildId) ?? null;

  return (
    <ServerContext.Provider
      value={{ servers, selectedGuildId, selectedServer, loading, selectServer, refresh }}
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