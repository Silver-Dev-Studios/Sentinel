import {
  Client,
  Events,
  ChannelType,
  PermissionFlagsBits,
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
  client.on(Events.MessageReactionAdd, (reaction, user) => void handleReactionAdd(reaction, user, prisma));
  client.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) {
      void trackAndRun(interaction, api, slashCommands);
    } else if (interaction.isButton() && interaction.customId.startsWith('ticket_panel:')) {
      const panelId = interaction.customId.slice('ticket_panel:'.length);
      void handleTicketPanelButton(interaction, prisma, api, panelId);
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

async function handleTicketPanelButton(
  interaction: import('discord.js').ButtonInteraction,
  prisma: PrismaClient,
  api: ApiClient,
  panelId: string,
): Promise<void> {
  try {
    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    if (!guildId) {
      await interaction.reply({ content: 'This can only be used inside a server.', ephemeral: true });
      return;
    }
    const panel = await prisma.ticketPanel.findUnique({ where: { id: panelId } });
    if (!panel || !panel.enabled) {
      await interaction.reply({ content: 'This ticket panel is no longer available.', ephemeral: true });
      return;
    }
    const existing = await prisma.ticket.findFirst({
      where: { guildId, ownerId: userId, status: { in: ['open', 'claimed'] } },
    });
    if (existing) {
      await interaction.reply({ content: `You already have an open ticket (<#${existing.channelId ?? 'unknown'}>).`, ephemeral: true });
      return;
    }
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Ticket creation requires a cached guild membership.', ephemeral: true });
      return;
    }
    const channelName = `ticket-${sanitizeChannelName(panel.name)}-${userId.slice(-4)}`;
    const category = panel.category ? interaction.guild?.channels.cache.find((c) => c.name === panel.category && c.type === ChannelType.GuildCategory) : undefined;
    const created = await interaction.guild?.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: (category as import('discord.js').CategoryChannel | undefined)?.id,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        ...(panel.staffRoleIds ?? []).map((roleId) => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
    });
    if (!created) {
      await interaction.reply({ content: 'Could not create a ticket channel.', ephemeral: true });
      return;
    }
    await prisma.ticket.create({
      data: {
        guildId,
        panelId,
        panelName: panel.name,
        category: panel.category ?? 'general',
        channelId: created.id,
        ownerId: userId,
        subject: panel.name,
        status: 'open',
        participants: { create: [{ guildId, userId, role: 'member' }] },
      },
    });
    const opener = panel.openingMessage ?? `Welcome! Support will be with you shortly.`;
    await created.send({ content: `<@${userId}> ${opener}` });
    await api.reportActivity({
      guildId,
      type: 'ticket_opened',
      actorId: userId,
      message: `Ticket opened via **${panel.name}** panel`,
      detail: { panelId },
    }).catch(() => undefined);
    await interaction.reply({ content: `Ticket created: <#${created.id}>`, ephemeral: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await interaction.reply({ content: `Failed to open ticket: ${message}`, ephemeral: true }).catch(() => undefined);
  }
}

async function handleReactionAdd(
  reaction: import('discord.js').MessageReaction | import('discord.js').PartialMessageReaction,
  user: import('discord.js').User | import('discord.js').PartialUser,
  prisma: PrismaClient,
): Promise<void> {
  if (user.bot || reaction.emoji.name !== '🎉') return;
  const messageId = reaction.message.id;
  const guildId = reaction.message.guildId;
  if (!guildId) return;
  const giveaway = await prisma.giveaway
    .findFirst({ where: { guildId, messageId, status: 'running' } })
    .catch(() => null);
  if (!giveaway) return;
  await prisma.giveawayEntry
    .upsert({
      where: { giveawayId_userId: { giveawayId: giveaway.id, userId: user.id } },
      create: { giveawayId: giveaway.id, guildId, userId: user.id },
      update: {},
    })
    .catch(() => undefined);
}

function sanitizeChannelName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32);
}
