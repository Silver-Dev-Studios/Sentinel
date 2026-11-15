# Deployment

Sentinel deploys to Render (the API) and GitHub Pages (the dashboard). The
single-Render-web-service constraint is handled by a supervisor process that
runs the API and the Discord bot inside one container.

Services:

| Component | Host | Command | Purpose |
| --- | --- | --- | --- |
| `sentinel-postgres` | Render (PostgreSQL) | — | Persistent storage. |
| `sentinel-api` | Render (Web Service) | `npm run start:all` | REST + WebSocket API **and** Discord bot, supervised. Health check `/api/health`. |
| Dashboard | GitHub Pages | `vite build` from `apps/dashboard/dist` | Dashboard SPA. |

`render.yaml` defines the Postgres database and the API web service
(`startCommand: npm run start:all`). The supervisor (`scripts/start-all.mjs`)
spawns the API (owner of the HTTP port; a crash exits the container so Render
restarts the service) and the bot as a child process with restart-on-crash
backoff. The bot is disabled automatically when `DISCORD_BOT_TOKEN` is unset.

## Preflight

1. Create a Discord application:
   - Enable the bot; grant `bot` + `applications.commands` OAuth2 scopes.
   - Add the bot to each SDS guild, then copy each guild ID into `SENTINEL_GUILD_ALLOWLIST`.
   - Configure the OAuth2 redirect URI to `https://<api-host>/api/auth/callback`.
2. Generate a strong `SESSION_SECRET`, `CSRF_SECRET`, and `SENTINEL_API_KEY`.

## Deploy steps

1. Push the repository. Render auto-detects Blueprint `render.yaml` and provisions
   `sentinel-postgres` + `sentinel-api`.
2. In the `sentinel-api` service, set the `sync: false` secrets:
   `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`,
   `SENTINEL_API_KEY`, `DISCORD_BOT_TOKEN`, `SENTINEL_GUILD_ALLOWLIST`.
3. Set `DASHBOARD_URL` (the GitHub Pages URL, e.g.
   `https://silver-dev-studios.github.io/Sentinel/`) and `CORS_ORIGINS` (a
   comma-separated list including the GitHub Pages origin).
4. Apply the schema. In a one-off shell connected to `sentinel-postgres`, or via a
   deploy-hook/prestart command:
   ```bash
   npm ci
   npm run db:generate -w @sds-sentinel/database
   npm run db:deploy -w @sds-sentinel/database   # applies prisma/migrations/20261115000000_init
   ```
   The repository ships Prisma migration files, so `db:deploy` works on an empty database.
5. Publish the dashboard to GitHub Pages from `apps/dashboard/dist`, built with:
   ```bash
   npm run build:packages && VITE_API_URL=https://<api-host> VITE_BASE_PATH=/Sentinel/ \
     npm run build -w @sds-sentinel/dashboard
   ```
   The SPA uses hash routing, so no URL rewrites are needed on GitHub Pages.
6. Verify `/api/health` on the API service and the login flow on the dashboard.

## Build ordering

Each Render service must build the workspace packages before the app that depends on them
(workspace `types` point at `dist/index.d.ts`, which is gitignored). The blueprint uses:

- API + Bot: `npm ci && npm run db:generate && npm run build:api && npm run build:bot`

(`build:api` and `build:bot` each build the workspace packages first via
`build:packages`; building both is required because the supervisor starts the
compiled bot at `apps/bot/dist/index.js`.)

## Environment matrix

| Variable | API service | Required | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | yes | From `sentinel-postgres`. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | yes | yes | Discord OAuth2 app. |
| `DISCORD_BOT_TOKEN` | yes | no (disables bot) | Where unset, the supervisor skips the bot. |
| `SENTINEL_GUILD_ALLOWLIST` | yes | yes | Comma-separated SDS guild IDs. |
| `SESSION_SECRET` / `CSRF_SECRET` | yes | yes | Strong random values. |
| `SENTINEL_API_KEY` | yes | yes | Shared bot/API key. |
| `SENTINEL_API_URL` | yes | no | Defaults to `http://localhost:$PORT` in the supervisor. |
| `DASHBOARD_URL` | yes | yes | GitHub Pages URL for OAuth redirects. |
| `CORS_ORIGINS` | yes | yes | Comma-separated allowed origins (GitHub Pages). |
| `REDIRECT_URI` | yes | yes | `https://<api-host>/api/auth/callback`. |
| `COOKIE_SECURE` / `COOKIE_SAMESITE` | yes | yes | `true` / `none` to allow cross-origin cookies from GitHub Pages. |
| `CSRF_ENABLED` / `TRUST_PROXY` | yes | yes | `true` in production. |
| Build-time | Dashboard | — | `VITE_API_URL` (Render API URL) and `VITE_BASE_PATH` (e.g. `/Sentinel/`). |

## Cross-origin notes (GitHub Pages → Render API)

The dashboard is served from GitHub Pages but calls the Render API, so:

- The API must set `COOKIE_SAMESITE=none` with `COOKIE_SECURE=true` so the
  session and CSRF cookies are sent cross-site.
- `CORS_ORIGINS` must include the GitHub Pages origin.
- The dashboard builds with `VITE_API_URL` pointing at the Render API. `wsUrl`
  derives the live-activity WebSocket endpoint from that same origin.

Note: WebSocket connections are currently not authenticated server-side (trust
headers only). If the dashboard is publicly reachable, add token/session auth to
the `/ws` handshake before enabling cross-origin live activity.

## Failure handling

- Discord API outages / rate limits: retries with backoff, never silent success.
- Bot restart: reconnects and resyncs channels (`syncGuildChannels`) and scheduled tasks.
- Backend restart: sessions persist via signed cookies; scheduled tasks persist in PostgreSQL.
- Database disconnect: heartbeats report `degraded`; diagnostics reflect real state.
- WebSocket failure: dashboard reconnects automatically.