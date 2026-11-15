import { GuildMember, PermissionsBitField } from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import {
  PERMISSION_KEYS,
  expandPermission,
  SENTINEL_ADMIN_ROLE_KEY,
  type PermissionKey,
} from '@sds-sentinel/shared';
import type { RolePermissionEntry, SentinelRoleData } from '@sds-sentinel/permissions';

/**
 * Resolves the effective Sentinel permission set for a Discord member, in the
 * bot process. Enforces the same hierarchy as the backend (see
 * packages/permissions) so a Sentinel role can never grant more than the
 * actor's Discord privileges (owner/ManageGuild) allow.
 */

export interface BotPermissionContext {
  guildId: string;
  userId: string;
  keys: Set<PermissionKey>;
  isGuildOwner: boolean;
  isDiscordAdmin: boolean;
}

const EVERYTHING = new Set(PERMISSION_KEYS as readonly PermissionKey[]);

function hasAnyDiscordAdminPerm(member: GuildMember): boolean {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.BanMembers) ||
    member.permissions.has(PermissionsBitField.Flags.KickMembers)
  );
}

export async function resolveBotPermissions(
  prisma: PrismaClient,
  member: GuildMember,
): Promise<BotPermissionContext> {
  const guildId = member.guild.id;
  const isGuildOwner = member.id === member.guild.ownerId;
  const isDiscordAdmin = hasAnyDiscordAdminPerm(member);

  // Owner and Discord administrators always get every Sentinel permission.
  // This avoids locking out the initial setup when no custom roles exist yet.
  if (isGuildOwner || isDiscordAdmin) {
    return { guildId, userId: member.id, keys: EVERYTHING, isGuildOwner, isDiscordAdmin };
  }

  const [roles, assignments] = await Promise.all([
    prisma.moderationRole.findMany({
      where: { guildId },
      include: { permissions: true },
    }),
    prisma.memberRoleAssignment.findMany({
      where: { guildId, userId: member.id },
    }),
  ]);

  const assignedKeys = new Set(assignments.map((a) => a.roleKey));
  const roleData: SentinelRoleData[] = roles.map((r) => ({
    key: r.key,
    name: r.name,
    isOwnerRole: r.isOwnerRole,
    permissions: r.permissions.map(
      (p): RolePermissionEntry => ({ permission: p.permission, enabled: p.enabled }),
    ),
  }));

  const granted = new Set<string>();
  for (const role of roleData) {
    if (!assignedKeys.has(role.key)) continue;
    if (role.key === SENTINEL_ADMIN_ROLE_KEY) {
      return { guildId, userId: member.id, keys: EVERYTHING, isGuildOwner, isDiscordAdmin };
    }
    for (const entry of role.permissions) {
      if (entry.enabled) {
        for (const expanded of expandPermission(entry.permission)) {
          granted.add(expanded);
        }
      }
    }
  }

  return { guildId, userId: member.id, keys: new Set(granted as unknown as PermissionKey[]), isGuildOwner, isDiscordAdmin };
}

export function hasPermission(ctx: BotPermissionContext, permission: PermissionKey): boolean {
  return ctx.keys.has(permission);
}