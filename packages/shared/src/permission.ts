/**
 * Sentinel application-level permission model.
 *
 * Sentinel permissions are application-level capabilities, not Discord role
 * permission overrides. They are enforced by the backend and the bot — the
 * dashboard never controls access by itself.
 *
 * A permission is a dotted capability key (e.g. `moderation.ban`). Wildcard
 * suffixes are supported: `security.*` implies every `security.*` permission.
 * Every guild-scoped permission also grants its `read` sibling implicitly at
 * the application level (see {@link PERMISSION_READ_SIBLING}).
 */

export const READ_SIBLING = 'read' as const;

/** Sentinel permission keys. */
export const PERMISSIONS = {
  // Moderation
  'moderation.ban': 'Ban / Unban',
  'moderation.untime': 'Time / Untime',
  'moderation.mute': 'Mute / Unmute',
  'moderation.kick': 'Kick',
  'moderation.lock': 'Lock / Unlock',
  'moderation.purge': 'Purge',
  'moderation.purgeList': 'Purge List',
  'moderation.snipe': 'Snipe',
  'moderation.snipeList': 'Snipe List',
  'moderation.warn': 'Warning Management',
  'moderation.view': 'Moderation Log Access',
  // Ticketing
  'tickets.manage': 'Ticket Management',
  // Giveaways
  'giveaways.manage': 'Giveaway Management',
  // Events
  'events.manage': 'Event Management',
  // Messages
  'messages.manage': 'Message Management',
  'messages.send': 'Send Messages',
  'messages.schedule': 'Schedule Messages',
  // Scheduler
  'scheduler.manage': 'Scheduler Management',
  // Custom Commands
  'commands.manage': 'Custom Command Management',
  // Security
  'security.report': 'Security Report Access',
  'security.automod': 'AutoMod Management',
  // Roles
  'roles.manage': 'Custom Role Management',
  // Analytics
  'analytics.view': 'Analytics Access',
  // Audit
  'audit.view': 'Audit Center Access',
  'system.audit': 'System Audit Access',
  // Settings
  'settings.manage': 'Settings Management',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type PermissionLabel = (typeof PERMISSIONS)[PermissionKey];

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export const PERMISSION_LABELS: Record<PermissionKey, PermissionLabel> = PERMISSIONS;

/** Dashboard page that a permission maps to (used to gate frontend navigation). */
export const PERMISSION_PAGE: Record<PermissionKey, string | null> = {
  'moderation.ban': 'moderation',
  'moderation.untime': 'moderation',
  'moderation.mute': 'moderation',
  'moderation.kick': 'moderation',
  'moderation.lock': 'moderation',
  'moderation.purge': 'moderation',
  'moderation.purgeList': 'moderation',
  'moderation.snipe': 'moderation',
  'moderation.snipeList': 'moderation',
  'moderation.warn': 'moderation',
  'moderation.view': 'moderation',
  'tickets.manage': 'tickets',
  'giveaways.manage': 'giveaways',
  'events.manage': 'events',
  'messages.manage': 'messages',
  'security.report': 'security',
  'security.automod': 'security',
  'roles.manage': 'roles',
  'analytics.view': 'analytics',
  'audit.view': 'system',
  'system.audit': 'system',
  'settings.manage': 'system',
  'messages.send': 'messages',
  'messages.schedule': 'scheduler',
  'scheduler.manage': 'scheduler',
  'commands.manage': 'commands',
};

/** Wildcard group → expanded permission keys. */
const WILDCARD_GROUPS: Record<string, PermissionKey[]> = {
  'moderation.*': [
    'moderation.ban',
    'moderation.untime',
    'moderation.mute',
    'moderation.kick',
    'moderation.lock',
    'moderation.purge',
    'moderation.purgeList',
    'moderation.snipe',
    'moderation.snipeList',
    'moderation.warn',
  ],
  'security.*': ['security.report', 'security.automod'],
  'analytics.*': ['analytics.view'],
  'audit.*': ['audit.view'],
  'system.*': ['system.audit'],
  'tickets.*': ['tickets.manage'],
  'giveaways.*': ['giveaways.manage'],
  'events.*': ['events.manage'],
  'messages.*': ['messages.manage', 'messages.send', 'messages.schedule'],
  'scheduler.*': ['scheduler.manage', 'messages.schedule'],
  'commands.*': ['commands.manage'],
  'roles.*': ['roles.manage'],
  'settings.*': ['settings.manage'],
  '*': PERMISSION_KEYS,
};

const WILDCARD_PREFIXES = [
  'moderation.',
  'security.',
  'analytics.',
  'audit.',
  'system.',
  'tickets.',
  'giveaways.',
  'events.',
  'messages.',
  'scheduler.',
  'commands.',
  'roles.',
  'settings.',
] as const;

/** Expands any permission key including wildcards into concrete key(s). */
export function expandPermission(perm: string): PermissionKey[] {
  if (perm === '*') {
    return [...PERMISSION_KEYS];
  }
  if (perm in WILDCARD_GROUPS) {
    return [...WILDCARD_GROUPS[perm]];
  }
  if (perm.endsWith('.*')) {
    const prefix = perm.slice(0, -1);
    if ((WILDCARD_PREFIXES as readonly string[]).includes(prefix)) {
      return PERMISSION_KEYS.filter((k) => k.startsWith(prefix));
    }
  }
  return (PERMISSION_KEYS as readonly string[]).includes(perm) ? [perm as PermissionKey] : [];
}

/**
 * Read-sibling map: knowing a guild-scoped permission implies basic `read`
 * access to related data. `moderation.ban` implies `moderation.view`, for
 * example. There is no sibling for read-only permissions.
 */
export const PERMISSION_READ_SIBLING: Partial<Record<PermissionKey, PermissionKey>> = {
  'moderation.ban': 'moderation.view',
  'moderation.untime': 'moderation.view',
  'moderation.mute': 'moderation.view',
  'moderation.kick': 'moderation.view',
  'moderation.lock': 'moderation.view',
  'moderation.purge': 'moderation.view',
  'moderation.purgeList': 'moderation.view',
  'moderation.snipe': 'moderation.view',
  'moderation.snipeList': 'moderation.view',
  'moderation.warn': 'moderation.view',
  'tickets.manage': 'tickets.manage',
  'giveaways.manage': 'giveaways.manage',
  'events.manage': 'events.manage',
  'messages.manage': 'messages.manage',
  'security.automod': 'security.report',
  'roles.manage': 'roles.manage',
  'settings.manage': 'settings.manage',
};

/**
 * The single fixed, non-editable role: full access to every Sentinel
 * capability. Assigned to server owners by the bot when a guild is authorized.
 */
export const SENTINEL_ADMIN_ROLE_KEY = 'sentinel-admin';

export const OWNER_PERMISSIONS: PermissionKey[] = [...PERMISSION_KEYS];