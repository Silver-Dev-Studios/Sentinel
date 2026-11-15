import type { FastifyInstance } from 'fastify';
import type { WsHub } from '../ws/hub.js';

/**
 * WebSocket endpoint for:
 *  - Dashboard clients: authenticated via session cookie + guild list headers.
 *  - The internal bot: authenticated via the shared internal API key.
 *
 * The connection hands off to the shared WsHub for fan-out; all live activity
 * events flow through it.
 */
export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  const hub: WsHub = app.wsHub;

  app.get('/ws', { websocket: true }, (socket, req) => {
    const internalKey = (req.headers['x-sentinel-key'] as string | undefined);
    const isBot = internalKey === app.config.apiKey;
    const userId = (req.headers['x-sentinel-user'] as string | undefined) ?? 'anon';
    const rawGuilds = (req.headers['x-sentinel-guilds'] as string | undefined) ?? '';
    hub.connect({
      ws: socket,
      userId,
      guilds: new Set(rawGuilds.split(',').filter(Boolean)),
      isBot,
      isAlive: true,
    });
    socket.send(JSON.stringify({ type: 'ready', botConnected: hub.botConnected, client: userId }));
  });
}