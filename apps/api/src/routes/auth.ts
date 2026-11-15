import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { exchangeCode, fetchOAuthUser } from '@sds-sentinel/discord-services';
import { sha256, createSessionRule, setSessionCookie, clearSessionCookie, SESSION_COOKIE } from '../auth/sessions.js';
import { writeAudit } from '../services/audit.js';

function hashIp(req: FastifyRequest): string | null {
  const ip = req.ip;
  if (!ip) return null;
  return sha256(ip).slice(0, 32);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  app.get('/api/auth/login', async (_req, reply) => {
    const clientId = app.config.clientId;
    const redirect = encodeURIComponent(app.config.redirectUri);
    const scope = encodeURIComponent('identify guilds guilds.members.read');
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    // State is short-lived and tied to nothing sensitive; stored in a cookie.
    reply.setCookie('sentinel_oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: app.config.cookieSecure,
      sameSite: app.config.cookieSameSite,
      maxAge: 600,
    });
    return reply.redirect(
      `https://discord.com/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${scope}&state=${state}&prompt=consent`,
    );
  });

  app.get('/api/auth/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    const storedState = req.cookies['sentinel_oauth_state'];
    if (!code || !state || state !== storedState) {
      return reply.redirect(`${app.config.dashboardUrl}/login?error=invalid_oauth_state`);
    }

    let token;
    try {
      token = await exchangeCode(code, {
        clientId: app.config.clientId,
        clientSecret: app.config.clientSecret,
        redirectUri: app.config.redirectUri,
      });
    } catch (err) {
      app.log.error({ err }, 'OAuth token exchange failed');
      return reply.redirect(`${app.config.dashboardUrl}/login?error=oauth_failed`);
    }

    const discordUser = await fetchOAuthUser(token.access_token).catch(() => null);
    if (!discordUser) {
      return reply.redirect(`${app.config.dashboardUrl}/login?error=user_fetch_failed`);
    }

    const user = await prisma.user.upsert({
      where: { discordId: discordUser.id },
      create: {
        discordId: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.global_name ?? discordUser.username,
        avatar: discordUser.avatar,
        email: undefined,
      },
      update: {
        username: discordUser.username,
        displayName: discordUser.global_name ?? discordUser.username,
        avatar: discordUser.avatar,
      },
    });

    const rule = createSessionRule(app, user.id);
    await prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId: user.id,
        tokenHash: sha256(rule.token),
        expiresAt: rule.expiresAt,
        ipHash: hashIp(req),
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 512),
      },
    });

    setSessionCookie(app, reply, rule.token, rule.expiresAt);
    await writeAudit(prisma, app.wsHub, {
      action: 'auth.login',
      category: 'auth',
      actorId: discordUser.id,
      resource: 'session',
      ipHash: hashIp(req),
    });

    return reply.redirect(`${app.config.dashboardUrl}/overview`);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
      await writeAudit(prisma, app.wsHub, {
        action: 'auth.logout',
        category: 'auth',
        actorId: req.auth?.user.discordId ?? null,
        ipHash: hashIp(req),
      }).catch(() => undefined);
    }
    clearSessionCookie(app, reply);
    reply.code(200).send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Not authenticated', code: 'UNAUTHENTICATED' });
    }
    const { user } = req.auth;
    // List servers the user belongs to that are allowlisted in Sentinel.
    const guilds = await prisma.authorizedServer.findMany({
      where: { active: true, memberIds: { has: user.discordId } },
    });
    const memberships = await prisma.serverMember.findMany({
      where: { guildId: { in: guilds.map((g) => g.id) }, userId: user.discordId },
      select: { guildId: true, discordRoles: true },
    });
    const memberGuildIds = new Set(memberships.map((m) => m.guildId));
    return {
      user: {
        id: user.id,
        discordId: user.discordId,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
      },
      servers: guilds
        .filter((g) => memberGuildIds.size === 0 || memberGuildIds.has(g.id))
        .map((g) => ({
          id: g.id,
          name: g.name,
          icon: g.icon,
          isOwner: g.ownerId === user.discordId,
        })),
    };
  });
}