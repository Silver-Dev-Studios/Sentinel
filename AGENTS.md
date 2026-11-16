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
- Production migrations run through `scripts/apply-migrations.mjs` (pooler-safe). It auto-baselines
  databases that predate migration tracking: DDL that fails with "already exists" (42P07/42710/
  42701/42P06) is skipped, and migrations whose objects all exist are recorded as applied so later
  migrations that actually add columns (e.g. `20261115224042_sync_schema_to_client`) still run.
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

## Deployment topology & auth (important)

- Dashboard is a static SPA on **GitHub Pages** (`https://silver-dev-studios.github.io/Sentinel/`,
  HashRouter); API + bot run on **one Render web service** (`https://sentinel-9o85.onrender.com`).
  These are **different origins**, so the dashboard and API are cross-site.
- `DASHBOARD_URL` on Render must be the Pages URL; the API normalizes trailing slashes and derives
  the bare `scheme://host` origin from it for CORS.
- **Auth uses a bearer token, not just cookies.** Browsers block the cross-site session cookie on
  the Pages→Render `fetch`, so after Discord OAuth the callback redirects to
  `${DASHBOARD_URL}/#/auth?token=<session-token>`; the dashboard stores the token (localStorage
  `sentinel_token`), scrubs the fragment to `#/overview` (module-load, before HashRouter mounts), and
  sends `Authorization: Bearer <token>` on every request. The API accepts the token from the
  `Authorization` header or the `sentinel_session` cookie. Bearer requests are exempt from CSRF
  (no ambient cookie to abuse). CORS must allow the `authorization` request header — `@fastify/cors`
  reflects requested headers, verified via OPTIONS preflight.
- The global auth guard must populate `request.auth` for `/api/auth/*` routes (optional auth);
  do not hard-skip the whole prefix or `/api/auth/me` will always 401.
- Local end-to-end auth check (no secrets printed): create a user+session in the local Postgres,
  build the API, then `app.inject({ url:'/api/auth/me', headers:{ authorization:`Bearer ${token}` } })`
  and expect 200; without the token expect 401. See git history `931e087`.
- **Access allowlist**: set `ALLOWED_DISCORD_USER_IDS` (comma-separated Discord user IDs) on Render.
  When non-empty, `resolveAuth` returns null for any other account → every API route 401s, and the
  OAuth callback redirects to `/#/login?error=not_allowed` without creating a session. Empty means
  anyone can log in (dev only); the API logs a startup warning then. Owner ID used in production:
  `1360925264669966338`.
- **Guild access / owner lockout**: the guild owner is ALWAYS allowed, even with no
  `server_members` row and not in `authorized_servers.memberIds` (both are cached and can be stale
  right after a bot start). `verifyGuildAccess`, `/api/auth/me`, `/api/overview` and `/ws` all treat
  `ownerId === user.discordId` as access. For non-owners, membership is read from the
  `server_members` table (authoritative) with `memberIds` as a fallback. If a user validly logs in
  but sees "You do not have access to this server", the cause is almost always that the user is the
  server owner but the **production** `authorized_servers.ownerId` doesn't match their Discord ID
  (e.g. old/test data), or they genuinely aren't a member of the allowlisted guild the bot monitors.
- **Health contract**: `/api/health` returns a superset shape — `{ status, uptime, apiLatencyMs,
  api, database:{ok,connected,latencyMs}, bot:{connected}, websocket:{connectedClients,botConnected} }`.
  The Overview strip and Diagnostics page read these real fields; do not render health sub-objects the
  endpoint doesn't return or they'll show "Disconnected/down/ms". DB probe is cached ~3s (`healthCache`
  in `routes/system.ts`). Note: `status` is `operational`/`degraded` (not `ok`).
- **WebSocket auth**: `/ws` dashboard clients must present `?token=<session-token>`; the server derives
  the user's guild set from the session + `authorized_servers` rows (never trusts headers). The internal
  bot uses `x-sentinel-key`. Unauthorized handshakes close with 4401.
- **Dashboard loading**: routes are code-split via `lazy()` (named exports → `.then(m => ({default:
  m.XPage}))`). Initial bundle is the shell + Login/Overview; other pages load on navigation.- **Delete requests must not send `Content-Type: application/json` with an empty body**.
  Fastify returns 400 `Body cannot be empty when content-type is set to 'application/json'`, which
  broke every dashboard DELETE (automod rules, roles, custom commands, scheduled tasks, tickets).
  `dashboard/src/lib/api.ts` now only sets the JSON content type for mutating requests that carry a body.
- **Security PATCH accepts partial configs**: `securityUpdateSchema` uses `.partial()` on the nested
  antiRaid/antiNuke/antiSpam objects so toggling a single switch (e.g. `{ antiRaid: { antiRaidEnabled: true } }`)
  validates. The route still merges partial values into the existing flat row before upsert.
- **Welcome POST/PATCH map display names**: the model fields are `welcomeEnabled`/`welcomeChannelId`/
  `welcomeTemplate` (+ goodbye twins); UIs may send `enabled`/`channelId`/`message`. `routes/management.ts`
  maps both via `firstDefined` so a save never 500s on unknown Prisma args.
- **Security report caching**: `computeSecurityReport(prisma, guildId, persist)` keeps a 15s in-memory per-guild
  cache (`services/security.ts`). Overview/Summary pass `persist=false` (no `securityAssessment` write per page
  view); the Security Overview page persists. Mutation routes invalidate with `invalidateSecurityCache(guildId)`
  so changes reflect immediately.
- **Commands page**: built-in command catalog lives in `packages/shared/src/commands.ts` (`BUILTIN_COMMANDS`
  with name/iface(+ `/` `both`)/category/permission/usage). The API serves it at
  `GET /api/servers/:guildId/commands/reference` and the dashboard page `Commands` (route `/commands`) renders it;
  custom commands remain at `/commands/custom`. To add a bot command, add it to the catalog AND the bot's
  prefix/slash handlers.
- **Overview no longer double-fetches /api/overview**: `ServerProvider` loads it once; the Overview page consumes
  `useServer()` servers and only polls `/api/health`.
- **`api` from `useAuth()` must stay referentially stable**: `AuthProvider` builds it with
  `useMemo(..., [])` and memoizes the context value. An inline `createApi()` re-created the client on
  every provider render, so every `useEffect`/`useCallback` keyed on `api` re-fired, and `refresh`
  calling `/api/auth/me` set a new `user` object which re-rendered the provider again — an endless
  loop (~10 req/s) that tripped the 120 req/min limiter and made every tab fail.
- **Rate-limit errors must keep `statusCode: 429`**: `@fastify/rate-limit`'s `errorResponseBuilder`
  result is thrown as-is, so omitting `statusCode` made the global error handler treat throttling as
  an unexpected failure and answer 500 `INTERNAL` — surfacing as "Internal server error" across the
  whole dashboard instead of a retryable 429. `app.ts` now forwards it.
- **`/api/health` is exempt from the rate limiter** (`config: { rateLimit: false }`) because it is
  Render's health probe; throttling it would turn client traffic into service restarts. The DB probe
  is cached ~3s.
- **Every routed page is wrapped in an `ErrorBoundary`** (`components/ErrorBoundary.tsx`, mounted
  around `<Outlet />` in `Layout.tsx`, remounted per pathname via `key`). React unmounts the whole
  tree on an uncaught render error, so before this one broken page left every other route blank until
  a hard reload — indistinguishable from a site-wide outage. Keep page components total: guard
  possibly-undefined API fields (e.g. the activity feed returns `{ rows }`, not `{ events }`).
- **Verifying the SPA without clicking through the UI**: run headless Chromium with `--remote-debugging-port`,
  seed `localStorage.sentinel_token`, navigate each route with a cache-busting `?r=...#/route` (a bare
  hash change will *not* remount a crashed tree), then read `#root.innerHTML.length` and collect
  `Runtime.exceptionThrown`. A `0` length means the page crashed; anything else means it rendered.
