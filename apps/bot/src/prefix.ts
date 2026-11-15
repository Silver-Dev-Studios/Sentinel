import { Message, EmbedBuilder, Colors } from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import type { ModerationService } from '@sds-sentinel/bot-services';
import { resolveBotPermissions, hasPermission, type BotPermissionContext } from './permissions.js';
import type { ApiClient } from './api-client.js';
import type { SnipeStore } from './snipe.js';
import type { PermissionKey } from '@sds-sentinel/shared';

/**
 * Prefix commands (`+command`). These share the same underlying
 * @sds-sentinel/bot-services functions as their slash equivalents — there is
 * no duplicated business logic.
 */
export class PrefixCommands {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly moderation: ModerationService,
    private readonly api: ApiClient,
    private readonly snipe: SnipeStore,
    private readonly prefix = '!',
  ) {}

  async handle(message: Message): Promise<boolean> {
    if (message.author.bot) return false;
    const guild = message.guild;
    if (!guild) return false;
    if (!message.content.startsWith(this.prefix)) return false;

    const guildId = guild.id;
    const args = message.content.slice(this.prefix.length).trim().split(/\s+/);
    const command = args.shift()?.toLowerCase();
    if (!command) return false;

    const member = message.member;
    if (!member) return false;
    const ctx = await resolveBotPermissions(this.prisma, member);

    const actions: Record<string, { permission: PermissionKey; run: () => Promise<void> }> = {
      ban: {
        permission: 'moderation.ban',
        run: () => this.withPerm(ctx, 'moderation.ban', async () => {
          const target = message.mentions.users.first();
          const reason = args.slice(1).join(' ') || undefined;
          if (!target) return this.reply(message, 'Usage: +ban <@user> [reason]');
          const result = await this.moderation.ban({
            guildId: guildId,
            userId: target.id,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason,
          });
          await this.reply(message, result.ok ? `Banned **${target.tag}**` : result.error ?? 'Failed');
        }),
      },
      unban: {
        permission: 'moderation.ban',
        run: () => this.withPerm(ctx, 'moderation.ban', async () => {
          const id = args[0];
          if (!id) return this.reply(message, 'Usage: +unban <user id> [reason]');
          const result = await this.moderation.unban({
            guildId: guildId,
            userId: id,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason: args.slice(1).join(' ') || undefined,
          });
          await this.reply(message, result.ok ? `Unbanned **${id}**` : result.error ?? 'Failed');
        }),
      },
      kick: {
        permission: 'moderation.kick',
        run: () => this.withPerm(ctx, 'moderation.kick', async () => {
          const target = message.mentions.users.first();
          const reason = args.slice(1).join(' ') || undefined;
          if (!target) return this.reply(message, 'Usage: +kick <@user> [reason]');
          const result = await this.moderation.kick({
            guildId: guildId,
            userId: target.id,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason,
          });
          await this.reply(message, result.ok ? `Kicked **${target.tag}**` : result.error ?? 'Failed');
        }),
      },
      warn: {
        permission: 'moderation.warn',
        run: () => this.withPerm(ctx, 'moderation.warn', async () => {
          const target = message.mentions.users.first();
          const reason = args.slice(1).join(' ');
          if (!target || !reason) return this.reply(message, 'Usage: +warn <@user> <reason>');
          const result = await this.moderation.warn({
            guildId: guildId,
            userId: target.id,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason,
          });
          await this.reply(message, result.ok ? `Warned **${target.tag}**: ${reason}` : result.error ?? 'Failed');
        }),
      },
      timeout: {
        permission: 'moderation.untime',
        run: () => this.withPerm(ctx, 'moderation.untime', async () => {
          const target = message.mentions.users.first();
          const minutes = Number(args[1]);
          const reason = args.slice(2).join(' ') || undefined;
          if (!target || !Number.isFinite(minutes)) return this.reply(message, 'Usage: +timeout <@user> <minutes> [reason]');
          const result = await this.moderation.timeout({
            guildId: guildId,
            userId: target.id,
            minutes,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason,
          });
          await this.reply(message, result.ok ? `Timed out **${target.tag}** for ${minutes}m` : result.error ?? 'Failed');
        }),
      },
      untime: {
        permission: 'moderation.untime',
        run: () => this.withPerm(ctx, 'moderation.untime', async () => {
          const target = message.mentions.users.first();
          if (!target) return this.reply(message, 'Usage: +untime <@user>');
          const result = await this.moderation.untime({
            guildId: guildId,
            userId: target.id,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
          });
          await this.reply(message, result.ok ? `Removed timeout from **${target.tag}**` : result.error ?? 'Failed');
        }),
      },
      lock: {
        permission: 'moderation.lock',
        run: () => this.withPerm(ctx, 'moderation.lock', async () => {
          const result = await this.moderation.lock({
            guildId: guildId,
            channelId: message.channelId,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason: args.join(' ') || undefined,
          });
          await this.reply(message, result.ok ? 'Locked this channel' : result.error ?? 'Failed');
        }),
      },
      unlock: {
        permission: 'moderation.lock',
        run: () => this.withPerm(ctx, 'moderation.lock', async () => {
          const result = await this.moderation.unlock({
            guildId: guildId,
            channelId: message.channelId,
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason: args.join(' ') || undefined,
          });
          await this.reply(message, result.ok ? 'Unlocked this channel' : result.error ?? 'Failed');
        }),
      },
      purge: {
        permission: 'moderation.purge',
        run: () => this.withPerm(ctx, 'moderation.purge', async () => {
          const amount = Number(args[0]);
          if (!Number.isFinite(amount)) return this.reply(message, 'Usage: +purge <amount>');
          const result = await this.moderation.purge({
            guildId: guildId,
            channelId: message.channelId,
            amount: Math.min(Math.floor(amount), 100),
            actor: { userId: member.id, source: 'discord_command', commandName: command },
            reason: 'purge',
          });
          await this.reply(message, result.ok ? `Purged ${amount} messages` : result.error ?? 'Failed');
        }),
      },
      snipe: {
        permission: 'moderation.snipe',
        run: () => this.withPerm(ctx, 'moderation.snipe', async () => {
          const entry = this.snipe.get(guildId, message.channelId);
          if (!entry) return this.reply(message, 'Nothing to snipe.');
          await this.reply(message, null, {
            description: entry.content ?? '*No text content*',
            footer: { text: `Deleted message from <@${entry.authorId}>` },
          });
        }),
      },
    };

    const action = actions[command];
    if (!action) return false;
    await action.run();
    return true;
  }

  private async withPerm(ctx: BotPermissionContext, permission: PermissionKey, run: () => Promise<void>) {
    if (!hasPermission(ctx, permission)) return;
    await run();
  }

  private async reply(message: Message, content: string | null, extra?: { footer?: { text: string }; description?: string }) {
    const embed = new EmbedBuilder()
      .setColor(content ? Colors.Green : Colors.Red)
      .setDescription(extra?.description ?? content ?? 'ok');
    if (extra?.footer) embed.setFooter(extra.footer);
    try {
      await message.reply({ embeds: [embed] });
    } catch {
      if (message.channel.isSendable()) {
        await message.channel.send({ embeds: [embed] }).catch(() => undefined);
      }
    }
  }
}