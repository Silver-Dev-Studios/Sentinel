/**
 * Built-in Sentinel command catalog.
 *
 * Single source of truth for the built-in Discord commands the bot exposes.
 * The bot's prefix/slash handlers implement these; the dashboard Commands page
 * renders this catalog so the documentation never drifts from reality. Custom
 * (user-created) commands are stored in the database, not here.
 *
 * Command notation (per spec §22):
 *   prefix = `+command` only, slash = `/command` only, both = both work.
 */

import type { CommandInterface } from './index.js';

export type CommandCategory = 'moderation' | 'management';

export interface SentinelCommand {
  /** Lowercase command name, e.g. `ban`. */
  name: string;
  /** How the command can be invoked. */
  iface: CommandInterface;
  /** Human description shown in help / the Commands page. */
  description: string;
  category: CommandCategory;
  /** Sentinel permission required to run it. */
  permission: string;
  /** Short usage signature with the interface marker (e.g. `/ban <user> [reason]`). */
  usage: string;
  /** Options/args detail rendered as bullet lines. */
  options?: string[];
}

export const BUILTIN_COMMANDS: SentinelCommand[] = [
  {
    name: 'ban',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.ban',
    description: 'Ban a member from the server.',
    usage: '`/ban <user> [reason] [days 0-7]` — `+ban <@user> [reason]`',
    options: ['user — member to ban', 'reason — optional ban reason', 'days — delete message history (0-7)'],
  },
  {
    name: 'unban',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.ban',
    description: 'Unban a previously banned user.',
    usage: '`/unban <user> [reason]` — `+unban <@user> [reason]`',
  },
  {
    name: 'kick',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.kick',
    description: 'Kick a member from the server.',
    usage: '`/kick <user> [reason]` — `+kick <@user> [reason]`',
  },
  {
    name: 'warn',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.warn',
    description: 'Issue a warning to a member (recorded in their moderation history).',
    usage: '`/warn <user> <reason>` — `+warn <@user> <reason>`',
    options: ['reason — required warning reason'],
  },
  {
    name: 'timeout',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.untime',
    description: 'Timeout a member for a given number of minutes.',
    usage: '`/timeout <user> <minutes> [reason]` — `+timeout <@user> <minutes> [reason]`',
    options: ['minutes — required duration in minutes'],
  },
  {
    name: 'untime',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.untime',
    description: 'Remove a timeout from a member.',
    usage: '`/untime <user> [reason]` — `+untime <@user> [reason]`',
  },
  {
    name: 'lock',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.lock',
    description: 'Lock the current (or a chosen) channel so members cannot send messages.',
    usage: '`/lock [channel] [reason]` — `+lock [reason]`',
  },
  {
    name: 'unlock',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.lock',
    description: 'Unlock a previously locked channel.',
    usage: '`/unlock [channel] [reason]` — `+unlock [reason]`',
  },
  {
    name: 'purge',
    iface: 'both',
    category: 'moderation',
    permission: 'moderation.purge',
    description: 'Bulk-delete messages in the current channel.',
    usage: '`/purge <amount>` — `+purge <amount>`',
    options: ['amount — number of messages (1-100)'],
  },
  {
    name: 'snipe',
    iface: 'prefix',
    category: 'moderation',
    permission: 'moderation.snipe',
    description: 'Show the most recently deleted message in this channel.',
    usage: '`+snipe`',
  },
];