import 'dotenv/config';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();
  const config = app.config;
  const port = config.port;
  const host = config.isProduction ? '0.0.0.0' : '0.0.0.0';

  const heartbeat = app.wsHub.startHeartbeat();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    clearInterval(heartbeat);
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port, host });
    app.log.info(`Sentinel API listening on ${config.apiUrl}`);
  } catch (err) {
    app.log.error(err, 'Failed to start API');
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});