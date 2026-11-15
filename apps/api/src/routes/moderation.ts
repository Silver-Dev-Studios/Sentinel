import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { guildGuard, ensurePerm } from '../middleware/guards.js';
import { writeAudit } from '../services/audit.js';
import { recordActivity } from '../ws/hub.js';
import { banInputSchema, timeoutInputSchema, warnInputSchema, purgeInputSchema, lockInputSchema } from '@sds-sentinel/validation';

export async function registerModerationRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // ---- Member management ---------------------------------------------------

  app.get('/api/servers/:guildId/members', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { search?: string; page?: string; pageSize?: string; limit?: string };
    const pageSize = Math.min(Number(q.pageSize ?? q.limit ?? 25), 100);
    const offset = (Math.max(Number(q.page ?? 1), 1) - 1) * pageSize;

    const where: Prisma.ServerMemberWhereInput = { guildId };
    if (q.search) {
      where.OR = [
        { username: { contains: q.search, mode: 'insensitive' } },
        { displayName: { contains: q.search, mode: 'insensitive' } },
        { userId: { contains: q.search } },
      ];
    }

    const [total, rows] = await Promise.all([
      prisma.serverMember.count({ where }),
      prisma.serverMember.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip: offset,
        take: pageSize,
      }),
    ]);

    // Fallback for an exact snowflake search: the bot may not have synced this
    // member yet (fresh join, cache gap, muted server). Return a lightweight
    // placeholder so Quick Actions can still target them by ID; moderation
    // commands resolve the Discord user by ID anyway.
    if (rows.length === 0 && q.search && /^[0-9]{15,25}$/.test(q.search.trim())) {
      return {
        total: 1,
        page: Math.max(Number(q.page ?? 1), 1),
        pageSize,
        rows: [{ guildId, userId: q.search.trim(), username: `user-${q.search.trim().slice(-4)}`, displayName: null, isBot: false }],
      };
    }

    return { total, page: Math.max(Number(q.page ?? 1), 1), pageSize, rows };
  });

  app.get('/api/servers/:guildId/members/:userId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, userId } = req.params as { guildId: string; userId: string };
    const [member, warnings, cases, assignments] = await Promise.all([
      prisma.serverMember.findUnique({ where: { guildId_userId: { guildId, userId } } }),
      prisma.moderationWarning.findMany({ where: { guildId, memberId: userId, active: true }, orderBy: { createdAt: 'desc' } }),
      prisma.moderationCase.findMany({ where: { guildId, targetId: userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.memberRoleAssignment.findMany({ where: { guildId, userId } }),
    ]);
    if (!member) {
      // The bot hasn't synced this member yet; still allow viewing/acting by ID.
      const placeholder = { guildId, userId, username: `user-${userId.slice(-4)}`, displayName: null, isBot: false };
      const roles = await prisma.moderationRole.findMany({ where: { guildId, key: { in: assignments.map((a) => a.roleKey) } as never } });
      return {
        member: placeholder,
        warnings: warnings.map((w) => ({ id: w.id, reason: w.reason, createdAt: w.createdAt })),
        cases,
        sentinelRoles: roles.map((r) => ({ key: r.key, name: r.name })),
      };
    }
    const roles = await prisma.moderationRole.findMany({ where: { guildId, key: { in: assignments.map((a) => a.roleKey) } as never } });
    return {
      member,
      warnings: warnings.map((w) => ({ id: w.id, reason: w.reason, createdAt: w.createdAt })),
      cases,
      sentinelRoles: roles.map((r) => ({ key: r.key, name: r.name })),
    };
  });

  // ---- Case history --------------------------------------------------------

  app.get('/api/servers/:guildId/moderation/cases', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { action?: string; targetId?: string; source?: string; page?: string; pageSize?: string };
    const pageSize = Math.min(Number(q.pageSize ?? 25), 100);
    const page = Math.max(Number(q.page ?? 1), 1);

    const where: Prisma.ModerationCaseWhereInput = { guildId };
    if (q.action) where.action = q.action;
    if (q.targetId) where.targetId = q.targetId;
    if (q.source) where.source = q.source;

    const [total, rows] = await Promise.all([
      prisma.moderationCase.count({ where }),
      prisma.moderationCase.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, rows };
  });

  app.get('/api/servers/:guildId/moderation/cases/:caseId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, caseId } = req.params as { guildId: string; caseId: string };
    const record = await prisma.moderationCase.findFirst({ where: { id: caseId, guildId } });
    if (!record) return reply.code(404).send({ error: 'Case not found', code: 'NOT_FOUND' });
    return record;
  });

  // ---- Quick actions (enqueue to bot) --------------------------------------

  app.post('/api/servers/:guildId/moderation/ban', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.ban');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = banInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'ban',
      payload: { userId: body.targetId, reason: body.reason ?? undefined, deleteMessageSeconds: body.deleteDays },
    });
    await audit(prisma, app, guildId, 'moderation.ban', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id, detail: { reason: body.reason } });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/unban', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.ban');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = banInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'unban',
      payload: { userId: body.targetId, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.unban', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/timeout', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.untime');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = timeoutInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'timeout',
      payload: { userId: body.targetId, minutes: body.durationMinutes, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.timeout', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/untime', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.untime');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = banInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'untime',
      payload: { userId: body.targetId, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.untime', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/warn', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.warn');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = warnInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'warn',
      payload: { userId: body.targetId, reason: body.reason },
    });
    await audit(prisma, app, guildId, 'moderation.warn', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id, detail: { reason: body.reason } });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/kick', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.kick');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = banInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'kick',
      payload: { userId: body.targetId, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.kick', { actorId: req.auth.user.discordId, targetId: body.targetId, resource: id });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/lock', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.lock');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = lockInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'lock',
      payload: { channelId: body.channelId, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.lock', { actorId: req.auth.user.discordId, resource: id, detail: { channelId: body.channelId } });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/unlock', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.lock');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = lockInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'unlock',
      payload: { channelId: body.channelId, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.unlock', { actorId: req.auth.user.discordId, resource: id, detail: { channelId: body.channelId } });
    return { queued: true, commandId: id };
  });

  app.post('/api/servers/:guildId/moderation/purge', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'moderation.purge');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = purgeInputSchema.parse(req.body);
    const { id } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'purge',
      payload: { channelId: body.channelId, amount: body.amount, reason: body.reason ?? undefined },
    });
    await audit(prisma, app, guildId, 'moderation.purge', { actorId: req.auth.user.discordId, resource: id, detail: { channelId: body.channelId, amount: body.amount } });
    return { queued: true, commandId: id };
  });

  // ---- Recent activity -----------------------------------------------------

  app.get('/api/servers/:guildId/activity', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 50), 200);
    const rows = await prisma.activityEvent.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: limit });
    return { rows };
  });

  // ---- Moderation roles ------------------------------------------------------

  app.get('/api/servers/:guildId/roles', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const roles = await prisma.moderationRole.findMany({ where: { guildId }, include: { permissions: true } });
    const assignments = await prisma.memberRoleAssignment.findMany({ where: { guildId } });
    return roles.map((role) => ({
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isOwnerRole: role.isOwnerRole,
      discordRoleId: role.discordRoleId,
      permissions: role.permissions.map((p) => ({ permission: p.permission, enabled: p.enabled })),
      memberCount: assignments.filter((a) => a.roleKey === role.key).length,
    }));
  });

  app.post('/api/servers/:guildId/roles', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'roles.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as { name: string; description?: string; permissions?: string[] };
    const name = body.name.trim();
    if (name.length < 2 || name.length > 64) return reply.code(400).send({ error: 'Invalid role name' });
    const key = `role_${crypto.randomUUID().slice(0, 8)}`;
    const role = await prisma.moderationRole.create({
      data: {
        guildId,
        key,
        name,
        description: body.description,
        permissions: {
          create: (body.permissions ?? []).map((p) => ({ guildId, permission: p, enabled: true })),
        },
      },
    });
    await audit(prisma, app, guildId, 'roles.create', { actorId: req.auth.user.discordId, resource: role.id, detail: { name: role.name } });
    await recordActivity(prisma, app.wsHub, { guildId, type: 'config_change', actorId: req.auth.user.discordId, message: `Created Sentinel role ${name}` });
    // Have the bot create a matching Discord role on the guild so the Sentinel
    // role can be used for channel/moderation assignment.
    await prisma.botCommand.create({
      data: {
        guildId,
        actorId: req.auth.user.discordId,
        type: 'create_role',
        payload: { roleId: role.id, name, description: body.description ?? null, key } as object,
      },
    });
    return role;
  });

  app.patch('/api/servers/:guildId/roles/:roleKey', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'roles.manage');
    const { guildId, roleKey } = req.params as { guildId: string; roleKey: string };
    const role = await prisma.moderationRole.findFirst({ where: { guildId, key: roleKey } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    if (role.isOwnerRole) return reply.code(400).send({ error: 'The owner role cannot be edited' });
    const body = req.body as { name?: string; description?: string | null; permissions?: { permission: string; enabled: boolean }[] };
    await prisma.moderationRole.update({
      where: { id: role.id },
      data: {
        name: body.name?.trim() ?? role.name,
        description: body.description ?? undefined,
      },
    });
    if (body.permissions) {
      await prisma.moderationRolePermission.deleteMany({ where: { roleId: role.id } });
      for (const p of body.permissions) {
        await prisma.moderationRolePermission.create({
          data: { roleId: role.id, guildId, permission: p.permission, enabled: p.enabled },
        });
      }
    }
    await audit(prisma, app, guildId, 'roles.update', { actorId: req.auth.user.discordId, resource: role.id });
    return { ok: true };
  });

  app.delete('/api/servers/:guildId/roles/:roleKey', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'roles.manage');
    const { guildId, roleKey } = req.params as { guildId: string; roleKey: string };
    const role = await prisma.moderationRole.findFirst({ where: { guildId, key: roleKey } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    if (role.isOwnerRole) return reply.code(400).send({ error: 'The owner role cannot be deleted' });
    await prisma.memberRoleAssignment.deleteMany({ where: { guildId, roleKey } });
    await prisma.moderationRolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.moderationRole.delete({ where: { id: role.id } });
    await audit(prisma, app, guildId, 'roles.delete', { actorId: req.auth.user.discordId, resource: role.id });
    return { ok: true };
  });

  app.post('/api/servers/:guildId/roles/:roleKey/assign', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'roles.manage');
    const { guildId, roleKey } = req.params as { guildId: string; roleKey: string };
    const role = await prisma.moderationRole.findFirst({ where: { guildId, key: roleKey } });
    if (!role) return reply.code(404).send({ error: 'Role not found' });
    const { userId } = req.body as { userId: string };
    if (!userId) return reply.code(400).send({ error: 'userId is required' });
    await prisma.memberRoleAssignment.upsert({
      where: { guildId_userId_roleKey: { guildId, userId, roleKey } },
      create: { guildId, userId, roleKey, assignedById: req.auth.user.discordId },
      update: { assignedById: req.auth.user.discordId },
    });
    await audit(prisma, app, guildId, 'roles.assign', { actorId: req.auth.user.discordId, targetId: userId, resource: roleKey });
    // Mirror the assignment onto Discord when the bot has a Discord role for it.
    if (role.discordRoleId) {
      await prisma.botCommand.create({
        data: {
          guildId,
          actorId: req.auth.user.discordId,
          type: 'assign_role',
          payload: { roleId: role.id, roleKey, userId, discordRoleId: role.discordRoleId } as object,
        },
      });
    }
    return { ok: true };
  });

  app.post('/api/servers/:guildId/roles/:roleKey/remove', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'roles.manage');
    const { guildId, roleKey } = req.params as { guildId: string; roleKey: string };
    const role = await prisma.moderationRole.findFirst({ where: { guildId, key: roleKey } });
    const { userId } = req.body as { userId: string };
    if (!userId) return reply.code(400).send({ error: 'userId is required' });
    await prisma.memberRoleAssignment.deleteMany({ where: { guildId, userId, roleKey } });
    if (role?.discordRoleId) {
      await prisma.botCommand.create({
        data: {
          guildId,
          actorId: req.auth.user.discordId,
          type: 'remove_role',
          payload: { roleKey, userId, discordRoleId: role.discordRoleId } as object,
        },
      });
    }
    await audit(prisma, app, guildId, 'roles.remove', { actorId: req.auth.user.discordId, targetId: userId, resource: roleKey });
    return { ok: true };
  });

  // ---- Server config ---------------------------------------------------------

  app.patch('/api/servers/:guildId/config', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as { prefix?: string; timezone?: string; snipeRetentionSeconds?: number; snipeLogging?: boolean };
    const config = await prisma.serverConfiguration.upsert({
      where: { guildId },
      create: { guildId, prefix: body.prefix ?? '!', timezone: body.timezone ?? 'UTC' },
      update: { ...body },
    });
    await audit(prisma, app, guildId, 'config.update', { actorId: req.auth.user.discordId, detail: body });
    return config;
  });

  app.get('/api/servers/:guildId/config', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const config = await prisma.serverConfiguration.findUnique({ where: { guildId } });
    return config ?? { guildId, prefix: '!', timezone: 'UTC' };
  });
}

async function audit(prisma: typeof app.prisma, app: FastifyInstance, guildId: string, action: string, opts: { actorId: string; targetId?: string; resource?: string; detail?: Record<string, unknown> }) {
  await writeAudit(prisma, app.wsHub, { guildId, action, category: 'moderation', ...opts });
}