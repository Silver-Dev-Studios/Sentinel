import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Bot,
  Database,
  Layers,
  Server,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { Card, Empty, Loading, PageHeader, Pill, StatCard } from '../../components/ui';
import type { HealthInfo, OverviewData } from '../../lib/types';

export function OverviewPage() {
  const { api } = useAuth();
  const [data, setData] = useState<OverviewData | null>(null);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [overview, h] = await Promise.all([
        api.get<OverviewData>('/api/overview'),
        api.get<HealthInfo>('/api/health'),
      ]);
      setData(overview);
      setHealth(h);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [api]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (error) {
    return (
      <div>
        <PageHeader title="Overview" />
        <Empty>{error}</Empty>
      </div>
    );
  }
  if (!data || !health) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Global Sentinel status across all connected SDS servers."
        actions={<Pill tone={health.status === 'ok' ? 'success' : 'warn'}>{health.status}</Pill>}
      />

      {/* Global connection status */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Connected Servers"
          value={data.global.connectedServers}
          icon={<Server className="h-5 w-5" />}
        />
        <StatCard
          label="Total Members"
          value={data.global.totalMembers.toLocaleString()}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Open Alerts"
          value={data.global.openAlerts}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Bot Status"
          value={
            <span className={data.global.botConnected ? 'text-emerald-400' : 'text-rose-400'}>
              {data.global.botConnected ? 'Connected' : 'Offline'}
            </span>
          }
          icon={<Bot className="h-5 w-5" />}
        />
      </div>

      {/* Service health strip */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-sentinel-accent2" />
          <div className="min-w-0">
            <div className="text-xs text-sentinel-muted">Bot Gateway</div>
            <div className="text-sm font-semibold">
              {health.websocket.botConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-sentinel-accent2" />
          <div className="min-w-0">
            <div className="text-xs text-sentinel-muted">API Latency</div>
            <div className="text-sm font-semibold">{health.apiLatencyMs} ms</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <Database className="h-5 w-5 text-sentinel-accent2" />
          <div className="min-w-0">
            <div className="text-xs text-sentinel-muted">Database</div>
            <div className="text-sm font-semibold">
              {health.database.connected ? (
                <span className="text-emerald-400">Connected</span>
              ) : (
                <span className="text-rose-400">Down</span>
              )}
            </div>
          </div>
        </Card>
        <Card className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-sentinel-accent2" />
          <div className="min-w-0">
            <div className="text-xs text-sentinel-muted">WebSocket Clients</div>
            <div className="text-sm font-semibold">{health.websocket.connectedClients}</div>
          </div>
        </Card>
      </div>

      {/* Server cards */}
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">
        Connected Servers
      </h3>
      {data.servers.length === 0 ? <Empty>No servers available to your account.</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.servers.map((server) => (
            <Card key={server.id}>
              <Link to="/" className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {server.icon ? (
                    <img
                      src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=128`}
                      alt=""
                      className="h-10 w-10 rounded-xl"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sentinel-accent/30 text-lg font-bold">
                      {server.name?.charAt(0) ?? '?'}
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-sentinel-text">{server.name}</div>
                    <div className="text-xs text-sentinel-muted">
                      {server.isOwner ? 'Owner' : 'Member'} · {server.bot.configured ? 'Configured' : 'Not configured'}
                    </div>
                  </div>
                </div>
                <ShieldCheck
                  className={`h-5 w-5 ${
                    (server.stats.securityScore ?? 0) >= 70
                      ? 'text-emerald-400'
                      : (server.stats.securityScore ?? 0) >= 40
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                />
              </Link>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-sentinel-text">{server.stats.members?.toLocaleString() ?? '—'}</div>
                  <div className="text-[11px] text-sentinel-muted">Members</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-sentinel-text">{server.stats.joins24h}</div>
                  <div className="text-[11px] text-sentinel-muted">Joins 24h</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-sentinel-text">{server.stats.moderation24h}</div>
                  <div className="text-[11px] text-sentinel-muted">Moderation 24h</div>
                </div>
              </div>
              {server.stats.recentActivity.length > 0 ? (
                <div className="mt-4 space-y-1">
                  {server.stats.recentActivity.map((a, i) => (
                    <div key={i} className="truncate text-xs text-sentinel-muted">
                      <span className="text-sentinel-accent2">›</span> {a.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}