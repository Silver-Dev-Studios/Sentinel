import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface AutomodSettings {
  guildId: string;
  enabled: boolean;
  warnCooldownSeconds?: number | null;
}

interface AutomodRule {
  id: string;
  guildId: string;
  name: string;
  kind: string;
  enabled: boolean;
  action: string;
  config?: Record<string, unknown>;
}

interface AutomodResponse {
  rules: AutomodRule[];
  settings: AutomodSettings;
  presets: Array<{ kind: string; name: string; config: Record<string, unknown>; action: string }>;
}

const KIND_LABELS: Record<string, string> = {
  spam: 'Spam detection',
  repeated_message: 'Repeated messages',
  mention_spam: 'Mention spam',
  suspicious_link: 'Suspicious links',
  invite_filter: 'Invite filtering',
  word_filter: 'Word filter',
  attachment_flood: 'Attachment floods',
  raid_behavior: 'Raid behavior',
};

export function AutoModPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<AutomodResponse>(`/api/servers/${selectedGuildId}/automod`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function toggleRule(rule: AutomodRule) {
    try {
      await api.patch(`/api/servers/${selectedGuildId}/automod/rules/${rule.id}`, { enabled: !rule.enabled });
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function addPreset(preset: AutomodResponse['presets'][number]) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/automod/rules`, {
        name: preset.name,
        kind: preset.kind,
        enabled: true,
        config: preset.config,
        action: preset.action,
      });
      setFeedback(`Added preset: ${preset.name}`);
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function deleteRule(id: string) {
    try {
      await api.delete(`/api/servers/${selectedGuildId}/automod/rules/${id}`);
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  async function toggleEnabled() {
    if (!data) return;
    try {
      await api.patch(`/api/servers/${selectedGuildId}/automod/settings`, { enabled: !data.settings.enabled });
      await reload();
    } catch (err) {
      setFeedback(`Failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>No AutoMod data.</Empty>;

  return (
    <div>
      <PageHeader
        title="AutoMod"
        description="Configure automatic moderation rules for this server."
        actions={
          <Button variant={data.settings.enabled ? 'danger' : 'primary'} onClick={() => void toggleEnabled()}>
            {data.settings.enabled ? 'Disable AutoMod' : 'Enable AutoMod'}
          </Button>
        }
      />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <div className="mb-6">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Active Rules</h3>
        {data.rules.length === 0 ? (
          <Empty>No AutoMod rules configured. Add preset rules below.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {data.rules.map((rule) => (
              <Card key={rule.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sentinel-text">{rule.name}</div>
                    <div className="mt-0.5 text-xs text-sentinel-muted">
                      {KIND_LABELS[rule.kind] ?? rule.kind} · Response: {rule.action}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill tone={rule.enabled ? 'success' : 'default'}>{rule.enabled ? 'On' : 'Off'}</Pill>
                    <button
                      onClick={() => void toggleRule(rule)}
                      className={`h-5 w-9 rounded-full transition ${rule.enabled ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
                    >
                      <span
                        className={`block h-4 w-4 rounded-full bg-white transition ${rule.enabled ? 'translate-x-4' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button onClick={() => void deleteRule(rule.id)} className="text-xs text-rose-400 hover:underline">
                    Delete
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Presets</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {data.presets.map((preset) => (
            <Card key={preset.kind}>
              <div className="font-medium text-sentinel-text">{preset.name}</div>
              <div className="mt-0.5 text-xs text-sentinel-muted">
                {KIND_LABELS[preset.kind] ?? preset.kind} · {preset.action}
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="secondary" onClick={() => void addPreset(preset)}>
                  Add rule
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}