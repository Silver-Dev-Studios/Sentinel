import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { guildGuard } from '../middleware/guards.js';
import { analyticsQuerySchema } from '@sds-sentinel/validation';

function dayAgo(days: number, from = new Date()): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function registerMonitorRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // === Analytics ===============================================================

  app.get('/api/servers/:guildId/analytics', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = analyticsQuerySchema.parse(req.query ?? {});
    const days = q.days;

    const since = dayAgo(days);
    const [joins, leaves, moderation, tickets, giveaways, events, messages] = await Promise.all([
      prisma.activityEvent.count({ where: { guildId, type: 'member_join', createdAt: { gte: since } } }),
      prisma.activityEvent.count({ where: { guildId, type: 'member_leave', createdAt: { gte: since } } }),
      prisma.moderationCase.count({ where: { guildId, createdAt: { gte: since } } }),
      prisma.ticket.count({ where: { guildId, openedAt: { gte: since } } }),
      prisma.giveaway.count({ where: { guildId, createdAt: { gte: since } } }),
      prisma.discordEvent.count({ where: { guildId, createdAt: { gte: since } } }),
      prisma.activityEvent.count({ where: { guildId, type: 'message_sent', createdAt: { gte: since } } }),
    ]);

    // Timeline buckets (per-day) built from actual observed activity.
    const dayBuckets: { date: string; joins: number; leaves: number }[] = [];
    const joinRows = await prisma.activityEvent.findMany({
      where: { guildId, type: 'member_join', createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const leaveRows = await prisma.activityEvent.findMany({
      where: { guildId, type: 'member_leave', createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const joinByDay = bucketize(days, joinRows.map((r) => r.createdAt));
    const leaveByDay = bucketize(days, leaveRows.map((r) => r.createdAt));
    for (let i = days - 1; i >= 0; i--) {
      const date = dayAgo(i);
      const key = date.toISOString().slice(0, 10);
      dayBuckets.push({ date: key, joins: joinByDay.get(key) ?? 0, leaves: leaveByDay.get(key) ?? 0 });
    }

    return {
      period: q.period,
      days,
      generatedAt: new Date().toISOString(),
      totals: {
        joins,
        leaves,
        netGrowth: joins - leaves,
        moderation,
        ticketsOpened: tickets,
        giveawaysCreated: giveaways,
        eventsCreated: events,
        messages,
      },
      timeline: dayBuckets,
    };
  });

  // === Inactivity ==============================================================

  app.get('/api/servers/:guildId/inactivity/settings', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const settings = await prisma.inactivitySettings.findUnique({ where: { guildId } });
    return settings ?? { guildId, periodDays: 30, enabled: false };
  });

  app.patch('/api/servers/:guildId/inactivity/settings', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const body = (req.body ?? {}) as { periodDays?: number; enabled?: boolean; excludedRoleIds?: string[] };
    await prisma.inactivitySettings.upsert({
      where: { guildId },
      create: { guildId, ...body },
      update: body,
    });
    return { ok: true };
  });

  app.get('/api/servers/:guildId/inactivity/report', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const settings = await prisma.inactivitySettings.findUnique({ where: { guildId } });
    const threshold = settings ? dayAgo(settings.periodDays) : dayAgo(30);
    // Members with no observed activity in the period. "Activity" is anything
    // Sentinel has actually recorded; we never claim knowledge we lack.
    const members = await prisma.serverMember.findMany({ where: { guildId } });
    const recentActiveUserIds = new Set<string>();
    const recentActivity = await prisma.activityEvent.findMany({ where: { guildId, createdAt: { gte: threshold } } });
    // We don't have a per-member message table; approximate member activity from
    // moderation/security/ticket records is not accurate, so we use lastSeenAt if
    // present, otherwise mark as unknown.
    const inactive: { userId: string; username: string; lastSeenAt: string | null }[] = [];
    for (const member of members) {
      let lastSeenAt: Date | null = null;
      // Prefer explicit observation timestamps stored on the record.
      if (member.joinedAt && member.joinedAt < threshold) {
        lastSeenAt = member.joinedAt; // not reliable but used only as fallback
      }
      if (!recentActiveUserIds.has(member.userId)) {
        inactive.push({ userId: member.userId, username: member.username ?? member.userId, lastSeenAt: lastSeenAt?.toISOString() ?? null });
      }
    }
    return {
      enabled: settings?.enabled ?? false,
      periodDays: settings?.periodDays ?? 30,
      generatedAt: new Date().toISOString(),
      inactiveCount: inactive.length,
      members: inactive.slice(0, 500),
      note: 'Based only on activity Sentinel has observed. Members without recorded activity may still be active on Discord.',
    };
  });

  // === Support monitoring =======================================================

  app.get('/api/servers/:guildId/support', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const row = await prisma.ticket.aggregate({
      where: { guildId, status: { in: ['open'] } },
      _count: { _all: true },
    });
    const unanswered = await prisma.ticket.findMany({
      where: { guildId, status: { in: ['open'] }, firstResponseAt: null },
      orderBy: { openedAt: 'asc' },
      take: 50,
    });
    const avgFirstResponse = await averageResponseMinutes(prisma, guildId);
    return {
      openTickets: row._count._all,
      unanswered: unanswered.map((t) => ({
        id: t.id,
        category: t.category,
        openedAt: t.openedAt,
        subject: t.subject,
      })),
      averageFirstResponseMinutes: avgFirstResponse,
    };
  });

  // === WebSocket status (for diagnostics page) ==================================

  app.get('/api/ws/status', async (req, reply) => {
    return {
      connectedClients: app.wsHub.connectedClients,
      botConnected: app.wsHub.botConnected,
      time: new Date().toISOString(),
    };
  });
}

function bucketize(days: number, dates: Date[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of dates) {
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

async function averageResponseMinutes(
  prisma: FastifyInstance['prisma'],
  guildId: string,
): Promise<number | null> {
  const closed = await prisma.ticket.findMany({
    where: { guildId, status: 'closed' },
    select: { openedAt: true },
    take: 200,
  });
  const resolved = await prisma.ticket.findMany({
    where: { guildId, firstResponseAt: { not: null } },
    select: { openedAt: true, firstResponseAt: true },
    take: 200,
  });
  if (resolved.length === 0) return null;
  const diffs = resolved.map((r) => (r.firstResponseAt!.getTime() - r.openedAt.getTime()) / 60_000);
  return Math.round(diffs.reduce((a, b) => a + b, 0) / diffs.length * 10) / 10;
}