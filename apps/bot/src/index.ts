import 'dotenv/config';
import { Client, Events, GatewayIntentBits, ActivityType } from 'discord.js';
import { getPrisma, checkDatabaseHealth } from '@sds-sentinel/database';
import { ModerationService, createPrismaDeps } from '@sds-sentinel/bot-services';
import { loadBotConfig } from './config.js';
import { createTransport } from './transport.js';
import { ApiClient } from './api-client.js';
import { SnipeStore } from './snipe.js';
import { PrefixCommands } from './prefix.js';
import { ModerationCommands, registerCommands } from './commands.js';
import { attachListeners } from './listeners.js';
import { QueueProcessor } from './queue-processor.js';
import { BotMessageService } from './message-service.js';
import { BotScheduler } from './scheduler.js';
import { connectBotSocket } from './ws.js';
import { syncAllChannels, syncGuildChannels } from './channel-sync.js';

async function main(): Promise<void> {
  const config = loadBotConfig();
  const prisma = getPrisma();

  const health = await checkDatabaseHealth();
  if (!health.ok) {
    console.error('[sentinel-bot] database unavailable at startup:', health.detail);
    process.exit(1);
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildModeration,
    ],
  });

  const api = new ApiClient(config);
  const transport = createTransport(client);
  const messages = new BotMessageService(client);
  const snipe = new SnipeStore(prisma);
  const deps = createPrismaDeps(prisma);
  const moderation = new ModerationService({ deps, transport });
  const prefixCommands = new PrefixCommands(prisma, moderation, api, snipe, config.prefix);
  const slashCommands = new ModerationCommands(prisma, transport, deps);

  client.once(Events.ClientReady, async (ready) => {
    console.log(`[sentinel-bot] logged in as ${ready.user.tag}`);
    await registerCommands(client);
    console.log('[sentinel-bot] slash commands registered');

    // Filter watched guilds to the allowlist (if configured).
    const allowlist = new Set(config.guildAllowlist);
    if (allowlist.size > 0) {
      const dropped = ready.guilds.cache.filter((g) => !allowlist.has(g.id));
      for (const guild of dropped.values()) {
        console.log(`[sentinel-bot] guild ${guild.name} (${guild.id}) is outside the allowlist; not administering`);
      }
    }

    // Mirror channel structure so the dashboard offers real channel pickers.
    await syncAllChannels(prisma, client, config.guildAllowlist);

    ready.user.setActivity('SDS servers', { type: ActivityType.Watching });
  });

  // Re-sync channels when new servers come online or channel structure changes.
  client.on(Events.GuildCreate, (guild) => {
    if (config.guildAllowlist.length > 0 && !config.guildAllowlist.includes(guild.id)) return;
    void syncGuildChannels(prisma, client, guild.id);
  });
  client.on(Events.ChannelCreate, (channel) => {
    if (!('guildId' in channel)) return;
    const channelType = (channel as { type: number }).type;
    if (![0, 2, 5, 15].includes(channelType)) return;
    const guildId = (channel as { guildId: string }).guildId;
    if (config.guildAllowlist.length > 0 && !config.guildAllowlist.includes(guildId)) return;
    void syncGuildChannels(prisma, client, guildId);
  });
  client.on(Events.ChannelDelete, (channel) => {
    if (!('guildId' in channel)) return;
    const channelType = (channel as { type: number }).type;
    if (![0, 2, 5, 15].includes(channelType)) return;
    const guildId = (channel as { guildId: string }).guildId;
    void syncGuildChannels(prisma, client, guildId);
  });

  attachListeners(client, prisma, api, snipe, prefixCommands, slashCommands);

  const queueProcessor = new QueueProcessor(prisma, transport, messages, api);
  queueProcessor.start();

  const scheduler = new BotScheduler(prisma, messages, api);
  scheduler.start();

  connectBotSocket(config, api);

  await client.login(config.token);
}

main().catch((err) => {
  console.error('[sentinel-bot] fatal error:', err);
  process.exit(1);
});