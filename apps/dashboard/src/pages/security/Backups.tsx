import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill, ConfirmDialog } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface Backup {
  id: string;
  name?: string;
  sizeBytes?: number;
  createdAt: string;
  restoredAt?: string | null;
  restoredBy?: string | null;
}

export function BackupsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: Backup[] }>(`/api/servers/${selectedGuildId}/backups`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null);

  async function createBackup() {
    setFeedback(null);
    try {
      await api.post(`/api/servers/${selectedGuildId}/backups`, {});
      setFeedback('Backup created.');
      await reload();
    } catch (err) {
      setFeedback(`Backup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function restoreBackup(b: Backup) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/backups/${b.id}/restore`, {});
      setRestoreTarget(null);
      setFeedback('Restore queued for the bot.');
      await reload();
    } catch (err) {
      setFeedback(`Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setRestoreTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Configuration Backups"
        description="Snapshot Sentinel configuration for safe, controlled restoration."
        actions={<Button onClick={() => void createBackup()}>Create backup</Button>}
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}
      <AlertBanner tone="info">
        Backups cover Sentinel-managed configuration (roles, AutoMod, security settings, templates). They do not promise full Discord server restoration.
      </AlertBanner>

      <div className="mt-4">
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : (data?.rows.length ?? 0) === 0 ? (
          <Card>
            <Empty>No backups yet. Create your first snapshot.</Empty>
          </Card>
        ) : (
          <Card>
            <div className="space-y-2">
              {data!.rows.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-lg border border-sentinel-border/60 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-sentinel-text">{b.name ?? `Backup ${new Date(b.createdAt).toLocaleString()}`}</div>
                    <div className="text-xs text-sentinel-muted">
                      {new Date(b.createdAt).toLocaleString()} · {formatBytes(b.sizeBytes ?? 0)}
                      {b.restoredAt ? <span className="ml-2 text-emerald-400">· restored {new Date(b.restoredAt).toLocaleString()}</span> : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {b.restoredAt ? <Pill tone="success">Restored</Pill> : null}
                    <Button variant="secondary" onClick={() => setRestoreTarget(b)}>
                      Restore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <ConfirmDialog
        open={!!restoreTarget}
        title="Restore this backup?"
        message="Restoration is enqueued and applied by the bot within the limits of Discord and its permissions. This can change server configuration."
        confirmLabel="Restore"
        danger
        onConfirm={() => restoreTarget && void restoreBackup(restoreTarget)}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}