import type { Client, Guild } from 'discord.js';
import type { PrismaClient } from '@prisma/client';

/**
 * Seed `authorized_servers` and `server_members` for allowlisted guilds.
 *
 * The dashboard decides which servers a user may open from these two tables,
 * so they must be populated on startup - waiting for future member-join events
 * would leave existing members (and the whole server list) invisible until
 * everyone happened to rejoin.
 *
 * Only allowlisted guilds are seeded: unknown servers never gain access.
 */
export async function syncAuthorizedServers(
  prisma: PrismaClient,
  client: Client,
  allowlist: string[],
): Promise<void> {
  const guilds: Guild[] =
    allowlist.length > 0
      ? allowlist.map((id) => client.guilds.cache.get(id)).filter((g): g is Guild => Boolean(g))
      : [...client.guilds.cache.values()];

  for (const guild of guilds) {
    let members = guild.members.cache;
    if (members.size === 0) {
      // Cache may not be chunked yet; fetch if the intent allows it.
      members = await guild.members.fetch().catch(() => guild.members.cache);
    }

    await prisma.authorizedServer
      .upsert({
        where: { id: guild.id },
        create: {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          ownerId: guild.ownerId,
          active: true,
          memberIds: [...members.keys()],
        },
        update: {
          name: guild.name,
          icon: guild.icon,
          ownerId: guild.ownerId,
          memberIds: [...members.keys()],
        },
      })
      .catch((err: unknown) => console.log(`[sentinel-bot] failed to upsert guild ${guild.id}:`, err));

    const rows = [...members.values()].map((m) => ({
      guildId: guild.id,
      userId: m.id,
      username: m.user.username,
      displayName: m.nickname ?? m.user.globalName ?? null,
      avatar: m.user.avatar,
      joinedAt: m.joinedAt ?? null,
      discordRoles: [...m.roles.cache.keys()],
      isBot: m.user.bot,
    }));

    for (const row of rows) {
      await prisma.serverMember
        .upsert({
          where: { guildId_userId: { guildId: row.guildId, userId: row.userId } },
          create: row,
          update: {
            username: row.username,
            displayName: row.displayName,
            avatar: row.avatar,
            joinedAt: row.joinedAt,
            discordRoles: row.discordRoles,
            isBot: row.isBot,
          },
        })
        .catch(() => undefined);
    }
    console.log(`[sentinel-bot] synced ${rows.length} members for guild ${guild.id}`);
  }
}
