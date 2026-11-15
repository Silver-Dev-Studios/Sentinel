import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PermissionKey } from '@sds-sentinel/shared';
import { can } from '@sds-sentinel/permissions';
import { requireGuild, AuthError } from './auth.js';

/**
 * Fastify preHandler that authenticates the request and resolves the guild
 * scope + permission context from :guildId. Applies to every guild-scoped route.
 */
export async function guildGuard(this: FastifyInstance, req: FastifyRequest): Promise<void> {
  await requireGuild(this.prisma, req);
}

/**
 * Returns true when the resolved permission context allows `permission`.
 * Must run after `guildGuard` so `req.permissions` is populated.
 */
export function hasPerm(req: FastifyRequest, permission: PermissionKey): boolean {
  if (!req.permissions) return false;
  return can(req.permissions, permission);
}

/** Throws a 403 when the permission is missing. */
export function ensurePerm(req: FastifyRequest, permission: PermissionKey): void {
  if (!hasPerm(req, permission)) {
    throw new AuthError('Insufficient permissions', 403, 'FORBIDDEN');
  }
}

export { requireGuild, AuthError };
export type { FastifyReply };
export interface GuildRouteQuery {
  guildId: string;
}