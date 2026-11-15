/**
 * Sentinel-wide shared types, constants, and conventions.
 *
 * This package is dependency-free and may be imported by the bot, API, and
 * dashboard. `permission.ts` is also re-exported here so consumers have a
 * single import surface.
 */

export * from './permission.js';
export * from './action-source.js';
export * from './snip.js';

/** Sentinel command notation: `+` prefix, `/` slash, `+/` both. */
export type CommandInterface = 'prefix' | 'slash' | 'both';

export type SystemStatus = 'operational' | 'degraded' | 'down' | 'unknown';
export type OnOff = 'enabled' | 'disabled';

/** Generic severity used by alerts, audit, diagnostics. */
export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export const CLIENT_KINDS = ['discordBot', 'discordGateway', 'backendApi', 'webSocket', 'database', 'scheduler', 'backgroundTasks'] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];

export interface ServiceState {
  kind: ClientKind;
  status: SystemStatus;
  detail?: string;
  updatedAt: string;
}