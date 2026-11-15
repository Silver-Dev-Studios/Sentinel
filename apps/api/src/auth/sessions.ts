import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient, User, Session } from '@prisma/client';

const SESSION_COOKIE = 'sentinel_session';
const CSRF_COOKIE = 'sentinel_csrf';

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function verifyCsrf(secret: string, token: string | undefined): boolean {
  if (!token) return false;
  // Tokens are opaque values derived from the server secret plus the session;
  // verify only shape here — origin enforcement happens in the plugin.
  return token.length >= 32;
}

export interface SessionUser extends User {
  session: Session;
}

/**
 * Extracts the session token from the request.
 *
 * The dashboard is served from a different origin (GitHub Pages) than the API
 * (Render), so browsers that block third-party cookies will not deliver the
 * session cookie on cross-site fetches. The dashboard therefore also sends the
 * token as `Authorization: Bearer <token>`, which works regardless of cookie
 * policy.
 */
function extractToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const value = header.slice('Bearer '.length).trim();
    if (value) return value;
  }
  return req.cookies[SESSION_COOKIE] ?? null;
}

function allowedDiscordUserIds(req: FastifyRequest): string[] {
  const cfg = (req.server as unknown as { config?: { allowedDiscordUserIds?: string[] } }).config;
  return cfg?.allowedDiscordUserIds ?? [];
}

export async function resolveAuth(
  prisma: PrismaClient,
  req: FastifyRequest,
): Promise<{ user: User; session: Session } | null> {
  const token = extractToken(req);
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  // Access allowlist: a valid session for a non-allowlisted Discord account is
  // treated as unauthenticated everywhere (API routes, /api/auth/me, WS).
  const allowed = allowedDiscordUserIds(req);
  if (allowed.length > 0 && !allowed.includes(session.user.discordId)) {
    return null;
  }
  return { user: session.user, session };
}

export { SESSION_COOKIE, CSRF_COOKIE, sha256 };

export function setSessionCookie(app: FastifyInstance, reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: app.config.cookieSecure,
    sameSite: app.config.cookieSameSite,
    expires: expiresAt,
  });
  // CSRF double-submit: the dashboard reads this non-HttpOnly cookie and echoes
  // it back in the x-csrf-token header for state-changing requests.
  reply.setCookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
    path: '/',
    httpOnly: false,
    secure: app.config.cookieSecure,
    sameSite: app.config.cookieSameSite,
    expires: expiresAt,
  });
}

export function clearSessionCookie(app: FastifyInstance, reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

export function createSessionRule(app: FastifyInstance, userId: string): { token: string; expiresAt: Date } {
  const ttlMs = app.config.sessionTtlDays * 24 * 60 * 60 * 1000;
  const token = createSessionToken();
  return { token, expiresAt: new Date(Date.now() + ttlMs) };
}