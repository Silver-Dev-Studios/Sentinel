# Sentinel Security Model

## Authentication

- **Discord OAuth2** is the only identity provider. The API redirects unauthenticated users to
  Discord, validates the returned code with the Discord OAuth2 token endpoint, and issues a signed
  cookie session.
- Sessions are signed with `SESSION_SECRET`. `SESSION_SECRET_PREVIOUS` supports rotation without
  invalidating existing sessions.
- `COOKIE_SECURE`, `COOKIE_SAMESITE`, and session TTL are configurable.

## Authorization

- Every `/api/servers/:guildId/*` route runs `guildGuard`, which verifies the authenticated user is
  authorized for that guild (`AuthorizedServer` records).
- Application permission checks map to `@sds-sentinel/permissions` (`PermissionKey`), which the
  backend and bot both enforce.
- Frontend-only filtering is never trusted. The API rejects unauthorized guild access regardless of
  what the UI shows.

## Guild isolation

- All server-scoped rows carry a `guildId`.
- Lookups always filter by `guildId` (Prisma `where` clauses include it).
- The bot only engages guilds in `SENTINEL_GUILD_ALLOWLIST`.

## Transport security

- CORS is restricted to `CORS_ORIGINS` + `DASHBOARD_URL`.
- CSRF protection is enforced for mutating dashboard API calls when `CSRF_ENABLED=true` (production).
- Sessions use `HttpOnly` cookies; WebSocket connections authenticate the same session.

## Input validation & rate limiting

- All request bodies are validated with zod schemas (`@sds-sentinel/validation`).
- Fastify rate limiting is applied per-route to mitigate abuse.

## Error handling

- API errors never leak tokens, database credentials, or internal stack details.
- Failed operations are recorded and surfaced (never silently reported as success).
- Diagnostics intentionally omit secrets.

## Data retention

- Snipe logs respect `SNIPE_RETENTION_SECONDS` and `SNIPE_MAX_LOGS` — a short retention window, not
  a permanent archive.
- Audit, moderation, alert, and activity retention are configurable per deployment.

## Secrets

- Stored only in environment variables (`.env` / Render env vars).
- `DISCORD_BOT_TOKEN`, `DATABASE_URL`, `SESSION_SECRET`, `CSRF_SECRET`, `SENTINEL_API_KEY` are never
  committed or logged.

## Preventive controls in product features

- **Emergency lockdown**: requires confirmation; excludes trusted administrators and Sentinel from
  being locked out; logs the action in audit.
- **Anti-Nuke**: uses thresholds and trusted-administrator configuration; never automatically punishes
  legitimate admins based on appearance alone; every response is reviewable.
- **Configuration Backups / moderation actions**: require confirmation before destructive changes.
- **Security Strength**: a weighted score of configuration coverage, not a guarantee of protection.
  The report explicitly distinguishes configuration coverage from actual effectiveness.