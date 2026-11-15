import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Button, Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';

interface AuditEntry {
  id: string;
  action: string;
  category: string;
  actorId?: string | null;
  resource?: string | null;
  detail?: unknown;
  createdAt: string;
}

interface AuditResponse {
  rows: AuditEntry[];
  total: number;
}

export function AuditCenterPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const [category, setCategory] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const load = () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '25' });
    if (category) params.set('category', category);
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(to).toISOString());
    return api.get<AuditResponse>(`/api/servers/${selectedGuildId}/audit?${params}`);
  };
  const { data, error, loading, reload } = useGuildData(load, [selectedGuildId, category, from, to, page]);

  const categories = ['moderation', 'security', 'management', 'system', 'auth'];

  return (
    <div>
      <PageHeader
        title="Audit Center"
        description="Immutable record of administrative, moderation, security, and configuration actions."
      />
      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">Category</div>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">From</div>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
          </div>
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wider text-sentinel-muted">To</div>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="rounded-lg border border-sentinel-border bg-sentinel-surface2 px-3 py-2 text-sm focus:border-sentinel-accent2 focus:outline-none" />
          </div>
          <Button variant="secondary" onClick={() => void reload()}>Apply</Button>
        </div>
      </Card>

      {loading && !data ? (
        <Loading />
      ) : error ? (
        <Empty>{error}</Empty>
      ) : (data?.rows.length ?? 0) === 0 ? (
        <Card>
          <Empty>No audit records match the filter.</Empty>
        </Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {data!.rows.map((a) => (
              <div key={a.id} className="flex items-start gap-2 border-b border-sentinel-border/40 pb-2 text-sm">
                <Pill tone={a.category === 'security' ? 'warn' : 'default'}>{a.category}</Pill>
                <div className="min-w-0 flex-1">
                  <div className="text-sentinel-text">{a.action}</div>
                  <div className="text-xs text-sentinel-muted">
                    {a.actorId ? `by ${shortId(a.actorId)}` : 'system'}
                    {a.resource ? ` · ${shortId(a.resource)}` : ''}
                  </div>
                </div>
                <span className="shrink-0 text-xs text-sentinel-muted">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              Previous
            </Button>
            <span className="text-xs text-sentinel-muted">
              Page {page} · {data!.total} records
            </span>
            <Button variant="secondary" disabled={page * 25 >= data!.total} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}…` : id;
}