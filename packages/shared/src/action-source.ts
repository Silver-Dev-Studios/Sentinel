/** Where an administrative or moderation action originated. */
export type ActionSource = 'discord_command' | 'dashboard';

export interface CaseSourceInfo {
  source: ActionSource;
  /** snowflake manager user id when the action came from a Discord command */
  commandName?: string;
  /** snowflake interaction or message id */
  commandId?: string;
}