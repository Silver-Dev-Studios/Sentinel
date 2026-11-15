import {
  Client,
  Guild,
  GuildMember,
  PermissionsBitField,
  ChannelType,
  type TextChannel,
} from 'discord.js';
import type { ModerationTransport, UserInfo } from '@sds-sentinel/bot-services';

/**
 * discord.js-backed implementation of the shared ModerationTransport.
 * This is the only place the bot calls mutating Discord APIs for moderation —
 * the business logic and case logging live in @sds-sentinel/bot-services.
 */
function resolveMember(guild: Guild, userId: string): GuildMember | Promise<GuildMember> {
  const cached = guild.members.cache.get(userId);
  if (cached) return cached;
  return guild.members.fetch(userId);
}

function resolveTextChannel(guild: Guild, channelId: string): TextChannel | undefined {
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return undefined;
  if ('send' in channel && 'permissionOverwrites' in channel) {
    return channel as TextChannel;
  }
  return undefined;
}

export function createTransport(client: Client): ModerationTransport {
  return {
    async banMember({ guildId, userId, reason, deleteMessageSeconds }) {
      const guild = await client.guilds.fetch(guildId);
      await guild.bans.create(userId, {
        reason: reason ?? undefined,
        deleteMessageSeconds,
      });
    },

    async unbanMember({ guildId, userId, reason }) {
      const guild = await client.guilds.fetch(guildId);
      await guild.bans.remove(userId, reason ?? undefined);
    },

    async kickMember({ guildId, userId, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const member = await resolveMember(guild, userId);
      await member.kick(reason ?? undefined);
    },

    async timeoutMember({ guildId, userId, minutes, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const member = await resolveMember(guild, userId);
      await member.timeout(minutes * 60_000, reason ?? undefined);
    },

    async untimeoutMember({ guildId, userId, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const member = await resolveMember(guild, userId);
      await member.timeout(null, reason ?? undefined);
    },

    async lockChannel({ guildId, channelId, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const channel = resolveTextChannel(guild, channelId);
      if (!channel) throw new Error(`Channel ${channelId} is not a text channel`);
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
        AddReactions: false,
      });
      // Preserve moderator access for the acting role set (role hierarchy is
      // respected by Discord; only the @everyone overwrite is changed).
      void reason;
    },

    async unlockChannel({ guildId, channelId, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const channel = resolveTextChannel(guild, channelId);
      if (!channel) throw new Error(`Channel ${channelId} is not a text channel`);
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null,
        AddReactions: null,
      });
      void reason;
    },

    async purgeMessages({ guildId, channelId, amount, reason }) {
      const guild = await client.guilds.fetch(guildId);
      const channel = resolveTextChannel(guild, channelId);
      if (!channel) throw new Error(`Channel ${channelId} is not a text channel`);
      const messages = await channel.bulkDelete(Math.min(amount, 100), true);
      void reason;
      return { count: messages.size };
    },

    async fetchUserInfo({ guildId, userId }): Promise<UserInfo> {
      const guild = await client.guilds.fetch(guildId);
      const member = await resolveMember(guild, userId);
      const user = member.user;
      return {
        id: user.id,
        username: user.username,
        displayName: member.nickname ?? user.displayName,
        avatar: user.avatar,
        bot: user.bot,
        joinedAt: member.joinedAt?.toISOString() ?? null,
        createdAt: user.createdAt?.toISOString() ?? null,
        roles: member.roles.cache.map((r) => r.id),
        communicationDisabledUntil: member.communicationDisabledUntil?.toISOString() ?? null,
        pending: member.pending ?? null,
      };
    },
  };
}

export function isAdminButNotOwner(member: GuildMember): boolean {
  if (member.id === member.guild.ownerId) return false;
  return member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    member.permissions.has(PermissionsBitField.Flags.Administrator);
}

export function channelMention(channelId: string): string {
  return `<#${channelId}>`;
}

export function isTextBasedAndWritable(channel: { type: ChannelType }): boolean {
  return (
    channel.type === ChannelType.GuildText ||
    channel.type === ChannelType.PublicThread ||
    channel.type === ChannelType.PrivateThread ||
    channel.type === ChannelType.GuildAnnouncement
  );
}