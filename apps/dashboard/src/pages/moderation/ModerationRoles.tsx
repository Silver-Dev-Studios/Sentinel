import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Button, Card, Empty, Loading, PageHeader, Pill, AlertBanner } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';
import { PERMISSION_LABELS, type PermissionKey } from '@sds-sentinel/shared';

interface RoleRow {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isOwnerRole: boolean;
  permissions: Array<{ permission: string; enabled: boolean }>;
  memberCount: number;
  discordRoleId?: string | null;
}

export function ModerationRolesPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<RoleRow[]>(`/api/servers/${selectedGuildId}/roles`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);

  const allKeys = Object.keys(PERMISSION_LABELS) as PermissionKey[];

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setName('');
    setDescription('');
    setPerms(new Set());
  }

  function startEdit(role: RoleRow) {
    setEditing(role);
    setCreating(false);
    setName(role.name);
    setDescription(role.description ?? '');
    setPerms(new Set(role.permissions.filter((p) => p.enabled).map((p) => p.permission)));
  }

  async function submit() {
    setFeedback(null);
    try {
      if (creating) {
        await api.post(`/api/servers/${selectedGuildId}/roles`, {
          name,
          description: description || undefined,
          permissions: [...perms],
        });
      } else if (editing) {
        await api.patch(`/api/servers/${selectedGuildId}/roles/${editing.key}`, {
          name,
          description: description || null,
          permissions: allKeys.map((k) => ({ permission: k, enabled: perms.has(k) })),
        });
      }
      setCreating(false);
      setEditing(null);
      setFeedback('Role saved.');
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function removeRole(key: string) {
    try {
      await api.delete(`/api/servers/${selectedGuildId}/roles/${key}`);
      await reload();
    } catch (err) {
      setFeedback(`Delete failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <div>
      <PageHeader
        title="Moderation Roles"
        description="Application-level permission roles. A matching Discord role is created automatically so the bot can assign members."
        actions={<Button onClick={startCreate}>Create role</Button>}
      />

      {feedback ? <AlertBanner tone={feedback.startsWith('Failed') ? 'danger' : 'success'}>{feedback}</AlertBanner> : null}

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : !data || data.length === 0 ? (
        <Empty>No custom roles yet. Create your first moderation role.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((role) => (
            <Card key={role.key}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-sentinel-text">
                    {role.name} {role.isOwnerRole ? <Pill tone="accent">Owner</Pill> : null}
                  </div>
                  <div className="text-xs text-sentinel-muted">{role.description ?? 'No description'}</div>
                  <div className="mt-1 text-xs text-sentinel-muted">
                    {role.memberCount} assigned member(s) ·{' '}
                    {role.discordRoleId ? (
                      <span className="text-emerald-400">Discord role <code className="text-[10px]">{role.discordRoleId}</code></span>
                    ) : (
                      <span className="text-amber-400">Discord role pending (bot will create it)</span>
                    )}
                  </div>
                </div>
                {!role.isOwnerRole ? (
                  <div className="flex gap-1.5">
                    <Button variant="secondary" onClick={() => startEdit(role)}>
                      Edit
                    </Button>
                    <Button variant="danger" onClick={() => void removeRole(role.key)}>
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {role.permissions.filter((p) => p.enabled).slice(0, 10).map((p) => (
                  <Pill key={p.permission} tone="accent">
                    {PERMISSION_LABELS[p.permission as PermissionKey] ?? p.permission}
                  </Pill>
                ))}
                {role.permissions.filter((p) => p.enabled).length > 10 ? (
                  <Pill>+{role.permissions.filter((p) => p.enabled).length - 10} more</Pill>
                ) : null}
                {role.permissions.filter((p) => p.enabled).length === 0 ? <Pill>No permissions</Pill> : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      {creating || editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">{creating ? 'Create role' : `Edit ${editing?.name}`}</h3>
            <label className="mt-4 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
              />
            </label>
            <div className="mt-4">
              <div className="mb-2 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Permissions</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {allKeys.map((key) => (
                  <label key={key} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sentinel-surface2">
                    <input
                      type="checkbox"
                      checked={perms.has(key)}
                      onChange={(e) => {
                        setPerms((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(key);
                          else next.delete(key);
                          return next;
                        });
                      }}
                      className="accent-indigo-500"
                    />
                    <span>{PERMISSION_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null); }}>
                Cancel
              </Button>
              <Button onClick={() => void submit()}>Save</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}