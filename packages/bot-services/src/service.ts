import type { ServiceDeps, Actor, ModerationActionResult, UserInfo } from './types.js';

/**
 * Transport implementations for Discord-mutating actions. The bot injects
 * discord.js-backed functions; nothing in this package calls the Discord API
 * directly so both process kinds share the same business logic and case logging.
 */
export interface ModerationTransport {
  banMember(input: { guildId: string; userId: string; reason?: string | null; deleteMessageSeconds?: number }): Promise<void>;
  unbanMember(input: { guildId: string; userId: string; reason?: string | null }): Promise<void>;
  kickMember(input: { guildId: string; userId: string; reason?: string | null }): Promise<void>;
  timeoutMember(input: { guildId: string; userId: string; minutes: number; reason?: string | null }): Promise<void>;
  untimeoutMember(input: { guildId: string; userId: string; reason?: string | null }): Promise<void>;
  lockChannel(input: { guildId: string; channelId: string; reason?: string | null }): Promise<void>;
  unlockChannel(input: { guildId: string; channelId: string; reason?: string | null }): Promise<void>;
  purgeMessages(input: { guildId: string; channelId: string; amount: number; reason?: string | null }): Promise<{ count: number }>;
  fetchUserInfo(input: { guildId: string; userId: string }): Promise<UserInfo>;
}

export interface ModerationServiceOptions {
  deps: ServiceDeps;
  transport: ModerationTransport;
}

export class ModerationService {
  constructor(private readonly opts: ModerationServiceOptions) {}

  private get deps(): ServiceDeps {
    return this.opts.deps;
  }

  private get transport(): ModerationTransport {
    return this.opts.transport;
  }

  async ban(input: {
    guildId: string;
    userId: string;
    actor: Actor;
    reason?: string | null;
    deleteMessageSeconds?: number;
  }): Promise<ModerationActionResult> {
    try {
      await this.transport.banMember({
        guildId: input.guildId,
        userId: input.userId,
        reason: input.reason,
        deleteMessageSeconds: input.deleteMessageSeconds,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'ban',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
        detail: { deleteMessageSeconds: input.deleteMessageSeconds },
      });
      return { ok: true, action: 'ban', ...saved };
    } catch (err) {
      return { ok: false, action: 'ban', error: errorMessage(err) };
    }
  }

  async unban(input: { guildId: string; userId: string; actor: Actor; reason?: string | null }): Promise<ModerationActionResult> {
    try {
      await this.transport.unbanMember({ guildId: input.guildId, userId: input.userId, reason: input.reason });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'unban',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
      });
      return { ok: true, action: 'unban', ...saved };
    } catch (err) {
      return { ok: false, action: 'unban', error: errorMessage(err) };
    }
  }

  async kick(input: { guildId: string; userId: string; actor: Actor; reason?: string | null }): Promise<ModerationActionResult> {
    try {
      await this.transport.kickMember({ guildId: input.guildId, userId: input.userId, reason: input.reason });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'kick',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
      });
      return { ok: true, action: 'kick', ...saved };
    } catch (err) {
      return { ok: false, action: 'kick', error: errorMessage(err) };
    }
  }

  async timeout(input: {
    guildId: string;
    userId: string;
    minutes: number;
    actor: Actor;
    reason?: string | null;
  }): Promise<ModerationActionResult> {
    try {
      await this.transport.timeoutMember({
        guildId: input.guildId,
        userId: input.userId,
        minutes: input.minutes,
        reason: input.reason,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'timeout',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
        detail: { durationMinutes: input.minutes },
      });
      return { ok: true, action: 'timeout', ...saved };
    } catch (err) {
      return { ok: false, action: 'timeout', error: errorMessage(err) };
    }
  }

  async untime(input: { guildId: string; userId: string; actor: Actor; reason?: string | null }): Promise<ModerationActionResult> {
    try {
      await this.transport.untimeoutMember({ guildId: input.guildId, userId: input.userId, reason: input.reason });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'untime',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
      });
      return { ok: true, action: 'untime', ...saved };
    } catch (err) {
      return { ok: false, action: 'untime', error: errorMessage(err) };
    }
  }

  async warn(input: {
    guildId: string;
    userId: string;
    actor: Actor;
    reason: string;
  }): Promise<ModerationActionResult> {
    try {
      await this.deps.recordWarn({
        guildId: input.guildId,
        memberId: input.userId,
        moderatorId: input.actor.userId,
        reason: input.reason,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'warn',
        actor: input.actor,
        targetId: input.userId,
        reason: input.reason,
      });
      return { ok: true, action: 'warn', ...saved };
    } catch (err) {
      return { ok: false, action: 'warn', error: errorMessage(err) };
    }
  }

  async lock(input: { guildId: string; channelId: string; actor: Actor; reason?: string | null }): Promise<ModerationActionResult> {
    try {
      await this.transport.lockChannel({
        guildId: input.guildId,
        channelId: input.channelId,
        reason: input.reason,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'lock',
        actor: input.actor,
        reason: input.reason,
        detail: { channelId: input.channelId },
        channelId: input.channelId,
      });
      return { ok: true, action: 'lock', ...saved };
    } catch (err) {
      return { ok: false, action: 'lock', error: errorMessage(err) };
    }
  }

  async unlock(input: { guildId: string; channelId: string; actor: Actor; reason?: string | null }): Promise<ModerationActionResult> {
    try {
      await this.transport.unlockChannel({
        guildId: input.guildId,
        channelId: input.channelId,
        reason: input.reason,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'unlock',
        actor: input.actor,
        reason: input.reason,
        detail: { channelId: input.channelId },
        channelId: input.channelId,
      });
      return { ok: true, action: 'unlock', ...saved };
    } catch (err) {
      return { ok: false, action: 'unlock', error: errorMessage(err) };
    }
  }

  async purge(input: {
    guildId: string;
    channelId: string;
    amount: number;
    actor: Actor;
    reason?: string | null;
  }): Promise<ModerationActionResult> {
    try {
      const { count } = await this.transport.purgeMessages({
        guildId: input.guildId,
        channelId: input.channelId,
        amount: input.amount,
        reason: input.reason,
      });
      const saved = await this.deps.saveCase({
        guildId: input.guildId,
        action: 'purge',
        actor: input.actor,
        reason: input.reason,
        detail: { count, channelId: input.channelId },
        channelId: input.channelId,
      });
      return { ok: true, action: 'purge', ...saved };
    } catch (err) {
      return { ok: false, action: 'purge', error: errorMessage(err) };
    }
  }

  async userInfo(input: { guildId: string; userId: string }): Promise<UserInfo> {
    return this.transport.fetchUserInfo(input);
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Avoid leaking long bodies/stack traces into case records
    return msg.length > 300 ? msg.slice(0, 300) : msg;
  }
  return String(err);
}