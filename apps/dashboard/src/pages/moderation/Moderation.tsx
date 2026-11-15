import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader, Pill, SectionTitle } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';
import type { ModerationCase } from '../../lib/types';

export function ModerationPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: ModerationCase[] }>(`/api/servers/${selectedGuildId}/moderation/cases?limit=100`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);

  return (
    <div>
      <PageHeader
        title="Moderation Center"
        description="Searchable history of every moderation action taken through Sentinel."
      />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : data && data.rows.length === 0 ? (
          <Empty>No moderation cases recorded yet.</Empty>
        ) : (
          <CasesTable cases={data?.rows ?? []} />
        )}
      </Card>
    </div>
  );
}

export function CasesTable({ cases }: { cases: ModerationCase[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-sentinel-border text-xs uppercase tracking-wider text-sentinel-muted">
            <th className="py-2 pr-3">Case</th>
            <th className="py-2 pr-3">Action</th>
            <th className="py-2 pr-3">Target</th>
            <th className="py-2 pr-3">Moderator</th>
            <th className="py-2 pr-3">Reason</th>
            <th className="py-2 pr-3">Source</th>
            <th className="py-2">When</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => (
            <tr key={c.id} className="border-b border-sentinel-border/40 hover:bg-sentinel-surface2/50">
              <td className="py-2 pr-3 text-sentinel-muted">#{c.caseNumber}</td>
              <td className="py-2 pr-3">
                <Pill tone={actionTone(c.action)}>{c.action}</Pill>
              </td>
              <td className="py-2 pr-3 font-medium text-sentinel-text">{shortId(c.targetId)}</td>
              <td className="py-2 pr-3 text-sentinel-muted">{shortId(c.moderatorId)}</td>
              <td className="max-w-[260px] truncate py-2 pr-3 text-sentinel-muted">{c.reason ?? '—'}</td>
              <td className="py-2 pr-3 text-xs text-sentinel-muted">{c.source}</td>
              <td className="whitespace-nowrap py-2 text-sentinel-muted">{new Date(c.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function actionTone(action: string): 'success' | 'warn' | 'danger' | 'default' {
  if (['ban', 'kick', 'timeout', 'mute', 'lock', 'purge'].includes(action)) return 'danger';
  if (['warn'].includes(action)) return 'warn';
  if (['unban', 'untimeout', 'unmute', 'unlock'].includes(action)) return 'success';
  return 'default';
}

function shortId(id?: string | null): string {
  if (!id) return '—';
  if (id.length > 12) return `${id.slice(0, 8)}…`;
  return id;
}

export function ModerationStatsBlocks({ total, today }: { total: number; today: number }) {
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2">
      <Card>Total cases: {total}</Card>
      <Card>Cases today: {today}</Card>
    </div>
  );
}

export { SectionTitle };