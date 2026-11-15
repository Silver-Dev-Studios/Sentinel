import {
  Client,
  Events,
  type GuildMember,
  type Message,
  type PartialMessage,
  type ChatInputCommandInteraction,
  type PartialGuildMember,
} from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import type { ApiClient } from './api-client.js';
import type { SnipeStore } from './snipe.js';
import type { PrefixCommands } from './prefix.js';
import type { ModerationCommands } from './commands.js';

/**
 * Gateway event wiring. Real observations are reported to the API (activity
 * feed) and persisted so the dashboard reflects actual events, never
 * fabricated numbers.
 */
export function attachListeners(
  client: Client,
  prisma: PrismaClient,
  api: ApiClient,
  snipe: SnipeStore,
  prefixCommands: PrefixCommands,
  slashCommands: ModerationCommands,
): void {
  client.on(Events.GuildMemberAdd, (member) => void handleMemberAdd(member, prisma, api));
  client.on(Events.GuildMemberRemove, (member) => void handleMemberRemove(member, prisma, api));
  client.on(Events.MessageDelete, (message) => handleMessageDelete(message, snipe));
  client.on(Events.MessageCreate, (message) => void prefixCommands.handle(message));
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void trackAndRun(interaction, api, slashCommands);
    }
  });

  setInterval(() => snipe.prune(), 10 * 60 * 1000).unref();
}

async function trackAndRun(
  interaction: ChatInputCommandInteraction,
  api: ApiClient,
  slashCommands: ModerationCommands,
): Promise<void> {
  if (interaction.inCachedGuild()) {
    api
      .reportActivity({
        guildId: interaction.guildId,
        type: 'command_used',
        actorId: interaction.user.id,
        message: `**${interaction.user.username}** used \`/${interaction.commandName}\``,
        detail: { command: interaction.commandName },
      })
      .catch(() => undefined);
  }
  await slashCommands.handleInteraction(interaction);
}

async function handleMemberAdd(
  member: GuildMember | PartialGuildMember,
  prisma: PrismaClient,
  api: ApiClient,
): Promise<void> {
  if (member.partial) return;
  const guildId = member.guild.id;
  const user = member.user;
  const joinedAt = member.joinedAt?.toISOString() ?? null;
  await prisma.serverMember
    .upsert({
      where: { guildId_userId: { guildId, userId: user.id } },
      create: {
        guildId,
        userId: user.id,
        username: user.username,
        displayName: member.nickname ?? null,
        avatar: user.avatar,
        joinedAt: joinedAt ? new Date(joinedAt) : null,
        discordRoles: member.roles.cache.map((r) => r.id),
      },
      update: {
        username: user.username,
        displayName: member.nickname ?? null,
        avatar: user.avatar,
        joinedAt: joinedAt ? new Date(joinedAt) : null,
        discordRoles: member.roles.cache.map((r) => r.id),
      },
    })
    .catch(() => undefined);
  // Allowlist: let dashboard access follow real membership on authorized servers.
  await prisma.authorizedServer
    .update({
      where: { id: guildId },
      data: { memberIds: { push: user.id } },
    })
    .catch(() => undefined);
  await api
    .reportActivity({
      guildId,
      type: 'member_join',
      actorId: user.id,
      message: `**${user.username}** joined the server`,
    })
    .catch(() => undefined);
}

async function handleMemberRemove(
  member: GuildMember | PartialGuildMember,
  prisma: PrismaClient,
  api: ApiClient,
): Promise<void> {
  const guildId = member.guild.id;
  const userId = member.id;
  // Members never get deleted from history; they are marked as last seen now
  // and the activity feed records the departure.
  await prisma.serverMember
    .update({
      where: { guildId_userId: { guildId, userId } },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => undefined);
  await api
    .reportActivity({
      guildId,
      type: 'member_leave',
      actorId: userId,
      message: `**${member.user?.username ?? userId}** left the server`,
    })
    .catch(() => undefined);
}

function handleMessageDelete(message: Message | PartialMessage, snipe: SnipeStore): void {
  if (message.partial) return;
  if (message.author?.bot) return;
  snipe.record(message as Message);
}
