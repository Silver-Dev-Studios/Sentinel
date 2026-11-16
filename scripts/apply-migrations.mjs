/**
 * Pooler-safe Prisma migration applier.
 *
 * `prisma migrate deploy` drives its schema engine over named prepared
 * statements, which the Supabase transaction pooler (PgBouncer, port 6543)
 * rejects with `prepared statement "s0" does not exist`. Running it at boot
 * is therefore unreliable when DATABASE_URL points at the pooler.
 *
 * This script applies the same per-migration migration.sql files through a
 * regular Prisma Client connection (single statements via $executeRawUnsafe),
 * which the pooler handles fine. It mirrors Prisma's own bookkeeping in
 * `_prisma_migrations` (same table schema, same checksum = sha256 of the
 * migration.sql bytes), so a later `prisma migrate deploy` against a direct
 * connection will see these migrations as already applied.
 *
 * Usage: node scripts/apply-migrations.mjs
 * Env:   DATABASE_URL (the pooled or direct URL)
 */

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const MIGRATIONS_DIR = join(ROOT, 'packages/database/prisma/migrations');

// Match the way the Prisma Client factory patches DATABASE_URL so dialing the
// pooler still gets a sane connection limit instead of the tiny free-tier
// default (P2024 "timed out fetching a new connection").
function withPoolParams(databaseUrl) {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5');
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '15000');
  return url.toString();
}

function parseStatements(sql) {
  const statements = [];
  let current = [];
  for (const line of sql.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('--')) continue;
    current.push(line);
    if (trimmed.endsWith(';')) {
      statements.push(current.join('\n').trim());
      current = [];
    }
  }
  if (current.length) {
    const rest = current.join('\n').trim();
    if (rest) statements.push(rest);
  }
  return statements.filter(Boolean);
}

async function ensureMigrationTable(client) {
  await client.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )
  `);
}

async function main() {
  const client = new PrismaClient({
    datasourceUrl: withPoolParams(process.env.DATABASE_URL),
  });
  try {
    const dirs = (await readdir(MIGRATIONS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    await ensureMigrationTable(client);

    const appliedRows = await client.$queryRawUnsafe(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`
    );
    const applied = new Set(appliedRows.map((r) => r.migration_name));

    let appliedCount = 0;
    for (const dir of dirs) {
      if (applied.has(dir)) continue;
      const sql = await readFile(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8');
      const statements = parseStatements(sql);
      console.log(`[apply-migrations] applying ${dir} (${statements.length} statements)`);
      const id = randomUUID();
      const checksum = createHash('sha256').update(sql).digest('hex');
      const startedAt = new Date();
      await client.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" ("id","checksum","started_at","migration_name","logs","rolled_back_at","applied_steps_count","finished_at") VALUES ($1,$2,$3,$4,NULL,NULL,$5,NULL)`,
        id, checksum, startedAt, dir, 0
      );
      for (const stmt of statements) {
        await client.$executeRawUnsafe(stmt);
      }
      await client.$executeRawUnsafe(
        `UPDATE "_prisma_migrations" SET "applied_steps_count" = $1, "finished_at" = now() WHERE "id" = $2`,
        statements.length, id
      );
      appliedCount += 1;
      console.log(`[apply-migrations] applied ${dir}`);
    }
    console.log(`[apply-migrations] done (${appliedCount} new, ${applied.size} already applied)`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((err) => {
  console.error('[apply-migrations] failed:', err.message);
  process.exit(1);
});