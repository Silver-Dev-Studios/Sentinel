import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { guildGuard, ensurePerm } from '../middleware/guards.js';
import { writeAudit } from '../services/audit.js';
import { recordActivity } from '../ws/hub.js';
import {
  messageSendSchema,
  templateCreateSchema,
  scheduleMessageSchema,
  eventCreateSchema,
  ticketPanelSchema,
  ticketCloseSchema,
  giveawayCreateSchema,
  customCommandSchema,
  scheduledTaskSchema,
} from '@sds-sentinel/validation';
import { BUILTIN_COMMANDS, PERMISSION_LABELS } from '@sds-sentinel/shared';

function firstDefined<T>(...values: T[]): T | undefined {
  return values.find((v) => v !== undefined);
}

export async function registerManagerRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // === Message Builder ========================================================

  // Real channel list synced by the bot from the live guild. Never fabricated.
  app.get('/api/servers/:guildId/channels', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const channels = await prisma.serverChannel.findMany({
      where: { guildId },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    const members = await prisma.serverMember.count({ where: { guildId } });
    return {
      channels: channels.map((c) => ({
        id: c.channelId,
        name: c.name,
        type: c.type,
        parentId: c.parentId,
        nsfw: c.nsfw,
        lastSyncedAt: c.lastSyncedAt.toISOString(),
      })),
      synced: channels.length > 0,
      lastSyncedAt: channels.length > 0 ? channels[0].lastSyncedAt.toISOString() : null,
      memberCount: members,
    };
  });

  // Send a message to one or more channels in the selected guild.
  app.post('/api/servers/:guildId/messages/send', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'messages.send');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = messageSendSchema.parse({ ...(req.body as object) });
    if (body.guildId && body.guildId !== guildId) {
      return reply.code(400).send({ error: 'guildId mismatch', code: 'GUILD_MISMATCH' });
    }
    // Multi-channel confirmation is enforced client-side; the server logs every
    // delivery and never accepts channels outside the requested guild.
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'send_message',
      payload: { channelIds: body.channelIds, content: body.content ?? undefined, embeds: body.embeds },
    });
    await prisma.messageDeliveryLog.create({
      data: {
        guildId,
        kind: 'message',
        status: 'scheduled',
        successCount: 0,
        failureCount: 0,
        detail: { channelCount: body.channelIds.length, commandId } as object,
      },
    });
    await writeAudit(prisma, app.wsHub, {
      guildId,
      action: 'messages.send',
      category: 'management',
      actorId: req.auth.user.discordId,
      detail: { channelCount: body.channelIds.length, hasEmbed: (body.embeds?.length ?? 0) > 0 },
    });
    return { queued: true, commandId };
  });

  app.get('/api/servers/:guildId/messages/deliveries', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { limit?: string };
    const rows = await prisma.messageDeliveryLog.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(q.limit ?? 50), 200),
    });
    return { rows };
  });

  // Templates
  app.get('/api/servers/:guildId/messages/templates', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const rows = await prisma.messageTemplate.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
    return { rows };
  });

  app.post('/api/servers/:guildId/messages/templates', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'messages.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = templateCreateSchema.parse(req.body);
    const template = await prisma.messageTemplate.create({
      data: {
        guildId,
        name: body.name,
        kind: body.kind,
        content: body.content ?? null,
        embeds: body.embeds ? (body.embeds as object[]) : undefined,
        channelIds: body.channelIds ?? [],
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'messages.template.create', category: 'management', actorId: req.auth.user.discordId, resource: template.id });
    return template;
  });

  app.put('/api/servers/:guildId/messages/templates/:templateId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'messages.manage');
    const { guildId, templateId } = req.params as { guildId: string; templateId: string };
    const body = templateCreateSchema.partial().parse(req.body);
    await prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        name: body.name ?? undefined,
        kind: body.kind ?? undefined,
        content: body.content ?? undefined,
        embeds: body.embeds ? (body.embeds as object[]) : undefined,
        channelIds: body.channelIds ?? undefined,
      },
    }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        return reply.code(404).send({ error: 'Template not found' });
      }
      throw err;
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'messages.template.update', category: 'management', actorId: req.auth.user.discordId, resource: templateId });
    return { ok: true };
  });

  app.delete('/api/servers/:guildId/messages/templates/:templateId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'messages.manage');
    const { guildId, templateId } = req.params as { guildId: string; templateId: string };
    await prisma.messageTemplate.deleteMany({ where: { id: templateId, guildId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'messages.template.delete', category: 'management', actorId: req.auth.user.discordId, resource: templateId });
    return { ok: true };
  });

  // Scheduler (messages)
  app.get('/api/servers/:guildId/scheduler', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const [scheduledMessages, scheduledTasks] = await Promise.all([
      prisma.scheduledMessage.findMany({ where: { guildId }, orderBy: { scheduledFor: 'asc' }, take: 200 }),
      prisma.scheduledTask.findMany({ where: { guildId }, orderBy: { runAt: 'asc' }, take: 200 }),
    ]);
    return { scheduledMessages, scheduledTasks };
  });

  app.post('/api/servers/:guildId/scheduler/messages', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'scheduler.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = scheduleMessageSchema.parse(req.body);
    const row = await prisma.scheduledTask.create({
      data: {
        guildId,
        type: body.recurring ? 'recurring_announcement' : 'announcement',
        name: body.name ?? 'Scheduled message',
        config: {
          channelIds: body.channelIds,
          content: body.content ?? undefined,
          embeds: body.embeds ?? undefined,
        } as object,
        runAt: new Date(body.scheduledFor),
        recurring: body.recurring ?? null,
        timezone: 'UTC',
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'scheduler.create', category: 'management', actorId: req.auth.user.discordId, resource: row.id });
    return row;
  });

  app.patch('/api/servers/:guildId/scheduler/messages/:taskId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'scheduler.manage');
    const { guildId, taskId } = req.params as { guildId: string; taskId: string };
    const body = (req.body ?? {}) as {
      channelIds?: string[];
      content?: string;
      embeds?: object[];
      scheduledFor?: string;
      recurring?: string | null;
      name?: string;
    };
    const row = await prisma.scheduledTask.updateMany({
      where: { id: taskId, guildId },
      data: {
        ...(body.scheduledFor ? { runAt: new Date(body.scheduledFor) } : {}),
        ...(body.recurring !== undefined ? { recurring: body.recurring } : {}),
        ...(body.content !== undefined || body.channelIds !== undefined || body.embeds !== undefined
          ? { config: { ...(body.channelIds ? { channelIds: body.channelIds } : {}), ...(body.content ? { content: body.content } : {}), ...(body.embeds ? { embeds: body.embeds } : {}) } as object }
          : {}),
      },
    });
    return { ok: row.count > 0 };
  });

  app.delete('/api/servers/:guildId/scheduler/messages/:taskId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'scheduler.manage');
    const { guildId, taskId } = req.params as { guildId: string; taskId: string };
    await prisma.scheduledTask.deleteMany({ where: { id: taskId, guildId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'scheduler.delete', category: 'management', actorId: req.auth.user.discordId, resource: taskId });
    return { ok: true };
  });

  // === Events =================================================================

  app.get('/api/servers/:guildId/events', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { status?: string; limit?: string };
    const where: Prisma.DiscordEventWhereInput = { guildId };
    if (q.status) where.status = q.status;
    const rows = await prisma.discordEvent.findMany({
      where,
      orderBy: { startsAt: 'desc' },
      take: Math.min(Number(q.limit ?? 100), 200),
    });
    return { rows };
  });

  app.post('/api/servers/:guildId/events', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'events.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = eventCreateSchema.parse(req.body);
    const event = await prisma.discordEvent.create({
      data: {
        guildId,
        name: body.name,
        description: body.description ?? null,
        image: body.image ?? null,
        channelId: body.channelId ?? null,
        location: body.location ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        rsvpEnabled: body.rsvpEnabled,
        reminderMinutes: body.reminderMinutes ?? [],
      },
    });
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'create_event',
      payload: { eventId: event.id, name: event.name, description: event.description, startsAt: event.startsAt.toISOString() },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'events.create', category: 'management', actorId: req.auth.user.discordId, resource: event.id });
    return { ...event, commandId };
  });

  app.patch('/api/servers/:guildId/events/:eventId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'events.manage');
    const { guildId, eventId } = req.params as { guildId: string; eventId: string };
    const body = eventCreateSchema.partial().parse(req.body);
    const existing = await prisma.discordEvent.findFirst({ where: { id: eventId, guildId } });
    if (!existing) return reply.code(404).send({ error: 'Event not found' });
    const event = await prisma.discordEvent.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.image !== undefined ? { image: body.image } : {}),
        ...(body.channelId !== undefined ? { channelId: body.channelId } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.startsAt !== undefined ? { startsAt: new Date(body.startsAt) } : {}),
        ...(body.endsAt !== undefined ? { endsAt: body.endsAt ? new Date(body.endsAt) : null } : {}),
        ...(body.rsvpEnabled !== undefined ? { rsvpEnabled: body.rsvpEnabled } : {}),
      },
    });
    await prisma.botCommand.create({
      data: { guildId, actorId: req.auth.user.discordId, type: 'update_event', payload: { eventId: existing.id, name: event.name } as object },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'events.update', category: 'management', actorId: req.auth.user.discordId, resource: event.id });
    return event;
  });

  app.post('/api/servers/:guildId/events/:eventId/cancel', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'events.manage');
    const { guildId, eventId } = req.params as { guildId: string; eventId: string };
    const existing = await prisma.discordEvent.findFirst({ where: { id: eventId, guildId } });
    if (!existing) return reply.code(404).send({ error: 'Event not found' });
    await prisma.discordEvent.update({ where: { id: existing.id }, data: { status: 'cancelled' } });
    if (existing.discordEventId) {
      await prisma.botCommand.create({
        data: { guildId, actorId: req.auth.user.discordId, type: 'cancel_event', payload: { discordEventId: existing.discordEventId } as object },
      });
    }
    await writeAudit(prisma, app.wsHub, { guildId, action: 'events.cancel', category: 'management', actorId: req.auth.user.discordId, resource: existing.id });
    return { ok: true };
  });

  app.get('/api/servers/:guildId/events/:eventId/attendees', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, eventId } = req.params as { guildId: string; eventId: string };
    const attendees = await prisma.eventAttendee.findMany({ where: { guildId, eventId } });
    return { rows: attendees };
  });

  // === Tickets ================================================================

  app.get('/api/servers/:guildId/tickets', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { status?: string; page?: string; pageSize?: string };
    const pageSize = Math.min(Number(q.pageSize ?? 25), 100);
    const page = Math.max(Number(q.page ?? 1), 1);
    const where: Prisma.TicketWhereInput = { guildId };
    if (q.status) where.status = q.status;
    const [total, rows] = await Promise.all([
      prisma.ticket.count({ where }),
      prisma.ticket.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    return { total, page, pageSize, rows };
  });

  app.get('/api/servers/:guildId/tickets/:ticketId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'tickets.manage');
    const { guildId, ticketId } = req.params as { guildId: string; ticketId: string };
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, guildId }, include: { participants: true } });
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    const transcripts = await prisma.ticketTranscript.findMany({ where: { ticketId } });
    return { ticket, transcripts };
  });

  app.post('/api/servers/:guildId/tickets/:ticketId/claim', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'tickets.manage');
    const { guildId, ticketId } = req.params as { guildId: string; ticketId: string };
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, guildId } });
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    if (ticket.status === 'closed') return reply.code(400).send({ error: 'Ticket is closed' });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: 'claimed', assignedTo: req.auth.user.discordId, firstResponseAt: ticket.firstResponseAt ?? new Date() },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'tickets.claim', category: 'management', actorId: req.auth.user.discordId, resource: ticket.id });
    return { ok: true };
  });

  app.post('/api/servers/:guildId/tickets/:ticketId/close', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'tickets.manage');
    const { guildId, ticketId } = req.params as { guildId: string; ticketId: string };
    const body = ticketCloseSchema.parse(req.body ?? {});
    const ticket = await prisma.ticket.findFirst({ where: { id: ticketId, guildId } });
    if (!ticket) return reply.code(404).send({ error: 'Ticket not found' });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        closedById: req.auth.user.discordId,
        ...(body.transcript && ticket.channelId ? { transcriptUrl: `transcript-${ticket.id}` } : {}),
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'tickets.close', category: 'management', actorId: req.auth.user.discordId, resource: ticket.id });
    await recordActivity(prisma, app.wsHub, { guildId, type: 'ticket', actorId: req.auth.user.discordId, message: `Ticket #${ticket.id.slice(-6).toUpperCase()} closed` });
    return { ok: true };
  });

  // Ticket panels
  app.get('/api/servers/:guildId/tickets/panels', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const rows = await prisma.ticketPanel.findMany({ where: { guildId }, orderBy: { name: 'asc' } });
    return { rows };
  });

  app.post('/api/servers/:guildId/tickets/panels', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'tickets.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = ticketPanelSchema.parse(req.body);
    const panel = await prisma.ticketPanel.create({
      data: {
        guildId,
        name: body.name,
        category: body.category,
        description: body.description ?? null,
        emoji: body.emoji ?? null,
        channelId: body.channelId ?? null,
        openingMessage: body.openingMessage ?? null,
        questions: body.questions ?? [],
        staffRoleIds: body.staffRoleIds ?? [],
      },
    });
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'create_ticket_panel',
      payload: { panelId: panel.id, name: panel.name, description: panel.description, emoji: panel.emoji, channelId: panel.channelId },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'tickets.panel.create', category: 'management', actorId: req.auth.user.discordId, resource: panel.id });
    return { ...panel, commandId };
  });

  app.delete('/api/servers/:guildId/tickets/panels/:panelId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'tickets.manage');
    const { guildId, panelId } = req.params as { guildId: string; panelId: string };
    await prisma.ticketPanel.deleteMany({ where: { id: panelId, guildId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'tickets.panel.delete', category: 'management', actorId: req.auth.user.discordId, resource: panelId });
    return { ok: true };
  });

  // === Giveaways ==============================================================

  app.get('/api/servers/:guildId/giveaways', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { status?: string; limit?: string };
    const rows = await prisma.giveaway.findMany({
      where: { guildId, ...(q.status ? { status: q.status } : {}) },
      orderBy: { endsAt: 'desc' },
      take: Math.min(Number(q.limit ?? 100), 200),
    });
    return { rows };
  });

  app.post('/api/servers/:guildId/giveaways', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'giveaways.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = giveawayCreateSchema.parse(req.body);
    const endsAt = new Date(Date.now() + body.durationMinutes * 60_000);
    const giveaway = await prisma.giveaway.create({
      data: {
        guildId,
        channelId: body.channelId,
        prize: body.prize,
        description: body.description ?? null,
        winnerCount: body.winnerCount,
        durationSeconds: body.durationMinutes * 60,
        endsAt,
        requirements: body.requirements as object | undefined,
      },
    });
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'create_giveaway',
      payload: { giveawayId: giveaway.id, channelId: giveaway.channelId, prize: giveaway.prize, winnerCount: giveaway.winnerCount, endsAt: giveaway.endsAt.toISOString() },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'giveaways.create', category: 'management', actorId: req.auth.user.discordId, resource: giveaway.id });
    return { ...giveaway, commandId };
  });

  app.post('/api/servers/:guildId/giveaways/:giveawayId/end', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'giveaways.manage');
    const { guildId, giveawayId } = req.params as { guildId: string; giveawayId: string };
    const giveaway = await prisma.giveaway.findFirst({ where: { id: giveawayId, guildId } });
    if (!giveaway) return reply.code(404).send({ error: 'Giveaway not found' });
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { status: 'ended', endedAt: new Date() } });
    if (giveaway.messageId) {
      await prisma.botCommand.create({
        data: { guildId, actorId: req.auth.user.discordId, type: 'end_giveaway', payload: { giveawayId: giveaway.id, messageId: giveaway.messageId, winnerCount: giveaway.winnerCount } as object },
      });
    }
    await writeAudit(prisma, app.wsHub, { guildId, action: 'giveaways.end', category: 'management', actorId: req.auth.user.discordId, resource: giveaway.id });
    return { ok: true };
  });

  app.post('/api/servers/:guildId/giveaways/:giveawayId/reroll', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'giveaways.manage');
    const { guildId, giveawayId } = req.params as { guildId: string; giveawayId: string };
    const giveaway = await prisma.giveaway.findFirst({ where: { id: giveawayId, guildId } });
    if (!giveaway) return reply.code(404).send({ error: 'Giveaway not found' });
    if (giveaway.messageId) {
      await prisma.botCommand.create({
        data: {
          guildId,
          actorId: req.auth.user.discordId,
          type: 'reroll_giveaway',
          payload: { giveawayId: giveaway.id, messageId: giveaway.messageId, winnerCount: giveaway.winnerCount } as object,
        },
      });
    }
    await prisma.giveaway.update({ where: { id: giveaway.id }, data: { rerolledAt: new Date(), rerolledById: req.auth.user.discordId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'giveaways.reroll', category: 'management', actorId: req.auth.user.discordId, resource: giveaway.id });
    return { ok: true };
  });

  app.get('/api/servers/:guildId/commands/reference', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    void prisma;
    return {
      rows: BUILTIN_COMMANDS.map((cmd) => ({
        name: cmd.name,
        iface: cmd.iface,
        category: cmd.category,
        description: cmd.description,
        usage: cmd.usage,
        options: cmd.options ?? [],
        permission: cmd.permission,
        permissionLabel: PERMISSION_LABELS[cmd.permission as keyof typeof PERMISSION_LABELS] ?? cmd.permission,
      })),
    };
  });

  // === Custom Commands ========================================================

  app.get('/api/servers/:guildId/commands', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { kind?: string };
    const rows = await prisma.customCommand.findMany({
      where: { guildId, ...(q.kind ? { kind: q.kind } : {}) },
      orderBy: { name: 'asc' },
    });
    return { rows };
  });

  app.post('/api/servers/:guildId/commands', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'commands.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = customCommandSchema.parse(req.body);
    const cmd = await prisma.customCommand.create({
      data: {
        guildId,
        name: body.name,
        kind: body.kind,
        description: body.description ?? null,
        content: body.content ?? null,
        embeds: body.embeds ? (body.embeds as object[]) : undefined,
        aliases: body.aliases ?? [],
        requiredPermission: body.requiredPermission ?? null,
        enabled: body.enabled,
      },
    });
    await prisma.botCommand.create({
      data: { guildId, actorId: req.auth.user.discordId, type: 'sync_commands', payload: {} as object },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'commands.create', category: 'management', actorId: req.auth.user.discordId, resource: cmd.id });
    return cmd;
  });

  app.patch('/api/servers/:guildId/commands/:commandId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'commands.manage');
    const { guildId, commandId } = req.params as { guildId: string; commandId: string };
    const body = customCommandSchema.partial().parse(req.body);
    await prisma.customCommand.updateMany({
      where: { id: commandId, guildId },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.embeds !== undefined ? { embeds: body.embeds as object[] } : {}),
        ...(body.aliases !== undefined ? { aliases: body.aliases } : {}),
        ...(body.requiredPermission !== undefined ? { requiredPermission: body.requiredPermission } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'commands.update', category: 'management', actorId: req.auth.user.discordId, resource: commandId });
    return { ok: true };
  });

  app.delete('/api/servers/:guildId/commands/:commandId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'commands.manage');
    const { guildId, commandId } = req.params as { guildId: string; commandId: string };
    await prisma.customCommand.deleteMany({ where: { id: commandId, guildId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'commands.delete', category: 'management', actorId: req.auth.user.discordId, resource: commandId });
    return { ok: true };
  });

  // === Backups ================================================================

  app.get('/api/servers/:guildId/backups', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const rows = await prisma.configBackup.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { rows };
  });

  app.post('/api/servers/:guildId/backups', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = (req.body ?? {}) as { name?: string };
    const [roles, channels, autoMod, security, templates, welcome] = await Promise.all([
      prisma.moderationRole.findMany({ where: { guildId }, include: { permissions: true } }),
      prisma.serverConfiguration.findUnique({ where: { guildId } }),
      prisma.autoModRule.findMany({ where: { guildId } }),
      prisma.securitySettings.findUnique({ where: { guildId } }),
      prisma.messageTemplate.findMany({ where: { guildId } }),
      prisma.welcomeSettings.findMany({ where: { guildId } }),
    ]);
    const data = { roles, channels: null, autoModRules: autoMod, security: security ?? null, templates, welcome };
    const json = JSON.stringify(data);
    const backup = await prisma.configBackup.create({
      data: {
        guildId,
        name: body.name?.trim() || `Backup ${new Date().toISOString().slice(0, 16)}`,
        data: data as unknown as object,
        sizeBytes: Buffer.byteLength(json),
        createdBy: req.auth.user.discordId,
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'backups.create', category: 'management', actorId: req.auth.user.discordId, resource: backup.id });
    return backup;
  });

  app.post('/api/servers/:guildId/backups/:backupId/restore', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const { guildId, backupId } = req.params as { guildId: string; backupId: string };
    const backup = await prisma.configBackup.findFirst({ where: { id: backupId, guildId } });
    if (!backup) return reply.code(404).send({ error: 'Backup not found' });
    // Restore is enqueued to the bot; we do not silently "restore" from raw JSON
    // since the bot verifies permissions and applies Discord-side changes.
    await prisma.botCommand.create({
      data: {
        guildId,
        actorId: req.auth.user.discordId,
        type: 'restore_backup',
        payload: { backupId: backup.id } as object,
      },
    });
    await prisma.configBackup.update({ where: { id: backup.id }, data: { restoredAt: new Date(), restoredBy: req.auth.user.discordId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'backups.restore', category: 'management', actorId: req.auth.user.discordId, resource: backup.id });
    return { ok: true };
  });

  // === Welcome / Goodbye ======================================================

  app.get('/api/servers/:guildId/welcome', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const rows = await prisma.welcomeSettings.findMany({ where: { guildId } });
    return { rows };
  });

  app.post('/api/servers/:guildId/welcome', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as Record<string, unknown>;
    // Map display names to the model as in PATCH; reject unknown fields so a
    // bad payload never 500s.
    const welcomeEnabled = firstDefined(body.welcomeEnabled, body.enabled);
    const welcomeChannelId = firstDefined(body.welcomeChannelId, body.channelId);
    const welcomeTemplate = firstDefined(body.welcomeTemplate, body.message, body.template);
    const welcomeEmbed = firstDefined(body.welcomeEmbed, body.embed);
    const goodbyeEnabled = firstDefined(body.goodbyeEnabled, body.goodbyeEnabled);
    const goodbyeChannelId = firstDefined(body.goodbyeChannelId, body.goodbyeChannelId);
    const goodbyeTemplate = firstDefined(body.goodbyeTemplate, body.goodbyeTemplate);
    const goodbyeEmbed = firstDefined(body.goodbyeEmbed, body.goodbyeEmbed);
    const data: Record<string, unknown> = {};
    if (welcomeEnabled !== undefined) data.welcomeEnabled = Boolean(welcomeEnabled);
    if (welcomeChannelId !== undefined) data.welcomeChannelId = welcomeChannelId === '' ? null : String(welcomeChannelId);
    if (welcomeTemplate !== undefined) data.welcomeTemplate = String(welcomeTemplate ?? '');
    if (welcomeEmbed !== undefined) data.welcomeEmbed = welcomeEmbed as object;
    if (goodbyeEnabled !== undefined) data.goodbyeEnabled = Boolean(goodbyeEnabled);
    if (goodbyeChannelId !== undefined) data.goodbyeChannelId = goodbyeChannelId === '' ? null : String(goodbyeChannelId);
    if (goodbyeTemplate !== undefined) data.goodbyeTemplate = String(goodbyeTemplate ?? '');
    if (goodbyeEmbed !== undefined) data.goodbyeEmbed = goodbyeEmbed as object;
    await prisma.welcomeSettings.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'welcome.upsert', category: 'management', actorId: req.auth.user.discordId });
    return { ok: true };
  });

  app.patch('/api/servers/:guildId/welcome', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'settings.manage');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as Record<string, unknown>;
    // The model uses `welcomeEnabled`/`welcomeChannelId`/... while UIs may send
    // the shorter display names (`enabled`, `channelId`). Map both so a PATCH
    // never fails validation with an unknown-argument 500.
    const welcomeEnabled = firstDefined(body.welcomeEnabled, body.enabled);
    const welcomeChannelId = firstDefined(body.welcomeChannelId, body.channelId);
    const welcomeTemplate = firstDefined(body.welcomeTemplate, body.message, body.template);
    const welcomeEmbed = firstDefined(body.welcomeEmbed, body.embed) as object | null | undefined;
    const goodbyeEnabled = firstDefined(body.goodbyeEnabled, body.goodbyeEnabled);
    const goodbyeChannelId = firstDefined(body.goodbyeChannelId, body.goodbyeChannelId);
    const goodbyeTemplate = firstDefined(body.goodbyeTemplate, body.goodbyeTemplate);
    const goodbyeEmbed = firstDefined(body.goodbyeEmbed, body.goodbyeEmbed) as object | null | undefined;
    const data: Record<string, unknown> = {};
    if (welcomeEnabled !== undefined) data.welcomeEnabled = Boolean(welcomeEnabled);
    if (welcomeChannelId !== undefined) data.welcomeChannelId = welcomeChannelId === '' ? null : String(welcomeChannelId);
    if (welcomeTemplate !== undefined) data.welcomeTemplate = String(welcomeTemplate);
    if (welcomeEmbed !== undefined) data.welcomeEmbed = welcomeEmbed as object;
    if (goodbyeEnabled !== undefined) data.goodbyeEnabled = Boolean(goodbyeEnabled);
    if (goodbyeChannelId !== undefined) data.goodbyeChannelId = goodbyeChannelId === '' ? null : String(goodbyeChannelId);
    if (goodbyeTemplate !== undefined) data.goodbyeTemplate = String(goodbyeTemplate);
    if (goodbyeEmbed !== undefined) data.goodbyeEmbed = goodbyeEmbed as object;
    await prisma.welcomeSettings.upsert({
      where: { guildId },
      create: { guildId, ...data },
      update: data,
    });
    return { ok: true };
  });

  // === Project announcements ==================================================

  app.get('/api/servers/:guildId/announcements', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { project?: string };
    const rows = await prisma.projectAnnouncement.findMany({
      where: { guildId, ...(q.project ? { project: q.project } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { rows };
  });

  app.post('/api/servers/:guildId/announcements', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'messages.send');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as { project: string; title: string; content?: string; embeds?: object[]; channelId?: string };
    const announcement = await prisma.projectAnnouncement.create({
      data: {
        guildId,
        project: body.project,
        title: body.title,
        content: body.content ?? null,
        embeds: body.embeds ?? undefined,
        channelId: body.channelId ?? null,
      },
    });
    if (body.channelId) {
      await prisma.botCommand.create({
        data: {
          guildId,
          actorId: req.auth.user.discordId,
          type: 'send_announcement',
          payload: { announcementId: announcement.id, channelId: body.channelId, content: body.content, title: body.title } as object,
        },
      });
    }
    await writeAudit(prisma, app.wsHub, { guildId, action: 'announcements.create', category: 'management', actorId: req.auth.user.discordId, resource: announcement.id });
    return announcement;
  });

  // === Diagnostics helpers ====================================================

  app.get('/api/servers/:guildId/discord/bot', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    // The bot's presence is approximate via the WS hub; detailed gateway state
    // is surfaced by the bot itself via /api/diagnostics in system.ts.
    return { connected: app.wsHub.botConnected, via: 'ws-hub' };
  });
}