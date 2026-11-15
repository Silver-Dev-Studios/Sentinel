import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { getPrisma, checkDatabaseHealth } from '@sds-sentinel/database';
import type { AuthError } from './middleware/auth.js';
import { loadConfig, type ApiConfig } from './config.js';
import { createWsHub } from './ws/hub.js';
import { BotNotifier } from './ws/bot.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerModerationRoutes } from './routes/moderation.js';
import { registerSecurityRoutes } from './routes/security.js';
import { registerManagerRoutes } from './routes/management.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerMonitorRoutes } from './routes/monitoring.js';
import { registerWebSocketRoutes } from './routes/ws.js';
import { registerBridgeRoutes } from './routes/bridge.js';

export interface AppContext {
  config: ApiConfig;
  prisma: ReturnType<typeof getPrisma>;
  wsHub: ReturnType<typeof createWsHub>;
  botNotifier: BotNotifier;
}

export async function buildApp(): Promise<FastifyInstance> {
  const config = loadConfig();
  const prisma = getPrisma();
  const wsHub = createWsHub(prisma);
  const botNotifier = new BotNotifier(prisma, wsHub);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: undefined,
    },
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
  });

  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('wsHub', wsHub);
  app.decorate('botNotifier', botNotifier);

  await app.register(cookie);
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || config.corsOrigins.includes(origin) || config.isProduction === false) {
        cb(null, true);
      } else {
        cb(new Error('Origin not allowed'), false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, context) => ({
      error: 'Too many requests',
      code: 'RATE_LIMITED',
      retryAfter: context.after,
    }),
  });
  await app.register(websocket);

  // Health endpoint (unauthenticated)
  app.get('/health', async (_req, reply) => {
    const db = await checkDatabaseHealth();
    const status = db.ok ? 'ok' : 'degraded';
    return reply.code(db.ok ? 200 : 503).send({
      status,
      service: 'sentinel-api',
      time: new Date().toISOString(),
      database: db,
      bot: wsHub.botConnected ? 'connected' : 'disconnected',
      version: process.env.SENTINEL_VERSION ?? '1.0.0',
    });
  });

  // Route groups
  await registerAuthRoutes(app);
  await registerDashboardRoutes(app);
  await registerModerationRoutes(app);
  await registerSecurityRoutes(app);
  await registerManagerRoutes(app);
  await registerSystemRoutes(app);
  await registerMonitorRoutes(app);
  await registerWebSocketRoutes(app);
  await registerBridgeRoutes(app);

  // CSRF enforcement for state-changing routes (double-submit via cookie+header)
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  app.addHook('onRequest', async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!config.csrfEnabled) return;
    // Internal bot <> API traffic is authenticated by key, not session
    if (request.headers['x-sentinel-key'] === config.apiKey) return;
    // Bearer-token auth is not cookie-based, so it is not CSRF-exposed: a
    // cross-site attacker cannot read the token or make the browser attach it.
    const authorization = request.headers.authorization;
    if (authorization && authorization.startsWith('Bearer ')) return;
    const token = request.headers['x-csrf-token'] as string | undefined;
    if (!token || token.length < 32) {
      reply.code(403).send({ error: 'CSRF validation failed', code: 'CSRF_FAILED' });
    }
  });

  // Global auth guard: every /api/* route (except /api/auth/* and the public
  // health/diagnostics endpoints) requires a session.
  // Guild scoping and permission checks happen in each route handler.
  // Auth prefixes that never 401 on their own: /api/auth/* resolve the session
  // when present (so /api/auth/me and /api/auth/logout work) but stay reachable
  // without one (login/callback). Health/ws-status are fully public.
  const OPTIONAL_AUTH_PREFIXES = ['/api/auth'];
  const PUBLIC_PREFIXES = ['/api/health', '/api/ws/status'];
  app.addHook('onRequest', async (request, reply) => {
    const url = request.url as string;
    const pathname = url.split('?')[0];
    if (!pathname.startsWith('/api')) return;
    const optional = OPTIONAL_AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
    const { resolveAuth } = await import('./auth/sessions.js');
    if (optional) {
      const auth = await resolveAuth(prisma, request).catch(() => null);
      if (auth) request.auth = auth;
      return;
    }
    if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return;
    const auth = await resolveAuth(prisma, request);
    if (!auth) {
      reply.code(401).send({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
      return;
    }
    request.auth = auth;
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    const authError = error as Partial<AuthError>;
    if (authError && typeof authError.status === 'number' && typeof authError.code === 'string') {
      return reply.code(authError.status).send({ error: authError.message, code: authError.code });
    }
    const ferr = error as { validation?: unknown; name?: string; statusCode?: number; message?: string };
    if (ferr.validation) {
      return reply.code(400).send({ error: 'Validation failed', code: 'VALIDATION', details: ferr.validation });
    }
    if (ferr.name === 'CorsError') {
      return reply.code(403).send({ error: 'Origin not allowed', code: 'CORS' });
    }
    request.log.error({ err: error }, 'Unhandled error');
    const statusCode = ferr.statusCode && ferr.statusCode < 500 ? ferr.statusCode : 500;
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? 'Internal server error' : ferr.message ?? 'Request failed',
      code: statusCode >= 500 ? 'INTERNAL' : 'REQUEST_ERROR',
    });
  });

  app.addHook('onClose', async () => {
    await prisma.$disconnect().catch(() => undefined);
  });

  return app;
}