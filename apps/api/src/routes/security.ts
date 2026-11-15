import type { FastifyInstance } from 'fastify';
import { guildGuard, ensurePerm } from '../middleware/guards.js';
import { writeAudit } from '../services/audit.js';
import { recordActivity } from '../ws/hub.js';
import { computeSecurityReport, DEFAULT_AUTOMOD_PRESETS } from '../services/security.js';
import { securityUpdateSchema, lockdownActivateSchema, autoModRuleSchema } from '@sds-sentinel/validation';

export async function registerSecurityRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // ---- Security settings ----------------------------------------------------

  app.get('/api/servers/:guildId/security', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const [settings, autoMod, assessments] = await Promise.all([
      prisma.securitySettings.findUnique({ where: { guildId } }),
      prisma.autoModRule.findMany({ where: { guildId }, orderBy: { createdAt: 'asc' } }),
      prisma.securityAssessment.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return {
      settings: settings ?? { guildId, antiRaidEnabled: false, antiNukeEnabled: false, antiSpamEnabled: false },
      autoModRules: autoMod,
      assessments: assessments.map((a) => ({ score: a.score, createdAt: a.createdAt })),
    };
  });

  app.patch('/api/servers/:guildId/security', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'security.automod');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = securityUpdateSchema.parse(req.body);
    const existing = await prisma.securitySettings.findUnique({ where: { guildId } });
    const flat = {
      guildId,
      antiRaidEnabled: body.antiRaid?.antiRaidEnabled ?? existing?.antiRaidEnabled ?? false,
      antiRaidJoinThreshold: body.antiRaid?.antiRaidJoinThreshold ?? existing?.antiRaidJoinThreshold ?? 10,
      antiRaidWindowSeconds: body.antiRaid?.antiRaidWindowSeconds ?? existing?.antiRaidWindowSeconds ?? 60,
      antiRaidAccountAgeSeconds: body.antiRaid?.antiRaidAccountAgeSeconds ?? existing?.antiRaidAccountAgeSeconds ?? 86400,
      antiRaidResponse: body.antiRaid?.antiRaidResponse ?? existing?.antiRaidResponse ?? 'alert',
      antiNukeEnabled: body.antiNuke?.antiNukeEnabled ?? existing?.antiNukeEnabled ?? false,
      antiNukeChannelDeleteThreshold: body.antiNuke?.antiNukeChannelDeleteThreshold ?? existing?.antiNukeChannelDeleteThreshold ?? 3,
      antiNukeRoleDeleteThreshold: body.antiNuke?.antiNukeRoleDeleteThreshold ?? existing?.antiNukeRoleDeleteThreshold ?? 3,
      antiNukeBanThreshold: body.antiNuke?.antiNukeBanThreshold ?? existing?.antiNukeBanThreshold ?? 5,
      antiNukeWindowSeconds: body.antiNuke?.antiNukeWindowSeconds ?? existing?.antiNukeWindowSeconds ?? 60,
      antiNukeResponse: body.antiNuke?.antiNukeResponse ?? existing?.antiNukeResponse ?? 'alert',
      antiSpamEnabled: body.antiSpam?.antiSpamEnabled ?? existing?.antiSpamEnabled ?? false,
      antiSpamMaxMessages: body.antiSpam?.antiSpamMaxMessages ?? existing?.antiSpamMaxMessages ?? 5,
      antiSpamWindowSeconds: body.antiSpam?.antiSpamWindowSeconds ?? existing?.antiSpamWindowSeconds ?? 5,
      antiSpamMaxMentions: body.antiSpam?.antiSpamMaxMentions ?? existing?.antiSpamMaxMentions ?? 4,
      antiSpamEscalation: body.antiSpam?.antiSpamEscalation ?? existing?.antiSpamEscalation ?? 'warn',
      antiSpamTimeoutSeconds: body.antiSpam?.antiSpamTimeoutSeconds ?? existing?.antiSpamTimeoutSeconds ?? 600,
      permissionScanEnabled: body.permissionScanEnabled ?? existing?.permissionScanEnabled ?? true,
      trustedAdminIds: body.trustedAdminIds ?? existing?.trustedAdminIds ?? [],
    };
    await prisma.securitySettings.upsert({ where: { guildId }, create: flat, update: flat });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'security.update', category: 'security', actorId: req.auth.user.discordId, detail: body });
    await recordActivity(prisma, app.wsHub, { guildId, type: 'config_change', actorId: req.auth.user.discordId, message: 'Security settings updated' });
    return { ok: true };
  });

  // ---- Security strength report ---------------------------------------------

  app.get('/api/servers/:guildId/security/report', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const report = await computeSecurityReport(prisma, guildId);
    return report;
  });

  // ---- AutoMod --------------------------------------------------------------

  app.get('/api/servers/:guildId/automod', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const [rules, settings] = await Promise.all([
      prisma.autoModRule.findMany({ where: { guildId }, orderBy: { name: 'asc' } }),
      prisma.autoModSettings.findUnique({ where: { guildId } }),
    ]);
    return { rules, settings: settings ?? { guildId, enabled: true }, presets: DEFAULT_AUTOMOD_PRESETS };
  });

  app.post('/api/servers/:guildId/automod/rules', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'security.automod');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = autoModRuleSchema.parse(req.body);
    const rule = await prisma.autoModRule.create({
      data: {
        guildId,
        name: body.name,
        kind: body.kind,
        enabled: body.enabled,
        config: body.config as object,
        action: body.action,
        timeoutSeconds: body.timeoutSeconds ?? null,
        channelIds: body.channelIds,
      },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'automod.rule.create', category: 'security', actorId: req.auth.user.discordId, resource: rule.id });
    return rule;
  });

  app.patch('/api/servers/:guildId/automod/rules/:ruleId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'security.automod');
    const { guildId, ruleId } = req.params as { guildId: string; ruleId: string };
    const body = autoModRuleSchema.partial().parse(req.body);
    const rule = await prisma.autoModRule.findFirst({ where: { id: ruleId, guildId } });
    if (!rule) return reply.code(404).send({ error: 'Rule not found' });
    await prisma.autoModRule.update({ where: { id: rule.id }, data: { ...body, config: body.config as object | undefined } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'automod.rule.update', category: 'security', actorId: req.auth.user.discordId, resource: rule.id });
    return { ok: true };
  });

  app.delete('/api/servers/:guildId/automod/rules/:ruleId', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'security.automod');
    const { guildId, ruleId } = req.params as { guildId: string; ruleId: string };
    await prisma.autoModRule.deleteMany({ where: { id: ruleId, guildId } });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'automod.rule.delete', category: 'security', actorId: req.auth.user.discordId, resource: ruleId });
    return { ok: true };
  });

  app.patch('/api/servers/:guildId/automod/settings', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    ensurePerm(req, 'security.automod');
    const guildId = (req.params as { guildId: string }).guildId;
    const body = req.body as { enabled?: boolean; warnCooldownSeconds?: number; timeoutCooldownSeconds?: number };
    await prisma.autoModSettings.upsert({
      where: { guildId },
      create: { guildId, ...body },
      update: body,
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'automod.settings.update', category: 'security', actorId: req.auth.user.discordId, detail: body });
    return { ok: true };
  });

  // ---- Security events ------------------------------------------------------

  app.get('/api/servers/:guildId/security/events', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    const q = req.query as { limit?: string; kind?: string };
    const rows = await prisma.securityEvent.findMany({
      where: { guildId, ...(q.kind ? { kind: q.kind } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(q.limit ?? 100), 200),
    });
    return { rows };
  });

  app.post('/api/servers/:guildId/security/events/:eventId/ack', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const { guildId, eventId } = req.params as { guildId: string; eventId: string };
    await prisma.securityEvent.updateMany({
      where: { id: eventId, guildId },
      data: { acknowledgedAt: new Date(), acknowledgedById: req.auth.user.discordId },
    });
    return { ok: true };
  });

  // ---- Emergency lockdown ----------------------------------------------------

  app.post('/api/servers/:guildId/security/lockdown/activate', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    // Lockdown is a deliberate, reviewable emergency action; treated as
    // security.report-level access to match the Security Overview.
    ensurePerm(req, 'security.report');
    const body = lockdownActivateSchema.parse(req.body);
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'lockdown_activate',
      payload: { channels: body.channels ?? [], roleId: body.roleId, pingRoleId: body.pingRoleId },
    });
    await prisma.securitySettings.upsert({
      where: { guildId },
      create: { guildId, lockdownActive: true, lockdownActivatedBy: req.auth.user.discordId, lockdownActivatedAt: new Date() },
      update: { lockdownActive: true, lockdownActivatedBy: req.auth.user.discordId, lockdownActivatedAt: new Date() },
    });
    await writeAudit(prisma, app.wsHub, { guildId, action: 'security.lockdown.activate', category: 'security', actorId: req.auth.user.discordId });
    await recordActivity(prisma, app.wsHub, { guildId, type: 'security', actorId: req.auth.user.discordId, message: 'Emergency lockdown ACTIVATED' });
    return { queued: true, commandId, lockdownActive: true };
  });

  app.post('/api/servers/:guildId/security/lockdown/deactivate', { preHandler: [guildGuard.bind(app)] }, async (req, reply) => {
    const guildId = (req.params as { guildId: string }).guildId;
    ensurePerm(req, 'security.report');
    const { id: commandId } = await app.botNotifier.enqueue({
      guildId,
      actorId: req.auth.user.discordId,
      type: 'lockdown_deactivate',
      payload: {},
    });
    await prisma.securitySettings.update({ where: { guildId }, data: { lockdownActive: false } }).catch(() => undefined);
    await writeAudit(prisma, app.wsHub, { guildId, action: 'security.lockdown.deactivate', category: 'security', actorId: req.auth.user.discordId });
    await recordActivity(prisma, app.wsHub, { guildId, type: 'security', actorId: req.auth.user.discordId, message: 'Emergency lockdown deactivated' });
    return { queued: true, commandId, lockdownActive: false };
  });
}