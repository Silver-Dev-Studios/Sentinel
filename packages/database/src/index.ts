import { PrismaClient } from '@prisma/client';

declare global {
  // Reuse a single client across hot-reloads in development.
  // eslint-disable-next-line no-var
  var __sentinelPrisma: PrismaClient | undefined;
}

/**
 * Render's free Postgres (and a 0-CPU free web service) makes Prisma default
 * to a tiny connection pool (`num_physical_cpus * 2 + 1` = 1 here). The
 * dashboard overview fans out 8+ concurrent queries per guild, so a single
 * pooled connection queues them all and the 10s pool timeout explodes into
 * P2024 "Timed out fetching a new connection" 500s after the free database
 * hibernates. Pin a sane pool size and a longer pool timeout on the existing
 * `DATABASE_URL` instead of relying on whatever the platform default yields.
 */
const DEFAULT_CONNECTION_LIMIT = 5;
const DEFAULT_POOL_TIMEOUT_MS = 15_000;

function withPoolParams(databaseUrl: string | undefined): string {
  const base = databaseUrl ?? process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL is required');
  const url = new URL(base);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(DEFAULT_CONNECTION_LIMIT));
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(DEFAULT_POOL_TIMEOUT_MS));
  }
  return url.toString();
}

export function createPrisma(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: withPoolParams(process.env.DATABASE_URL),
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