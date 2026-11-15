import type { FastifyInstance } from 'fastify';
import { guildGuard } from '../middleware/guards.js';
import { computeSecurityReport } from '../services/security.js';

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // Global overview: compares servers, never merges their underlying records.
  app.get('/api/overview', async (req, reply) => {
    if (!req.auth) return reply.code(401).send({ error: 'Unauthenticated' });
    const user = req.auth.user;
    // Guilds the user can access: the allowlisted server's owner, or any
    // member we've actually observed in the server. `memberIds` is a cached
    // convenience list that may be stale/partial (e.g. right after a bot
    // start), so the server_members table is the source of truth for
    // membership; the owner always has access.
    const guilds = await prisma.authorizedServer.findMany({ where: { active: true } });
    const memberRows = await prisma.serverMember.findMany({
      where: { userId: user.discordId },
      select: { guildId: true },
    });
    const memberGuildIds = new Set(memberRows.map((m) => m.guildId));
    const accessible = guilds.filter(
      (g) => g.ownerId === user.discordId || memberGuildIds.has(g.id) || g.memberIds.includes(user.discordId),
    );

    const servers = [];
    for (const guild of accessible) {
      const [members, joins24, leaves24, cases24, alerts, recentActivity, config, unsupervised] = await Promise.all([
        prisma.serverMember.count({ where: { guildId: guild.id } }),
        prisma.activityEvent.count({
          where: { guildId: guild.id, type: 'member_join', createdAt: { gte: daysAgo(1) } },
        }),
        prisma.activityEvent.count({
          where: { guildId: guild.id, type: 'member_leave', createdAt: { gte: daysAgo(1) } },
        }),
        prisma.moderationCase.count({ where: { guildId: guild.id, createdAt: { gte: daysAgo(1) } } }),
        prisma.alert.count({ where: { guildId: guild.id, status: 'open' } }),
        prisma.activityEvent.findMany({ where: { guildId: guild.id }, orderBy: { createdAt: 'desc' }, take: 5 }),
        prisma.serverConfiguration.findUnique({ where: { guildId: guild.id } }),
        computeSecurityReport(prisma, guild.id, false).catch(() => null),
      ]);

      servers.push({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        isOwner: guild.ownerId === user.discordId,
        stats: {
          members,
          online: null, // Discord presence is not tracked by Sentinel; reported only when known
          joins24h: joins24,
          leaves24h: leaves24,
          moderation24h: cases24,
          openAlerts: alerts,
          securityScore: unsupervised?.score ?? null,
          recentActivity: recentActivity.map((a) => ({
            type: a.type,
            message: a.message,
            createdAt: a.createdAt.toISOString(),
          })),
        },
        bot: config ? { configured: true } : { configured: false },
      });
    }

    return {
      global: {
        connectedServers: accessible.length,
        totalMembers: servers.reduce((a, s) => a + (s.stats.members ?? 0), 0),
        openAlerts: servers.reduce((a, s) => a + (s.stats.openAlerts ?? 0), 0),
        botConnected: app.wsHub.botConnected,
        apiStatus: 'operational',
        databaseStatus: 'operational',
        sentinel: 'operational',
      },
      servers,
      generatedAt: new Date().toISOString(),
    };
  });

  // Per-server bootstrap payload for the dashboard workspace.
  app.get('/api/servers/:guildId/summary', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guild = req.guild!;
    const [members, config, security, roles, tickets, giveaways, events, auditCount] = await Promise.all([
      prisma.serverMember.count({ where: { guildId: guild.id } }),
      prisma.serverConfiguration.findUnique({ where: { guildId: guild.id } }),
      prisma.securitySettings.findUnique({ where: { guildId: guild.id } }),
      prisma.moderationRole.count({ where: { guildId: guild.id } }),
      prisma.ticket.count({ where: { guildId: guild.id, status: { in: ['open', 'claimed'] } } }),
      prisma.giveaway.count({ where: { guildId: guild.id, status: 'running' } }),
      prisma.discordEvent.count({ where: { guildId: guild.id, status: 'scheduled' } }),
      prisma.auditLog.count({ where: { guildId: guild.id } }),
    ]);
    return {
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      memberCount: members,
      securityStrength: security ? await computeSecurityReport(prisma, guild.id, false).then((r) => r.score) : null,
      counts: {
        roles,
        openTickets: tickets,
        runningGiveaways: giveaways,
        scheduledEvents: events,
        auditRecords: auditCount,
      },
      botConnected: app.wsHub.botConnected,
      prefix: config?.prefix ?? '!',
    };
  });

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }
}