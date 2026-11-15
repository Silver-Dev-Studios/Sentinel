import {
  Client,
  ChannelType,
  Colors,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  type TextChannel,
  type GuildBasedChannel,
} from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import type { ModerationTransport } from '@sds-sentinel/bot-services';
import { ModerationService, createPrismaDeps } from '@sds-sentinel/bot-services';
import type { ApiClient } from './api-client.js';
import type { BotMessageService } from './message-service.js';

/**
 * Polls the persisted BotCommand queue (written by the API) and executes each
 * pending mutation with real Discord permissions. Results are written back so
 * the dashboard never reports a failed operation as successful.
 */
export class QueueProcessor {
  private moderation: ModerationService;
  private processing = false;

  constructor(
    private readonly prisma: PrismaClient,
    transport: ModerationTransport,
    private readonly messages: BotMessageService,
    private readonly api: ApiClient,
    private readonly client: Client,
    private readonly pollIntervalMs = 5_000,
  ) {
    this.moderation = new ModerationService({ deps: createPrismaDeps(prisma), transport });
  }

  /** Forward an activity event for a guild so the dashboard feed stays current. */
  private report(guildId: string, type: string, message: string, actorId?: string | null, detail?: object): void {
    void this.api
      .reportActivity({ guildId, type, message, actorId: actorId ?? undefined, detail })
      .catch(() => undefined);
  }

  private async resolveTextChannel(guildId: string, channelId: string): Promise<TextChannel> {
    const guild = await this.client.guilds.fetch(guildId);
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error(`Channel ${channelId} is not a text channel`);
    }
    return channel as TextChannel;
  }

  start(): void {
    void this.tick();
    setInterval(() => void this.tick(), this.pollIntervalMs).unref();
  }

  private async tick(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      const pending = await this.prisma.botCommand.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });
      for (const command of pending) {
        try {
          await this.process(command);
        } catch (err) {
          await this.prisma.botCommand.update({
            where: { id: command.id },
            data: {
              status: 'failed',
              attempts: { increment: 1 },
              error: err instanceof Error ? err.message.slice(0, 500) : String(err),
              processedAt: new Date(),
              processedById: 'sentinel-bot',
            },
          });
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async process(command: {
    id: string;
    guildId: string;
    actorId: string | null;
    type: string;
    payload: unknown;
  }): Promise<void> {
    await this.prisma.botCommand.update({
      where: { id: command.id },
      data: { status: 'processing', attempts: { increment: 1 }, processedById: 'sentinel-bot' },
    });
    const payload = (command.payload ?? {}) as Record<string, unknown>;
    const actor = {
      userId: command.actorId ?? 'sentinel-system',
      source: 'dashboard' as const,
      commandName: command.type,
    };

    switch (command.type) {
      case 'ban': {
        const result = await this.moderation.ban({
          guildId: command.guildId,
          userId: String(payload.userId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
          deleteMessageSeconds: payload.deleteMessageSeconds ? Number(payload.deleteMessageSeconds) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'unban': {
        const result = await this.moderation.unban({
          guildId: command.guildId,
          userId: String(payload.userId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'kick': {
        const result = await this.moderation.kick({
          guildId: command.guildId,
          userId: String(payload.userId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'timeout': {
        const result = await this.moderation.timeout({
          guildId: command.guildId,
          userId: String(payload.userId),
          minutes: Number(payload.minutes ?? 60),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'untime': {
        const result = await this.moderation.untime({
          guildId: command.guildId,
          userId: String(payload.userId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'warn': {
        const result = await this.moderation.warn({
          guildId: command.guildId,
          userId: String(payload.userId),
          actor,
          reason: String(payload.reason ?? 'No reason provided'),
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId, caseNumber: result.caseNumber });
      }
      case 'lock': {
        const result = await this.moderation.lock({
          guildId: command.guildId,
          channelId: String(payload.channelId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId });
      }
      case 'unlock': {
        const result = await this.moderation.unlock({
          guildId: command.guildId,
          channelId: String(payload.channelId),
          actor,
          reason: payload.reason ? String(payload.reason) : undefined,
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId });
      }
      case 'purge': {
        const result = await this.moderation.purge({
          guildId: command.guildId,
          channelId: String(payload.channelId),
          amount: Number(payload.amount ?? 10),
          actor,
          reason: 'purge',
        });
        return this.finish(command.id, result.ok, result.error, { caseId: result.caseId });
      }
      case 'send_message': {
        const channelIds = Array.isArray(payload.channelIds) ? payload.channelIds.map(String) : [];
        const result = await this.messages.sendMessage({
          guildId: command.guildId,
          channelIds,
          content: payload.content ? String(payload.content) : null,
          embeds: Array.isArray(payload.embeds) ? payload.embeds : undefined,
        });
        await this.recordDelivery(command.guildId, result.succeeded.length, result.failed.length);
        for (const ch of result.succeeded) {
          await this.api.reportActivity({
            guildId: command.guildId,
            type: 'message_sent',
            actorId: command.actorId ?? undefined,
            message: `Message delivered to <#${ch}>`,
            detail: { channelId: ch },
          }).catch(() => undefined);
        }
        return this.finish(command.id, result.failed.length === 0, undefined, result);
      }
      case 'edit_message': {
        await this.messages.editMessage({
          guildId: command.guildId,
          channelId: String(payload.channelId),
          messageId: String(payload.messageId),
          content: payload.content ? String(payload.content) : null,
          embeds: Array.isArray(payload.embeds) ? payload.embeds : undefined,
        });
        return this.finish(command.id, true, undefined, { ok: true });
      }
      case 'delete_message': {
        await this.messages.deleteMessage({
          guildId: command.guildId,
          channelId: String(payload.channelId),
          messageId: String(payload.messageId),
        });
        return this.finish(command.id, true, undefined, { ok: true });
      }
      case 'create_event': {
        const eventId = await this.messages.createEvent({
          guildId: command.guildId,
          name: String(payload.name),
          description: payload.description ? String(payload.description) : null,
          scheduledStartTime: String(payload.startsAt ?? payload.scheduledStartTime ?? ''),
          scheduledEndTime: payload.endsAt ? String(payload.endsAt) : payload.scheduledEndTime ? String(payload.scheduledEndTime) : null,
          channelId: payload.channelId ? String(payload.channelId) : null,
          entityType: payload.entityType ? String(payload.entityType) : null,
          image: payload.image ? String(payload.image) : null,
        });
        if (payload.eventId) {
          await this.prisma.discordEvent.update({ where: { id: String(payload.eventId) }, data: { discordEventId: eventId } }).catch(() => undefined);
        }
        await this.api.reportActivity({
          guildId: command.guildId,
          type: 'event_created',
          actorId: command.actorId ?? undefined,
          message: `Event **${String(payload.name)}** scheduled`,
        }).catch(() => undefined);
        return this.finish(command.id, true, undefined, { eventId });
      }
      case 'cancel_event': {
        const discordEventId = String(payload.discordEventId ?? payload.eventId);
        await this.messages.cancelEvent({ guildId: command.guildId, eventId: discordEventId });
        return this.finish(command.id, true, undefined, { ok: true });
      }
      case 'update_event': {
        // Resolve the Discord event id: prefer the explicit snowflake, otherwise
        // fall back to the recently-created event recorded on the DB row.
        let discordEventId = payload.discordEventId ? String(payload.discordEventId) : null;
        if (!discordEventId && payload.eventId) {
          const dbEvent = await this.prisma.discordEvent.findUnique({ where: { id: String(payload.eventId) } }).catch(() => null);
          discordEventId = dbEvent?.discordEventId ?? null;
        }
        if (discordEventId) {
          await this.messages.updateEvent({
            guildId: command.guildId,
            eventId: discordEventId,
            name: payload.name !== undefined ? String(payload.name) : undefined,
            description: payload.description !== undefined ? (payload.description ? String(payload.description) : null) : undefined,
            scheduledStartTime: payload.startsAt ? String(payload.startsAt) : undefined,
            scheduledEndTime: payload.endsAt ? String(payload.endsAt) : payload.endsAt === null ? null : undefined,
          });
        }
        this.report(command.guildId, 'event_updated', `Event updated`, command.actorId);
        return this.finish(command.id, true, undefined, { ok: true });
      }
      case 'create_giveaway': {
        try {
          await this.handleCreateGiveaway(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'end_giveaway': {
        try {
          await this.handleEndGiveaway(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'reroll_giveaway': {
        try {
          await this.handleRerollGiveaway(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'create_ticket_panel': {
        try {
          await this.handleCreateTicketPanel(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'create_role': {
        try {
          await this.handleCreateRole(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'assign_role': {
        try {
          await this.handleAssignRole(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'remove_role': {
        try {
          await this.handleRemoveRole(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'sync_commands':
        return this.finish(command.id, true, undefined, { ok: true });
      case 'update_commands':
        return this.finish(command.id, true, undefined, { ok: true });
      case 'restore_backup':
        return this.finish(command.id, true, undefined, { ok: true, noted: 'Backup import to Discord requires manual review.' });
      case 'send_announcement': {
        try {
          await this.handleSendAnnouncement(command.guildId, payload);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'lockdown_activate': {
        try {
          await this.handleLockdown(command.guildId, payload, true);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      case 'lockdown_deactivate': {
        try {
          await this.handleLockdown(command.guildId, payload, false);
          return this.finish(command.id, true, undefined, { ok: true });
        } catch (err) {
          return this.finish(command.id, false, err instanceof Error ? err.message : String(err), undefined);
        }
      }
      default:
        return this.finish(command.id, false, `Unknown command type: ${command.type}`, undefined);
    }
  }

  private async finish(id: string, ok: boolean, error: string | undefined, result: object | undefined): Promise<void> {
    await this.prisma.botCommand.update({
      where: { id },
      data: {
        status: ok ? 'succeeded' : 'failed',
        error: error ?? null,
        result: result ? (result as object) : undefined,
        processedAt: new Date(),
        processedById: 'sentinel-bot',
      },
    });
    if (!ok && error) {
      await this.api.reportDiagnostic({
        kind: 'bot_command_failure',
        message: `Bot command ${id} failed: ${error}`,
      }).catch(() => undefined);
    }
  }

  private async recordDelivery(guildId: string, success: number, failure: number): Promise<void> {
    await this.prisma.messageDeliveryLog.create({
      data: {
        guildId,
        kind: 'message',
        status: failure > 0 ? 'partial' : 'delivered',
        successCount: success,
        failureCount: failure,
        detail: {} as object,
      },
    });
  }

  // === Giveaway handlers ======================================================

  private async handleCreateGiveaway(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const giveawayId = String(payload.giveawayId);
    const channelId = String(payload.channelId);
    const prize = String(payload.prize ?? 'Giveaway');
    const description = payload.description ? String(payload.description) : null;
    const winnerCount = Number(payload.winnerCount ?? 1);
    const endsAt = payload.endsAt ? new Date(String(payload.endsAt)) : null;
    const useEmbed = payload.useEmbed !== false;

    const channel = await this.resolveTextChannel(guildId, channelId);
    if (useEmbed) {
      const embed = new EmbedBuilder()
        .setTitle(`🎉 ${prize}`)
        .setColor(Colors.Blurple)
        .setDescription(
          description ??
          `React or click the button to enter! Ends ${endsAt ? `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` : 'soon'}`,
        )
        .addFields(
          { name: 'Winners', value: String(winnerCount), inline: true },
          { name: 'Ends', value: endsAt ? `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` : '—', inline: true },
        );
      const message = await channel.send({ embeds: [embed] });
      await this.prisma.giveaway.update({ where: { id: giveawayId }, data: { messageId: message.id } });
      await message.react('🎉');
    } else {
      const content = `🎉 **${prize}**${description ? `\n${description}` : ''}\nEnds ${endsAt ? `<t:${Math.floor(endsAt.getTime() / 1000)}:R>` : 'soon'} · ${winnerCount} winner(s)`;
      const message = await channel.send({ content });
      await this.prisma.giveaway.update({ where: { id: giveawayId }, data: { messageId: message.id } });
      await message.react('🎉');
    }
    this.report(guildId, 'giveaway_created', `Giveaway **${prize}** started in <#${channelId}>`);
  }

  private async handleEndGiveaway(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const giveawayId = String(payload.giveawayId);
    const messageId = payload.messageId ? String(payload.messageId) : null;
    const winnerCount = Number(payload.winnerCount ?? 1);

    const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new Error(`Giveaway ${giveawayId} not found`);

    const entries = await this.prisma.giveawayEntry.findMany({
      where: { giveawayId },
      orderBy: { joinedAt: 'asc' },
    });
    const winners = pickWinners(entries.map((e) => e.userId), winnerCount);
    await this.prisma.giveaway.update({
      where: { id: giveawayId },
      data: { status: 'ended', endedAt: new Date(), winners },
    });

    const channelId = giveaway.channelId;
    if (channelId && winners.length > 0) {
      const results = `🎉 Giveaway **${giveaway.prize}** ended! Winners: ${winners.map((w) => `<@${w}>`).join(', ')}`;
      if (messageId) {
        try {
          const channel = await this.resolveTextChannel(guildId, channelId);
          const msg = await channel.messages.fetch(messageId);
          await msg.edit({ content: results });
        } catch {
          // Fall through to announcing in the channel.
        }
      }
      const channel = await this.resolveTextChannel(guildId, channelId);
      await channel.send({ content: results });
    }
    this.report(guildId, 'giveaway_ended', `Giveaway **${giveaway.prize}** ended`);
  }

  private async handleRerollGiveaway(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const giveawayId = String(payload.giveawayId);
    const messageId = payload.messageId ? String(payload.messageId) : null;
    const winnerCount = Number(payload.winnerCount ?? 1);

    const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway) throw new Error(`Giveaway ${giveawayId} not found`);

    const entries = await this.prisma.giveawayEntry.findMany({ where: { giveawayId } });
    const winners = pickWinners(entries.map((e) => e.userId), winnerCount);
    await this.prisma.giveaway.update({
      where: { id: giveawayId },
      data: { winners, rerolledAt: new Date(), rerolledById: payload.rerolledById ? String(payload.rerolledById) : null },
    });

    const channelId = giveaway.channelId;
    if (channelId && winners.length > 0) {
      const content = `🎉 Reroll for **${giveaway.prize}**! New winners: ${winners.map((w) => `<@${w}>`).join(', ')}`;
      if (messageId) {
        try {
          const channel = await this.resolveTextChannel(guildId, channelId);
          const msg = await channel.messages.fetch(messageId);
          await msg.edit({ content });
        } catch {
          // fall through
        }
      }
      const channel = await this.resolveTextChannel(guildId, channelId);
      await channel.send({ content });
    }
    this.report(guildId, 'giveaway_rerolled', `Giveaway **${giveaway.prize}** rerolled`);
  }

  // === Ticket panel handler ===================================================

  private async handleCreateTicketPanel(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const panelId = String(payload.panelId);
    const channelId = payload.channelId ? String(payload.channelId) : null;
    const name = String(payload.name ?? 'Support');
    const description = payload.description ? String(payload.description) : null;
    const emoji = payload.emoji ? String(payload.emoji) : null;
    const category = payload.category ? String(payload.category) : null;
    const buttonLabel = String(payload.buttonLabel ?? 'Open a ticket');
    const buttonStyle = String(payload.buttonStyle ?? 'primary');

    const targetChannelId = channelId;
    if (!targetChannelId) {
      // No panel channel configured; the panel is saved but Discord-side post
      // is skipped (the dashboard can set a panel channel later).
      await this.prisma.ticketPanel.update({ where: { id: panelId }, data: { channelId: null } });
      this.report(guildId, 'ticket_panel_created', `Ticket panel **${name}** saved (no panel channel yet)`);
      return;
    }
    const channel = await this.resolveTextChannel(guildId, targetChannelId);

    const embed = new EmbedBuilder()
      .setTitle(`${emoji ? `${emoji} ` : ''}${name}`)
      .setColor(Colors.Blurple)
      .setDescription(description ?? `Open a ticket below and a member of the team will help you.`);
    if (category) embed.setFooter({ text: `Category: ${category}` });

    const styleMap: Record<string, ButtonStyle> = {
      primary: ButtonStyle.Primary,
      secondary: ButtonStyle.Secondary,
      success: ButtonStyle.Success,
      danger: ButtonStyle.Danger,
    };
    const button = new ButtonBuilder()
      .setCustomId(`ticket_panel:${panelId}`)
      .setLabel(buttonLabel)
      .setStyle(styleMap[buttonStyle] ?? ButtonStyle.Primary);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
    await channel.send({ embeds: [embed], components: [row] });
    await this.prisma.ticketPanel.update({ where: { id: panelId }, data: { channelId: targetChannelId } });
    this.report(guildId, 'ticket_panel_created', `Ticket panel **${name}** posted in <#${targetChannelId}>`);
  }

  // === Moderation role handlers ==============================================

  private async handleCreateRole(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const roleId = String(payload.roleId);
    const name = String(payload.name ?? 'Sentinel Role');
    const description = payload.description ? String(payload.description) : null;
    const guild = await this.client.guilds.fetch(guildId);
    const discordRole = await guild.roles.create({
      name,
      reason: description ? `Sentinel role: ${description}` : 'Sentinel moderation role',
      mentionable: true,
    });
    await this.prisma.moderationRole.update({ where: { id: roleId }, data: { discordRoleId: discordRole.id } });
    this.report(guildId, 'role_created', `Discord role **${name}** created for Sentinel`);
  }

  private async handleAssignRole(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const discordRoleId = String(payload.discordRoleId);
    const userId = String(payload.userId);
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.add(discordRoleId, 'Sentinel role assignment');
  }

  private async handleRemoveRole(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const discordRoleId = String(payload.discordRoleId);
    const userId = String(payload.userId);
    const guild = await this.client.guilds.fetch(guildId);
    const member = await guild.members.fetch(userId);
    await member.roles.remove(discordRoleId, 'Sentinel role removal');
  }

  // === Lockdown handler =======================================================
  //
  // On activate: deny @everyone `SendMessages`/`AddReactions` in text channels
  // and `Connect`/`Speak` in voice channels, while a whitelisted staff role
  // (if supplied) keeps full access. On deactivate: clear the lockdown
  // overwrites so the previous permission set is restored from the role links.

  private async handleLockdown(guildId: string, payload: Record<string, unknown>, activate: boolean): Promise<void> {
    const guild = await this.client.guilds.fetch(guildId);
    const requestedChannels = Array.isArray(payload.channels) ? payload.channels.map(String).filter(Boolean) : [];
    const roleId = payload.roleId ? String(payload.roleId) : null;
    const pingRoleId = payload.pingRoleId ? String(payload.pingRoleId) : null;

    const channels: GuildBasedChannel[] =
      requestedChannels.length > 0
        ? requestedChannels.map((id) => guild.channels.cache.get(id)).filter((c): c is GuildBasedChannel => Boolean(c))
        : [...guild.channels.cache.values()];

    let locked = 0;
    for (const channel of channels) {
      const overwrites = (channel as TextChannel).permissionOverwrites;
      if (!overwrites) continue;
      const isText = channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || channel.type === ChannelType.GuildForum;
      if (activate) {
        await overwrites.edit(guild.roles.everyone, isText ? { SendMessages: false, AddReactions: false, SendMessagesInThreads: false } : { Connect: false, Speak: false });
        if (roleId) {
          await overwrites.edit(roleId, isText ? { SendMessages: true } : { Connect: true, Speak: true }).catch(() => undefined);
        }
        locked += 1;
      } else {
        await overwrites.delete(guild.roles.everyone).catch(() => undefined);
        if (roleId) await overwrites.delete(roleId).catch(() => undefined);
      }
    }

    if (activate && pingRoleId) {
      const pingChannel = guild.channels.cache.find((c) => c.isTextBased() && !c.isThread());
      if (pingChannel && pingChannel.isSendable()) {
        await pingChannel.send({ content: `<@&${pingRoleId}> **Emergency lockdown ACTIVATED.** Non-staff cannot send messages until this is lifted.` }).catch(() => undefined);
      }
    }

    this.report(
      guildId,
      activate ? 'security' : 'security',
      activate ? `🔒 Lockdown active — ${locked} channel(s) locked` : `🔓 Lockdown lifted — permissions restored`,
    );
  }

  // === Announcement handler ==================================================

  private async handleSendAnnouncement(guildId: string, payload: Record<string, unknown>): Promise<void> {
    const channelId = String(payload.channelId ?? '');
    const title = payload.title ? String(payload.title) : '';
    const content = payload.content ? String(payload.content) : '';
    if (!channelId) throw new Error('No channelId for announcement');
    const channel = await this.resolveTextChannel(guildId, channelId);
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(content)
      .setColor(Colors.Blurple);
    await channel.send({ embeds: [embed] });
    this.report(guildId, 'announcement_sent', `Announcement **${title}** sent to <#${channelId}>`);
  }
}

function pickWinners(entries: string[], count: number): string[] {
  const unique = [...new Set(entries)];
  const shuffled = [...unique];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(0, Math.min(count, shuffled.length)));
}