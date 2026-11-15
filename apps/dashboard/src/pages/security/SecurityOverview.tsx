import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { AlertBanner, Button, Card, Empty, Loading, PageHeader, Pill, StatusIcon, ConfirmDialog } from '../../components/ui';
import { SecurityRing } from '../../components/SecurityRing';
import { useGuildData } from '../../lib/hooks';

interface SecurityReportData {
  score: number;
  checks: Array<{ label: string; score: number; weakness?: string }>;
  enabled: string[];
  disabled: string[];
  recommendations: string[];
  assessedAt: string;
}

interface SecuritySettings {
  guildId: string;
  antiRaidEnabled: boolean;
  antiNukeEnabled: boolean;
  antiSpamEnabled: boolean;
  antiRaidResponse?: string;
  antiNukeResponse?: string;
  antiSpamEscalation?: string;
  permissionScanEnabled?: boolean;
  trustedAdminIds?: string[];
  lockdownActive?: boolean;
  lockdownActivatedAt?: string | null;
  lockdownActivatedBy?: string | null;
}

interface SecurityResponse {
  settings: SecuritySettings;
  autoModRules: Array<{ id: string; name: string; enabled: boolean }>;
  assessments: Array<{ score: number; createdAt: string }>;
}

export function SecurityOverviewPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<SecurityResponse>(`/api/servers/${selectedGuildId}/security`);
  const secState = useGuildData(load, [selectedGuildId]);
  const reportLoad = () => api.get<SecurityReportData>(`/api/servers/${selectedGuildId}/security/report`);
  const reportState = useGuildData(reportLoad, [selectedGuildId], 60_000);

  const [showReport, setShowReport] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [lockdownConfirm, setLockdownConfirm] = useState(false);

  async function toggleLockdown(activate: boolean) {
    try {
      await api.post(`/api/servers/${selectedGuildId}/security/lockdown/${activate ? 'activate' : 'deactivate'}`, activate ? { roleId: null } : {});
      setLockdownConfirm(false);
      setFeedback(activate ? 'Lockdown activated.' : 'Lockdown lifted.');
      await secState.reload();
    } catch (err) {
      setFeedback(`Lockdown failed: ${err instanceof Error ? err.message : 'unknown error'}`);
      setLockdownConfirm(false);
    }
  }

  if (secState.loading && !secState.data) return <Loading />;
  if (secState.error) return <Empty>{secState.error}</Empty>;
  const settings = secState.data?.settings;
  if (!settings) return <Empty>No security settings.</Empty>;

  const score = reportState.data?.score ?? 0;
  const enabledProtections = [
    ...(settings.antiRaidEnabled ? ['Anti-Raid'] : []),
    ...(settings.antiNukeEnabled ? ['Anti-Nuke'] : []),
    ...(settings.antiSpamEnabled ? ['Anti-Spam'] : []),
    ...((settings.permissionScanEnabled ?? true) ? ['Permission Scan'] : []),
    ...((secState.data?.autoModRules ?? []).filter((r) => r.enabled).length > 0 ? ['AutoMod Rules'] : []),
  ];

  return (
    <div>
      <PageHeader
        title="Security Overview"
        description="Server security posture, protections, and emergency controls."
        actions={
          settings.lockdownActive ? (
            <Button variant="danger" onClick={() => setLockdownConfirm(true)}>
              Deactivate lockdown
            </Button>
          ) : (
            <Button variant="danger" onClick={() => setLockdownConfirm(true)}>
              Emergency lockdown
            </Button>
          )
        }
      />

      {feedback ? <AlertBanner tone="success">{feedback}</AlertBanner> : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center py-8 lg:col-span-1">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Security Strength</div>
          <button onClick={() => setShowReport(true)} title="View security report" className="rounded-2xl transition hover:opacity-80">
            <SecurityRing value={score} />
          </button>
          <p className="mt-4 max-w-[220px] text-center text-xs text-sentinel-muted">
            Configuration coverage score, based on weighted security checks. Click for the full report.
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Enabled protections</div>
          {enabledProtections.length === 0 ? (
            <Empty>No protections enabled. Configure Anti-Raid, Anti-Nuke, and Anti-Spam below.</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {enabledProtections.map((p) => (
                <Pill key={p} tone="success">{p}</Pill>
              ))}
            </div>
          )}
          <div className="mt-5 mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Response modes</div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <Info label="Anti-Raid response" value={settings.antiRaidResponse ?? 'alert'} />
            <Info label="Anti-Nuke response" value={settings.antiNukeResponse ?? 'alert'} />
            <Info label="Anti-Spam escalation" value={settings.antiSpamEscalation ?? 'warn'} />
          </div>
          <div className="mt-5 text-sm">
            {settings.lockdownActive ? (
              <AlertBanner tone="danger">
                <strong>LOCKDOWN ACTIVE</strong> since {settings.lockdownActivatedAt ? new Date(settings.lockdownActivatedAt).toLocaleString() : 'recently'}.
              </AlertBanner>
            ) : (
              <span className="text-sentinel-muted">No lockdown is currently active.</span>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-sentinel-muted">Protection checks</div>
        {reportState.loading && !reportState.data ? (
          <Loading />
        ) : reportState.data ? (
          <div className="divide-y divide-sentinel-border/40">
            {reportState.data.checks.map((c) => (
              <div key={c.label} className="flex items-start gap-3 py-2.5">
                <StatusIcon status={c.score > 0 ? 'ok' : c.weakness ? 'warn' : 'critical'} />
                <div className="flex-1">
                  <div className="text-sm font-medium text-sentinel-text">{c.label}</div>
                  {c.weakness ? <div className="text-xs text-sentinel-muted">{c.weakness}</div> : null}
                </div>
                <Pill tone={c.score > 0 ? 'success' : 'warn'}>{Math.round(c.score * 100)}%</Pill>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {showReport && reportState.data ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-sentinel-text">Security report</h3>
              <button onClick={() => setShowReport(false)} className="text-sentinel-muted">✕</button>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <SecurityRing value={reportState.data.score} size={100} stroke={8} />
              <div className="text-sm text-sentinel-muted">
                Assessed {new Date(reportState.data.assessedAt).toLocaleString()}. This is a configuration-coverage score,
                not a guarantee of protection.
              </div>
            </div>
            {reportState.data.enabled.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Enabled</div>
                <div className="flex flex-wrap gap-1.5">
                  {reportState.data.enabled.map((e) => <Pill key={e} tone="success">{e}</Pill>)}
                </div>
              </div>
            ) : null}
            {reportState.data.disabled.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Disabled</div>
                <div className="flex flex-wrap gap-1.5">
                  {reportState.data.disabled.map((e) => <Pill key={e} tone="warn">{e}</Pill>)}
                </div>
              </div>
            ) : null}
            {reportState.data.recommendations.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Recommendations</div>
                <ul className="space-y-1 text-sm text-sentinel-text">
                  {reportState.data.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={lockdownConfirm}
        title={settings.lockdownActive ? 'Deactivate lockdown?' : 'Activate emergency lockdown?'}
        message={
          settings.lockdownActive
            ? 'Lockdown will be lifted and access restored.'
            : 'This queues a protective configuration for the specified channels. Trusted admins and Sentinel are preserved. Activity is logged.'
        }
        confirmLabel={settings.lockdownActive ? 'Lift lockdown' : 'Activate lockdown'}
        danger
        onConfirm={() => void toggleLockdown(!settings.lockdownActive)}
        onCancel={() => setLockdownConfirm(false)}
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-sentinel-border/60 p-2.5">
      <div className="text-[11px] uppercase tracking-wider text-sentinel-muted">{label}</div>
      <div className="mt-0.5 font-medium text-sentinel-text">{value}</div>
    </div>
  );
}