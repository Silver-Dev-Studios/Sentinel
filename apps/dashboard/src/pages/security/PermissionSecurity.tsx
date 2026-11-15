import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface SecurityEvent {
  id: string;
  guildId: string;
  kind: string;
  severity?: string;
  message?: string;
  createdAt: string;
}

export function PermissionSecurityPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () =>
    api.get<{ rows: SecurityEvent[] }>(
      `/api/servers/${selectedGuildId}/security/events?kind=permission&limit=100`,
    );
  const { data, error, loading } = useGuildData(load, [selectedGuildId], 30_000);

  return (
    <div>
      <PageHeader
        title="Permission Security"
        description="Monitor dangerous role permissions, unexpected administrator grants, and suspicious permission escalations."
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card>
          <Empty>No permission security events. Sentinel records suspicious permission changes as they are observed.</Empty>
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {data!.rows.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2 border-b border-sentinel-border/40 pb-2 text-sm">
                <Pill tone={ev.severity === 'critical' ? 'danger' : ev.severity === 'warning' ? 'warn' : 'default'}>
                  {ev.kind}
                </Pill>
                <span className="flex-1 text-sentinel-text">{ev.message ?? 'Permission event'}</span>
                <span className="shrink-0 text-xs text-sentinel-muted">{new Date(ev.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}