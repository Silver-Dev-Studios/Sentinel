/**
 * Discord OAuth2 helpers for the backend API. Uses only the REST endpoints.
 */
import type { DiscordUser } from './index.js';

export interface DiscordOAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export async function exchangeCode(code: string, config: OAuthConfig): Promise<DiscordOAuthToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
    scope: 'identify guilds guilds.members.read',
  });
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord OAuth token exchange failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return (await response.json()) as DiscordOAuthToken;
}

export async function refreshAccessToken(refreshToken: string, config: OAuthConfig): Promise<DiscordOAuthToken> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const response = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord OAuth refresh failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return (await response.json()) as DiscordOAuthToken;
}

export async function fetchOAuthUser(token: string): Promise<DiscordUser> {
  const response = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Discord user fetch failed (${response.status})`);
  }
  return (await response.json()) as DiscordUser;
}

export async function fetchOAuthGuilds(token: string): Promise<
  { id: string; name: string; icon: string | null; owner: boolean; permissions: string }[]
> {
  const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`Discord guilds fetch failed (${response.status})`);
  }
  const data = (await response.json()) as {
    id: string;
    name: string;
    icon: string | null;
    owner: boolean;
    permissions: string;
  }[];
  return data; // no size beyond 200 for the /users/@me/guilds endpoint by default
}

export function isAdminInGuild(guild: { owner: boolean; permissions: string }): boolean {
  if (guild.owner) return true;
  const perms = BigInt(guild.permissions);
  // MANAGE_GUILD (0x20) or ADMINISTRATOR (0x8)
  return (perms & (BigInt(0x20) | BigInt(0x8))) !== 0n;
}

export function hasDiscordPermission(permissions: string, flag: bigint): boolean {
  return (BigInt(permissions) & flag) !== 0n;
}

export const DISCORD_PERMISSIONS = {
  CREATE_INSTANT_INVITE: 0x1n,
  KICK_MEMBERS: 0x2n,
  BAN_MEMBERS: 0x4n,
  ADMINISTRATOR: 0x8n,
  MANAGE_CHANNELS: 0x10n,
  MANAGE_GUILD: 0x20n,
  MANAGE_MESSAGES: 0x2000n,
  MENTION_EVERYONE: 0x20000n,
  MANAGE_ROLES: 0x10000000n,
  MANAGE_WEBHOOKS: 0x20000000n,
  MANAGE_EVENTS: 0x200000000n,
} as const;

export type DiscordPermissionKey = keyof typeof DISCORD_PERMISSIONS;