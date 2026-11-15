import { useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface SecurityResponse {
  settings: Record<string, unknown> & {
    guildId: string;
    antiRaidEnabled?: boolean;
    antiNukeEnabled?: boolean;
    antiSpamEnabled?: boolean;
  };
  autoModRules: Array<{ id: string; name: string; kind: string; enabled: boolean }>;
  assessments: Array<{ score: number; createdAt: string }>;
}

export function SecurityFeaturePage({
  title,
  description,
  feature,
  fields,
  assessments,
  extra,
}: {
  title: string;
  description: string;
  feature: 'antiRaid' | 'antiNuke' | 'antiSpam';
  fields: Array<{ key: string; label: string; type?: 'number' | 'text' | 'select'; options?: string[] }>;
  assessments?: boolean;
  extra?: ReactNode;
}) {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<SecurityResponse>(`/api/servers/${selectedGuildId}/security`);
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId]);
  const [form, setForm] = useState<Record<string, string | number | boolean | undefined>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  const enabledKey = `${feature}Enabled` as const;

  function setValue(key: string, value: string | number | boolean) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setFeedback(null);
    try {
      await api.patch(`/api/servers/${selectedGuildId}/security`, {
        [feature]: form,
      });
      setFeedback('Settings saved.');
      await reload();
    } catch (err) {
      setFeedback(`Save failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <Empty>{error}</Empty>;
  const settings = { ...(data?.settings ?? {}) } as Record<string, unknown> & {
    antiRaidEnabled?: boolean;
    antiNukeEnabled?: boolean;
    antiSpamEnabled?: boolean;
  };

  return (
    <div>
      <PageHeader title={title} description={description} />
      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <div className="mb-6">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sentinel-text">{title}</div>
              <div className="text-xs text-sentinel-muted">
                {settings[enabledKey] ? (
                  <Pill tone="success">Enabled</Pill>
                ) : (
                  <Pill tone="warn">Disabled</Pill>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setValue(enabledKey, !settings[enabledKey]);
              }}
              className={`h-6 w-11 rounded-full transition ${settings[enabledKey] ? 'bg-emerald-500' : 'bg-sentinel-border'}`}
            >
              <span className={`block h-5 w-5 rounded-full bg-white transition ${settings[enabledKey] ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </Card>
      </div>

      <Card className="mb-6">
        <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Configuration</div>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              type={field.type ?? 'number'}
              options={field.options}
              value={
                form[field.key] ??
                (settings[field.key] as string | number | boolean | undefined) ??
                (field.type === 'number' ? 0 : '')
              }
              onChange={(v) => setValue(field.key, v)}
            />
          ))}
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => void save()}>Save settings</Button>
        </div>
      </Card>

      {extra}

      {assessments && data && data.assessments.length > 0 ? (
        <Card>
          <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Assessment history</div>
          <div className="space-y-1 text-sm">
            {data.assessments.map((a, i) => (
              <div key={i} className="flex justify-between text-sentinel-muted">
                <span>{new Date(a.createdAt).toLocaleString()}</span>
                <span className="font-semibold text-sentinel-text">{a.score}%</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Field({
  label,
  type,
  options,
  value,
  onChange,
}: {
  label: string;
  type: 'number' | 'text' | 'select';
  options?: string[];
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const base =
    'w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none';
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
      {type === 'number' ? (
        <input
          type="number"
          value={String(value)}
          onChange={(e) => onChange(Number(e.target.value))}
          className={base}
        />
      ) : type === 'select' ? (
        <select value={String(value)} onChange={(e) => onChange(e.target.value)} className={base}>
          {options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input value={String(value)} onChange={(e) => onChange(e.target.value)} className={base} />
      )}
    </div>
  );
}