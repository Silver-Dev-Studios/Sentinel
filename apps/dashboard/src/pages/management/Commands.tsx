import { useMemo, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { Search, ShieldCheck, TerminalSquare } from 'lucide-react';
import { useGuildData } from '../../lib/hooks';

export interface BuiltinCommandRow {
  name: string;
  iface: 'prefix' | 'slash' | 'both';
  category: 'moderation' | 'management';
  description: string;
  usage: string;
  options: string[];
  permission: string;
  permissionLabel: string;
}

const NOTATION: Record<BuiltinCommandRow['iface'], { glyph: string; label: string; tone: 'accent' | 'success' | 'default' }> = {
  both: { glyph: '+/–', label: 'Prefix + Slash', tone: 'accent' },
  slash: { glyph: '/', label: 'Slash command', tone: 'success' },
  prefix: { glyph: '+', label: 'Prefix command', tone: 'default' },
};

export function CommandsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: BuiltinCommandRow[] }>(`/api/servers/${selectedGuildId}/commands/reference`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'moderation' | 'management'>('all');

  const rows = useMemo(() => {
    if (!data?.rows) return [];
    const q = query.trim().toLowerCase();
    return data.rows
      .filter((c) => (category === 'all' ? true : c.category === category))
      .filter(
        (c) =>
          !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.permission.toLowerCase().includes(q),
      );
  }, [data, query, category]);

  const counts = useMemo(() => {
    if (!data?.rows) return { total: 0, both: 0, slash: 0, prefix: 0 };
    return {
      total: data.rows.length,
      both: data.rows.filter((c) => c.iface === 'both').length,
      slash: data.rows.filter((c) => c.iface === 'slash').length,
      prefix: data.rows.filter((c) => c.iface === 'prefix').length,
    };
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Commands"
        description="Built-in Sentinel commands and the permissions that control them. Custom commands you create appear under Custom Commands."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total commands" value={counts.total} />
        <Stat label="Prefix + Slash" value={counts.both} tone="accent" />
        <Stat label="Slash only" value={counts.slash} />
        <Stat label="Prefix only" value={counts.prefix} />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sentinel-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, descriptions, permissions…"
            className="w-full rounded-lg border border-sentinel-border bg-sentinel-surface2 py-2 pl-9 pr-3 text-sm text-sentinel-text placeholder:text-sentinel-muted focus:border-sentinel-accent2 focus:outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'moderation', 'management'] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
                category === c ? 'bg-sentinel-accent/20 text-sentinel-text' : 'text-sentinel-muted hover:bg-sentinel-surface2'
              }`}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      </div>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : rows.length === 0 ? (
        <Empty>No commands match your filter.</Empty>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((cmd) => {
            const n = NOTATION[cmd.iface];
            return (
              <Card key={cmd.name} className="flex flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sentinel-accent/15 text-sm font-semibold text-sentinel-accent">
                      {cmd.iface === 'both' ? '±' : cmd.iface === 'slash' ? '/' : '+'}
                    </div>
                    <div>
                      <div className="font-mono text-sm font-semibold text-sentinel-text">
                        {cmd.iface === 'both' ? '+/– ' : cmd.iface === 'slash' ? '/ ' : '+ '}
                        {cmd.name}
                      </div>
                      <div className="text-xs text-sentinel-muted">{cmd.description}</div>
                    </div>
                  </div>
                  <Pill tone={n.tone}>{n.glyph} {n.label}</Pill>
                </div>

                <div className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-start gap-2">
                    <TerminalSquare className="mt-0.5 h-4 w-4 shrink-0 text-sentinel-muted" />
                    <code className="rounded bg-sentinel-surface2 px-2 py-1 font-mono text-xs text-sentinel-accent2">{cmd.usage}</code>
                  </div>
                  {cmd.options.length > 0 ? (
                    <ul className="list-inside list-disc space-y-0.5 pl-6 text-xs text-sentinel-muted">
                      {cmd.options.map((opt) => (
                        <li key={opt}>{opt}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <div className="mt-3 flex items-center gap-2 border-t border-sentinel-border/40 pt-2.5 text-xs">
                  <ShieldCheck className="h-4 w-4 text-sentinel-muted" />
                  <span className="text-sentinel-muted">Requires:</span>
                  <span className="text-sentinel-text">{cmd.permissionLabel}</span>
                  <span className="font-mono text-sentinel-muted">({cmd.permission})</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'accent' }) {
  return (
    <Card className="flex items-center justify-between">
      <div className="text-xs font-medium uppercase tracking-wider text-sentinel-muted">{label}</div>
      <div className={`text-xl font-bold ${tone === 'accent' ? 'text-sentinel-accent' : 'text-sentinel-text'}`}>{value}</div>
    </Card>
  );
}