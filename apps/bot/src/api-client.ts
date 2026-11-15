import type { BotConfig } from './config.js';

/**
 * Bot → API bridge. The API never holds the Discord token; the bot reports
 * events it has observed so the dashboard can display real data.
 */
export class ApiClient {
  constructor(private readonly config: BotConfig) {}

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${this.config.apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sentinel-key': this.config.apiKey,
        'x-sentinel-user': 'sentinel-bot',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API ${path} failed (${response.status}): ${text.slice(0, 200)}`);
    }
    return response.json().catch(() => undefined);
  }

  reportActivity(input: { guildId: string; type: string; message: string; actorId?: string; detail?: object }): Promise<unknown> {
    return this.post('/api/bridge/activity', input);
  }

  reportDiagnostic(input: { guildId?: string; kind: string; message: string; detail?: object }): Promise<unknown> {
    return this.post('/api/bridge/diagnostic', input);
  }
}