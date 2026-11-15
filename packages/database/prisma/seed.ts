/**
 * Sentinel database seed.
 *
 * Only seeds globally-shared reference data and, when SENTINEL_SEED_DEMO is
 * set, a documented demo environment. The production deployment must NOT set
 * SENTINEL_SEED_DEMO. Authorized servers are intentionally never seeded in
 * production: they are added by the bot when an operator authorizes a guild.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  // No static reference data is required. The record below exists so we can
  // note explicitly that seeding is caller-driven.
  const demo = process.env.SENTINEL_SEED_DEMO === 'true';

  if (demo) {
    const guildId = process.env.SENTINEL_DEMO_GUILD_ID ?? '000000000000000000';
    const exists = await prisma.authorizedServer.findUnique({ where: { id: guildId } });
    if (!exists) {
      await prisma.authorizedServer.create({
        data: { id: guildId, name: 'Demo Server', ownerId: '000000000000000000' },
      });
      await prisma.serverConfiguration.create({ data: { guildId } });
      console.log(`[seed] demo authorized server ${guildId} created`);
    }
  }

  console.log('[seed] complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());