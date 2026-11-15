/**
 * Shared business logic used by both the Discord bot and the backend API.
 *
 * Discord-mutating implementations are injected so this package stays
 * transport-agnostic: the bot injects discord.js-backed implementations, while
 * the API persists intent via the bot command queue.
 */

export * from './types.js';
export * from './registry.js';
export { ModerationService, type ModerationTransport } from './service.js';
export * from './deps.js';