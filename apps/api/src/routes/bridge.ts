import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { recordActivity } from '../ws/hub.js';

/**
 * Internal endpoints used by the bot background worker to hand real-world
 * observations (events seen on the gateway) to the API for the dashboard.
 *
 * Authenticated by the shared internal API key, never by a Discord session.
 */
export async function registerBridgeRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  app.post('/api/bridge/activity', async (req, reply) => {
    if (req.headers['x-sentinel-key'] !== app.config.apiKey) {
      return reply.code(401).send({ error: 'Invalid internal key', code: 'BAD_INTERNAL_KEY' });
    }
    const body = req.body as {
      guildId: string;
      type?: string;
      message: string;
      actorId?: string;
      detail?: Record<string, unknown>;
    };
    if (!body.guildId || typeof body.message !== 'string') {
      return reply.code(400).send({ error: 'guildId and message are required' });
    }
    await recordActivity(prisma, app.wsHub, {
      guildId: body.guildId,
      type: body.type ?? 'bot_activity',
      actorId: body.actorId,
      message: body.message,
      detail: body.detail,
    });
    return { ok: true };
  });

  app.post('/api/bridge/diagnostic', async (req, reply) => {
    if (req.headers['x-sentinel-key'] !== app.config.apiKey) {
      return reply.code(401).send({ error: 'Invalid internal key', code: 'BAD_INTERNAL_KEY' });
    }
    const body = req.body as {
      guildId?: string;
      kind: string;
      message: string;
      detail?: Record<string, unknown>;
    };
    if (typeof body.kind !== 'string' || typeof body.message !== 'string') {
      return reply.code(400).send({ error: 'kind and message are required' });
    }
    await prisma.diagnosticLog.create({
      data: {
        kind: body.kind,
        service: 'bot',
        message: body.message.slice(0, 500),
        detail: (body.detail ?? undefined) as Prisma.InputJsonValue,
        actorId: null,
      },
    });
    return { ok: true };
  });

  // WebSocket upgrade for the bot's live connection.
  // Defined here as a REST fallback; the real WS handshake lives in routes/ws.ts.
  app.post('/api/bridge/heartbeat', async (req, reply) => {
    if (req.headers['x-sentinel-key'] !== app.config.apiKey) {
      return reply.code(401).send({ error: 'Invalid internal key', code: 'BAD_INTERNAL_KEY' });
    }
    app.wsHub.markBotAlive();
    return { ok: true, botConnected: app.wsHub.botConnected };
  });
}