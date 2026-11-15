import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Button, Card, Empty, Loading, PageHeader, StatCard } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface AnalyticsData {
  period: string;
  days: number;
  generatedAt: string;
  totals: {
    joins: number;
    leaves: number;
    netGrowth: number;
    moderation: number;
    ticketsOpened: number;
    giveawaysCreated: number;
    eventsCreated: number;
    messages: number;
  };
  timeline: Array<{ date: string; joins: number; leaves: number }>;
}

export function AnalyticsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const [days, setDays] = useState(14);

  const load = () => api.get<AnalyticsData>(`/api/servers/${selectedGuildId}/analytics?days=${days}`);
  const { data, error, loading } = useGuildData<AnalyticsData | null>(load, [selectedGuildId, days]);

  const periodLabel =
    days <= 1 ? 'Today' : days <= 7 ? 'Last 7 days' : days <= 14 ? 'Last 14 days' : days <= 30 ? 'Last 30 days' : `${days} days`;

  return (
    <div>
      <PageHeader
        title="Server Analytics"
        description={`${periodLabel} — including only activity Sentinel has actually observed.`}
        actions={
          <div className="flex items-center gap-1">
            {[7, 14, 30, 90].map((d) => (
              <Button key={d} variant={days === d ? 'primary' : 'secondary'} onClick={() => setDays(d)}>
                {d}d
              </Button>
            ))}
          </div>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : data ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Net Growth" value={data.totals.netGrowth >= 0 ? `+${data.totals.netGrowth}` : data.totals.netGrowth} />
            <StatCard label="Joins" value={data.totals.joins} />
            <StatCard label="Leaves" value={data.totals.leaves} />
            <StatCard label="Moderation Actions" value={data.totals.moderation} />
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Messages Sent" value={data.totals.messages} />
            <StatCard label="Tickets Opened" value={data.totals.ticketsOpened} />
            <StatCard label="Giveaways" value={data.totals.giveawaysCreated} />
            <StatCard label="Events" value={data.totals.eventsCreated} />
          </div>

          <Card>
            <div className="mb-3 text-sm font-semibold text-sentinel-text">Member Growth Timeline</div>
            <TimelineChart timeline={data.timeline} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

function TimelineChart({ timeline }: { timeline: Array<{ date: string; joins: number; leaves: number }> }) {
  const max = Math.max(1, ...timeline.map((t) => Math.max(t.joins, t.leaves)));
  return (
    <div className="flex h-48 items-end gap-1">
      {timeline.map((t) => (
        <div key={t.date} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
          <div className="flex w-full flex-1 items-end justify-center gap-0.5">
            <div
              className="w-1/2 rounded-t bg-emerald-500/70"
              title={`${t.date} joins: ${t.joins}`}
              style={{ height: `${(t.joins / max) * 100}%` }}
            />
            <div
              className="w-1/2 rounded-t bg-rose-500/70"
              title={`${t.date} leaves: ${t.leaves}`}
              style={{ height: `${(t.leaves / max) * 100}%` }}
            />
          </div>
          <div className="text-[9px] text-sentinel-muted">{t.date.slice(5)}</div>
        </div>
      ))}
    </div>
  );
}