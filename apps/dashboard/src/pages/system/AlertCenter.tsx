import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface Alert {
  id: string;
  guildId: string;
  severity: string;
  category: string;
  message: string;
  status: string;
  createdAt: string;
}

export function AlertCenterPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: Alert[] }>(`/api/servers/${selectedGuildId}/alerts?limit=100`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');

  async function ack(a: Alert) {
    await api.post(`/api/servers/${selectedGuildId}/alerts/${a.id}/ack`, {});
    await reload();
  }

  async function resolve(a: Alert) {
    await api.post(`/api/servers/${selectedGuildId}/alerts/${a.id}/resolve`, {});
    await reload();
  }

  const filtered = (data?.rows ?? []).filter((a) => (statusFilter === 'all' ? true : a.status === statusFilter));

  const toneFor = (a: Alert): 'danger' | 'warn' | 'accent' | 'default' =>
    a.severity === 'critical' || a.severity === 'high' ? 'danger' : a.severity === 'warning' ? 'warn' : a.status === 'resolved' ? 'default' : 'accent';

  return (
    <div>
      <PageHeader
        title="Alert Center"
        description="Important events that need attention."
        actions={
          <div className="flex gap-1">
            {(['all', 'open', 'acknowledged', 'resolved'] as const).map((s) => (
              <Button key={s} variant={statusFilter === s ? 'primary' : 'secondary'} onClick={() => setStatusFilter(s)}>
                {s[0].toUpperCase() + s.slice(1)}
              </Button>
            ))}
          </div>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : filtered.length === 0 ? (
        <Card>
          <Empty>No alerts in this view.</Empty>
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {filtered.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 rounded-lg border border-sentinel-border/60 p-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={toneFor(a)}>
                      {a.severity} · {a.category}
                    </Pill>
                    <Pill>{a.status}</Pill>
                  </div>
                  <div className="mt-1.5 text-sm text-sentinel-text">{a.message}</div>
                  <div className="mt-0.5 text-xs text-sentinel-muted">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
                {a.status !== 'resolved' ? (
                  <div className="flex shrink-0 gap-1.5">
                    {a.status === 'open' ? (
                      <Button variant="secondary" onClick={() => void ack(a)}>
                        Acknowledge
                      </Button>
                    ) : null}
                    <Button variant="secondary" onClick={() => void resolve(a)}>
                      Resolve
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}