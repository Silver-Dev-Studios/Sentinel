# SDS Sentinel

**Internal Discord server monitoring, moderation, security, and administration platform for Silver Dev Studios.**

Sentinel is an internal server-management platform — not a public Discord bot. It provides a single
dashboard to monitor, secure, moderate, and manage the SDS Discord ecosystem while keeping every
server's data, permissions, and configuration completely independent.

Sentinel is exclusively intended for Discord servers owned and operated by Silver Dev Studios.

---

## Components

| Component | Path | Description |
| --- | --- | --- |
| Discord Bot | `apps/bot` | Discord Gateway listener: moderation, automation, security monitoring, scheduler, bridge to the API. Supervised alongside the API by `scripts/start-all.mjs`. |
| Web Dashboard | `apps/dashboard` | React + TypeScript + Vite + Tailwind admin console. |
| Backend API | `apps/api` | Fastify REST + WebSocket API: auth, permissions, data management, real-time events. |
| Shared packages | `packages/*` | `shared`, `database`, `permissions`, `validation`, `discord-services`, `bot-services`. |

## Repository layout

```
sentinel/
├─ apps/
│  ├─ bot/          # Discord bot (gateway, commands, listeners, services)
│  ├─ dashboard/    # React dashboard (static build)
│  └─ api/          # Fastify REST + WebSocket API
├─ packages/
│  ├─ shared/            # shared types, constants, conventions
│  ├─ database/          # Prisma schema + generated client
│  ├─ permissions/       # application-level permission model + enforcement
│  ├─ validation/        # zod schemas shared across server boundaries
│  ├─ discord-services/  # Discord API clients/wrappers
│  └─ bot-services/      # business logic reused by slash + prefix commands
├─ docs/            # module documentation
├─ scripts/         # development/housekeeping helpers
├─ render.yaml      # Render blueprint
└─ package.json     # npm workspaces root
```

## Requirements

- Node.js ≥ 20
- PostgreSQL ≥ 14
- A Discord application with:
  - Bot enabled (Gateway + Server Members privileged intents as needed)
  - OAuth2 redirect configured for the API

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp apps/api/.env.example apps/api/.env
cp apps/bot/.env.example apps/bot/.env
cp packages/database/.env.example packages/database/.env
cp apps/dashboard/.env.example apps/dashboard/.env
# ... then fill in real values (see Environment secrets)

# 3. Create/extend the database schema
npm run db:generate
npm run db:push          # dev; use `npm run db:migrate` for tracked migrations

# 4. Run the API + bot
npm run dev              # concurrently starts api and bot

# 5. In another terminal, run the dashboard
npm run dev:dashboard    # http://localhost:5173
```

The API listens on `http://localhost:12000` and the dashboard proxies `/api` and `/ws` to it during
development.

## Environment secrets

All credentials are supplied through environment variables — never hard-code or commit secrets.

### API (`apps/api/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord OAuth2 application credentials. |
| `REDIRECT_URI` | OAuth callback URL (`http://localhost:12000/api/auth/callback` locally). |
| `DASHBOARD_URL` | Allowed dashboard origin for CORS and cookie scope. |
| `SESSION_SECRET`, `SESSION_SECRET_PREVIOUS` | Cookie signing secrets. Set the previous value when rotating. |
| `CSRF_SECRET` | CSRF protection secret. |
| `SENTINEL_API_KEY` | Internal key the bot uses to authenticate bridge calls. |
| `COOKIE_SECURE` / `CSRF_ENABLED` / `TRUST_PROXY` | Security toggles for the deployment environment. |
| `CORS_ORIGINS` | Comma-separated list of allowed origins. |

### Bot (`apps/bot/.env`)

| Variable | Purpose |
| --- | --- |
| `DISCORD_BOT_TOKEN` | Discord bot token. |
| `SENTINEL_GUILD_ALLOWLIST` | Comma-separated allowlist of supported guild IDs. Unknown guilds receive no Sentinel functionality. |
| `SENTINEL_API_URL` / `SENTINEL_API_KEY` | Bridge endpoint + internal API key. |
| `DATABASE_URL` | PostgreSQL connection string. |
| `SENTINEL_PREFIX` | Message-command prefix (default `!`). |

### Dashboard (`apps/dashboard/.env`)

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Base URL of the API (used by the dev proxy; the production static build targets the same origin when served behind a proxy). |

## Scripts (root)

| Script | Description |
| --- | --- |
| `npm run dev` | Run API + bot in watch mode. |
| `npm run dev:dashboard` | Run the dashboard dev server. |
| `npm run build` | Build all workspaces (shared, database, permissions, validation, discord-services, api, bot, dashboard). |
| `npm run start:api` | Start the built API. |
| `npm run start:bot` | Start the built bot. |
| `npm run start:all` | Supervised API + bot (Render web service start). |
| `npm run typecheck` | Typecheck every workspace. |
| `npm run db:generate` | Regenerate the Prisma client. |
| `npm run db:push` | Push the Prisma schema to the database (dev). |
| `npm run db:migrate` | Create/apply a Prisma migration (dev). |
| `npm run db:seed` | Seed the database. |

## Command notation

Throughout the project, commands use the following notation:

- `+` = prefix (message) command, e.g. `+ban`
- `–` = slash command, e.g. `/ban`
- `+/–` = both, e.g. `+/– warn`

Prefix and slash commands call the **same** service functions — there is no duplicated business
logic.

### Moderation commands

| Command | Interface | Description |
| --- | --- | --- |
| ban | `+/–` | Ban a member. |
| unban | `+/–` | Unban a user. |
| kick | `+/–` | Kick a member. |
| warn | `+/–` | Issue a warning. |
| timeout | `+/–` | Apply a timeout (minutes). |
| untime | `+/–` | Remove a timeout. |
| lock | `+/–` | Lock the current/chosen channel. |
| unlock | `+/–` | Unlock the current/chosen channel. |
| purge | `+/–` | Bulk-delete messages (1–100). |
| snipe | `+` | Show the most recently deleted message in the channel (short retention). |
| userinfo | `–` | Show member information. |

## Multi-server isolation

- Every server-scoped record is associated with its Discord guild ID.
- The API verifies, on every request, that the authenticated administrator is authorized for the
  requested guild (`guildGuard`). Frontend filtering is never trusted for security.
- A `SENTINEL_GUILD_ALLOWLIST` controls which guilds the bot engages with. Unknown servers get no
  Sentinel functionality.
- Server-specific data (channels, members, moderation, settings, analytics, tickets, roles,
  templates, events, giveaways, audit records, security state) is never mixed between guilds.

## Permission model

Sentinel uses **application-level permissions**, not Discord role overrides. Custom Sentinel roles
(`Moderation Roles`) bundle these capabilities per server:

- Moderation: ban/unban, timeout/untime, mute/unmute, kick, lock/unlock, purge, snipe, warnings.
- Community: tickets, giveaways, events, message management.
- Ops: moderation log access, security report access, AutoMod management, custom-role management,
  analytics access, audit center access.

The backend and bot enforce permissions; the dashboard only reflects them. A custom role can never
grant more than the underlying Discord bot permissions allow.

## Security model

- Discord OAuth2 authentication with cookie sessions.
- Server-side authorization per guild; strict guild-ID isolation.
- CSRF protection, rate limiting, input validation (zod), secure error handling.
- Audit logging for administrative, moderation, security, and access events.
- Secrets only via environment variables; diagnostics never expose tokens or credentials.
- Snipe records honor a short configurable retention window, not permanent archives.
- Confirmation is required for destructive actions.

## Modules

| Module | Location | Notes |
| --- | --- | --- |
| Overview + server selector | `apps/dashboard/src/pages/general` | Real data from the API — no hardcoded values. |
| Moderation Center / Quick Actions / Logs / Roles | `apps/dashboard/src/pages/moderation` + `apps/api/src/routes/moderation.ts` | Full case log, quick actions, custom roles. |
| AutoMod | `apps/api/src/routes/security.ts`, `apps/bot/src/services` | Configurable rules with per-server storage. |
| Anti-Raid / Anti-Nuke / Anti-Spam | `apps/api/src/routes/security.ts`, `apps/bot/src/services` | Thresholds, alerts, protective responses. |
| Permission security + Security Strength | `apps/dashboard/src/pages/security`, `apps/api/src/routes/security.ts` | Weighted security checks (not random). |
| Emergency lockdown | `apps/api/src/routes/security.ts`, dashboard Security Overview | Confirm-first; avoids locking out trusted admins. |
| Message Builder | `apps/dashboard/src/pages/management/MessageBuilder.tsx` | Regular + embed modes, live preview, multi-channel, templates, scheduling. Real channel list from bot-synced `server_channels`. |
| Event Builder | `apps/dashboard/src/pages/management/EventBuilder.tsx` | Scheduled Discord events, RSVP, attendees. |
| Ticket System | `apps/dashboard/src/pages/management/TicketSystem.tsx` | Panels, categories, claim/close, transcripts. |
| Giveaways | `apps/dashboard/src/pages/management/Giveaways.tsx` | Creation, winners, rerolls, history. |
| Custom Commands | `apps/dashboard/src/pages/management/CustomCommands.tsx` | Prefix/slash custom commands; cannot bypass permissions or run code server-side. |
| Scheduler | `apps/dashboard/src/pages/management/Scheduler.tsx` | Persisted scheduled tasks in PostgreSQL. |
| Alert Center | `apps/dashboard/src/pages/system/AlertCenter.tsx` | Acknowledge/resolve, severity, history. |
| Audit Center | `apps/dashboard/src/pages/system/AuditCenter.tsx` | Search/filter audit records by actor, resource, date range. |
| Diagnostics | `apps/dashboard/src/pages/system/Diagnostics.tsx` | Live health of bot, gateway, API, database, WebSocket, tasks. |
| Settings | `apps/dashboard/src/pages/system/Settings.tsx` | Per-server Sentinel settings. |
| Analytics | `apps/dashboard/src/pages/general/Analytics.tsx` | Member growth, messages, moderation, tickets; respects Discord data availability. |
| Welcome / Goodbye / Announcements / Inactivity / Support monitoring | management + monitoring routes | Templates, reports; only reports activity Sentinel actually observed. |

### Database

The schema lives in `packages/database/prisma/schema.prisma`. Server-scoped tables carry a
`guildId` column with proper foreign keys, indexes, and unique constraints. Key models include
`AuthorizedServer`, `ServerConfiguration`, `ServerMember`, `ServerChannel`, `ModerationCase`,
`ModerationWarning`, `ModerationRole`/`ModerationRolePermission`, `SecuritySettings`,
`AutoModRule`, `SecurityEvent`, `SecurityAssessment`, `MessageTemplate`,
`MessageDeliveryLog`, `ScheduledMessage`, `DiscordEvent`, `Ticket`, `Giveaway`, `AuditLog`,
`Alert`, `AnalyticsRecord`, `CustomCommand`, `ScheduledTask`, `ConfigBackup`, and `DiagnosticLog`.

## Deployment

See [`render.yaml`](./render.yaml) for the blueprint and
[`docs/deployment.md`](./docs/deployment.md) for full notes.

One Render web service hosts both the API and the Discord bot via
`scripts/start-all.mjs` (`npm run start:all`): the API owns the HTTP port, the
bot runs as a supervised child with restart-on-crash backoff. The dashboard is
a static SPA hosted on GitHub Pages and points at the Render API.

- **PostgreSQL** — managed Render Postgres (`sentinel-postgres`).
- **API + Bot (web service)** — `start:all`; health check on `/api/health`.
- **Dashboard (GitHub Pages)** — built with `VITE_API_URL` (Render API) and
  `VITE_BASE_PATH` (repo subpath); hash routing needs no rewrites.

Before first deploy:

1. Create a Discord application, enable the bot, and add it to each SDS guild.
2. Fill the `sync: false` secrets in the Render dashboard for the API service.
3. Run migrations: attach a one-off shell or use a deploy hook to run
   `npm run db:deploy -w @sds-sentinel/database` against the managed database.
4. Publish the dashboard to GitHub Pages and configure `DASHBOARD_URL`,
   `CORS_ORIGINS`, and `COOKIE_SAMESITE=none` on the API service.

## Documentation

- `docs/architecture.md` — components, data flow, real-time model.
- `docs/security.md` — threat model and security controls.
- `docs/moderations.md` — moderation actions and command reference.
- `docs/deployment.md` — Render deployment notes and environment matrix.

See the `docs/` directory for module-level detail.

## Status

Sentinel is under active development. See the development roadmap in `docs/architecture.md` for the
stage breakdown (v0.1 foundation → v1.0 production release). Implemented, partial, and planned items
are tracked continuously.
