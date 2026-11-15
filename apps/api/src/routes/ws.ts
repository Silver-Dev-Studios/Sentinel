import type { FastifyInstance } from 'fastify';
import type { WsHub } from '../ws/hub.js';
import { resolveAuth } from '../auth/sessions.js';

/**
 * WebSocket endpoint for:
 *  - Dashboard clients: authenticated via bearer token (never via client
 *    supplied headers, which are trivial to forge).
 *  - The internal bot: authenticated via the shared internal API key.
 *
 * The connection hands off to the shared WsHub for fan-out; all live activity
 * events flow through it. The hub only forwards events to clients whose guild
 * set includes the event's guild, so we derive the guild set from the user's
 * actual session + database membership rather than trusting request headers.
 */
export async function registerWebSocketRoutes(app: FastifyInstance): Promise<void> {
  const hub: WsHub = app.wsHub;
  const prisma = app.prisma;

  app.get('/ws', { websocket: true }, async (socket, req) => {
    const internalKey = (req.headers['x-sentinel-key'] as string | undefined);
    const isBot = internalKey === app.config.apiKey;

    if (isBot) {
      hub.connect({ ws: socket, userId: 'bot', guilds: new Set(), isBot: true, isAlive: true });
      socket.send(JSON.stringify({ type: 'ready', botConnected: hub.botConnected, client: 'bot' }));
      return;
    }

    // Dashboard clients must present a valid session token. The user id and
    // guild set are derived from the session + authorized server rows instead
    // of trusting anything the browser claims.
    const q = (req.query as { token?: string }).token ?? '';
    const reqWithHeader = {
      ...req,
      headers: { ...req.headers, authorization: q ? `Bearer ${q}` : '' },
    } as typeof req;
    const auth = await resolveAuth(prisma, reqWithHeader).catch(() => null);
    if (!auth) {
      socket.close(4401, 'unauthorized');
      return;
    }
    const user = auth.user;
    const [allGuilds, memberRows] = await Promise.all([
      prisma.authorizedServer.findMany({ where: { active: true }, select: { id: true, ownerId: true, memberIds: true } }),
      prisma.serverMember.findMany({ where: { userId: user.discordId }, select: { guildId: true } }),
    ]);
    const memberGuildIds = new Set(memberRows.map((r) => r.guildId));
    const guilds = allGuilds.filter(
      (g) => g.ownerId === user.discordId || memberGuildIds.has(g.id) || g.memberIds.includes(user.discordId),
    );
    hub.connect({
      ws: socket,
      userId: user.discordId,
      guilds: new Set(guilds.map((g) => g.id)),
      isBot: false,
      isAlive: true,
    });
    socket.send(
      JSON.stringify({ type: 'ready', botConnected: hub.botConnected, client: user.discordId }),
    );
  });
}