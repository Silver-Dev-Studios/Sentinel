import { ChannelType, type Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Mirror the channel structure of allowlisted guilds into the database so the
 * dashboard can offer real channel selection (never fabricated data).
 *
 * Only "chat-addressable" channels are stored: text/news threads and voice.
 * We never copy message contents or anything sensitive.
 */
export async function syncGuildChannels(prisma: PrismaClient, client: Client, guildId: string): Promise<number> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return 0;

  let channels: Awaited<ReturnType<typeof guild.channels.fetch>>;
  try {
    channels = await guild.channels.fetch();
  } catch {
    return 0;
  }
  const seen = new Set<string>();
  let count = 0;

  const rows: {
    guildId: string;
    channelId: string;
    name: string;
    type: number;
    parentId: string | null;
    position: number;
    nsfw: boolean;
  }[] = [];

  for (const channel of channels.values()) {
    if (!channel) continue;
    // Skip DMs, categories, forums/announcements handled separately.
    if (channel.type === ChannelType.GuildCategory || channel.type === ChannelType.GuildForum) continue;
    if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildVoice) {
      const c = channel as { name: string; parentId: string | null; position: number; nsfw?: boolean };
      rows.push({
        guildId,
        channelId: channel.id,
        name: c.name,
        type: channel.type,
        parentId: c.parentId,
        position: c.position ?? 0,
        nsfw: c.nsfw ?? false,
      });
      seen.add(channel.id);
      count++;
    }
  }

  // Upsert each channel so renames and metadata changes are reflected, then
  // remove channels that disappeared from the guild so the dashboard never
  // lists stale targets.
  for (const row of rows) {
    await prisma.serverChannel.upsert({
      where: { guildId_channelId: { guildId, channelId: row.channelId } },
      update: { ...row, lastSyncedAt: new Date() },
      create: { ...row, lastSyncedAt: new Date() },
    });
  }
  if (seen.size > 0) {
    await prisma.serverChannel.deleteMany({ where: { guildId, channelId: { notIn: [...seen] } } });
  }
  return count;
}

export async function syncAllChannels(prisma: PrismaClient, client: Client, allowlist: string[]): Promise<void> {
  const targets = allowlist.length > 0 ? allowlist : client.guilds.cache.map((g) => g.id);
  for (const guildId of targets) {
    const count = await syncGuildChannels(prisma, client, guildId).catch(() => 0);
    if (count >= 0) console.log(`[sentinel-bot] synced ${count} channels for guild ${guildId}`);
  }
}