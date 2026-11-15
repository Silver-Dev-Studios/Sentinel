import { PrismaClient } from '@prisma/client';

declare global {
  // Reuse a single client across hot-reloads in development.
  // eslint-disable-next-line no-var
  var __sentinelPrisma: PrismaClient | undefined;
}

export function createPrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.SENTINEL_LOG_LEVEL === 'debug'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });
}

let prisma: PrismaClient;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = global.__sentinelPrisma ?? createPrisma();
    if (process.env.NODE_ENV !== 'production') {
      global.__sentinelPrisma = prisma;
    }
  }
  return prisma;
}

export async function checkDatabaseHealth(): Promise<{
  ok: boolean;
  latencyMs: number;
  detail?: string;
}> {
  const started = Date.now();
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      detail: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

export { PrismaClient } from '@prisma/client';