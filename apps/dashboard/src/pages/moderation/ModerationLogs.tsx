import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Card, Empty, Loading, PageHeader, Tabs } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';
import type { ModerationCase } from '../../lib/types';
import { CasesTable } from './Moderation';

interface Channel {
  id: string;
  name: string;
  type: number;
}

const LOG_CATEGORIES = ['messages', 'moderation', 'tickets', 'giveaways', 'modmail', 'security', 'events'] as const;
type LogCategory = (typeof LOG_CATEGORIES)[number];

export function ModerationLogsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: ModerationCase[] }>(`/api/servers/${selectedGuildId}/moderation/cases?limit=200`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);
  const channelsLoad = () => api.get<{ channels: Channel[] }>(`/api/servers/${selectedGuildId}/channels`);
  const channelsState = useGuildData(channelsLoad, [selectedGuildId]);
  const settingsLoad = () => api.get<{ logChannels: Partial<Record<LogCategory, string | null>> }>(`/api/servers/${selectedGuildId}/settings`);
  const settingsState = useGuildData(settingsLoad, [selectedGuildId]);

  const [saving, setSaving] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [tab, setTab] = useState<'history' | 'routing'>('history');

  const channels = (channelsState.data?.channels ?? []).filter((c) => c.type === 0 || c.type === 5 || c.type === 15);
  const logChannels = settingsState.data?.logChannels ?? {};

  async function saveCategory(category: LogCategory, channelId: string) {
    setSaving(category);
    setFeedback(null);
    try {
      await api.patch(`/api/servers/${selectedGuildId}/log-channels`, {
        [category]: channelId || null,
      });
      setFeedback(`${label(category)} logs routed to ${channelId ? `#${channels.find((c) => c.id === channelId)?.name ?? channelId}` : 'nowhere (disabled)'}.`);
      await settingsState.reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Moderation Logs"
        description="Send specific log categories to their own channels, and review the complete moderation history."
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <Tabs
        tabs={[
          { id: 'routing', label: 'Log channel routing' },
          { id: 'history', label: 'Case history' },
        ]}
        active={tab}
        onChange={(t) => setTab(t as 'routing' | 'history')}
      />

      {tab === 'routing' ? (
        <Card className="mt-4">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">
            Route each log type to a channel
          </div>
          <p className="mb-4 text-xs text-sentinel-muted">
            Messages, moderation actions, ticket events, giveaways and more can each be mirrored to a dedicated Discord
            channel. Leave a category on “— disabled —” to stop posting that log.
          </p>
          <div className="space-y-3">
            {LOG_CATEGORIES.map((category) => {
              const current = logChannels[category] ?? '';
              return (
                <div key={category} className="flex flex-wrap items-center gap-3 border-b border-sentinel-border/40 pb-3">
                  <div className="w-40 text-sm font-medium capitalize text-sentinel-text">{label(category)}</div>
                  <select
                    value={current}
                    disabled={saving === category}
                    onChange={(e) => void saveCategory(category, e.target.value)}
                    className="min-w-64 flex-1 rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none disabled:opacity-60"
                  >
                    <option value="">— Disabled —</option>
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        #{c.name}
                      </option>
                    ))}
                  </select>
                  {saving === category ? <span className="text-xs text-sentinel-muted">Saving…</span> : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="mt-4">
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
      )}
    </div>
  );
}

function label(category: LogCategory): string {
  const map: Record<LogCategory, string> = {
    messages: 'Message logs',
    moderation: 'Moderation logs',
    tickets: 'Ticket logs',
    giveaways: 'Giveaway logs',
    modmail: 'Modmail logs',
    security: 'Security logs',
    events: 'Event logs',
  };
  return map[category];
}