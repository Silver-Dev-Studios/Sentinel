import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { guildGuard, ensurePerm } from '../middleware/guards.js';
import { writeAudit, queryAudit } from '../services/audit.js';

export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // Public health probe used by Render and the diagnostics page.
  app.get('/api/health', async (_req, reply) => {
    let db = { ok: false };
    try {
      const { checkDatabaseHealth } = await import('@sds-sentinel/database');
      db = await checkDatabaseHealth();
    } catch (err) {
      db = { ok: false };
    }
    const ok = db.ok;
    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'operational' : 'degraded',
      api: { ok: true, uptimeSeconds: Math.round(process.uptime()) },
      database: db,
      bot: { connected: app.wsHub.botConnected },
      websocket: { connectedClients: app.wsHub.connectedClients },
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
    const [config, inactivity, snipe] = await Promise.all([
      prisma.serverConfiguration.findUnique({ where: { guildId } }),
      prisma.inactivitySettings.findUnique({ where: { guildId } }),
      undefined,
    ]);
    return {
      config: config ?? { guildId, prefix: '!', timezone: 'UTC', snipeRetentionSeconds: 1800, snipeLogging: true },
      inactivity: inactivity ?? { guildId, periodDays: 30, enabled: false },
      snipe: snipe,
    };
  });

  // === Diagnostics ==============================================================

  app.get('/api/servers/:guildId/diagnostics', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const recentErrors = await prisma.diagnosticLog.findMany({
      where: { kind: { in: ['error', 'warning', 'api_failure', 'bot_disconnect', 'db_failure'] } },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    const failedOperations = await prisma.botCommand.count({
      where: { guildId, status: { in: ['failed', 'rejected'] } },
    });
    return {
      guildId,
      generatedAt: new Date().toISOString(),
      api: { status: 'operational', latencyMs: 0 },
      database: { status: 'operational' },
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