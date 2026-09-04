# Free public deployment readiness

This runbook prepares the repository for a first public demo on Cloudflare and Render. It does not create resources or deploy anything. Keep the existing Azure runbook in `docs/AZURE_DEPLOYMENT.md`; this is an additional target.

Replace every angle-bracket placeholder only after the providers assign the real HTTPS URLs. All `VITE_*` values are public build-time browser configuration. Never put API keys, reconnect tokens, credentials, or `GEMINI_API_KEY` in them.

## Target architecture

| Component | Application directory | Target |
|---|---|---|
| Retro Platform | `apps/retro-platform-web` | Cloudflare Pages |
| Retro Rush | `games/retro-rush` | Cloudflare Pages |
| Spin the Bottle | `games/spin-the-bottle` | Cloudflare Workers through Vinext |
| Realtime backend | `services/retrospective-server` | Render Free Web Service, Docker runtime |
| AI Bot | `ai-bot` | Not deployed in this phase |

`services/retro-platform-api` is the legacy API and is not part of this deployment. The current backend is `services/retrospective-server` with SignalR at `/hubs/room`.

## Cloudflare Pages: Retro Platform

Create a Pages project connected to the repository and use these dashboard settings:

| Setting | Value |
|---|---|
| Application directory | `apps/retro-platform-web` |
| Root directory | Leave blank (repository root) |
| Framework preset | Vite, or None with the explicit fields below |
| Build command | `npm run build:web` |
| Build output directory | `apps/retro-platform-web/dist` |
| Production branch | Select the intended release branch |

Building at the repository root lets npm resolve `packages/platform-contracts` and `packages/realtime-client` as workspaces. The build output is the normal Vite `dist` directory. `public/_redirects` is copied into that directory and rewrites the current client-side routes to `index.html`, including `/room/create`, `/room/join`, `/room/:roomCode`, and `/room/:roomCode/games`. It deliberately does not use a catch-all that could intercept assets.

Set these production build variables under the Pages project's environment variables:

```text
VITE_API_URL=https://<RENDER_BACKEND_HOST>
VITE_RETRO_RUSH_URL=https://<RETRO_RUSH_CLOUDFLARE_HOST>
VITE_SPIN_THE_BOTTLE_URL=https://<SPIN_WORKER_HOST>
VITE_ROOM_SERVICE=real
```

Do not set `VITE_AI_BOT_URL` for this phase. A production build validates that configured service URLs use HTTPS. The generated Content Security Policy includes `VITE_API_URL`, including its WSS origin for SignalR.

## Cloudflare Pages: Retro Rush

Create a second Pages project from the same repository:

| Setting | Value |
|---|---|
| Application directory | `games/retro-rush` |
| Root directory | Leave blank (repository root) |
| Framework preset | Vite, or None with the explicit fields below |
| Build command | `npm run build:retro-rush` |
| Build output directory | `games/retro-rush/dist` |
| Production branch | Select the intended release branch |

Set these production build variables:

```text
VITE_API_URL=https://<RENDER_BACKEND_HOST>
VITE_PLATFORM_URL=https://<PLATFORM_CLOUDFLARE_HOST>
VITE_TRANSPORT_MODE=signalr
```

Do not set `VITE_AI_BOT_URL`. Retro Rush first asks the backend for room questions. If the optional AI service is unavailable, its existing retry path selects the bundled `retroQuestions` defaults; gameplay and room transport continue.

## Cloudflare Workers: Spin the Bottle

Spin remains a Vinext App Router application on Vite 8. The native Cloudflare integration is configured by `vite.config.ts` and `wrangler.jsonc` with `@cloudflare/vite-plugin`. The pinned `@vinext/cloudflare` adapter matches the installed Vinext `1.0.0-beta.6`; Platform and Retro Rush remain on Vite 7.

Compatibility-only check from the repository root:

```bash
npm --workspace games/spin-the-bottle run check:cloudflare
```

The preferred future one-command deployment is either of the following. Do not run it until the final URLs and Cloudflare account are ready:

```bash
cd games/spin-the-bottle
npx @vinext/cloudflare deploy

# Equivalent from the repository root:
npm --workspace games/spin-the-bottle run deploy:cloudflare
```

For a connected Cloudflare Workers Builds project, keep commands at repository root so workspace packages resolve:

| Setting | Value |
|---|---|
| Worker name | `spin-the-bottle` (must match `wrangler.jsonc`) |
| Root directory | Leave blank (repository root) |
| Build command | `npm run build:spin-the-bottle` |
| Deploy command | `npm --workspace games/spin-the-bottle run deploy:cloudflare -- --skip-build` |
| Node version build variable | `NODE_VERSION=22.13.0` or newer Node 22 |

Set these as non-secret Workers **build variables**, because Vite embeds them while building:

```text
VITE_API_URL=https://<RENDER_BACKEND_HOST>
VITE_PLATFORM_URL=https://<PLATFORM_CLOUDFLARE_HOST>
```

Do not add `VITE_AI_BOT_URL` or `GEMINI_API_KEY`. No runtime Worker secrets are needed by the current game. The Wrangler configuration uses Vinext's fetch handler, the generated `dist/client` assets, `nodejs_compat`, and no KV, database, image, or other binding.

## Render: realtime backend

Create a Render **Web Service** from the repository with these settings:

| Setting | Value |
|---|---|
| Service type | Web Service |
| Runtime / Language | Docker |
| Instance type | Free |
| Root directory | Leave blank (repository root) |
| Dockerfile path | `services/retrospective-server/Dockerfile` |
| Docker build context | `.` |
| Docker command / start command | Leave blank; use Dockerfile `ENTRYPOINT` |
| Health check path | `/health` |
| Instance count | One |

The Dockerfile restores the current server project, publishes Release with the .NET 10 SDK, and copies only the published output into the minimal ASP.NET Core 10 Alpine runtime image. It runs as the image's non-root `$APP_UID` and starts with:

```text
dotnet retrospective-server.dll
```

Render supplies `PORT`. At startup the application validates it and binds `http://0.0.0.0:<PORT>`. The image uses `0.0.0.0:10000` only as a local container default when `PORT` is absent. Do not hardcode `5281` in production. Local development remains:

```bash
dotnet run --project services/retrospective-server --urls http://localhost:5281
```

Set these Render environment variables after the three frontend URLs are known:

```text
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
AllowedOrigins__0=https://<PLATFORM_CLOUDFLARE_HOST>
AllowedOrigins__1=https://<RETRO_RUSH_CLOUDFLARE_HOST>
AllowedOrigins__2=https://<SPIN_WORKER_HOST>
```

Do not set `PORT`; Render owns it. This deployment phase intentionally does not deploy the AI-bot and therefore cannot generate new Gemini questions. The backend's AI gateway defaults to `http://localhost:3002/`, which is not another Render service and can be unreachable without preventing room creation, SignalR, or game launch.

To enable AI later, deploy `ai-bot` as its own service, set its `AI_PROVIDER=gemini`, `GEMINI_API_KEY`, `INTERNAL_SERVICE_KEY`, `ALLOWED_ORIGINS`, and optional question-bank settings, then set backend `AiQuestions__BaseUrl=https://<AI_BOT_RENDER_HOST>/` and `AiQuestions__InternalServiceKey` to the same service key. Do not expose either secret through a `VITE_*` variable.

`GET /health` remains anonymous and returns a successful JSON response. SignalR remains at `/hubs/room`; browsers connect to the HTTPS Render base URL and the official client negotiates WSS. Render terminates public TLS and supports WebSocket upgrades. Do not add Redis, Azure SignalR, a database, or another realtime provider for this first single-instance deployment.

## CORS

Production startup fails closed if no origins are configured. The backend validates each entry as an exact HTTPS origin and uses `WithOrigins(...).AllowCredentials()`; it never uses `AllowAnyOrigin`. Values must contain only scheme and authority, with no path or trailing slash.

Local origins remain only in `appsettings.Development.json` for ports 5173, 5174, 5175, and 5176. Production receives only the three public origins through Render environment variables.

## Session handoff

Cross-origin launches retain the existing reconnect design:

1. The Platform URL contains only `roomCode`, `gameId`, and `gameSessionId`.
2. The complete credential envelope is placed in `window.name` for a same-tab, one-time handoff.
3. Retro Rush or Spin clears `window.name` before parsing, validates the envelope, then stores it in that game's origin-scoped `sessionStorage`.
4. Refresh and SignalR reconnect use that origin's saved credential.
5. Returning to Platform uses the room route and `returnFromGame=1`; the Platform already retains its own origin-scoped session.

`playerId`, display name, host status, and reconnect token are not added to launch URLs. Do not replace this with query-string credentials.

## AI-offline behavior

The AI Bot is intentionally absent from this deployment:

- Platform room creation and SignalR do not depend on it.
- Platform catches question-preparation failure and still launches the selected game.
- Retro Rush retries room-question loading, then uses its bundled default question set.
- Spin uses the backend's authoritative built-in question text when generated questions are unavailable.

No production frontend needs `VITE_AI_BOT_URL`, and `GEMINI_API_KEY` must not be exposed or configured in Cloudflare.

## In-memory limitation

`RoomManager` stores active rooms and game state in the backend process memory. Therefore:

- a Render restart removes all active rooms;
- a Render redeploy removes all active rooms;
- free-service spin-down removes all active rooms.

This is accepted for the first demo/MVP. Keep exactly one backend instance; multiple instances would have independent room state. No persistence is added in this phase.

## Local development

No Cloudflare or Render credentials are required for local development:

```bash
npm run dev:all
```

This keeps Platform on 5173, Retro Rush on 5174, Spin on 5175, the realtime backend on 5281, and the optional AI Bot on 3002 when available. Rus Ruleti remains on 5176 as part of the existing local script and is outside this deployment phase.

## First-deployment order

Use this exact sequence:

1. Deploy Render backend.
2. Verify public `/health`.
3. Configure local frontend against public backend.
4. Test SignalR.
5. Deploy Platform Pages.
6. Deploy Retro Rush Pages.
7. Deploy Spin Worker.
8. Configure final public URLs.
9. Configure Render CORS origins.
10. Test from two different networks.

Every Vite URL change requires a new frontend build/deployment. After step 8, rebuild all three Cloudflare applications with their final HTTPS values before the final CORS and two-network tests.

## Pre-deployment verification

Run from the repository root:

```bash
npm run build:all
npm run test:web
npm run test:retro-rush
npm run test:rus-ruleti
dotnet build
dotnet test
npm --workspace games/spin-the-bottle run check:cloudflare
docker build -f services/retrospective-server/Dockerfile -t retrospective-server .
git diff --check
```

If Docker is available, start the image with a test origin and port, then request `/health`:

```bash
docker run --rm -p 10000:10000 -e PORT=10000 -e AllowedOrigins__0=https://example.invalid retrospective-server
curl http://localhost:10000/health
```

The placeholder origin is sufficient for a local health check; it is not a production setting. A successful build or dry run is not a Cloudflare or Render deployment.

## Free-tier constraints

Render Free web services spin down after an idle period and can take about a minute to wake. WebSocket messages count as inbound activity, but a restart, redeploy, provider maintenance event, or idle spin-down still ends connections and clears all rooms. Free monthly hours, build minutes, and bandwidth are provider quotas, not guarantees. Confirm the current provider limits immediately before deployment.
