import type { PrismaClient } from '@sds-sentinel/database';
import type { BotMessageService } from './message-service.js';
import type { ApiClient } from './api-client.js';

/**
 * Executes persisted scheduled messages and scheduled tasks. Both are
 * PostgreSQL-backed so they survive bot restarts — the bot is the only actor
 * with Discord write permission, so scheduling homes here.
 */
export class BotScheduler {
  private running = false;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly messages: BotMessageService,
    private readonly api: ApiClient,
    private readonly pollIntervalMs = 15_000,
  ) {}

  start(): void {
    void this.tick();
    setInterval(() => void this.tick(), this.pollIntervalMs).unref();
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const due = await this.prisma.scheduledMessage.findMany({
        where: { status: 'pending', scheduledFor: { lte: now } },
        take: 10,
      });
      for (const message of due) {
        try {
          await this.processScheduledMessage(message.id);
        } catch (err) {
          await this.prisma.scheduledMessage.update({
            where: { id: message.id },
            data: { status: 'failed', error: err instanceof Error ? err.message.slice(0, 500) : String(err) },
          });
        }
      }

      // Scheduled tasks (announcements, embeds, reminders).
      const dueTasks = await this.prisma.scheduledTask.findMany({
        where: { status: 'pending', runAt: { lte: now } },
        take: 10,
      });
      for (const task of dueTasks) {
        try {
          await this.processScheduledTask(task.id);
        } catch (err) {
          await this.prisma.scheduledTask.update({
            where: { id: task.id },
            data: { lastError: err instanceof Error ? err.message.slice(0, 500) : String(err) },
          });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async processScheduledMessage(id: string): Promise<void> {
    const message = await this.prisma.scheduledMessage.findUnique({ where: { id } });
    if (!message) return;
    const result = await this.messages.sendMessage({
      guildId: message.guildId,
      channelIds: [message.channelId],
      content: message.content,
      embeds: message.embeds ? (message.embeds as unknown[]) : undefined,
    });
    if (result.failed.length > 0) {
      throw new Error(result.failed[0].error);
    }
    await this.prisma.scheduledMessage.update({
      where: { id },
      data: { status: 'sent', executedAt: new Date() },
    });
    await this.api.reportActivity({
      guildId: message.guildId,
      type: 'message_sent',
      message: `Scheduled message delivered to <#${message.channelId}>`,
    }).catch(() => undefined);
  }

  private async processScheduledTask(id: string): Promise<void> {
    const task = await this.prisma.scheduledTask.findUnique({ where: { id } });
    if (!task) return;
    const config = (task.config ?? {}) as Record<string, unknown>;

    switch (task.type) {
      case 'announcement':
      case 'recurring_announcement':
      case 'embed':
      case 'reminder': {
        const channelId = String(config.channelId ?? config.targetChannelId ?? '');
        if (!channelId) throw new Error('No target channel configured');
        const result = await this.messages.sendMessage({
          guildId: task.guildId,
          channelIds: [channelId],
          content: config.content ? String(config.content) : null,
          embeds: Array.isArray(config.embeds) ? config.embeds : undefined,
        });
        if (result.failed.length > 0) throw new Error(result.failed[0].error);
        break;
      }
      case 'giveaway_end': {
        // Giveaway end is handled by the giveaway processor; mark task complete.
        if (config.giveawayId) {
          await this.endGiveaway(String(config.giveawayId), task.guildId);
        }
        break;
      }
      case 'event_reminder': {
        const channelId = String(config.channelId ?? '');
        const eventId = String(config.eventId ?? '');
        if (channelId && eventId) {
          await this.messages.sendMessage({
            guildId: task.guildId,
            channelIds: [channelId],
            content: `📅 Reminder: event <#${eventId}> is coming up!`,
          });
        }
        break;
      }
      default:
        throw new Error(`Unsupported scheduled task type: ${task.type}`);
    }

    if (task.recurring) {
      // Queue the next occurrence after the cron interval by scheduling a
      // follow-up task. The DB-backed row keeps the recurrence durable.
      const next = this.nextCronRunAt(task.recurring);
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: { runAt: next, lastRunAt: new Date(), lastError: null, status: 'pending' },
      });
    } else {
      await this.prisma.scheduledTask.update({
        where: { id: task.id },
        data: { status: 'completed', lastRunAt: new Date(), lastError: null },
      });
    }
  }

  private async endGiveaway(giveawayId: string, guildId: string): Promise<void> {
    const giveaway = await this.prisma.giveaway.findUnique({ where: { id: giveawayId } });
    if (!giveaway || giveaway.status !== 'running') return;
    const entries = await this.prisma.giveawayEntry.findMany({
      where: { giveawayId },
      orderBy: { joinedAt: 'asc' },
    });
    const channelId = giveaway.channelId;
    const winnerCount = Math.min(giveaway.winnerCount, entries.length);
    // Fair selection: shuffle. We record the draw order that was actually used.
    const shuffled = entries.map((e) => e.userId);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const winners = shuffled.slice(0, winnerCount);
    await this.prisma.giveaway.update({
      where: { id: giveawayId },
      data: { status: 'ended', endedAt: new Date(), winners },
    });
    if (channelId && winners.length > 0) {
      await this.messages.sendMessage({
        guildId,
        channelIds: [channelId],
        content: `🎉 Giveaway **${giveaway.prize}** ended! Winners: ${winners.map((w) => `<@${w}>`).join(', ')}`,
      });
    }
  }

  private nextCronRunAt(expression: string): Date {
    // Minimal next-minute resolver for simple cron expressions like "0 * * * *".
    const parts = expression.trim().split(/\s+/);
    const now = new Date();
    const next = new Date(now);
    if (parts.length === 5 && parts[1] === '*') {
      next.setMinutes(next.getMinutes() + 1, 0, 0);
      return next;
    }
    // Fallback: run again in 1 hour.
    next.setHours(next.getHours() + 1, 0, 0, 0);
    return next;
  }
}