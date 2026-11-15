#!/usr/bin/env node
/**
 * Single-process supervisor for Render web services.
 *
 * Runs the Sentinel API and the Discord bot as child processes inside one
 * container so the platform's single-web-service plan can host both:
 *
 *   - The API child owns the HTTP port (`PORT`) so the platform health check
 *     targets the live web service. If the API dies the supervisor exits, and
 *     the platform restarts the whole service.
 *   - The bot child runs the persistent Discord Gateway connection. It is
 *     restarted on crash with backoff. A missing bot token disables it
 *     instead of crashing the service.
 *
 * Signals are forwarded to children. The supervisor does not restart the API:
 * a platform restart is the correct recovery for the process that owns the
 * HTTP listener.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const isEnabled = (value) => value !== 'false' && value !== '0' && value !== '';

// SENTINEL_BOT_ENABLED defaults to enabled; a bot token must be present.
const botEnabled =
  isEnabled(process.env.SENTINEL_BOT_ENABLED ?? 'true') &&
  Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_BOT_TOKEN.trim());

function makeSpawner(appDir, entry, envOverrides = {}) {
  const cwd = join(root, appDir);
  return (onExit) => {
    const child = spawn(process.execPath, [entry], {
      cwd,
      env: { ...process.env, ...envOverrides },
      stdio: ['inherit', 'inherit', 'inherit'],
    });
    child.on('exit', (code, signal) => onExit(code, signal));
    return child;
  };
}

const runApi = makeSpawner('apps/api', 'dist/server.js');

// The bot talks to the API over its own HTTP port inside the same container.
// Prefer localhost over the public URL: fewer moving parts, no public roundtrip.
function resolveBotApiUrl() {
  if (process.env.SENTINEL_API_URL) return null; // explicit override wins
  if (process.env.NODE_ENV === 'production' && process.env.PORT) {
    return `http://localhost:${process.env.PORT}`;
  }
  return null;
}

const runBot = (onExit) => {
  const botEnv = { ...process.env };
  const apiUrl = resolveBotApiUrl();
  if (apiUrl) botEnv.SENTINEL_API_URL = apiUrl;
  return makeSpawner('apps/bot', 'dist/index.js', botEnv)(onExit);
};

const children = new Map();
let stopping = false;

function stopAll(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) {
    child.kill(signal);
  }
}

function startApi() {
  console.log('[supervisor] starting API');
  const child = runApi((code, signal) => {
    console.log(`[supervisor] API exited (code=${code} signal=${signal})`);
    // Never restart the API process: the platform owns that recovery.
    stopAll('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  });
  children.set('api', child);
}

const MAX_BOT_RESTARTS = 15;
let botCrashCount = 0;

function startBot() {
  if (!botEnabled) {
    console.log('[supervisor] bot disabled (SENTINEL_BOT_ENABLED=false or DISCORD_BOT_TOKEN missing)');
    return;
  }
  if (botCrashCount >= MAX_BOT_RESTARTS) {
    console.error('[supervisor] bot exceeded max restarts; giving up until platform restart');
    return;
  }
  console.log('[supervisor] starting bot');
  let backoffMs = 1_000;
  const child = runBot((code, signal) => {
    if (stopping) return;
    botCrashCount += 1;
    console.error(
      `[supervisor] bot exited unexpectedly (code=${code} signal=${signal}); restarting (${botCrashCount}/${MAX_BOT_RESTARTS})`,
    );
    children.delete('bot');
    const delay = backoffMs;
    backoffMs = Math.min(backoffMs * 2, 30_000);
    setTimeout(() => startBot(), delay);
  });
  children.set('bot', child);
}

startApi();
startBot();

process.on('SIGINT', () => stopAll('SIGINT'));
process.on('SIGTERM', () => stopAll('SIGTERM'));
process.on('SIGHUP', () => stopAll('SIGHUP'));