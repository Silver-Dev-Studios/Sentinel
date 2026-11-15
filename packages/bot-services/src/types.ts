import type { PermissionKey } from '@sds-sentinel/shared';

/** An actor from either the dashboard or Discord. */
export interface Actor {
  userId: string;
  username?: string;
  source: 'dashboard' | 'discord_command';
  commandName?: string;
}

/** Result of a Discord-mutating moderation action. */
export interface ModerationActionResult {
  ok: boolean;
  error?: string;
  caseId?: string;
  caseNumber?: number;
  /** Moderation case action key (ban, kick, ...) */
  action: string;
}

export interface ServiceDeps {
  saveCase(deps: {
    guildId: string;
    action: string;
    actor: Actor;
    targetId?: string;
    targetUsername?: string;
    reason?: string | null;
    detail?: Record<string, unknown>;
    channelId?: string;
    messageId?: string;
  }): Promise<{ id: string; caseNumber: number }>;
  recordWarn(deps: {
    guildId: string;
    memberId: string;
    moderatorId: string;
    reason: string;
  }): Promise<void>;
  upsertMember(deps: {
    guildId: string;
    userId: string;
    username?: string;
    displayName?: string;
    avatar?: string | null;
    joinedAt?: Date | null;
  }): Promise<void>;
}

export interface UserInfo {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bot: boolean;
  joinedAt: string | null;
  createdAt: string | null;
  roles: string[];
  communicationDisabledUntil: string | null;
  pending: boolean | null;
}

export type { PermissionKey };