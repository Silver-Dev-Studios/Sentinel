import type { PrismaClient } from '@prisma/client';
import type { WsHub } from '../ws/hub.js';

export interface WriteAuditInput {
  guildId?: string;
  action: string;
  category: string;
  actorId?: string | null;
  targetId?: string | null;
  resource?: string;
  detail?: Record<string, unknown>;
  ipHash?: string | null;
}

/**
 * Write an immutable audit record. Records are only ever inserted; there is no
 * update path in Sentinel. Retention cleanup uses deletes only.
 */
export async function writeAudit(prisma: PrismaClient, hub: WsHub | null, input: WriteAuditInput): Promise<void> {
  const record = await prisma.auditLog.create({
    data: {
      guildId: input.guildId ?? '',
      action: input.action,
      category: input.category,
      actorId: input.actorId ?? null,
      targetId: input.targetId ?? null,
      resource: input.resource ?? null,
      detail: input.detail ? (input.detail as object) : undefined,
      ipHash: input.ipHash ?? null,
    },
  });
  if (hub && input.guildId) {
    hub.publish({
      type: 'audit',
      guildId: input.guildId,
      event: {
        id: record.id,
        action: record.action,
        category: record.category,
        actorId: record.actorId,
        targetId: record.targetId,
        resource: record.resource,
        createdAt: record.createdAt.toISOString(),
      },
    });
  }
}

export interface QueryAuditInput {
  guildId?: string;
  category?: string;
  actorId?: string;
  resource?: string;
  from?: Date;
  to?: Date;
  page: number;
  pageSize: number;
}

export async function queryAudit(prisma: PrismaClient, input: QueryAuditInput) {
  const where: Record<string, unknown> = {};
  if (input.guildId) where.guildId = input.guildId;
  if (input.category) where.category = input.category;
  if (input.actorId) where.actorId = input.actorId;
  if (input.resource) where.resource = { contains: input.resource, mode: 'insensitive' };
  if (input.from || input.to) {
    where.createdAt = {
      ...(input.from ? { gte: input.from } : {}),
      ...(input.to ? { lte: input.to } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return { total, page: input.page, pageSize: input.pageSize, rows };
}