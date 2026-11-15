import type { Message } from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import { SNIPE_RETENTION_SECONDS, SNIPE_MAX_LOGS } from '@sds-sentinel/shared';

/**
 * In-memory deleted-message records used by the Snipe command.
 *
 * Discord provides no API to fetch a deleted message. We only keep what the
 * bot actually witnessed while it was connected, for a short configurable
 * window. Records are never presented as a permanent archive.
 */
export class SnipeStore {
  private readonly logs: Map<string, SnipeEntry[]> = new Map();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly retentionSeconds = SNIPE_RETENTION_SECONDS,
  ) {}

  record(message: Message): void {
    const guildId = message.guildId;
    if (!guildId) return;
    const entry: SnipeEntry = {
      guildId,
      channelId: message.channelId,
      authorId: message.author.id,
      messageId: message.id,
      content: message.content || null,
      deletedAt: Date.now(),
      createdAt: message.createdTimestamp,
    };
    let list = this.logs.get(guildId);
    if (!list) {
      list = [];
      this.logs.set(guildId, list);
    }
    list.unshift(entry);
    if (list.length > SNIPE_MAX_LOGS) list.length = SNIPE_MAX_LOGS;

    // Fast prune for the current guild
    const now = Date.now();
    const cutoff = now - this.retentionSeconds * 1000;
    this.logs.set(
      guildId,
      list.filter((e) => e.deletedAt >= cutoff),
    );

    // Persist a lightweight statistical log (who, which channel) — never the
    // full content archive, which is intentionally ephemeral.
    this.prisma.snipeLog
      .create({
        data: {
          guildId,
          channelId: message.channelId,
          authorId: message.author.id,
          messageId: message.id,
          deletedAt: new Date(),
        },
      })
      .catch(() => undefined);
  }

  get(guildId: string, channelId: string): SnipeEntry | undefined {
    const list = this.logs.get(guildId);
    if (!list) return undefined;
    const now = Date.now();
    const cutoff = now - this.retentionSeconds * 1000;
    return list.find((e) => e.channelId === channelId && e.deletedAt >= cutoff);
  }

  list(guildId: string, channelId: string, limit = 5): SnipeEntry[] {
    const list = this.logs.get(guildId);
    if (!list) return [];
    const now = Date.now();
    const cutoff = now - this.retentionSeconds * 1000;
    return list.filter((e) => e.channelId === channelId && e.deletedAt >= cutoff).slice(0, limit);
  }

  prune(): void {
    const now = Date.now();
    const cutoff = now - this.retentionSeconds * 1000;
    for (const [guildId, list] of this.logs) {
      const kept = list.filter((e) => e.deletedAt >= cutoff);
      if (kept.length === 0) this.logs.delete(guildId);
      else this.logs.set(guildId, kept);
    }
  }
}

export interface SnipeEntry {
  guildId: string;
  channelId: string;
  authorId: string;
  messageId: string;
  content: string | null;
  deletedAt: number;
  createdAt: number;
}