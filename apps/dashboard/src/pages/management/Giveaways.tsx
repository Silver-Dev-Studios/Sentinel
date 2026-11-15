import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill, ConfirmDialog } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface Giveaway {
  id: string;
  guildId: string;
  prize: string;
  status: string;
  winnerCount: number;
  endsAt?: string;
  createdAt?: string;
  winners?: string[];
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface GiveawaySettings {
  defaultChannelId: string | null;
  defaultEmbed: boolean;
}

export function GiveawaysPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: Giveaway[] }>(`/api/servers/${selectedGuildId}/giveaways`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const channelsLoad = () => api.get<{ channels: Channel[] }>(`/api/servers/${selectedGuildId}/channels`);
  const channelsState = useGuildData(channelsLoad, [selectedGuildId]);
  const settingsLoad = () => api.get<GiveawaySettings>(`/api/servers/${selectedGuildId}/giveaways/settings`);
  const settingsState = useGuildData(settingsLoad, [selectedGuildId]);

  const [creating, setCreating] = useState(false);
  const [prize, setPrize] = useState('');
  const [winnerCount, setWinnerCount] = useState(1);
  const [durationHours, setDurationHours] = useState(24);
  const [channelId, setChannelId] = useState('');
  const [description, setDescription] = useState('');
  const [useEmbed, setUseEmbed] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [endTarget, setEndTarget] = useState<Giveaway | null>(null);
  const [rerollTarget, setRerollTarget] = useState<Giveaway | null>(null);

  const channels = (channelsState.data?.channels ?? []).filter((c) => c.type === 0 || c.type === 5 || c.type === 15);
  const defaultChannelId = settingsState.data?.defaultChannelId ?? '';
  const effectiveChannel = channelId || defaultChannelId || '';

  async function createGiveaway() {
    setFeedback(null);
    if (!prize.trim()) return;
    try {
      await api.post(`/api/servers/${selectedGuildId}/giveaways`, {
        prize: prize.trim(),
        winnerCount,
        endsAt: new Date(Date.now() + durationHours * 3600_000).toISOString(),
        ...(effectiveChannel ? { channelId: effectiveChannel } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        useEmbed,
      });
      setCreating(false);
      setPrize('');
      setDescription('');
      setChannelId('');
      setFeedback('Giveaway created.');
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function saveDefaultChannel(id: string) {
    try {
      await api.patch(`/api/servers/${selectedGuildId}/giveaways/settings`, {
        defaultChannelId: id || null,
        defaultEmbed: settingsState.data?.defaultEmbed ?? true,
      });
      setFeedback('Default giveaway channel saved.');
      await settingsState.reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function toggleDefaultEmbed(enabled: boolean) {
    try {
      await api.patch(`/api/servers/${selectedGuildId}/giveaways/settings`, {
        defaultChannelId: settingsState.data?.defaultChannelId ?? null,
        defaultEmbed: enabled,
      });
      setUseEmbed(enabled);
      setFeedback(enabled ? 'Giveaways will default to embeds.' : 'Giveaways will default to plain messages.');
      await settingsState.reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function endGiveaway(g: Giveaway) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/giveaways/${g.id}/end`, {});
      setEndTarget(null);
      await reload();
    } catch (err) {
      setFeedback(`End failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setEndTarget(null);
    }
  }

  async function rerollGiveaway(g: Giveaway) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/giveaways/${g.id}/reroll`, {});
      setRerollTarget(null);
      await reload();
    } catch (err) {
      setFeedback(`Reroll failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setRerollTarget(null);
    }
  }

  const active = data?.rows.filter((g) => g.status === 'running') ?? [];
  const finished = data?.rows.filter((g) => g.status !== 'running') ?? [];

  return (
    <div>
      <PageHeader
        title="Giveaways"
        description="Create giveaways and manage their winners from the dashboard or Discord."
        actions={<Button onClick={() => setCreating(true)}>New giveaway</Button>}
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <div className="min-w-56 flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-sentinel-muted">Default giveaway channel</label>
            <select
              value={defaultChannelId}
              onChange={(e) => void saveDefaultChannel(e.target.value)}
              className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
            >
              <option value="">No default (last synced channel)</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 pb-2">
            <span className="text-sentinel-text">Default to embeds</span>
            <button
              type="button"
              onClick={() => void toggleDefaultEmbed(!(settingsState.data?.defaultEmbed ?? true))}
              className={`h-6 w-11 rounded-full transition ${settingsState.data?.defaultEmbed ?? true ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white transition ${settingsState.data?.defaultEmbed ?? true ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Running</h3>
            {active.length === 0 ? <Empty>No active giveaways.</Empty> : (
              <div className="grid gap-3 md:grid-cols-2">
                {active.map((g) => (
                  <Card key={g.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sentinel-text">{g.prize}</div>
                        <div className="mt-0.5 text-xs text-sentinel-muted">
                          {g.winnerCount} winner(s) ·{' '}
                          {g.endsAt ? `ends ${new Date(g.endsAt).toLocaleString()}` : 'no end time'}
                        </div>
                      </div>
                      <Pill tone="success">{g.status}</Pill>
                    </div>
                    <div className="mt-3 flex justify-end gap-1.5">
                      <Button variant="danger" onClick={() => setEndTarget(g)}>
                        End now
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {finished.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">History</h3>
              <Card>
                <div className="space-y-2">
                  {finished.map((g) => (
                    <div key={g.id} className="flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sentinel-text">{g.prize}</div>
                        {g.winners && g.winners.length > 0 ? (
                          <div className="truncate text-xs text-sentinel-muted">Winners: {g.winners.map((w) => shortId(w)).join(', ')}</div>
                        ) : null}
                      </div>
                      <Button variant="secondary" onClick={() => setRerollTarget(g)}>
                        Reroll
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          ) : null}
        </>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">New giveaway</h3>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Prize</span>
              <input
                value={prize}
                onChange={(e) => setPrize(e.target.value)}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional — displayed on the giveaway message"
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Channel</span>
              <select
                value={effectiveChannel}
                onChange={(e) => setChannelId(e.target.value)}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              >
                <option value="">Use server default{defaultChannelId ? ` (#${(channels.find((c) => c.id === defaultChannelId)?.name ?? defaultChannelId)})` : ' (last synced channel)'}</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Winners</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={winnerCount}
                  onChange={(e) => setWinnerCount(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Duration (hours)</span>
                <input
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-sentinel-text">Post as embed</span>
              <button
                type="button"
                onClick={() => setUseEmbed((v) => !v)}
                className={`h-6 w-11 rounded-full transition ${useEmbed ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
              >
                <span className={`block h-5 w-5 rounded-full bg-white transition ${useEmbed ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createGiveaway()}>Create</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!endTarget}
        title={`End "${endTarget?.prize}"?`}
        message="The giveaway ends immediately and winners are selected."
        confirmLabel="End giveaway"
        danger
        onConfirm={() => endTarget && void endGiveaway(endTarget)}
        onCancel={() => setEndTarget(null)}
      />
      <ConfirmDialog
        open={!!rerollTarget}
        title="Reroll winners?"
        message="New winners will be selected fairly and the result recorded."
        confirmLabel="Reroll"
        onConfirm={() => rerollTarget && void rerollGiveaway(rerollTarget)}
        onCancel={() => setRerollTarget(null)}
      />
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}