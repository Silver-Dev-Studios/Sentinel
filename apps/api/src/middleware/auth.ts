import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { PermissionKey } from '@sds-sentinel/shared';
import { resolveAuth } from '../auth/sessions.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
  }
}

/** Requires a valid session. Populates request.auth. */
export async function requireAuth(prisma: PrismaClient, req: FastifyRequest): Promise<void> {
  const auth = await resolveAuth(prisma, req);
  if (!auth) {
    throw new AuthError('Not authenticated', 401, 'UNAUTHENTICATED');
  }
  req.auth = auth;
}

/** Requires an active, allowlisted server with access for the requester. */
export async function requireGuild(prisma: PrismaClient, req: FastifyRequest): Promise<void> {
  await requireAuth(prisma, req);
  const guildId = (req.params as { guildId?: string } | undefined)?.guildId
    ?? (req.query as { guildId?: string } | undefined)?.guildId;
  if (!guildId) {
    throw new AuthError('guildId is required', 400, 'GUILD_REQUIRED');
  }

  const guild = await prisma.authorizedServer.findUnique({ where: { id: guildId } });
  if (!guild || !guild.active) {
    throw new AuthError('Server is not authorized for Sentinel', 404, 'GUILD_NOT_AUTHORIZED');
  }
  await verifyGuildAccess(prisma, guildId, req.auth.user.discordId, req, guild.ownerId);
  req.guild = guild;
}

/**
 * Verifies the requester is a member of the allowlisted guild and computes the
 * Sentinel permission context. Both the bot and the API must perform this
 * check; the dashboard never gates access on its own.
 */
export async function verifyGuildAccess(
  prisma: PrismaClient,
  guildId: string,
  discordId: string,
  req: FastifyRequest,
  ownerId?: string | null,
): Promise<void> {
  // The guild owner always has access, even if the member-sync has not yet
  // persisted a server_members row (new guild, bot startup, partial sync).
  const isGuildOwner = ownerId === discordId;
  const member = await prisma.serverMember.findUnique({
    where: { guildId_userId: { guildId, userId: discordId } },
  });
  if (!member && !isGuildOwner) {
    throw new AuthError('You do not have access to this server', 403, 'GUILD_ACCESS_DENIED');
  }
  const [roles, assignments] = await Promise.all([
    prisma.moderationRole.findMany({
      where: { guildId },
      include: { permissions: true },
    }),
    prisma.memberRoleAssignment.findMany({ where: { guildId, userId: discordId } }),
  ]);
  const permissionContextRoles = roles.map((role) => ({
    key: role.key,
    name: role.name,
    isOwnerRole: role.isOwnerRole,
    permissions: role.permissions.map((p) => ({ permission: p.permission, enabled: p.enabled })),
  }));
  const ctx: import('@sds-sentinel/permissions').PermissionContext = {
    guildId,
    userId: discordId,
    discordRoleIds: member?.discordRoles ?? [],
    assignedRoleKeys: assignments.map((a) => a.roleKey),
    roles: permissionContextRoles,
    isGuildOwner,
    // Discord administrators should never be locked out either. The bot
    // resolves this from live Discord member state; the API can't fully
    // replicate that without extra data, so it relies on the owner bypass
    // and role membership (member row existing) for everyone else.
    isDiscordAdmin: false,
  };
  req.permissions = ctx;
}