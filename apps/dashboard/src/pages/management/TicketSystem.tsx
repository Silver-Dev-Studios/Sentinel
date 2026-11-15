import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill, ConfirmDialog } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface Ticket {
  id: string;
  guildId: string;
  panelId?: string | null;
  authorId?: string | null;
  subject: string;
  status: string;
  assignedToId?: string | null;
  openedAt?: string;
  createdAt?: string;
}

interface TicketPanel {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  emoji?: string | null;
}

export function TicketSystemPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const loadTickets = () => api.get<{ rows: Ticket[]; total: number }>(`/api/servers/${selectedGuildId}/tickets?status=open,claimed`);
  const ticketsState = useGuildData(loadTickets, [selectedGuildId]);
  const loadPanels = () => api.get<{ rows: TicketPanel[] }>(`/api/servers/${selectedGuildId}/tickets/panels`);
  const panelsState = useGuildData(loadPanels, [selectedGuildId]);

  const [creatingPanel, setCreatingPanel] = useState(false);
  const [panelName, setPanelName] = useState('');
  const [panelCategory, setPanelCategory] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<Ticket | null>(null);

  async function claim(ticket: Ticket) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/tickets/${ticket.id}/claim`, {});
      setFeedback('Ticket claimed.');
      await ticketsState.reload();
    } catch (err) {
      setFeedback(`Claim failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function closeTicket(ticket: Ticket) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/tickets/${ticket.id}/close`, { transcript: true });
      setCloseTarget(null);
      setFeedback('Ticket closed.');
      await ticketsState.reload();
    } catch (err) {
      setFeedback(`Close failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setCloseTarget(null);
    }
  }

  async function createPanel() {
    setFeedback(null);
    if (!panelName.trim()) return;
    try {
      await api.post(`/api/servers/${selectedGuildId}/tickets/panels`, {
        name: panelName.trim(),
        category: panelCategory || undefined,
      });
      setCreatingPanel(false);
      setPanelName('');
      setPanelCategory('');
      setFeedback('Panel created and queued for Discord.');
      await panelsState.reload();
    } catch (err) {
      setFeedback(`Panel create failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const rows = ticketsState.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Ticket System"
        description="Support tickets and ticket panels for this server."
        actions={<Button onClick={() => setCreatingPanel(true)}>New ticket panel</Button>}
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-sm font-semibold text-sentinel-text">Open & claimed tickets</div>
          {ticketsState.loading && !ticketsState.data ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty>No open tickets.</Empty>
          ) : (
            <div className="space-y-2">
              {rows.map((t) => (
                <div key={t.id} className="rounded-lg border border-sentinel-border/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-sentinel-text">{t.subject}</div>
                      <div className="mt-0.5 text-xs text-sentinel-muted">
                        by {shortId(t.authorId)} ·{' '}
                        {new Date(t.openedAt ?? t.createdAt ?? Date.now()).toLocaleString()}
                      </div>
                    </div>
                    <Pill tone={t.status === 'claimed' ? 'accent' : 'warn'}>{t.status}</Pill>
                  </div>
                  <div className="mt-2 flex justify-end gap-1.5">
                    {t.status !== 'claimed' ? (
                      <Button variant="secondary" onClick={() => void claim(t)}>
                        Claim
                      </Button>
                    ) : null}
                    <Button variant="danger" onClick={() => setCloseTarget(t)}>
                      Close
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="mb-3 text-sm font-semibold text-sentinel-text">Ticket panels</div>
          {panelsState.loading && !panelsState.data ? (
            <Loading />
          ) : (panelsState.data?.rows.length ?? 0) === 0 ? (
            <Empty>No ticket panels configured.</Empty>
          ) : (
            <div className="space-y-2">
              {panelsState.data!.rows.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-sentinel-border/60 p-3">
                  <div>
                    <div className="text-sm font-medium text-sentinel-text">
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.name}
                    </div>
                    <div className="text-xs text-sentinel-muted">{p.category ?? 'No category'}</div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => api.delete(`/api/servers/${selectedGuildId}/tickets/panels/${p.id}`).then(() => panelsState.reload())}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {creatingPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">Create ticket panel</h3>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Panel name</span>
              <input
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Category</span>
              <input
                value={panelCategory}
                onChange={(e) => setPanelCategory(e.target.value)}
                placeholder="e.g. General Support, Technical Support"
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreatingPanel(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createPanel()}>Create</Button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!closeTarget}
        title="Close ticket?"
        message="Closing generates a transcript and moves the ticket to history."
        confirmLabel="Close & save transcript"
        danger
        onConfirm={() => closeTarget && void closeTicket(closeTarget)}
        onCancel={() => setCloseTarget(null)}
      />
    </div>
  );
}

function shortId(id?: string | null): string {
  if (!id) return 'unknown';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}