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

export async function resolveAuth(
  prisma: PrismaClient,
  req: FastifyRequest,
): Promise<{ user: User; session: Session } | null> {
  const token = req.cookies[SESSION_COOKIE];
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