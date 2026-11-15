/**
 * Discord REST client used by the bot background worker.
 *
 * The bot process uses its own token; the API process never holds it. This
 * module therefore only lives in the bot application (and unit tests), never
 * in the web service.
 */
import type { Expand } from './types.js';

export * from './oauth.js';

export interface DiscordUser {
  id: string;
  username: string;
  discriminator?: string;
  avatar: string | null;
  bot?: boolean;
  global_name?: string | null;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner_id: string;
  member_count?: number;
  approximate_presence_count?: number;
  permissions?: string;
  features?: string[];
}

export interface DiscordChannel {
  id: string;
  type: number;
  name?: string;
  guild_id?: string;
  position?: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  permissions: string;
  position: number;
  managed: boolean;
  hoist: boolean;
  color: number;
  mentionable: boolean;
}

export interface DiscordGuildMember {
  user?: DiscordUser;
  nick: string | null;
  roles: string[];
  joined_at: string | null;
  premium_since?: string | null;
  pending?: boolean;
  communication_disabled_until?: string | null;
}

export type DiscordEmbedField = Expand<{
  name: string;
  value: string;
  inline?: boolean;
}>;

export type DiscordEmbed = Expand<{
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name?: string; url?: string; icon_url?: string };
  thumbnail?: { url?: string };
  image?: { url?: string };
  footer?: { text?: string; icon_url?: string };
  fields?: DiscordEmbedField[];
}>;

export type RateLimitState = Expand<{
  remaining: number;
  resetAt: number;
}>;

export interface RestRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  reason?: string;
  retries?: number;
}

const API_VERSION = '10';
const BASE = `https://discord.com/api/v${API_VERSION}`;
const MAX_RETRIES = 4;

const isRateLimit = (status: number): boolean => status === 429;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DiscordRestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: number | null,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'DiscordRestError';
  }
}

/**
 * Minimal REST client with rate-limit honoring and idempotent retries.
 * Uses only stdlib fetch. Credentials are supplied by the caller (bot token).
 */
export class DiscordRestClient {
  private readonly token: string;
  private residual = 0;
  private readonly bucket: Map<string, RateLimitState> = new Map();

  constructor(token: string) {
    if (!token) {
      throw new Error('DiscordRestClient requires a bot token');
    }
    this.token = token;
  }

  async request<T = unknown>(req: RestRequest): Promise<T> {
    const key = `${req.method} ${req.path.split('?')[0]}`;
    const bucketState = this.bucket.get(key);
    if (bucketState) {
      if (bucketState.remaining <= 0 && bucketState.resetAt > Date.now()) {
        await sleep(Math.min(bucketState.resetAt - Date.now() + 10, 65_000));
      }
    }

    const retries = req.retries ?? MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const url = new URL(`${BASE}${req.path}`);
      if (req.query) {
        for (const [k, v] of Object.entries(req.query)) {
          if (v !== undefined && v !== '') {
            url.searchParams.set(k, String(v));
          }
        }
      }

      const headers: Record<string, string> = {
        Authorization: `Bot ${this.token}`,
        'User-Agent': 'DiscordBot (https://github.com/Silver-Dev-Studios/Sentinel, 1.0.0)',
      };
      if (req.body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (req.reason) {
        headers['X-Audit-Log-Reason'] = req.reason.slice(0, 512);
      }

      const response = await fetch(url, {
        method: req.method,
        headers,
        body: req.body !== undefined ? JSON.stringify(req.body) : undefined,
      });

      if (response.status === 429) {
        let retryAfter = Number(response.headers.get('Retry-After') ?? '1');
        if (!Number.isFinite(retryAfter) || retryAfter < 0) retryAfter = 1;
        const global = response.headers.get('X-RateLimit-Global') === 'true';
        // Global rate limit: wait longer and honor global reset
        await sleep(Math.min((global ? 5 : 1) * retryAfter * 1000, 65_000));
        continue;
      }

      // Track per-bucket rate limits
      const remainingHeader = response.headers.get('X-RateLimit-Remaining');
      const resetAfterHeader = response.headers.get('X-RateLimit-Reset-After');
      const resetHeader = response.headers.get('X-RateLimit-Reset');
      if (remainingHeader && resetAfterHeader) {
        this.bucket.set(key, {
          remaining: Number(remainingHeader),
          resetAt: Date.now() + Math.max(Number(resetAfterHeader) * 1000, 500),
        });
      } else if (resetHeader) {
        this.bucket.set(key, {
          remaining: 1,
          resetAt: Number(resetHeader) * 1000,
        });
      }

      if (response.ok) {
        if (response.status === 204) return undefined as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }

      if (response.status >= 500 || response.status === 429) {
        lastError = new DiscordRestError(
          `Discord ${req.method} ${req.path} failed with ${response.status}`,
          response.status,
          (json as { code?: number } | null)?.code ?? null,
          json,
        );
        await sleep(500 * (attempt + 1));
        continue;
      }

      if (response.status === 403) {
        throw new DiscordRestError(
          `Discord ${req.method} ${req.path} forbidden (missing permission)`,
          403,
          (json as { code?: number } | null)?.code ?? null,
          json,
        );
      }

      throw new DiscordRestError(
        `Discord ${req.method} ${req.path} failed with ${response.status}: ${text.slice(0, 200)}`,
        response.status,
        (json as { code?: number } | null)?.code ?? null,
        json,
      );
    }

    throw lastError ?? new Error(`Discord request ${req.method} ${req.path} failed after retries`);
  }

  getCurrentUser(): Promise<DiscordUser> {
    return this.request<DiscordUser>({ method: 'GET', path: '/users/@me' });
  }

  getGuild(guildId: string): Promise<DiscordGuild> {
    return this.request<DiscordGuild>({ method: 'GET', path: `/guilds/${guildId}` });
  }

  getGuilds(): Promise<DiscordGuild[]> {
    return this.request<DiscordGuild[]>({ method: 'GET', path: '/users/@me/guilds', query: { limit: 200 } });
  }

  getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    return this.request<DiscordChannel[]>({ method: 'GET', path: `/guilds/${guildId}/channels` });
  }

  getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    return this.request<DiscordRole[]>({ method: 'GET', path: `/guilds/${guildId}/roles` });
  }

  getGuildMember(guildId: string, userId: string): Promise<DiscordGuildMember> {
    return this.request<DiscordGuildMember>({ method: 'GET', path: `/guilds/${guildId}/members/${userId}` });
  }

  getGuildMembers(guildId: string, limit = 1000, after?: string): Promise<DiscordGuildMember[]> {
    return this.request<DiscordGuildMember[]>({
      method: 'GET',
      path: `/guilds/${guildId}/members`,
      query: { limit: Math.min(limit, 1000), after },
    });
  }

  createMessage(channelId: string, payload: {
    content?: string;
    embeds?: DiscordEmbed[];
    allowed_mentions?: unknown;
    components?: unknown[];
  }): Promise<{ id: string; channel_id: string }> {
    return this.request<{ id: string; channel_id: string }>({
      method: 'POST',
      path: `/channels/${channelId}/messages`,
      body: payload,
    });
  }

  editMessage(channelId: string, messageId: string, payload: {
    content?: string;
    embeds?: DiscordEmbed[];
  }): Promise<{ id: string }> {
    return this.request<{ id: string }>({
      method: 'PATCH',
      path: `/channels/${channelId}/messages/${messageId}`,
      body: payload,
    });
  }

  deleteMessage(channelId: string, messageId: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path: `/channels/${channelId}/messages/${messageId}` });
  }

  bulkDeleteMessages(channelId: string, messageIds: string[]): Promise<void> {
    return this.request<void>({ method: 'POST', path: `/channels/${channelId}/messages/bulk-delete`, body: { messages: messageIds } });
  }

  banUser(guildId: string, userId: string, reason?: string, deleteMessageSeconds?: number): Promise<void> {
    return this.request<void>({
      method: 'PUT',
      path: `/guilds/${guildId}/bans/${userId}`,
      body: deleteMessageSeconds ? { delete_message_seconds: deleteMessageSeconds } : {},
      reason,
    });
  }

  unbanUser(guildId: string, userId: string, reason?: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path: `/guilds/${guildId}/bans/${userId}`, reason });
  }

  removeMember(guildId: string, userId: string, reason?: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path: `/guilds/${guildId}/members/${userId}`, reason });
  }

  modifyMember(guildId: string, userId: string, payload: Record<string, unknown>, reason?: string): Promise<DiscordGuildMember> {
    return this.request<DiscordGuildMember>({ method: 'PATCH', path: `/guilds/${guildId}/members/${userId}`, body: payload, reason });
  }

  getGuildScheduledEvent(guildId: string, eventId: string): Promise<{
    id: string;
    name: string;
    description?: string | null;
    scheduled_start_time: string;
    scheduled_end_time?: string | null;
    entity_type: number;
    status: number;
  }> {
    return this.request({
      method: 'GET',
      path: `/guilds/${guildId}/scheduled-events/${eventId}`,
    });
  }

  createGuildScheduledEvent(guildId: string, payload: Record<string, unknown>): Promise<{
    id: string;
    status: number;
    scheduled_start_time: string;
  }> {
    return this.request({
      method: 'POST',
      path: `/guilds/${guildId}/scheduled-events`,
      body: payload,
    });
  }

  deleteGuildScheduledEvent(guildId: string, eventId: string): Promise<void> {
    return this.request<void>({ method: 'DELETE', path: `/guilds/${guildId}/scheduled-events/${eventId}` });
  }

  createWebhook(channelId: string, payload: { name: string; avatar?: string }): Promise<{ id: string }> {
    return this.request<{ id: string }>({ method: 'POST', path: `/channels/${channelId}/webhooks`, body: payload });
  }

  isRateLimitActive(): boolean {
    for (const state of this.bucket.values()) {
      if (state.remaining <= 0 && state.resetAt > Date.now()) return true;
    }
    return false;
  }

  resetState(): void {
    this.bucket.clear();
    this.residual = 0;
  }
}