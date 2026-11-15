import { useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill, ConfirmDialog } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface DiscordEvent {
  id: string;
  guildId: string;
  name: string;
  description?: string | null;
  scheduledStartTime: string;
  scheduledEndTime?: string | null;
  status: string;
  location?: string | null;
}

export function EventBuilderPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: DiscordEvent[] }>(`/api/servers/${selectedGuildId}/events`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [location, setLocation] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<DiscordEvent | null>(null);

  async function createEvent() {
    setFeedback(null);
    if (!name.trim() || !startsAt) {
      setFeedback('Name and start time are required.');
      return;
    }
    try {
      await api.post(`/api/servers/${selectedGuildId}/events`, {
        name: name.trim(),
        description: description || undefined,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : undefined,
        location: location || undefined,
      });
      setFeedback('Event created.');
      setCreating(false);
      setName('');
      setDescription('');
      setStartsAt('');
      setEndsAt('');
      setLocation('');
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function cancelEvent(ev: DiscordEvent) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/events/${ev.id}/cancel`, {});
      setCancelTarget(null);
      await reload();
    } catch (err) {
      setFeedback(`Cancel failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setCancelTarget(null);
    }
  }

  const upcoming = data?.rows.filter((e) => e.status === 'scheduled') ?? [];
  const past = data?.rows.filter((e) => e.status !== 'scheduled') ?? [];

  return (
    <div>
      <PageHeader
        title="Event Builder"
        description="Create and manage Discord scheduled events for this server."
        actions={
          <Button onClick={() => setCreating(true)}>
            <CalendarDays className="h-4 w-4" /> New event
          </Button>
        }
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
            {upcoming.length === 0 ? (
              <Empty>No upcoming events.</Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {upcoming.map((ev) => (
                  <Card key={ev.id}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-sentinel-text">{ev.name}</div>
                        <div className="mt-1 line-clamp-2 text-sm text-sentinel-muted">{ev.description ?? 'No description'}</div>
                      </div>
                      <Pill tone="accent">{ev.status}</Pill>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-sentinel-muted">
                      <span>{new Date(ev.scheduledStartTime).toLocaleString()}</span>
                      {ev.scheduledEndTime ? <span>→ {new Date(ev.scheduledEndTime).toLocaleString()}</span> : null}
                      {ev.location ? <span>· {ev.location}</span> : null}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Button variant="danger" onClick={() => setCancelTarget(ev)}>
                        Cancel event
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {past.length > 0 ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">History</h3>
              <Card>
                <div className="space-y-2">
                  {past.map((ev) => (
                    <div key={ev.id} className="flex items-center justify-between text-sm">
                      <span className="text-sentinel-text">{ev.name}</span>
                      <span className="text-sentinel-muted">
                        {ev.status} · {new Date(ev.scheduledStartTime).toLocaleDateString()}
                      </span>
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
            <h3 className="text-lg font-semibold text-sentinel-text">Create event</h3>
            <div className="mt-4 space-y-3">
              <Input label="Name" value={name} onChange={setName} />
              <Input label="Description" value={description} onChange={setDescription} textarea />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Starts</div>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Ends</div>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                  />
                </div>
              </div>
              <Input label="Location" value={location} onChange={setLocation} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createEvent()}>Create</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!cancelTarget}
        title={`Cancel "${cancelTarget?.name}"?`}
        message="The event will be cancelled in Discord and its history retained."
        confirmLabel="Cancel event"
        danger
        onConfirm={() => cancelTarget && void cancelEvent(cancelTarget)}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

function Input({ label, value, onChange, textarea }: { label: string; value: string; onChange: (v: string) => void; textarea?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
        />
      )}
    </div>
  );
}