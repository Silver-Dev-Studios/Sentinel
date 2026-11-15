import { z } from 'zod';
import { PERMISSION_KEYS, expandPermission, type ActionSource } from '@sds-sentinel/shared';

// Shared low-level scalars ---------------------------------------------------

export const snowflake = z
  .string()
  .regex(/^[0-9]{1,25}$/, 'Invalid Discord snowflake')
  .max(25);

export const guildIdSchema = snowflake.describe('Discord guild ID');

export const reasonSchema = z
  .string()
  .trim()
  .min(1, 'Reason is required')
  .max(1024, 'Reason too long');

export const optionalReasonSchema = z.string().trim().max(1024).optional().nullable();

export const actionSourceSchema = z.enum(['discord_command', 'dashboard']).default('dashboard') as z.ZodType<ActionSource, any, any>;

// Moderation ----------------------------------------------------------------

export const moderateTargetSchema = z.object({
  guildId: guildIdSchema,
  targetId: snowflake.describe('target Discord user id'),
  reason: optionalReasonSchema,
  days: z.number().int().min(0).max(7).optional().describe('delete messages days for ban'),
});

export const banInputSchema = z.object({
  targetId: snowflake,
  reason: optionalReasonSchema,
  deleteDays: z.number().int().min(0).max(7).default(0),
});

export const timeoutInputSchema = z.object({
  targetId: snowflake,
  durationMinutes: z.number().int().min(1).max(10080),
  reason: optionalReasonSchema,
});

export const warnInputSchema = z.object({
  targetId: snowflake,
  reason: reasonSchema,
});

export const purgeInputSchema = z.object({
  channelId: snowflake,
  amount: z.number().int().min(1).max(500),
  reason: optionalReasonSchema,
});

export const lockInputSchema = z.object({
  channelId: snowflake,
  reason: optionalReasonSchema,
});

// Sentinel custom roles ------------------------------------------------------

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(64),
  description: z.string().trim().max(256).optional(),
  permissions: z
    .array(z.string().min(1).max(64))
    .refine((permissions) => permissions.every((p) => expandPermission(p).length > 0), {
      message: 'One or more permissions are not recognized',
    })
    .optional(),
});

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(64).optional(),
  description: z.string().trim().max(256).optional().nullable(),
});

export const assignRoleSchema = z.object({
  userId: snowflake,
  roleKey: z
    .string()
    .min(1)
    .max(128)
    .refine((key) => key !== 'sentinel-admin', { message: 'sentinel-admin cannot be assigned manually' }),
});

export const permissionUpdateSchema = z.object({
  permission: z
    .string()
    .min(1)
    .max(64)
    .refine((p) => expandPermission(p).length > 0 || p === '*', { message: 'Unknown permission' }),
  enabled: z.boolean(),
});

export const grantedPermissionsSchema = z.object({
  // Permission key map for dashboard usage
  granted: z.array(z.string()),
  isOwner: z.boolean(),
});

// Security --------------------------------------------------------------------

export const antiRaidConfigSchema = z.object({
  antiRaidEnabled: z.boolean(),
  antiRaidJoinThreshold: z.number().int().min(2).max(1000),
  antiRaidWindowSeconds: z.number().int().min(10).max(3600),
  antiRaidAccountAgeSeconds: z.number().int().min(0).max(2592000),
  antiRaidResponse: z.enum(['alert', 'lockdown', 'kick']),
});

export const antiNukeConfigSchema = z.object({
  antiNukeEnabled: z.boolean(),
  antiNukeChannelDeleteThreshold: z.number().int().min(1).max(100),
  antiNukeRoleDeleteThreshold: z.number().int().min(1).max(100),
  antiNukeBanThreshold: z.number().int().min(1).max(100),
  antiNukeWindowSeconds: z.number().int().min(10).max(3600),
  antiNukeResponse: z.enum(['alert', 'lockdown']),
});

export const antiSpamConfigSchema = z.object({
  antiSpamEnabled: z.boolean(),
  antiSpamMaxMessages: z.number().int().min(2).max(100),
  antiSpamWindowSeconds: z.number().int().min(1).max(600),
  antiSpamMaxMentions: z.number().int().min(1).max(200),
  antiSpamEscalation: z.enum(['warn', 'timeout']),
  antiSpamTimeoutSeconds: z.number().int().min(10).max(604800),
});

export const securityUpdateSchema = z.object({
  antiRaid: antiRaidConfigSchema.partial().optional(),
  antiNuke: antiNukeConfigSchema.partial().optional(),
  antiSpam: antiSpamConfigSchema.partial().optional(),
  permissionScanEnabled: z.boolean().optional(),
  trustedAdminIds: z.array(snowflake).optional(),
});

export const lockdownActivateSchema = z.object({
  channels: z.array(snowflake).optional(),
  roleId: snowflake.optional(),
  pingRoleId: snowflake.optional(),
});

export const autoModRuleSchema = z.object({
  name: z.string().trim().min(2).max(64),
  kind: z.enum(['spam', 'repeated_message', 'mention_spam', 'suspicious_link', 'invite_filter', 'word_filter', 'attachment_flood', 'raid_behavior']),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  action: z.enum(['warn', 'timeout', 'delete', 'kick']).default('warn'),
  timeoutSeconds: z.number().int().min(1).max(604800).optional().nullable(),
  channelIds: z.array(snowflake).optional().default([]),
});

// Messages -------------------------------------------------------------------

export const embedFieldSchema = z.object({
  name: z.string().trim().min(1).max(256),
  value: z.string().trim().min(1).max(1024),
  inline: z.boolean().default(false),
});

export const embedSchema = z.object({
  title: z.string().trim().max(256).optional(),
  description: z.string().max(4096).optional(),
  url: z.string().url().max(2048).optional(),
  color: z.number().int().min(0).max(16777215).optional(),
  timestamp: z.string().datetime().optional(),
  author: z.object({ name: z.string().max(256), icon_url: z.string().url().optional() }).optional(),
  thumbnail: z.object({ url: z.string().url() }).optional(),
  image: z.object({ url: z.string().url() }).optional(),
  footer: z.object({ text: z.string().max(2048), icon_url: z.string().url().optional() }).optional(),
  fields: z.array(embedFieldSchema).max(25).optional(),
});

export const messageSendSchema = z
  .object({
    guildId: guildIdSchema,
    channelIds: z.array(snowflake).min(1, 'At least one channel is required'),
    content: z.string().trim().max(2000).optional(),
    embeds: z.array(embedSchema).max(10).optional(),
  })
  .refine((m) => m.content || (m.embeds && m.embeds.length > 0), {
    message: 'Message must have content or at least one embed',
  });

export const templateCreateSchema = z.object({
  name: z.string().trim().min(2).max(64),
  kind: z.enum(['message', 'embed']),
  content: z.string().trim().max(2000).optional(),
  embeds: z.array(embedSchema).max(10).optional(),
  channelIds: z.array(snowflake).optional(),
});

export const scheduleMessageSchema = z
  .object({
    channelIds: z.array(snowflake).min(1, 'At least one channel is required'),
    content: z.string().trim().max(2000).optional(),
    embeds: z.array(embedSchema).max(10).optional(),
    scheduledFor: z.string().datetime({ offset: true }),
    recurring: z.string().max(64).optional(),
    name: z.string().trim().max(64).optional(),
  })
  .refine((m) => m.content || (m.embeds && m.embeds.length > 0), {
    message: 'Message must have content or at least one embed',
  });

// Events ---------------------------------------------------------------------

export const eventCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(1024).optional(),
  image: z.string().url().optional(),
  channelId: snowflake.optional(),
  location: z.string().max(160).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional(),
  rsvpEnabled: z.boolean().default(true),
  reminderMinutes: z.array(z.number().int().min(1).max(10080)).optional(),
});

// Tickets --------------------------------------------------------------------

export const ticketPanelSchema = z.object({
  name: z.string().trim().min(2).max(64),
  category: z.string().trim().min(2).max(64),
  description: z.string().trim().max(512).optional(),
  emoji: z.string().max(8).optional(),
  channelId: snowflake.optional(),
  openingMessage: z.string().trim().max(2000).optional(),
  questions: z.array(z.string().max(256)).max(10).optional(),
  staffRoleIds: z.array(snowflake).optional(),
});

export const ticketCloseSchema = z.object({
  reason: optionalReasonSchema,
  transcript: z.boolean().default(true),
});

// Giveaways ------------------------------------------------------------------

export const giveawayCreateSchema = z.object({
  channelId: snowflake,
  prize: z.string().trim().min(1).max(256),
  description: z.string().trim().max(1024).optional(),
  winnerCount: z.number().int().min(1).max(100),
  durationMinutes: z.number().int().min(1).max(10080),
  requirements: z.record(z.unknown()).optional(),
});

// Custom commands ------------------------------------------------------------

export const customCommandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9-_]+$/, 'Command names may only contain letters, numbers, dashes and underscores'),
  kind: z.enum(['prefix', 'slash']),
  description: z.string().trim().max(100).optional(),
  content: z.string().trim().max(2000).optional(),
  embeds: z.array(embedSchema).max(10).optional(),
  aliases: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  requiredPermission: z.string().max(64).optional().nullable(),
  enabled: z.boolean().default(true),
});

// Scheduler ------------------------------------------------------------------

export const scheduledTaskSchema = z.object({
  name: z.string().trim().min(2).max(64),
  type: z.enum(['announcement', 'embed', 'event_reminder', 'recurring_announcement', 'reminder', 'giveaway_end']),
  channelId: snowflake.optional(),
  content: z.string().trim().max(2000).optional(),
  embeds: z.array(embedSchema).max(10).optional(),
  runAt: z.string().datetime({ offset: true }),
  recurring: z.string().max(64).optional(),
  timezone: z.string().max(64).default('UTC'),
});

// Analytics ------------------------------------------------------------------

export const analyticsQuerySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'compare']).default('daily'),
  days: z.coerce.number().int().min(1).max(180).default(30),
});

export const PAGINATION = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export { PERMISSION_KEYS };