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
  channelId?: string | null;
  openingMessage?: string | null;
  questions?: string[] | null;
  staffRoleIds?: string[];
}

interface Channel {
  id: string;
  name: string;
  type: number;
}

interface GuildRole {
  id: string;
  key: string;
  name: string;
  discordRoleId?: string | null;
}

export function TicketSystemPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const loadTickets = () => api.get<{ rows: Ticket[]; total: number }>(`/api/servers/${selectedGuildId}/tickets?status=open,claimed`);
  const ticketsState = useGuildData(loadTickets, [selectedGuildId]);
  const loadPanels = () => api.get<{ rows: TicketPanel[] }>(`/api/servers/${selectedGuildId}/tickets/panels`);
  const panelsState = useGuildData(loadPanels, [selectedGuildId]);
  const channelsLoad = () => api.get<{ channels: Channel[] }>(`/api/servers/${selectedGuildId}/channels`);
  const channelsState = useGuildData(channelsLoad, [selectedGuildId]);

  const [creatingPanel, setCreatingPanel] = useState(false);
  const [editingPanel, setEditingPanel] = useState<TicketPanel | null>(null);
  const [panelName, setPanelName] = useState('');
  const [panelCategory, setPanelCategory] = useState('');
  const [panelDescription, setPanelDescription] = useState('');
  const [panelEmoji, setPanelEmoji] = useState('');
  const [panelChannelId, setPanelChannelId] = useState('');
  const [panelOpeningMessage, setPanelOpeningMessage] = useState('');
  const [panelQuestions, setPanelQuestions] = useState('');
  const [panelStaffRoles, setPanelStaffRoles] = useState<string[]>([]);
  const [panelButtonLabel, setPanelButtonLabel] = useState('Open a ticket');
  const [panelButtonStyle, setPanelButtonStyle] = useState<'primary' | 'secondary' | 'success' | 'danger'>('primary');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<Ticket | null>(null);

  const channels = (channelsState.data?.channels ?? []).filter((c) => c.type === 0 || c.type === 5 || c.type === 15);

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

  function openCreate() {
    setEditingPanel(null);
    setPanelName('');
    setPanelCategory('');
    setPanelDescription('');
    setPanelEmoji('');
    setPanelChannelId('');
    setPanelOpeningMessage('');
    setPanelQuestions('');
    setPanelStaffRoles([]);
    setPanelButtonLabel('Open a ticket');
    setPanelButtonStyle('primary');
    setCreatingPanel(true);
  }

  function openEdit(p: TicketPanel) {
    setEditingPanel(p);
    setPanelName(p.name);
    setPanelCategory(p.category ?? '');
    setPanelDescription(p.description ?? '');
    setPanelEmoji(p.emoji ?? '');
    setPanelChannelId(p.channelId ?? '');
    setPanelOpeningMessage(p.openingMessage ?? '');
    setPanelQuestions((p.questions ?? []).join('\n'));
    setPanelStaffRoles(p.staffRoleIds ?? []);
    setPanelButtonLabel('Open a ticket');
    setPanelButtonStyle('primary');
    setCreatingPanel(true);
  }

  function toggleStaffRole(roleId: string) {
    setPanelStaffRoles((prev) => (prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]));
  }

  async function savePanel() {
    setFeedback(null);
    if (!panelName.trim()) return;
    const body = {
      name: panelName.trim(),
      category: panelCategory.trim() || undefined,
      description: panelDescription.trim() || undefined,
      emoji: panelEmoji.trim() || undefined,
      channelId: panelChannelId || undefined,
      openingMessage: panelOpeningMessage.trim() || undefined,
      questions: panelQuestions.split('\n').map((q) => q.trim()).filter(Boolean).slice(0, 10),
      staffRoleIds: panelStaffRoles,
      buttonLabel: panelButtonLabel.trim() || 'Open a ticket',
      buttonStyle: panelButtonStyle,
    };
    try {
      if (editingPanel) {
        await api.patch(`/api/servers/${selectedGuildId}/tickets/panels/${editingPanel.id}`, body);
        setFeedback('Panel updated and re-posted to Discord.');
      } else {
        await api.post(`/api/servers/${selectedGuildId}/tickets/panels`, body);
        setFeedback('Panel created and queued for Discord.');
      }
      setCreatingPanel(false);
      await panelsState.reload();
    } catch (err) {
      setFeedback(`Panel save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  const rows = ticketsState.data?.rows ?? [];

  return (
    <div>
      <PageHeader
        title="Ticket System"
        description="Support tickets and ticket panels for this server."
        actions={<Button onClick={openCreate}>New ticket panel</Button>}
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
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-sentinel-border/60 p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-sentinel-text">
                      {p.emoji ? `${p.emoji} ` : ''}
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-sentinel-muted">
                      {p.category ?? 'No category'}
                      {p.channelId ? ` · panel in <#${p.channelId}>` : ''}
                    </div>
                    {p.openingMessage ? <div className="mt-0.5 truncate text-xs text-sentinel-muted">{p.openingMessage}</div> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => api.delete(`/api/servers/${selectedGuildId}/tickets/panels/${p.id}`).then(() => panelsState.reload())}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {creatingPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">
              {editingPanel ? 'Edit ticket panel' : 'Create ticket panel'}
            </h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Panel name</span>
                <input
                  value={panelName}
                  onChange={(e) => setPanelName(e.target.value)}
                  placeholder="e.g. Support"
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Emoji</span>
                <input
                  value={panelEmoji}
                  onChange={(e) => setPanelEmoji(e.target.value)}
                  placeholder="🎫"
                  maxLength={8}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
            </div>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Ticket category</span>
              <input
                value={panelCategory}
                onChange={(e) => setPanelCategory(e.target.value)}
                placeholder="e.g. General Support, Technical Support"
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Panel description (embed body)</span>
              <textarea
                value={panelDescription}
                onChange={(e) => setPanelDescription(e.target.value)}
                rows={2}
                placeholder="Shown on the panel embed message"
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Panel channel (where the button post goes)</span>
              <select
                value={panelChannelId}
                onChange={(e) => setPanelChannelId(e.target.value)}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              >
                <option value="">— No channel (save only) —</option>
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Opening message</span>
              <textarea
                value={panelOpeningMessage}
                onChange={(e) => setPanelOpeningMessage(e.target.value)}
                rows={2}
                placeholder="Welcome! Support will be with you shortly."
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>

            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Opening questions (one per line)</span>
              <textarea
                value={panelQuestions}
                onChange={(e) => setPanelQuestions(e.target.value)}
                rows={2}
                placeholder={'What is your issue?\nWhich server is this about?'}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Button label</span>
                <input
                  value={panelButtonLabel}
                  onChange={(e) => setPanelButtonLabel(e.target.value)}
                  maxLength={80}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Button style</span>
                <select
                  value={panelButtonStyle}
                  onChange={(e) => setPanelButtonStyle(e.target.value as never)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                >
                  <option value="primary">Primary (blue)</option>
                  <option value="secondary">Secondary (grey)</option>
                  <option value="success">Success (green)</option>
                  <option value="danger">Danger (red)</option>
                </select>
              </label>
            </div>

            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Staff roles (can view/respond)</span>
              <RolesPicker selected={panelStaffRoles} onToggle={toggleStaffRole} />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreatingPanel(false)}>
                Cancel
              </Button>
              <Button onClick={() => void savePanel()}>{editingPanel ? 'Save changes' : 'Create panel'}</Button>
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

function RolesPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ id: string; key: string; name: string; discordRoleId?: string | null }[]>(`/api/servers/${selectedGuildId}/roles`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);

  if (loading && !data) return <Loading />;
  if (error) return <div className="text-xs text-sentinel-muted">{error}</div>;
  const roles =
    (data ?? []).filter((r) => r.discordRoleId || r.id) as Array<GuildRole & { id: string }>;

  return (
    <div className="flex flex-wrap gap-2">
      {roles.length === 0 ? (
        <span className="text-xs text-sentinel-muted">No custom roles created yet. Staff access falls back to server administrators.</span>
      ) : (
        roles.map((role) => {
          const roleIdForSelect = role.discordRoleId ?? role.id;
          const active = selected.includes(roleIdForSelect);
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => onToggle(roleIdForSelect)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? 'border-sentinel-accent2 bg-sentinel-accent2/20 text-sentinel-accent2'
                  : 'border-sentinel-border text-sentinel-muted hover:border-sentinel-accent2/50'
              }`}
            >
              {role.name}
            </button>
          );
        })
      )}
    </div>
  );
}

function shortId(id?: string | null): string {
  if (!id) return 'unknown';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}