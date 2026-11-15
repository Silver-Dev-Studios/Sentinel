import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, PageHeader } from '../../components/ui';
import type { ServerMember } from '../../lib/types';

interface MemberDetail {
  member: ServerMember;
  warnings: Array<{ id: string; reason: string; createdAt: string }>;
  cases: Array<{ id: string; action: string; reason?: string | null; createdAt: string }>;
  sentinelRoles: Array<{ key: string; name: string }>;
}

type Action = 'warn' | 'ban' | 'unban' | 'kick' | 'timeout' | 'untime';

const ACTIONS: { id: Action; label: string; needsReason: boolean; needsMinutes: boolean; destructive: boolean }[] = [
  { id: 'warn', label: 'Warn', needsReason: true, needsMinutes: false, destructive: false },
  { id: 'ban', label: 'Ban', needsReason: true, needsMinutes: false, destructive: true },
  { id: 'unban', label: 'Unban', needsReason: true, needsMinutes: false, destructive: false },
  { id: 'kick', label: 'Kick', needsReason: true, needsMinutes: false, destructive: true },
  { id: 'timeout', label: 'Timeout', needsReason: true, needsMinutes: true, destructive: true },
  { id: 'untime', label: 'Remove timeout', needsReason: true, needsMinutes: false, destructive: false },
];

function LoadingOrNull() {
  return null;
}

export function QuickActionsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ServerMember[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MemberDetail | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      const res = await api.get<{ rows: ServerMember[] }>(
        `/api/servers/${selectedGuildId}/members?search=${encodeURIComponent(query.trim())}&limit=50`,
      );
      setResults(res.rows);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function openMember(userId: string) {
    try {
      const detail = await api.get<MemberDetail>(`/api/servers/${selectedGuildId}/members/${userId}`);
      setSelected(detail);
    } catch {
      setSelected(null);
    }
  }

  async function executeAction() {
    if (!selected || !action) return;
    setSubmitting(true);
    setFeedback(null);
    const targetId = selected.member.userId;
    const body: Record<string, unknown> = { targetId, reason: reason || undefined };
    if (action === 'timeout') body.durationMinutes = minutes;
    try {
      const res = await api.post<{ queued: boolean; commandId: string }>(
        `/api/servers/${selectedGuildId}/moderation/${action}`,
        body,
      );
      setFeedback({ tone: 'success', text: `Action queued (command ${res.commandId}). Moderator and target are logged.` });
      setAction(null);
      setReason('');
      await openMember(targetId);
    } catch (err) {
      setFeedback({ tone: 'danger', text: `Action failed: ${err instanceof Error ? err.message : 'unknown error'}` });
      setAction(null);
    } finally {
      setSubmitting(false);
    }
  }

  const actionMeta = ACTIONS.find((a) => a.id === action);

  return (
    <div>
      <PageHeader
        title="Quick Actions"
        description="Search members and perform moderation actions directly from the dashboard."
      />

      {feedback ? <AlertBanner tone={feedback.tone}>{feedback.text}</AlertBanner> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
        <Card>
          <div className="mb-3 text-sm font-semibold text-sentinel-text">Member Search</div>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void runSearch()}
              placeholder="Username or user ID…"
              className="flex-1 rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
            />
            <Button onClick={() => void runSearch()} disabled={searching}>
              Search
            </Button>
          </div>
          <div className="mt-4 space-y-1">
            {searched && results.length === 0 ? <Empty>No members matched.</Empty> : null}
            {results.map((m) => (
              <button
                key={m.userId}
                onClick={() => void openMember(m.userId)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-sentinel-surface2/70"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sentinel-accent/30 text-xs font-bold">
                  {m.username?.charAt(0).toUpperCase() ?? '?'}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-sentinel-text">{m.displayName ?? m.username}</div>
                  <div className="truncate text-xs text-sentinel-muted">{m.userId}</div>
                </div>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          {!selected ? (
            <Empty>Select a member to view their information and history.</Empty>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-sentinel-text">
                    {selected.member.displayName ?? selected.member.username}
                  </div>
                  <div className="text-sm text-sentinel-muted">
                    @{selected.member.username} · {selected.member.userId}
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-1.5">
                  {ACTIONS.map((a) => (
                    <Button
                      key={a.id}
                      variant={a.destructive ? 'danger' : 'secondary'}
                      onClick={() => {
                        setAction(a.id);
                        setReason('');
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sentinel-muted">Warnings</div>
                  {selected.warnings.length === 0 ? (
                    <div className="text-sm text-sentinel-muted">None active</div>
                  ) : (
                    <ul className="space-y-1 text-sm text-sentinel-text">
                      {selected.warnings.slice(0, 5).map((w) => (
                        <li key={w.id}>• {w.reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sentinel-muted">Recent cases</div>
                  {selected.cases.length === 0 ? (
                    <div className="text-sm text-sentinel-muted">None</div>
                  ) : (
                    <ul className="space-y-1 text-sm text-sentinel-text">
                      {selected.cases.slice(0, 6).map((c) => (
                        <li key={c.id}>
                          {c.action} <span className="text-xs text-sentinel-muted">({new Date(c.createdAt).toLocaleDateString()})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-sentinel-muted">Sentinel roles</div>
                  {selected.sentinelRoles.length === 0 ? (
                    <div className="text-sm text-sentinel-muted">None</div>
                  ) : (
                    <ul className="space-y-1 text-sm text-sentinel-text">
                      {selected.sentinelRoles.map((r) => (
                        <li key={r.key}>• {r.name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {action && selected && actionMeta ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <h3 className="text-lg font-semibold text-sentinel-text">
              {actionMeta.label} {selected.member.displayName ?? selected.member.username}
            </h3>
            <p className="mt-1 text-sm text-sentinel-muted">
              This action is executed by the Sentinel bot and recorded in the audit trail.
            </p>
            {actionMeta.needsMinutes ? (
              <label className="mt-4 block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Duration (minutes)</span>
                <input
                  type="number"
                  min={1}
                  max={10080}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
            ) : null}
            {actionMeta.needsReason ? (
              <label className="mt-4 block text-sm">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-sentinel-muted">Reason</span>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="Required for warnings; optional otherwise"
                  className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
                />
              </label>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAction(null)}>
                Cancel
              </Button>
              <Button
                variant={actionMeta.destructive ? 'danger' : 'primary'}
                disabled={submitting}
                onClick={() => void executeAction()}
              >
                {submitting ? 'Queuing…' : `Confirm ${actionMeta.label}`}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <LoadingOrNull />
    </div>
  );
}
