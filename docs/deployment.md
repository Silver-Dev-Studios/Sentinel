# Deployment (Render)

Sentinel deploys to Render as four services (see `render.yaml`):

| Service | Type | Command | Purpose |
| --- | --- | --- | --- |
| `sentinel-postgres` | PostgreSQL | — | Persistent storage. |
| `sentinel-api` | Web Service | `npm run start:api` | REST + WebSocket API. Health check `/api/health`. |
| `sentinel-dashboard` | Static Site | `vite build` output from `apps/dashboard/dist` | Dashboard SPA. |
| `sentinel-bot` | Background Worker | `npm run start:bot` | Discord Gateway listener. |

> **Important:** the bot must run as a background worker. Do not replace it with a web service or an
> HTTP keep-alive workaround.

## Preflight

1. Create a Discord application:
   - Enable the bot; grant `bot` + `applications.commands` OAuth2 scopes.
   - Add the bot to each SDS guild, then copy each guild ID into `SENTINEL_GUILD_ALLOWLIST`.
   - Configure the OAuth2 redirect URI to `https://<api-host>/api/auth/callback`.
2. Generate a strong `SESSION_SECRET`, `CSRF_SECRET`, and `SENTINEL_API_KEY`.

## Deploy steps

1. Push the repository (Render Blueprint `render.yaml` is auto-detected).
2. In each service, set the `sync: false` secrets:
   - API: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SESSION_SECRET`, `CSRF_SECRET`, `SENTINEL_API_KEY`.
   - Bot: `DISCORD_BOT_TOKEN`, `SENTINEL_GUILD_ALLOWLIST`.
3. Apply the schema. In a one-off shell connected to `sentinel-postgres`:
   ```bash
   npm ci
   npm run db:generate -w @sds-sentinel/database
   npm run db:deploy -w @sds-sentinel/database
   ```
4. Verify `/api/health` on the API service and the login flow on the dashboard.

## Environment matrix

| Variable | API | Bot | Dashboard |
| --- | --- | --- | --- |
| `DATABASE_URL` | required | required | — |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | required | — | — |
| `DISCORD_BOT_TOKEN` | — | required | — |
| `SENTINEL_GUILD_ALLOWLIST` | — | required | — |
| `SESSION_SECRET` / `CSRF_SECRET` | required | — | — |
| `SENTINEL_API_KEY` | required | required | — |
| `SENTINEL_API_URL` | — | required | — |
| `DASHBOARD_URL` / `CORS_ORIGINS` | required | — | — |
| `REDIRECT_URI` | required | — | — |
| `COOKIE_SECURE` / `CSRF_ENABLED` / `TRUST_PROXY` | required (true in prod) | — | — |
| `VITE_API_URL` | — | — | build-time |

## Failure handling

- Discord API outages / rate limits: retries with backoff, never silent success.
- Bot restart: reconnects and resyncs channels (`syncGuildChannels`) and scheduled tasks.
- Backend restart: sessions persist via signed cookies; scheduled tasks persist in PostgreSQL.
- Database disconnect: heartbeats report `degraded`; diagnostics reflect real state.
- WebSocket failure: dashboard reconnects automatically.