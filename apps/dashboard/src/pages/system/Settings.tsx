import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Loading, PageHeader } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface SettingsResponse {
  config: {
    guildId: string;
    prefix: string;
    timezone: string;
    snipeRetentionSeconds: number;
    snipeLogging: boolean;
  };
  inactivity: { guildId: string; periodDays: number; enabled: boolean };
  snipe: { guildId: string; retentionSeconds?: number; logging?: boolean } | null;
}

export function SettingsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<SettingsResponse>(`/api/servers/${selectedGuildId}/settings`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function saveInactivity(enabled: boolean, periodDays: number) {
    try {
      await api.patch(`/api/servers/${selectedGuildId}/inactivity/settings`, { enabled, periodDays });
      setFeedback('Inactivity settings saved.');
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Per-server Sentinel configuration." />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <AlertBanner tone="danger">{error}</AlertBanner>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">General</div>
            <div className="space-y-3 text-sm">
              <Row label="Command prefix" value={`"${data!.config.prefix}"`} note="Alternative convenience prefix; slash commands always work." />
              <Row label="Timezone" value={data!.config.timezone} note="Used for scheduler previews and reports." />
              <Row label="Snipe retention" value={`${data!.config.snipeRetentionSeconds}s`} note="Deleted-message records used by Snipe are kept only briefly." />
              <Row label="Snipe logging" value={data!.config.snipeLogging ? 'enabled' : 'disabled'} />
            </div>
          </Card>

          <Card>
            <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Inactivity monitoring</div>
            <p className="mb-3 text-xs text-sentinel-muted">
              Sentinel only reports inactivity it has actually observed. Configure the period it uses to flag inactive members.
            </p>
            <ConfigRow
              label="Enabled"
              checked={data!.inactivity.enabled}
              onToggle={(v) => void saveInactivity(v, data!.inactivity.periodDays)}
            />
            <ConfigRow
              label={`Inactive after ${data!.inactivity.periodDays} days`}
              checked={undefined}
              action={
                <Button
                  variant="secondary"
                  onClick={() => void saveInactivity(data!.inactivity.enabled, Math.min(365, data!.inactivity.periodDays + 7))}
                >
                  + 7 days
                </Button>
              }
            />
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-sentinel-border/40 pb-2">
      <div>
        <div className="text-sentinel-text">{label}</div>
        {note ? <div className="text-xs text-sentinel-muted">{note}</div> : null}
      </div>
      <div className="text-sentinel-muted">{value}</div>
    </div>
  );
}

function ConfigRow({
  label,
  checked,
  onToggle,
  action,
}: {
  label: string;
  checked?: boolean;
  onToggle?: (v: boolean) => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-sentinel-border/40 py-2">
      <div className="text-sm text-sentinel-text">{label}</div>
      {checked !== undefined ? (
        <button
          onClick={() => onToggle?.(!checked)}
          className={`h-6 w-11 rounded-full transition ${checked ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
        >
          <span className={`block h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      ) : (
        action
      )}
    </div>
  );
}