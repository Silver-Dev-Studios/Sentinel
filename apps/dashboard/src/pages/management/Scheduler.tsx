import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface ScheduledMessage {
  id: string;
  name?: string | null;
  type: string;
  runAt?: string;
  scheduledFor?: string;
  recurring?: string | null;
  status?: string;
  config?: { channelIds?: string[]; content?: string };
}

interface SchedulerResponse {
  scheduledMessages: ScheduledMessage[];
  scheduledTasks: ScheduledMessage[];
}

export function SchedulerPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<SchedulerResponse>(`/api/servers/${selectedGuildId}/scheduler`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [recurring, setRecurring] = useState('');
  const [channelId, setChannelId] = useState('');
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadChannels = async () => {
    try {
      const res = await api.get<{ channels: Array<{ id: string; name: string; type: number }> }>(
        `/api/servers/${selectedGuildId}/channels`,
      );
      setChannels(res.channels.filter((c) => c.type === 0 || c.type === 15));
    } catch {
      setChannels([]);
    }
  };

  async function openCreate() {
    setCreating(true);
    setFeedback(null);
    setName('');
    setContent('');
    setScheduledFor('');
    setRecurring('');
    setChannelId('');
    await loadChannels();
  }

  async function createTask() {
    setFeedback(null);
    if (!content.trim() || !scheduledFor || !channelId) {
      setFeedback('Content, time, and channel are required.');
      return;
    }
    try {
      await api.post(`/api/servers/${selectedGuildId}/scheduler/messages`, {
        channelIds: [channelId],
        content: content.trim(),
        scheduledFor: new Date(scheduledFor).toISOString(),
        recurring: recurring || undefined,
        name: name.trim() || undefined,
      });
      setCreating(false);
      setFeedback('Scheduled task created.');
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function deleteTask(id: string) {
    try {
      await api.delete(`/api/servers/${selectedGuildId}/scheduler/messages/${id}`);
      await reload();
    } catch (err) {
      setFeedback(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const tasks = [
    ...(data?.scheduledMessages ?? []).map((m) => ({ ...m, runAt: m.scheduledFor })),
    ...(data?.scheduledTasks ?? []),
  ].filter((t): t is ScheduledMessage & { runAt: string } => !!t.runAt);
  tasks.sort((a, b) => new Date(a.runAt).getTime() - new Date(b.runAt).getTime());

  const next = tasks.filter((t) => new Date(t.runAt).getTime() > Date.now() && !t.recurring);
  const recurringTasks = tasks.filter((t) => !!t.recurring);

  return (
    <div>
      <PageHeader
        title="Scheduler"
        description="Automate announcements, embeds, reminders, and recurring messages. Tasks persist in PostgreSQL and survive restarts."
        actions={<Button onClick={() => void openCreate()}>New scheduled task</Button>}
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (
        <>
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Upcoming</h3>
            {next.length === 0 ? <Empty>No upcoming scheduled tasks.</Empty> : (
              <div className="space-y-2">
                {next.map((t) => (
                  <Card key={t.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-sentinel-text">{t.name ?? 'Scheduled message'}</div>
                        <div className="truncate text-xs text-sentinel-muted">
                          {new Date(t.runAt).toLocaleString()} · {(t.config?.content ?? '').slice(0, 60)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone="accent">{t.type}</Pill>
                        <Button variant="ghost" onClick={() => void deleteTask(t.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Recurring</h3>
            {recurringTasks.length === 0 ? <Empty>No recurring tasks.</Empty> : (
              <div className="space-y-2">
                {recurringTasks.map((t) => (
                  <Card key={t.id}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-sentinel-text">{t.name ?? 'Recurring'}</div>
                        <div className="truncate text-xs text-sentinel-muted">every {t.recurring} · next {new Date(t.runAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone="success">recurring</Pill>
                        <Button variant="ghost" onClick={() => void deleteTask(t.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">New scheduled task</h3>
            <div className="mt-4 space-y-3">
              <Labeled label="Name (optional)">
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
              </Labeled>
              <Labeled label="Channel">
                <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none">
                  <option value="">Select channel…</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.id}>#{c.name}</option>
                  ))}
                </select>
              </Labeled>
              <Labeled label="Content">
                <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
              </Labeled>
              <Labeled label="Run at">
                <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
              </Labeled>
              <Labeled label="Recurring (cron-like, optional)">
                <input value={recurring} onChange={(e) => setRecurring(e.target.value)} placeholder="e.g. daily, weekly, 0 9 * * MON" className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
              </Labeled>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
              <Button onClick={() => void createTask()}>Schedule</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
      {children}
    </div>
  );
}