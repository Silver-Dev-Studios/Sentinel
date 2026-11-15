import { ModerationService, type ModerationTransport } from './service.js';
import type { ServiceDeps } from './types.js';

export interface ServiceRegistry {
  moderation: ModerationService;
}

export function createServiceRegistry(deps: ServiceDeps, transport: ModerationTransport): ServiceRegistry {
  return {
    moderation: new ModerationService({ deps, transport }),
  };
}

export type { ModerationTransport } from './service.js';
export type { ServiceDeps } from './types.js';