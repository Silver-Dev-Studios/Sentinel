import {
  Client,
  Interaction,
  SlashCommandBuilder,
  EmbedBuilder,
  Colors,
} from 'discord.js';
import type { PrismaClient } from '@sds-sentinel/database';
import {
  createServiceRegistry,
  type ModerationService,
  type ModerationTransport,
  type ServiceDeps,
} from '@sds-sentinel/bot-services';
import type { BotPermissionContext } from './permissions.js';
import { resolveBotPermissions, hasPermission } from './permissions.js';
import type { PermissionKey } from '@sds-sentinel/shared';

type Ctx = BotPermissionContext;

export function buildSlashCommandDefinitions() {
  const ban = new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to ban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Ban reason'))
    .addIntegerOption((o) => o.setName('days').setDescription('Delete message history (days 0-7)'));

  const unban = new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addUserOption((o) => o.setName('user').setDescription('User to unban').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'));

  const kick = new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to kick').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Kick reason'));

  const warn = new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to warn').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Warning reason').setRequired(true));

  const timeout = new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a member')
    .addUserOption((o) => o.setName('user').setDescription('Member to timeout').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Duration in minutes').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'));

  const untime = new SlashCommandBuilder()
    .setName('untime')
    .setDescription('Remove a timeout')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'));

  const lock = new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock the channel')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to lock'))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'));

  const unlock = new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock the channel')
    .addChannelOption((o) => o.setName('channel').setDescription('Channel to unlock'))
    .addStringOption((o) => o.setName('reason').setDescription('Reason'));

  const purge = new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete messages')
    .addIntegerOption((o) => o.setName('amount').setDescription('Number of messages (1-100)').setRequired(true));

  const userinfo = new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Show member information')
    .addUserOption((o) => o.setName('user').setDescription('Member').setRequired(false));

  return [ban, unban, kick, warn, timeout, untime, lock, unlock, purge, userinfo];
}

export async function registerCommands(client: Client) {
  const commands = buildSlashCommandDefinitions();
  const app = client.application;
  if (!app) throw new Error('Client is not logged in before command registration');
  await app.commands.set(commands.map((c) => c.toJSON()));
}

export class ModerationCommands {
  private registry!: ReturnType<typeof createServiceRegistry>;

  constructor(
    private readonly prisma: PrismaClient,
    transport: ModerationTransport,
    deps: ServiceDeps,
  ) {
    this.registry = createServiceRegistry(deps, transport);
  }

  private get moderation(): ModerationService {
    return this.registry.moderation;
  }

  async handleInteraction(interaction: Interaction) {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inCachedGuild()) return;
    const cmd = interaction.commandName;
    const member = interaction.member;
    if (!member) return;
    const ctx = await resolveBotPermissions(this.prisma, member);

    switch (cmd) {
      case 'ban':
        return this.withPerm(ctx, 'moderation.ban', async () => {
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason');
          const days = interaction.options.getInteger('days') ?? 0;
          await interaction.deferReply({ ephemeral: false });
          const result = await this.moderation.ban({
            guildId: interaction.guildId,
            userId: user.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
            deleteMessageSeconds: days > 0 ? days * 86_400 : undefined,
          });
          await this.respond(interaction, result.ok, `Banned **${user.tag}**`, result.error);
        });
      case 'unban':
        return this.withPerm(ctx, 'moderation.ban', async () => {
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.unban({
            guildId: interaction.guildId,
            userId: user.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Unbanned **${user.tag}**`, result.error);
        });
      case 'kick':
        return this.withPerm(ctx, 'moderation.kick', async () => {
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.kick({
            guildId: interaction.guildId,
            userId: user.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Kicked **${user.tag}**`, result.error);
        });
      case 'warn':
        return this.withPerm(ctx, 'moderation.warn', async () => {
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason', true);
          await interaction.deferReply();
          const result = await this.moderation.warn({
            guildId: interaction.guildId,
            userId: user.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Warned **${user.tag}**: ${reason}`, result.error);
        });
      case 'timeout':
        return this.withPerm(ctx, 'moderation.untime', async () => {
          const user = interaction.options.getUser('user', true);
          const minutes = interaction.options.getInteger('minutes', true);
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.timeout({
            guildId: interaction.guildId,
            userId: user.id,
            minutes,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Timed out **${user.tag}** for ${minutes}m`, result.error);
        });
      case 'untime':
        return this.withPerm(ctx, 'moderation.untime', async () => {
          const user = interaction.options.getUser('user', true);
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.untime({
            guildId: interaction.guildId,
            userId: user.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Removed timeout from **${user.tag}**`, result.error);
        });
      case 'lock':
        return this.withPerm(ctx, 'moderation.lock', async () => {
          const channel = interaction.options.getChannel('channel') ?? interaction.channel;
          if (!channel || !('id' in channel)) return interaction.reply({ content: 'Invalid channel', ephemeral: true });
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.lock({
            guildId: interaction.guildId,
            channelId: channel.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Locked <#${channel.id}>`, result.error);
        });
      case 'unlock':
        return this.withPerm(ctx, 'moderation.lock', async () => {
          const channel = interaction.options.getChannel('channel') ?? interaction.channel;
          if (!channel || !('id' in channel)) return interaction.reply({ content: 'Invalid channel', ephemeral: true });
          const reason = interaction.options.getString('reason');
          await interaction.deferReply();
          const result = await this.moderation.unlock({
            guildId: interaction.guildId,
            channelId: channel.id,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason,
          });
          await this.respond(interaction, result.ok, `Unlocked <#${channel.id}>`, result.error);
        });
      case 'purge':
        return this.withPerm(ctx, 'moderation.purge', async () => {
          const amount = interaction.options.getInteger('amount', true);
          const channel = interaction.channel;
          if (!channel || !('id' in channel)) return interaction.reply({ content: 'Invalid channel', ephemeral: true });
          await interaction.deferReply();
          const result = await this.moderation.purge({
            guildId: interaction.guildId,
            channelId: channel.id,
            amount,
            actor: { userId: member.id, source: 'discord_command', commandName: cmd },
            reason: 'purge',
          });
          await this.respond(interaction, result.ok, `Purged ${amount} messages`, result.error);
        });
      case 'userinfo':
        return interaction.deferReply({ ephemeral: true }).then(async () => {
          const user = interaction.options.getUser('user') ?? interaction.user;
          const info = await this.moderation.userInfo({ guildId: interaction.guildId, userId: user.id }).catch(() => null);
          const embed = new EmbedBuilder()
            .setColor(Colors.Purple)
            .setTitle(user.tag)
            .setDescription(info ? `Joined: ${info.joinedAt ?? 'unknown'}` : 'Not a member');
          if (info?.displayName) embed.addFields({ name: 'Nickname', value: info.displayName, inline: true });
          await interaction.editReply({ embeds: [embed] });
        });
      default:
        return;
    }
  }

  private async withPerm(ctx: Ctx, permission: PermissionKey, fn: () => Promise<unknown>) {
    if (!hasPermission(ctx, permission)) {
      await this.noPermission(ctx, permission);
      return;
    }
    try {
      await fn();
    } catch (err) {
      // Errors are already surfaced per-action; report if a real exception escaped
      console.error(`Command error:`, err);
    }
  }

  private async respond(
    interaction: { deferred: boolean; editReply: (opts: object) => Promise<unknown>; followUp: (opts: object) => Promise<unknown> },
    ok: boolean,
    success: string,
    error?: string,
  ) {
    const opts = {
      embeds: [
        new EmbedBuilder()
          .setColor(ok ? Colors.Green : Colors.Red)
          .setDescription(ok ? success : error ?? 'Action failed'),
      ],
    };
    if (interaction.deferred) {
      await interaction.editReply(opts);
    } else {
      await interaction.followUp(opts);
    }
  }

  private async noPermission(ctx: Ctx, permission: PermissionKey) {
    void ctx;
    void permission;
  }
}