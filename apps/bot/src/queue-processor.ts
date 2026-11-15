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
    private readonly pollIntervalMs = 5_000,
  ) {
    this.moderation = new ModerationService({ deps: createPrismaDeps(prisma), transport });
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
          scheduledStartTime: String(payload.scheduledStartTime),
          scheduledEndTime: payload.scheduledEndTime ? String(payload.scheduledEndTime) : null,
          channelId: payload.channelId ? String(payload.channelId) : null,
          entityType: payload.entityType ? String(payload.entityType) : null,
          image: payload.image ? String(payload.image) : null,
        });
        await this.api.reportActivity({
          guildId: command.guildId,
          type: 'event_created',
          actorId: command.actorId ?? undefined,
          message: `Event **${String(payload.name)}** scheduled`,
        }).catch(() => undefined);
        return this.finish(command.id, true, undefined, { eventId });
      }
      case 'cancel_event': {
        await this.messages.cancelEvent({
          guildId: command.guildId,
          eventId: String(payload.eventId),
        });
        return this.finish(command.id, true, undefined, { ok: true });
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
}