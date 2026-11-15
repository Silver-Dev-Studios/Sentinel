/**
 * The API's internal side-channel to the bot process.
 *
 * The bot connects to `GET /ws` with `x-sentinel-key` set; the API injects
 * commands by writing the BotCommand row (durable queue) and nudging the bot
 * over this socket when live.
 */
import type { PrismaClient } from '@prisma/client';
import type { WsHub } from './hub.js';

export interface EnqueueOptions {
  guildId: string;
  actorId?: string;
  type: string;
  payload: Record<string, unknown>;
}

export class BotNotifier {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly hub: WsHub,
  ) {}

  async enqueue(opts: EnqueueOptions): Promise<{ id: string; status: string }> {
    const command = await this.prisma.botCommand.create({
      data: {
        guildId: opts.guildId,
        actorId: opts.actorId ?? null,
        type: opts.type,
        payload: opts.payload as object,
      },
    });
    this.hub.publishToBot({ type: 'bot:command', commandId: command.id });
    return { id: command.id, status: command.status };
  }

  isBotOnline(): boolean {
    return this.hub.botConnected;
  }
}