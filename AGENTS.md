# Sentinel — repository guide

SDS Sentinel: internal Discord monitoring/moderation/security/administration platform for Silver
Dev Studios. Monorepo via npm workspaces (`apps/*`, `packages/*`).

## Commands

- `npm install` — install all workspaces.
- `npm run dev` — API + bot concurrently (watch mode).
- `npm run dev:dashboard` — Vite dashboard on port 5173.
- `npm run build` — build every workspace (shared, database, permissions, validation,
  discord-services, api, bot, dashboard).
- `npm run typecheck` — `tsc --noEmit` across all workspaces.
- `npm run db:push` / `npm run db:migrate` — apply Prisma schema (dev).
- `npm run db:generate` — regenerate Prisma client after schema edits.

## Architecture

- `apps/api` — Fastify REST + WebSocket API; the dashboard's only backend.
- `apps/bot` — discord.js Gateway listener, runs as a background worker.
- `apps/dashboard` — React + Vite + Tailwind static SPA.
- `packages/shared` — types/constants. Consumed by dashboard via a Vite alias to its TS source
  (`apps/dashboard/vite.config.ts`), because rollup can't statically analyse its CJS dist.
- `packages/permissions` — application `PermissionKey` model + enforcement.
- `packages/validation` — zod schemas.
- `packages/bot-services` — business logic shared by slash + prefix command handlers.
- `packages/discord-services` — Discord API wrappers.
- `packages/database` — Prisma schema + generated client.

## Conventions

- Every server-scoped Prisma row carries `guildId`; the API's `guildGuard` enforces authorization
  on every `/api/servers/:guildId/*` route. Never bypass it.
- Slash + prefix commands must call the same bot-services functions (no duplicated logic).
- Dashboard stats come from the API — never hardcode demo data.
- Secrets live in env vars only (`.env`, Render env). Never commit real tokens.
- The bot must stay a background worker in Render (`render.yaml`); do not convert to web service.
- Command notation: `+` prefix, `–` slash, `+/–` both.
- After changing `packages/database/prisma/schema.prisma`, run `npm run db:generate` then
  `npm run db:push` (dev) and rebuild affected workspaces.
- `apps/bot/src/channel-sync.ts` mirrors allowlisted guild channels into `ServerChannel`
  (`server_channels`) so the dashboard Message Builder lists real channels.
- New dashboard pages: React component under `apps/dashboard/src/pages/{general,moderation,
  management,security,system}/`, register its route in `apps/dashboard/src/App.tsx`, add nav entry in
  `apps/dashboard/src/nav.ts`. Reuse `components/ui.tsx` primitives and `lib/hooks.ts` data hooks.
- Shared package CJS dist can be stale for rollup; the dashboard alias to `src/index.ts` sidesteps
  rebuild-dependency. Rebuild shared with `npm run build -w @sds-sentinel/shared` when API/bot need
  new exports.

## Verification

- `npm run typecheck` must be clean.
- `npm run build` must produce `apps/dashboard/dist` and app `dist/` outputs.
- API boots via `npm run start:api` after `npm run build`; `/api/health` reports real DB/bot state.