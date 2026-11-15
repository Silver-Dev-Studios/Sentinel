import type { PrismaClient } from '@sds-sentinel/database';
import { getPrisma } from '@sds-sentinel/database';
import type { ServiceDeps } from './types.js';

/**
 * Default ServiceDeps backed by Prisma. Used by both the bot process and the
 * API process so case numbering, warnings, and member records stay consistent.
 */
export function createPrismaDeps(prisma?: PrismaClient): ServiceDeps {
  const db = prisma ?? getPrisma();

  async function nextCaseNumber(guildId: string): Promise<number> {
    const latest = await db.moderationCase.findFirst({
      where: { guildId },
      orderBy: { caseNumber: 'desc' },
      select: { caseNumber: true },
    });
    return (latest?.caseNumber ?? 0) + 1;
  }

  return {
    async saveCase(opts) {
      const caseNumber = await nextCaseNumber(opts.guildId);
      const record = await db.moderationCase.create({
        data: {
          guildId: opts.guildId,
          caseNumber,
          action: opts.action,
          moderatorId: opts.actor.userId,
          targetId: opts.targetId ?? null,
          reason: opts.reason ?? null,
          source: opts.actor.source,
          commandName: opts.actor.commandName ?? null,
          detail: opts.detail ? (opts.detail as object) : undefined,
          channelId: opts.channelId ?? null,
          messageId: opts.messageId ?? null,
        },
      });
      return { id: record.id, caseNumber };
    },

    async recordWarn(opts) {
      await db.moderationWarning.create({
        data: {
          guildId: opts.guildId,
          memberId: opts.memberId,
          moderatorId: opts.moderatorId,
          reason: opts.reason,
        },
      });
      // Upsert the member row so the warnings relation is guaranteed
      await db.serverMember.upsert({
        where: { guildId_userId: { guildId: opts.guildId, userId: opts.memberId } },
        create: { guildId: opts.guildId, userId: opts.memberId, username: opts.moderatorId },
        update: {},
      }).catch(() => undefined);
      await db.serverMember.upsert({
        where: { guildId_userId: { guildId: opts.guildId, userId: opts.moderatorId } },
        create: { guildId: opts.guildId, userId: opts.moderatorId, username: opts.moderatorId },
        update: {},
      }).catch(() => undefined);
    },

    async upsertMember(opts) {
      await db.serverMember.upsert({
        where: { guildId_userId: { guildId: opts.guildId, userId: opts.userId } },
        create: {
          guildId: opts.guildId,
          userId: opts.userId,
          username: opts.username ?? opts.userId,
          displayName: opts.displayName ?? null,
          avatar: opts.avatar ?? null,
          joinedAt: opts.joinedAt ?? null,
        },
        update: {
          username: opts.username,
          displayName: opts.displayName,
          avatar: opts.avatar,
        },
      });
    },
  };
}