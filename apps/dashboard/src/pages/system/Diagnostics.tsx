import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader, Pill, StatusIcon } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface DiagnosticsData {
  api: { status: string; latencyMs: number };
  database: { status: string };
  websocket: { connectedClients: number; botConnected: boolean };
  bot: { connected: boolean };
  backgroundTasks: { status: string };
  failedOperations: number;
  recentErrors: Array<{ kind: string; service: string; message: string; createdAt: string }>;
}

export function DiagnosticsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<DiagnosticsData>(`/api/servers/${selectedGuildId}/diagnostics`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId], 15_000);

  return (
    <div>
      <PageHeader title="Diagnostics" description="Health of Sentinel itself: bot, gateway, API, database, and background tasks." />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HealthCard label="Discord bot" ok={data!.bot.connected} detail={`${data!.bot.connected ? 'connected' : 'disconnected'}`} />
            <HealthCard label="WebSocket" ok={data!.websocket.botConnected} detail={`${data!.websocket.connectedClients} client(s)`} />
            <HealthCard label="API" ok={data!.api.status === 'operational'} detail={`latency ${data!.api.latencyMs}ms`} />
            <HealthCard label="Database" ok={data!.database.status === 'operational'} detail={data!.database.status} />
          </div>

          <Card className="mb-6">
            <div className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-sentinel-muted">
              <span>Background tasks</span>
              <Pill tone={data!.backgroundTasks.status === 'running' ? 'success' : 'warn'}>{data!.backgroundTasks.status}</Pill>
            </div>
            <div className="flex items-center gap-2 text-sm text-sentinel-text">
              <StatusIcon status={data!.failedOperations === 0 ? 'ok' : 'warn'} />
              Failed operations: <strong>{data!.failedOperations}</strong>
            </div>
          </Card>

          <Card>
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Recent errors</div>
            {(data!.recentErrors.length ?? 0) === 0 ? (
              <Empty>No recent errors recorded.</Empty>
            ) : (
              <div className="space-y-2">
                {data!.recentErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-2 border-b border-sentinel-border/40 pb-2 text-sm">
                    <Pill tone={e.kind === 'error' ? 'danger' : 'warn'}>{e.kind}</Pill>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sentinel-text">{e.message}</div>
                      <div className="text-xs text-sentinel-muted">{e.service}</div>
                    </div>
                    <span className="shrink-0 text-xs text-sentinel-muted">{new Date(e.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function HealthCard({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <Card className="flex items-center gap-3">
      <StatusIcon status={ok ? 'ok' : 'critical'} />
      <div>
        <div className="text-sm font-medium text-sentinel-text">{label}</div>
        <div className="text-xs text-sentinel-muted">{detail}</div>
      </div>
    </Card>
  );
}