import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useServer } from '../../lib/server';
import { Card, Empty, Loading, PageHeader, Pill } from '../../components/ui';
import { wsUrl } from '../../lib/api';
import type { ActivityEvent } from '../../lib/types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function MonitoringPage() {
  const { api } = useAuth();
  const { selectedGuildId } = useServer();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);

  // Initial + polled REST load.
  useEffect(() => {
    if (!selectedGuildId) return;
    setLoading(true);
    void api
      .get<{ events: ActivityEvent[] }>(`/api/servers/${selectedGuildId}/activity?limit=60`)
      .then((r) => setEvents(r.events))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [api, selectedGuildId]);

  // Live WebSocket feed.
  useEffect(() => {
    if (!selectedGuildId) return;
    const socket = new WebSocket(wsUrl(API_BASE));
    wsRef.current = socket;
    socket.onopen = () => setWsStatus('open');
    socket.onclose = () => setWsStatus('closed');
    socket.onerror = () => setWsStatus('closed');
    socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(String(msg.data)) as { type?: string; guild?: string; event?: ActivityEvent };
        if (data.event && data.guild && data.guild === selectedGuildId) {
          setEvents((prev) => [data.event as ActivityEvent, ...prev].slice(0, 100));
        }
      } catch {
        // ignore non-JSON frames
      }
    };
    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [selectedGuildId]);

  const mapType = (type: string): 'success' | 'warn' | 'danger' | 'default' => {
    if (['member_join', 'message_sent', 'ticket_closed', 'giveaway_ended'].includes(type)) return 'success';
    if (['member_leave', 'alert', 'security'].includes(type)) return 'warn';
    if (['ban', 'kick', 'timeout', 'purge', 'lock', 'unlock', 'warn'].includes(type)) return 'danger';
    return 'default';
  };

  return (
    <div>
      <PageHeader
        title="Live Monitoring"
        description="Real-time activity across the selected server."
        actions={<Pill tone={wsStatus === 'open' ? 'success' : 'warn'}>WS {wsStatus}</Pill>}
      />
      <Card>
        <div className="mb-3 text-sm font-semibold text-sentinel-text">Activity Feed</div>
        {loading && events.length === 0 ? (
          <Loading />
        ) : events.length === 0 ? (
          <Empty>No activity recorded yet. Events appear here as Sentinel observes them.</Empty>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 border-b border-sentinel-border/50 pb-2 text-sm">
                <span className="mt-1 text-sentinel-accent2">•</span>
                <Pill tone={mapType(e.type)}>{e.type}</Pill>
                <span className="flex-1 text-sentinel-text">{e.message}</span>
                <span className="shrink-0 text-xs text-sentinel-muted">
                  {new Date(e.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}