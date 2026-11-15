import { Server, ShieldCheck } from 'lucide-react';
import { useServer } from '../../lib/server';
import { Button, Card, Empty, ErrorState, Loading, PageHeader, StatCard } from '../../components/ui';

export function ServerSelectorPage() {
  const { servers, selectedGuildId, selectServer, loading, error, retrying, refresh } = useServer();

  if (loading) return <Loading />;
  if (error) {
    return (
      <ErrorState
        title={retrying ? 'Could not load servers — retrying' : 'Could not load servers'}
        description={error}
        retrying={retrying}
        onRetry={refresh}
      />
    );
  }

  const totalMembers = servers.reduce((a, s) => a + (s.stats.members ?? 0), 0);
  const openAlerts = servers.reduce((a, s) => a + (s.stats.openAlerts ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Server Selector"
        description="Choose the SDS server workspace to manage. Each server has its own isolated data, settings, and permissions."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Available Servers" value={servers.length} icon={<Server className="h-5 w-5" />} />
        <StatCard label="Total Members" value={totalMembers.toLocaleString()} icon={<Server className="h-5 w-5" />} />
        <StatCard label="Open Alerts" value={openAlerts} icon={<Server className="h-5 w-5" />} />
      </div>

      {servers.length === 0 ? (
        <Empty>No servers are authorized for your account.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {servers.map((server) => (
            <Card
              key={server.id}
              className={`transition ${selectedGuildId === server.id ? 'border-sentinel-accent2 shadow-glow' : ''}`}
            >
              <div className="flex items-center gap-3">
                {server.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${server.id}/${server.icon}.png?size=128`}
                    alt=""
                    className="h-12 w-12 rounded-xl"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sentinel-accent/30 text-xl font-bold">
                    {server.name?.charAt(0) ?? '?'}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-sentinel-text">{server.name}</div>
                  <div className="text-xs text-sentinel-muted">
                    {server.isOwner ? 'You own this server' : 'You have access'} · ID {server.id}
                  </div>
                </div>
                <ShieldCheck className="h-5 w-5 text-sentinel-accent2" />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-bold text-sentinel-text">{server.stats.members?.toLocaleString() ?? '—'}</div>
                  <div className="text-[11px] text-sentinel-muted">Members</div>
                </div>
                <div>
                  <div className="font-bold text-sentinel-text">{server.stats.joins24h}</div>
                  <div className="text-[11px] text-sentinel-muted">Joins 24h</div>
                </div>
                <div>
                  <div className="font-bold text-sentinel-text">{server.stats.openAlerts}</div>
                  <div className="text-[11px] text-sentinel-muted">Open Alerts</div>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                {selectedGuildId === server.id ? (
                  <PillSelected />
                ) : (
                  <Button onClick={() => selectServer(server.id)}>Open workspace</Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PillSelected() {
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-400">
      Selected
    </span>
  );
}
