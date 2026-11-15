# Sentinel Architecture

## Components

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Discord        │      │  Dashboard       │      │  Discord Bot    │
│  (Gateway/API)  │◄────►│  (React, static) │◄────►│  (worker)       │
└─────────────────┘      └────────┬─────────┘      └────────┬────────┘
                                  │ REST + WebSocket        │ bridge (REST)
                                  ▼                         ▼
                        ┌──────────────────┐      ┌─────────────────┐
                        │  Backend API     │◄────►│  PostgreSQL     │
                        │  (Fastify)       │      │  (Prisma)       │
                        └──────────────────┘      └─────────────────┘
```

- **Discord bot** connects to the Discord Gateway and REST API. It executes moderation/security/
  automation actions, registers slash commands, handles message commands, and reports events to
  the API over an authenticated bridge (`POST /api/bridge/*`).
- **Backend API** is the single source of truth for the dashboard. It owns authentication,
  authorization, guild isolation, persistence, and real-time fan-out via WebSockets (`/ws`).
- **Dashboard** is a static React SPA that speaks only to the API. It holds no business secrets.

## Data flow

1. The bot observes Discord events (join/leave, message, moderation, member update, channel
   create/delete) and mirrors them to the API through `apps/bot/src/api-client.ts`.
2. The API stores records in PostgreSQL and publishes live events over WebSockets to connected
   dashboard clients (scoped by guild).
3. Dashboard commands (e.g. Quick Actions, Message Builder, Emergency Lockdown) call the API; the
   API enforces authorization and executes Discord operations in-process for gateway actions or
   routes the action to the bot when gateway access is required.
4. The bot periodically reports a heartbeat with diagnostic health so the Diagnostics page shows
   real bot/gateway/latency state.

## Real-time model

- Clients connect to `GET /ws?guild=<guildId>` with an authenticated session.
- Messages are scoped by guild; a dashboard client only receives events for guilds it is
  authorized to view.
- `apps/api/src/routes/ws.ts` owns the hub; `apps/api/src/services` push activity, security, and
  alert events.

## Shared business logic

Business logic lives in `@sds-sentinel/bot-services` so slash commands and prefix commands share
the same functions (e.g. `moderation.ban`). Command handlers in `apps/bot/src/commands.ts` and
`apps/bot/src/prefix.ts` are thin adapters over these services.

## Development roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| v0.1 Foundation | Monorepo, bot connection, dashboard foundation, Discord OAuth2, API, PostgreSQL, multi-server architecture, server selector, initial overview, Render config | Implemented |
| v0.2 Moderation | Moderation commands, logging, quick actions, custom roles, permission enforcement, moderation history | Implemented |
| v0.3 Security | AutoMod, Anti-Raid, Anti-Nuke, Anti-Spam, Permission Security, Security Strength, Emergency Lockdown | Implemented |
| v0.4 Message Builder | Regular + embed creation, live previews, multi-channel delivery, templates, scheduling | Implemented |
| v0.5 Community | Event Builder, Ticket System, Giveaways, Welcome/Goodbye | Implemented |
| v0.6 Monitoring | Live Activity, Audit Center, Alert Center, Server Analytics, Support Monitoring | Implemented |
| v0.7 Automation | Scheduler, Custom Commands, automation management, Configuration Backups | Implemented |
| v1.0 Production | Diagnostics, security review, performance, responsive design, error handling, documentation, testing, deployment verification | In progress |