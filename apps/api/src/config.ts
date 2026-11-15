function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export interface ApiConfig {
  port: number;
  apiUrl: string;
  dashboardUrl: string;
  databaseUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  deprecatedSessionSecret: string | undefined;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict' | 'none';
  sessionTtlDays: number;
  csrfEnabled: boolean;
  csrfSecret: string;
  apiKey: string;
  trustProxy: boolean;
  corsOrigins: string[];
  rateLimitMax: number;
  logLevel: string;
  isProduction: boolean;
}

function resolveCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  const origins = raw && raw.trim() ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const dashboard = process.env.DASHBOARD_URL;
  if (dashboard && !origins.includes(dashboard)) {
    origins.unshift(dashboard);
  }
  if (process.env.NODE_ENV !== 'production') {
    origins.push('http://localhost:5173');
  }
  return origins;
}

export function loadConfig(): ApiConfig {
  const isProduction = process.env.NODE_ENV === 'production';
  return {
    port: num('PORT', 12000),
    apiUrl: process.env.API_URL ?? `http://localhost:${num('PORT', 12000)}`,
    dashboardUrl: (process.env.DASHBOARD_URL ?? 'http://localhost:5173').replace(/\/+$/, ''),
    databaseUrl: process.env.DATABASE_URL ?? required('DATABASE_URL'),
    redirectUri: process.env.REDIRECT_URI ?? `${process.env.API_URL ?? `http://localhost:${num('PORT', 12000)}`}/api/auth/callback`,
    clientId: process.env.DISCORD_CLIENT_ID ?? required('DISCORD_CLIENT_ID'),
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? required('DISCORD_CLIENT_SECRET'),
    sessionSecret: process.env.SESSION_SECRET ?? required('SESSION_SECRET'),
    deprecatedSessionSecret: process.env.SESSION_SECRET_PREVIOUS || undefined,
    cookieSecure: bool('COOKIE_SECURE', isProduction),
    cookieSameSite: (process.env.COOKIE_SAMESITE as ApiConfig['cookieSameSite']) || (isProduction ? 'lax' : 'lax'),
    sessionTtlDays: num('SESSION_TTL_DAYS', 14),
    csrfEnabled: bool('CSRF_ENABLED', true),
    csrfSecret: process.env.CSRF_SECRET ?? process.env.SESSION_SECRET ?? required('CSRF_SECRET'),
    apiKey: process.env.SENTINEL_API_KEY ?? required('SENTINEL_API_KEY'),
    trustProxy: bool('TRUST_PROXY', isProduction),
    corsOrigins: resolveCorsOrigins(),
    rateLimitMax: num('RATE_LIMIT_MAX', 120),
    logLevel: process.env.SENTINEL_LOG_LEVEL ?? 'info',
    isProduction,
  };
}