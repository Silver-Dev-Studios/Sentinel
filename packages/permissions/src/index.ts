import {
  expandPermission,
  PERMISSION_KEYS,
  PERMISSION_READ_SIBLING,
  SENTINEL_ADMIN_ROLE_KEY,
  type PermissionKey,
} from '@sds-sentinel/shared';

export interface RolePermissionEntry {
  permission: string;
  enabled: boolean;
}

export interface SentinelRoleData {
  key: string;
  name: string;
  isOwnerRole: boolean;
  permissions: RolePermissionEntry[];
}

/**
 * The invocation context used to authorize an action. Both the bot and the
 * backend construct one of these when a moderator performs an action.
 */
export interface PermissionContext {
  guildId: string;
  /** Discord user snowflake */
  userId: string;
  /** Discord roles for the actor (snowflakes) — used for interim Discord-role mapping */
  discordRoleIds: string[];
  /** Custom Sentinel roles resolved for the actor (keys) */
  assignedRoleKeys: string[];
  roles: SentinelRoleData[];
  /** Set when the actor is the guild owner (always implicitly Sentinel owner) */
  isGuildOwner: boolean;
  /** Set when the actor is a Discord administrator (fallback owners group) */
  isDiscordAdmin: boolean;
}

function rolesForKeys(roles: SentinelRoleData[], keys: string[]): SentinelRoleData[] {
  if (keys.includes(SENTINEL_ADMIN_ROLE_KEY)) {
    return roles;
  }
  return roles.filter((r) => keys.includes(r.key));
}

/**
 * Resolves the concrete permission keys a context can use.
 *
 * Rules:
 * - The fixed Sentinel admin role implies every permission.
 * - Guild owners and Discord administrators (with ManageGuild) fall back to the
 *   owner permission set so an unconfigured fresh guild is never locked out.
 * - A concrete permission implies its read sibling (e.g. moderation.ban → moderation.view).
 * - Wildcard entries (e.g. security.*) expand to their members.
 */
export function resolveEffectivePermissions(ctx: PermissionContext): Set<PermissionKey> {
  if (ctx.isGuildOwner || ctx.isDiscordAdmin) {
    return new Set(PERMISSION_KEYS);
  }

  const granted = new Set<string>();
  for (const role of rolesForKeys(ctx.roles, ctx.assignedRoleKeys)) {
    if (role.key === SENTINEL_ADMIN_ROLE_KEY) {
      return new Set(PERMISSION_KEYS);
    }
    for (const entry of role.permissions) {
      if (entry.enabled) {
        for (const expanded of expandPermission(entry.permission)) {
          granted.add(expanded);
        }
      }
    }
  }

  const effective = new Set<PermissionKey>();
  for (const key of granted) {
    effective.add(key as PermissionKey);
    const sibling = PERMISSION_READ_SIBLING[key as PermissionKey];
    if (sibling) {
      effective.add(sibling);
    }
  }
  return effective;
}

/** Does the context hold the given permission? */
export function can(ctx: PermissionContext, permission: PermissionKey): boolean {
  if (ctx.isGuildOwner || ctx.isDiscordAdmin) {
    return true;
  }
  return resolveEffectivePermissions(ctx).has(permission);
}

/** Does the context hold ANY of the given permissions? */
export function canAny(ctx: PermissionContext, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => can(ctx, p));
}

/** Does the context hold ALL of the given permissions? */
export function canAll(ctx: PermissionContext, permissions: PermissionKey[]): boolean {
  return permissions.every((p) => can(ctx, p));
}

/**
 * The effective set of permissions expressed as a sorted list of "granted"
 * permission keys plus an explicit note about escalation floors.
 */
export function effectivePermissionsForDashboard(ctx: PermissionContext): {
  granted: PermissionKey[];
  isOwner: boolean;
} {
  const set = resolveEffectivePermissions(ctx);
  return {
    granted: Array.from(set).sort(),
    isOwner: ctx.isGuildOwner || ctx.isDiscordAdmin || ctx.assignedRoleKeys.includes(SENTINEL_ADMIN_ROLE_KEY),
  };
}

export { expandPermission, PERMISSION_KEYS, SENTINEL_ADMIN_ROLE_KEY };
export type { PermissionKey };

/**
 * A permission entry change request. Validated by the caller before being
 * applied to the database.
 */
export interface PermissionChange {
  roleKey: string;
  permission: string;
  enabled: boolean;
}