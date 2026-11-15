import type { Session, User, AuthorizedServer } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      user: User;
      session: Session;
    };
    guild?: AuthorizedServer;
    /** Compiled permission context for `guild` when present */
    permissions?: import('@sds-sentinel/permissions').PermissionContext;
  }
  interface FastifyInstance {
    config: import('./config.js').ApiConfig;
    prisma: import('@prisma/client').PrismaClient;
    wsHub: import('./ws/hub.js').WsHub;
    botNotifier: import('./ws/bot.js').BotNotifier;
  }
}

export type { Session, User, AuthorizedServer };