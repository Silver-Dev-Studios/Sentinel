import { type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-sentinel-border bg-sentinel-surface p-5 ${className}`}>
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
          <div className="mt-1 text-2xl font-bold text-sentinel-text">{value}</div>
          {hint ? <div className="mt-1 text-xs text-sentinel-muted">{hint}</div> : null}
        </div>
        {icon ? <div className="text-sentinel-accent2">{icon}</div> : null}
      </div>
    </Card>
  );
}

export function SectionTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-bold text-sentinel-text">{children}</h2>
      {sub ? <p className="mt-1 text-sm text-sentinel-muted">{sub}</p> : null}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'success' | 'warn' | 'danger' | 'accent' }) {
  const tones: Record<string, string> = {
    default: 'bg-sentinel-surface2 text-sentinel-muted border-sentinel-border',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    warn: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
    accent: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatusIcon({ status }: { status: 'ok' | 'warn' | 'critical' }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === 'warn') return <AlertTriangle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-rose-400" />;
}

export function AlertBanner({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'success' | 'warn' | 'danger';
}) {
  const styles: Record<string, string> = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-300',
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    danger: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  };
  const Icon = tone === 'info' ? Info : tone === 'success' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : XCircle;
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${styles[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-sentinel-muted">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-sentinel-accent2 border-t-transparent" />
      {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-sentinel-border p-6 text-center text-sm text-sentinel-muted">{children}</div>;
}

export function ErrorState({
  title,
  description,
  retrying = false,
  onRetry,
}: {
  title: string;
  description: string;
  retrying?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-sentinel-border p-8 text-center">
      <div className="text-sm font-semibold text-sentinel-text">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-sm text-sentinel-muted">{description}</p>
      {onRetry ? (
        <div className="mt-4">
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const variants: Record<string, string> = {
    primary:
      'bg-gradient-to-r from-sentinel-accent to-sentinel-indigo text-white hover:opacity-90 disabled:opacity-50',
    secondary: 'bg-sentinel-surface2 text-sentinel-text border border-sentinel-border hover:bg-sentinel-border/40 disabled:opacity-50',
    danger: 'bg-rose-600/90 text-white hover:bg-rose-600 disabled:opacity-50',
    ghost: 'text-sentinel-text hover:bg-sentinel-surface2 disabled:opacity-50',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: ReactNode }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-sentinel-surface2 p-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            active === tab.id ? 'bg-sentinel-accent text-white' : 'text-sentinel-muted hover:text-sentinel-text'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-sentinel-text">{title}</h1>
        {description ? <p className="mt-1 text-sm text-sentinel-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-sentinel-border bg-sentinel-surface p-6">
        <h3 className="text-lg font-semibold text-sentinel-text">{title}</h3>
        <p className="mt-2 text-sm text-sentinel-muted">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}