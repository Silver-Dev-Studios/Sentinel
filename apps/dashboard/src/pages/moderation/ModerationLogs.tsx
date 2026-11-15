import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader } from '../../components/ui';
import { useGuildData } from '../../lib/hooks';
import type { ModerationCase } from '../../lib/types';
import { CasesTable } from './Moderation';

export function ModerationLogsPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const load = () => api.get<{ rows: ModerationCase[] }>(`/api/servers/${selectedGuildId}/moderation/cases?limit=200`);
  const { data, error, loading } = useGuildData(load, [selectedGuildId]);

  return (
    <div>
      <PageHeader
        title="Moderation Logs"
        description="Complete searchable history of all documented moderation activity."
      />
      <Card>
        {loading && !data ? (
          <Loading />
        ) : error ? (
          <Empty>{error}</Empty>
        ) : data && data.rows.length === 0 ? (
          <Empty>No moderation cases recorded yet.</Empty>
        ) : (
          <CasesTable cases={data?.rows ?? []} />
        )}
      </Card>
    </div>
  );
}