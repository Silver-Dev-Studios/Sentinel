import { Client, ChannelType, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventStatus, type TextChannel } from 'discord.js';

/**
 * Dashboard-initiated message/event mutations performed with the bot token.
 * These are driven through the BotCommand queue so they survive restarts and
 * report accurate success/failure back to the API.
 */
export class BotMessageService {
  constructor(private readonly client: Client) {}

  private async resolveChannel(guildId: string, channelId: string): Promise<TextChannel> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }
    return channel as TextChannel;
  }

  private toDiscordEmbeds(embeds?: unknown[]): import('discord.js').APIEmbed[] | undefined {
    if (!embeds || embeds.length === 0) return undefined;
    return embeds as import('discord.js').APIEmbed[];
  }

  async sendMessage(payload: { channelIds: string[]; guildId: string; content?: string | null; embeds?: unknown[] }): Promise<{ succeeded: string[]; failed: Array<{ channelId: string; error: string }> }> {
    const succeeded: string[] = [];
    const failed: Array<{ channelId: string; error: string }> = [];
    for (const channelId of payload.channelIds) {
      try {
        const channel = await this.resolveChannel(payload.guildId, channelId);
        const sent = await channel.send({
          content: payload.content ?? undefined,
          embeds: this.toDiscordEmbeds(payload.embeds),
          allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
        });
        succeeded.push(channelId);
        void sent;
      } catch (err) {
        failed.push({ channelId, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return { succeeded, failed };
  }

  async editMessage(payload: { guildId: string; channelId: string; messageId: string; content?: string | null; embeds?: unknown[] }): Promise<void> {
    const channel = await this.resolveChannel(payload.guildId, payload.channelId);
    const message = await channel.messages.fetch(payload.messageId);
    if (!message.editable) throw new Error('Message is not editable by the bot');
    await message.edit({
      content: payload.content ?? undefined,
      embeds: this.toDiscordEmbeds(payload.embeds),
    });
  }

  async deleteMessage(payload: { guildId: string; channelId: string; messageId: string }): Promise<void> {
    const channel = await this.resolveChannel(payload.guildId, payload.channelId);
    const message = await channel.messages.fetch(payload.messageId);
    if (!message.deletable) throw new Error('Message is not deletable by the bot');
    await message.delete();
  }

  async createEvent(payload: {
    guildId: string;
    name: string;
    description?: string | null;
    scheduledStartTime: string;
    scheduledEndTime?: string | null;
    channelId?: string | null;
    entityType?: string | null;
    image?: string | null;
  }): Promise<string> {
    const guild = await this.client.guilds.fetch(payload.guildId);
    // For scheduled events Discord requires based on entityType:
    // STAGE_INSTANCE / VOICE need a channel; EXTERNAL needs a location + end time.
    const useExternal = payload.entityType === 'EXTERNAL' || !payload.channelId;
    const created = await guild.scheduledEvents.create({
      name: payload.name,
      description: payload.description ?? undefined,
      scheduledStartTime: new Date(payload.scheduledStartTime),
      scheduledEndTime: payload.scheduledEndTime ? new Date(payload.scheduledEndTime) : undefined,
      entityType: useExternal
        ? GuildScheduledEventEntityType.External
        : GuildScheduledEventEntityType.Voice,
      privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      entityMetadata: useExternal
        ? { location: payload.channelId ? `#<${payload.channelId}>` : 'TBD' }
        : undefined,
      channel: useExternal ? undefined : (payload.channelId ?? undefined),
      image: payload.image ?? undefined,
    });
    return created.id;
  }

  async cancelEvent(payload: { guildId: string; eventId: string }): Promise<void> {
    const guild = await this.client.guilds.fetch(payload.guildId);
    const event = await guild.scheduledEvents.fetch(payload.eventId);
    await event.setStatus(GuildScheduledEventStatus.Canceled);
  }

  async updateEvent(payload: {
    guildId: string;
    eventId: string;
    name?: string;
    description?: string | null;
    scheduledStartTime?: string;
    scheduledEndTime?: string | null;
    channelId?: string | null;
    entityType?: string | null;
    image?: string | null;
  }): Promise<void> {
    const guild = await this.client.guilds.fetch(payload.guildId);
    const event = await guild.scheduledEvents.fetch(payload.eventId);
    const patch: Parameters<typeof event.edit>[0] = {};
    if (payload.name !== undefined) patch.name = payload.name;
    if (payload.description !== undefined) patch.description = payload.description ?? '';
    if (payload.scheduledStartTime) patch.scheduledStartTime = new Date(payload.scheduledStartTime);
    if (payload.scheduledEndTime) patch.scheduledEndTime = new Date(payload.scheduledEndTime);
    if (payload.image !== undefined) patch.image = payload.image ?? undefined;
    await event.edit(patch);
  }
}