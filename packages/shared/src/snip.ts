/**
 * Snipe records: only what the bot has actually observed while online.
 *
 * Discord provides no API to fetch a deleted message. Sentinel keeps a short,
 * configurable in-memory retention of message deletions it witnessed. The
 * database doubles as a quick statistical log (who caused a delete, which
 * channel) but never a permanent archive of deleted content.
 */

export const SNIPE_RETENTION_SECONDS = 6 * 60 * 60; // 6h default

export const SNIPE_MAX_LOGS = 10_000;

export interface SnipeRecord {
  guildId: string;
  channelId: string;
  authorId: string;
  messageId: string;
  content: string | null;
  deletedAt: number; // epoch ms
  createdAt: number; // epoch ms of the original message when available
}

export interface SnipeLogMeta {
  guildId: string;
  channelId: string;
  authorId: string;
  messageId: string;
  timestamp: number; // delete time, epoch ms
}