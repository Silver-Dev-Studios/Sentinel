export interface BotConfig {
  token: string;
  prefix: string;
  apiUrl: string;
  apiKey: string;
  guildAllowlist: string[];
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadBotConfig(): BotConfig {
  const allowlist = (process.env.SENTINEL_GUILD_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    token: required('DISCORD_BOT_TOKEN'),
    prefix: process.env.SENTINEL_PREFIX ?? '!',
    apiUrl: process.env.SENTINEL_API_URL ?? 'http://localhost:12000',
    apiKey: process.env.SENTINEL_API_KEY ?? 'dev-internal-key-0123456789',
    guildAllowlist: allowlist,
  };
}