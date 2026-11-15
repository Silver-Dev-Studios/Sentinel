import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface CustomCommand {
  id: string;
  name: string;
  kind: 'prefix' | 'slash';
  description?: string | null;
  content?: string | null;
  embeds?: unknown[];
  aliases?: string[];
  requiredPermission?: string | null;
  enabled: boolean;
}

export function CustomCommandsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: CustomCommand[] }>(`/api/servers/${selectedGuildId}/commands`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'prefix' | 'slash'>('slash');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [aliases, setAliases] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function createCmd() {
    setFeedback(null);
    if (!name.trim() && !content.trim()) {
      setFeedback('Command name and response content are required.');
      return;
    }
    try {
      await api.post(`/api/servers/${selectedGuildId}/commands`, {
        name: name.trim(),
        kind,
        description: description || undefined,
        content: content.trim(),
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        enabled: true,
      });
      setCreating(false);
      setName('');
      setContent('');
      setDescription('');
      setAliases('');
      setFeedback('Command created.');
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function toggleEnabled(cmd: CustomCommand) {
    try {
      await api.patch(`/api/servers/${selectedGuildId}/commands/${cmd.id}`, { enabled: !cmd.enabled });
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function deleteCmd(cmd: CustomCommand) {
    try {
      await api.delete(`/api/servers/${selectedGuildId}/commands/${cmd.id}`);
      await reload();
    } catch (err) {
      setFeedback(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <div>
      <PageHeader
        title="Custom Commands"
        description="Create prefix and slash commands for your server. Custom commands can never bypass the permission system."
        actions={<Button onClick={() => setCreating(true)}>New command</Button>}
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Empty>No custom commands yet.</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data!.rows.map((cmd) => (
            <Card key={cmd.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sentinel-text">
                    {cmd.kind === 'slash' ? '/' : '+'}
                    {cmd.name}
                  </div>
                  <div className="mt-0.5 text-xs text-sentinel-muted">
                    {cmd.description ?? 'No description'}
                    {cmd.aliases?.length ? ` · aliases: ${cmd.aliases.map((a) => `+${a}`).join(', ')}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill tone={cmd.enabled ? 'success' : 'default'}>{cmd.enabled ? 'Enabled' : 'Disabled'}</Pill>
                  <button
                    onClick={() => void toggleEnabled(cmd)}
                    className={`h-5 w-9 rounded-full transition ${cmd.enabled ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
                  >
                    <span className={`block h-4 w-4 rounded-full bg-white transition ${cmd.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-sentinel-muted">{cmd.content}</div>
              <div className="mt-3 flex justify-end">
                <Button variant="ghost" onClick={() => void deleteCmd(cmd)}>
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">New custom command</h3>
            <div className="mt-4 space-y-3">
              <Labeled label="Kind">
                <div className="flex gap-2">
                  <Button variant={kind === 'slash' ? 'primary' : 'secondary'} onClick={() => setKind('slash')}>
                    Slash (/)
                  </Button>
                  <Button variant={kind === 'prefix' ? 'primary' : 'secondary'} onClick={() => setKind('prefix')}>
                    Prefix (+)
                  </Button>
                </div>
              </Labeled>
              <Labeled label="Command name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </Labeled>
              <Labeled label="Description">
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </Labeled>
              <Labeled label="Response content">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </Labeled>
              <Labeled label="Aliases (comma separated, prefix only)">
                <input
                  value={aliases}
                  onChange={(e) => setAliases(e.target.value)}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </Labeled>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={() => void createCmd()}>Create</Button>
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