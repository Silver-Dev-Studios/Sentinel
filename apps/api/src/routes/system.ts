import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { checkDatabaseHealth } from '@sds-sentinel/database';
import { guildGuard, ensurePerm } from '../middleware/guards.js';
import { writeAudit, queryAudit } from '../services/audit.js';
import { logChannelsSchema } from '@sds-sentinel/validation';

/**
 * Cache the database probe briefly. The Overview strip and Diagnostics page poll
 * health independently; a 3s cache keeps both fresh while avoiding a DB round
 * trip on every poll.
 */
let healthCache: { at: number; value: Awaited<ReturnType<typeof checkDatabaseHealth>> } | null = null;
async function cachedDatabaseHealth(): Promise<Awaited<ReturnType<typeof checkDatabaseHealth>>> {
  const now = Date.now();
  if (healthCache && now - healthCache.at < 3000) return healthCache.value;
  const value = await checkDatabaseHealth().catch(() => ({ ok: false, latencyMs: 0 }));
  healthCache = { at: now, value };
  return value;
}

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // Public health probe used by Render and the diagnostics page.
  // Returns a superset shape so every dashboard widget (Overview strip and
  // Diagnostics page) reads real values instead of undefined.
  app.get('/api/health', async (_req, reply) => {
    const started = Date.now();
    const db = await cachedDatabaseHealth();
    const ok = db.ok;
    const uptime = Math.round(process.uptime());
    const apiLatencyMs = Date.now() - started;
    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'operational' : 'degraded',
      uptime,
      apiLatencyMs,
      api: { ok: true, latencyMs: apiLatencyMs, uptimeSeconds: uptime },
      database: {
        ok,
        connected: ok,
        latencyMs: db.latencyMs,
        ...(db.detail ? { detail: db.detail } : {}),
      },
      bot: { connected: app.wsHub.botConnected },
      websocket: { connectedClients: app.wsHub.connectedClients, botConnected: app.wsHub.botConnected },
      time: new Date().toISOString(),
    });
  });

  // === Alerts =================================================================

  app.get('/api/servers/:guildId/alerts', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { status?: 'open' | 'acknowledged' | 'resolved'; severity?: string; page?: string; pageSize?: string };
    const pageSize = Math.min(Number(q.pageSize ?? 25), 100);
    const page = Math.max(Number(q.page ?? 1), 1);
    const where: Prisma.AlertWhereInput = { guildId };
    if (q.status) where.status = q.status;
    if (q.severity) where.severity = q.severity;
    const [total, rows] = await Promise.all([
      prisma.alert.count({ where }),
      prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, rows };
  });

  app.post('/api/servers/:guildId/alerts/:alertId/ack', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, alertId } = req.params as { guildId: string; alertId: string };
    const alert = await prisma.alert.findFirst({ where: { id: alertId, guildId } });
    if (!alert) return reply.code(404).send({ error: 'Alert not found' });
    const nextStatus = alert.status === 'open' ? 'acknowledged' : alert.status;
    await prisma.alert.update({ where: { id: alert.id }, data: { status: nextStatus, acknowledgedAt: new Date(), acknowledgedById: req.auth.user.discordId } });
    return { ok: true };
  });

  app.post('/api/servers/:guildId/alerts/:alertId/resolve', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, alertId } = req.params as { guildId: string; alertId: string };
    const alert = await prisma.alert.findFirst({ where: { id: alertId, guildId } });
    if (!alert) return reply.code(404).send({ error: 'Alert not found' });
    await prisma.alert.update({ where: { id: alert.id }, data: { status: 'resolved', resolvedAt: new Date(), resolvedById: req.auth.user.discordId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'alerts.resolve', category: 'system', actorId: req.auth.user.discordId, resource: alert.id });
    return { ok: true };
  });

  // === Audit Center ============================================================

  app.get('/api/servers/:guildId/audit', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'system.audit');
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { category?: string; actorId?: string; resource?: string; from?: string; to?: string; page?: string; pageSize?: string };
    const pageSize = Math.min(Number(q.pageSize ?? 25), 100);
    const page = Math.max(Number(q.page ?? 1), 1);
    const result = await queryAudit(prisma, {
      guildId,
      category: q.category,
      actorId: q.actorId,
      resource: q.resource,
      from: q.from ? new Date(q.from) : undefined,
      to: q.to ? new Date(q.to) : undefined,
      page,
      pageSize,
    });
    return result;
  });

  // === Settings (per-server) ====================================================

  app.get('/api/servers/:guildId/settings', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const [config, inactivity] = await Promise.all([
      prisma.serverConfiguration.findUnique({ where: { guildId } }),
      prisma.inactivitySettings.findUnique({ where: { guildId } }),
    ]);
    return {
      config: config ?? { guildId, prefix: '!', timezone: 'UTC', snipeRetentionSeconds: 1800, snipeLogging: true },
      inactivity: inactivity ?? { guildId, periodDays: 30, enabled: false },
      logChannels: (config?.logChannels as Record<string, string | null> | null) ?? {},
    };
  });

  // Per-category log channel routing (message/moderation/ticket/giveaway/etc).
  app.patch('/api/servers/:guildId/log-channels', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = logChannelsSchema.parse(req.body ?? {});
    const current = await prisma.serverConfiguration.findUnique({ where: { guildId } });
    const merged = { ...((current?.logChannels as Record<string, string | null> | null) ?? {}), ...body };
    await prisma.serverConfiguration.upsert({
      where: { guildId },
      create: { guildId, logChannels: merged as object },
      update: { logChannels: merged as object },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'settings.logChannels.update', category: 'system', actorId: req.auth.user.discordId, detail: body });
    return { ok: true, logChannels: merged };
  });

  // Giveaway defaults (channel + embed default) for the Message-area pages.
  app.get('/api/servers/:guildId/giveaway-settings', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const config = await prisma.serverConfiguration.findUnique({ where: { guildId } });
    return {
      defaultChannelId: config?.giveawayDefaultChannelId ?? null,
      defaultEmbed: config?.giveawayDefaultEmbed ?? true,
    };
  });

  // === Diagnostics ==============================================================

  app.get('/api/servers/:guildId/diagnostics', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const started = Date.now();
    const db = await cachedDatabaseHealth();
    const recentErrors = await prisma.diagnosticLog.findMany({
      where: { kind: { in: ['error', 'warning', 'api_failure', 'bot_disconnect', 'db_failure'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const failedOperations = await prisma.botCommand.count({
      where: { guildId, status: { in: ['failed', 'rejected'] } },
    });
    const apiLatencyMs = Date.now() - started;
    return {
      guildId,
      generatedAt: new Date().toISOString(),
      api: { status: 'operational', latencyMs: apiLatencyMs },
      database: { status: db.ok ? 'operational' : 'down', latencyMs: db.latencyMs },
      websocket: { connectedClients: app.wsHub.connectedClients, botConnected: app.wsHub.botConnected },
      bot: { connected: app.wsHub.botConnected },
      backgroundTasks: { status: app.wsHub.botConnected ? 'running' : 'unknown' },
      failedOperations,
      recentErrors: recentErrors.map((e) => ({ kind: e.kind, service: e.service, message: e.message, createdAt: e.createdAt })),
    };
  });

  // === Backups (listing is in management.ts; here only the summary) ============

  app.get('/api/servers/:guildId/backups/summary', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const latest = await prisma.configBackup.findFirst({ where: { guildId }, orderBy: { createdAt: 'desc' } });
    const count = await prisma.configBackup.count({ where: { guildId } });
    return { count, latest: latest ? { id: latest.id, name: latest.name, createdAt: latest.createdAt } : null };
  });
}