import type { WebSocket } from 'ws';
import type { PrismaClient } from '@prisma/client';

interface Client {
  ws: WebSocket;
  userId: string;
  /** guilds the user can view (snowflakes) */
  guilds: Set<string>;
  isBot?: boolean;
  isAlive: boolean;
}

interface OutboundEvent {
  type: string;
  guildId?: string;
  [key: string]: unknown;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

/** Fan-out hub for real-time dashboard events and the internal bot feed. */
export class WsHub {
  private readonly clients = new Set<Client>();

  constructor(private readonly prisma: PrismaClient) {}

  connect(client: Client): void {
    this.clients.add(client);
    client.ws.on('pong', () => {
      client.isAlive = true;
    });
    client.ws.on('close', () => {
      this.clients.delete(client);
    });
  }

  /** Publish to every client that may view `guildId` (or all when no guild). */
  publish(event: OutboundEvent): number {
    let delivered = 0;
    for (const client of this.clients) {
      if (client.isBot) {
        // The bot subscribes to command completions via its own channel.
        continue;
      }
      if (event.guildId && !client.guilds.has(event.guildId)) {
        continue;
      }
      if (client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify(event));
        delivered++;
      }
    }
    return delivered;
  }

  /** Broadcast to the single internal bot client, if connected. */
  publishToBot(event: OutboundEvent): boolean {
    for (const client of this.clients) {
      if (client.isBot && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(JSON.stringify(event));
        return true;
      }
    }
    return false;
  }

  startHeartbeat(): NodeJS.Timeout {
    return setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  get connectedClients(): number {
    return this.clients.size;
  }

  get botConnected(): boolean {
    for (const client of this.clients) {
      if (client.isBot) return true;
    }
    return false;
  }

  /** REST heartbeat fallback so the bot's presence survives WS hiccups. */
  markBotAlive(): void {
    for (const client of this.clients) {
      if (client.isBot) client.isAlive = true;
    }
  }
}

export function createWsHub(prisma: PrismaClient): WsHub {
  return new WsHub(prisma);
}

export type WsActivityPayload = {
  guildId: string;
  type: string;
  actorId?: string | null;
  targetId?: string | null;
  message: string;
  detail?: Record<string, unknown>;
};

/** Persist an activity event and broadcast it to dashboard clients. */
export async function recordActivity(prisma: PrismaClient, hub: WsHub, payload: WsActivityPayload): Promise<void> {
  const event = await prisma.activityEvent.create({
    data: {
      guildId: payload.guildId,
      type: payload.type,
      actorId: payload.actorId ?? null,
      targetId: payload.targetId ?? null,
      message: payload.message,
      detail: payload.detail ? (payload.detail as object) : undefined,
    },
  });
  hub.publish({
    type: 'activity',
    guildId: payload.guildId,
    event: {
      id: event.id,
      type: event.type,
      actorId: event.actorId,
      targetId: event.targetId,
      message: event.message,
      detail: event.detail,
      createdAt: event.createdAt.toISOString(),
    },
  });
}