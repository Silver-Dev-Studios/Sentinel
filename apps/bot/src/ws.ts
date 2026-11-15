import WebSocket from 'ws';
import type { BotConfig } from './config.js';
import type { ApiClient } from './api-client.js';

/**
 * Bot-side WebSocket connection to the API. Authenticated as the internal
 * client (x-sentinel-key) so the API reports the bot as connected. A REST
 * heartbeat fallback keeps the "connected" flag fresh even if this transport
 * hiccups, so the dashboard never claims a bot is online when it is not.
 */
export function connectBotSocket(config: BotConfig, api: ApiClient): void {
  const url = `${config.apiUrl.replace(/^http/, 'ws')}/ws`;
  let socket: WebSocket | null = null;
  let retries = 0;
  let heartbeat: NodeJS.Timeout | null = null;

  function connect(): void {
    try {
      socket = new WebSocket(url, {
        headers: {
          'x-sentinel-key': config.apiKey,
          'x-sentinel-user': 'sentinel-bot',
        },
      });
    } catch {
      scheduleReconnect();
      return;
    }

    socket.on('open', () => {
      retries = 0;
      socket?.send(JSON.stringify({ type: 'hello', role: 'bot' }));
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = setInterval(() => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.ping();
        }
      }, 30_000);
      heartbeat.unref();
    });

    socket.on('error', () => {
      socket?.close();
    });

    socket.on('close', () => {
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      scheduleReconnect();
    });

    socket.on('message', (data) => {
      // All command execution is queue-driven; inbound WS messages are a
      // future optimization.
      void data;
    });
  }

  function scheduleReconnect(): void {
    const delay = Math.min(30_000, 2_000 * 2 ** retries);
    retries++;
    setTimeout(connect, delay).unref();
  }

  connect();
}
