# Azure deployment readiness

This runbook prepares the repository for Azure. It does not create resources or deploy anything. Replace every angle-bracket placeholder only after the resource names and public hostnames are known.

## Target resources

| Component | Source | Azure target | Placeholder |
|---|---|---|---|
| Platform Website | `apps/retro-platform-web` | Azure Static Web Apps | `<PLATFORM_SWA>` |
| Retro Rush | `games/retro-rush` | Azure Static Web Apps | `<RETRO_RUSH_SWA>` |
| Spin the Bottle | `games/spin-the-bottle` | Azure App Service, Node.js | `<SPIN_APP_SERVICE>` |
| Realtime backend | `services/retrospective-server` | Azure App Service, ASP.NET Core | `<API_APP_SERVICE>` |
| AI Bot | `ai-bot` | Azure App Service, Node.js | `<AI_BOT_APP_SERVICE>` |
| Optional realtime fan-out | backend integration | Azure SignalR Service | `<SIGNALR_RESOURCE>` |

Place all resources in `<RESOURCE_GROUP>`. `services/retro-platform-api` is a legacy service and is not part of this target architecture.

Use Node.js 22.13 or newer for Spin and the AI Bot. Use the .NET 10 runtime for the realtime backend. Do not upgrade or unify the frontend toolchains: Platform and Retro Rush use Vite 7.3.6; Spin uses Vinext 1.0.0-beta.2 with Vite 8.0.13.

## Environment and application settings

All `VITE_*` values are public build-time browser configuration. Never place keys, tokens, reconnect credentials, or connection strings in them.

| Variable | Used by | Local example | Production purpose | Secret? |
|---|---|---|---|---|
| `VITE_API_URL` | Platform, Retro Rush, Spin | `http://localhost:5281` | `https://<api-host>`; base for REST and `/hubs/room` | No |
| `VITE_AI_BOT_URL` | Platform, Retro Rush, Spin | `http://localhost:3002` | `https://<ai-bot-host>` | No |
| `VITE_RETRO_RUSH_URL` | Platform | `http://localhost:5174` | `https://<retro-rush-host>` | No |
| `VITE_SPIN_THE_BOTTLE_URL` | Platform | `http://localhost:5175` | `https://<spin-host>` | No |
| `VITE_PLATFORM_URL` | Retro Rush, Spin | `http://localhost:5173` | `https://<platform-host>` for Back to Games | No |
| `VITE_ROOM_SERVICE` | Platform | `real` | Keep `real`; `mock` is isolated UI development only | No |
| `VITE_TRANSPORT_MODE` | Retro Rush standalone configuration | `mock` | Set `signalr` in its production build | No |
| `AllowedOrigins__0` | Backend | `http://localhost:5173` from Development JSON | Exact `https://<platform-host>` | No |
| `AllowedOrigins__1` | Backend | `http://localhost:5174` from Development JSON | Exact `https://<retro-rush-host>` | No |
| `AllowedOrigins__2` | Backend | `http://localhost:5175` from Development JSON | Exact `https://<spin-host>` | No |
| `ASPNETCORE_ENVIRONMENT` | Backend | `Development` from launch profile | `Production` | No |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | Backend | not needed | `true` on Linux App Service so forwarded HTTPS is observed | No |
| `Azure__SignalR__ConnectionString` | Backend, optional later | unset | Azure SignalR SDK configuration after optional integration | Yes |
| `QUESTION_PROVIDER` | AI Bot | `demo` | `demo` or `gemini` | No |
| `GEMINI_API_KEY` | AI Bot | `your-api-key-here` | Required when provider is `gemini` | Yes |
| `GEMINI_MODEL` | AI Bot | `gemini-2.5-flash-lite` | Provider model name | No |
| `PORT` | Spin and AI Bot | `3000` / `3002` | Assigned by App Service; do not hardcode it | No |
| `NODE_ENV` | AI Bot | `development` or unset | `production`, enabling fail-closed CORS validation | No |
| `ALLOWED_ORIGINS` | AI Bot | comma-separated local origins | Comma-separated exact HTTPS frontend origins | No |
| `SESSION_TTL_MINUTES` | AI Bot | `180` | In-memory question expiry | No |
| `INTERNAL_SERVICE_KEY` | AI Bot, optional server-to-server mode | placeholder only | Authenticate a future backend-to-bot proxy | Yes |

The Platform does not need a `VITE_PLATFORM_URL`: it derives its own origin from the browser. Existing `VITE_API_BASE_URL` and `VITE_HUB_URL` fields in Retro Rush are legacy standalone configuration; the multiplayer client in this deployment derives `/hubs/room` from `VITE_API_URL`.

## Builds and outputs

Run clean installation from the repository root. The AI Bot is a root npm workspace, so this installs all JavaScript build dependencies without relying on generated files.

```bash
npm ci
npm run build
npm run build:ai-bot
# or both groups:
npm run build:all
```

| Target | Working/app location | Build command from repository root | Output |
|---|---|---|---|
| Platform SWA | `/` | `npm run build:web` | `apps/retro-platform-web/dist` |
| Retro Rush SWA | `/` | `npm run build:retro-rush` | `games/retro-rush/dist` |
| Spin App Service | `/` | `npm run build:spin-the-bottle` | `games/spin-the-bottle/dist` (`client` and `server`) |
| Backend App Service | `/` | `dotnet publish services/retrospective-server -c Release -o <PUBLISH_DIR>` | `<PUBLISH_DIR>` |
| AI Bot App Service | `/` | `npm run build:ai-bot` | `ai-bot/dist` |

For an Azure Static Web Apps workflow that lets Oryx build from the monorepo, use `app_location: /`, the root build command shown above, and the exact repository-root-relative output location. If deploying the already-built artifact, point the deployment step at that `dist` directory and skip its build. The Platform build copies `public/staticwebapp.config.json` to the output root; its navigation fallback serves `index.html` for client routes while excluding asset/file requests. Retro Rush has no client-side route tree and needs no fallback.

## Production start commands

- Spin, repository deployment: `npm --workspace games/spin-the-bottle start`. From the game directory: `npm start`. Vinext confirmed that `vinext start` serves the prior `vinext build`, honors `PORT`, and binds `0.0.0.0`. Do not use a static-file server because Spin has a server build.
- AI Bot, repository deployment: `npm --workspace ai-bot start`. From `ai-bot`: `npm start`. This runs `node dist/server.js`; run the build first. Production startup reads App Service settings and does not require a `.env` file.
- Backend, published output: `dotnet retrospective-server.dll`. On a compatible Windows App Service, the platform can infer the managed startup from the deployed project; on Linux, configure this explicit command if required. Kestrel uses App Service/ASP.NET hosting configuration rather than port 5281.

The root `npm run dev:all` remains local-only and starts the three frontends, the backend, and the optional demo-mode AI Bot on ports 5173, 5174, 5175, 5281, and 3002. It requires neither Azure credentials nor a local AI `.env` file.

## Backend, CORS, HTTPS, and SignalR

Production startup fails closed when `AllowedOrigins` is empty. Configure only the three exact HTTPS frontend origins. The policy uses `WithOrigins`, allows required headers/methods, and enables credentials; never combine credentialed SignalR with `AllowAnyOrigin`.

Clients pass `https://<api-host>` to the official SignalR client, which negotiates at `https://<api-host>/hubs/room` and derives WSS transport. No client constructs a WebSocket URL manually. App Service terminates TLS. HSTS is enabled outside Development, but HTTPS redirection is intentionally not forced in application code because an unconfigured reverse proxy can redirect to an internal port. On Linux App Service set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`.

`GET /health` is anonymous and returns only a simple successful status. Configure the App Service health-check path as `/health`.

### Optional Azure SignalR

Azure SignalR is deliberately not compiled in yet: the project targets .NET 10, and forcing a package version before the service is selected adds deployment risk without helping the single-instance MVP. When enabling it, select the then-current `Microsoft.Azure.SignalR` package compatible with .NET 10, change `AddSignalR()` to conditionally call `AddAzureSignalR()` when `Azure:SignalR:ConnectionString` exists, and store configuration as `Azure__SignalR__ConnectionString` or use managed identity. Leave the setting absent locally so normal ASP.NET Core SignalR remains active.

Azure SignalR scales connections, not `RoomManager`. Even after enabling it, keep one backend instance until room state is shared safely.

## Session and reconnect audit

Separate origins cannot read each other's `sessionStorage`; the implementation does not depend on that. Before navigation the Platform:

1. writes only `roomCode`, `gameId`, and `gameSessionId` to the URL;
2. places the complete credential envelope in `window.name` for a same-tab, one-time handoff;
3. the destination clears `window.name` before parsing, validates the envelope, and saves it to that game's origin-scoped `sessionStorage`;
4. refresh and SignalR reconnect use the saved credential on the game origin.

`playerId`, `displayName`, `isHost`, and the reconnect token are not in the navigation URL. No API key, authorization secret, or reconnect secret is placed in query parameters. Both games use the same shared contract. Returning to the Platform does not copy the game credential back, because the Platform retains its own origin-scoped session.

## In-memory limits

`RoomManager` and AI question packages are process memory only. An App Service restart, deployment restart, or process recycle removes active rooms/questions. Configure exactly one backend instance for the MVP. Multiple independent backend instances would disagree about room state; Azure SignalR alone does not solve this. No database, Redis, or distributed room manager is part of this deployment.

## GitHub Actions readiness

Five path-filtered, manually triggerable workflows under `.github/workflows` perform clean builds/tests and upload artifacts. Changes to `packages/platform-contracts`, `packages/realtime-client`, or the root npm manifests trigger every affected frontend consumer. They intentionally contain no Azure login, deployment token, publish profile, or deployment step.

Before enabling deployment steps, define these non-secret repository/environment variables:

- `PUBLIC_API_URL`
- `PUBLIC_AI_BOT_URL`
- `PUBLIC_PLATFORM_URL`
- `PUBLIC_RETRO_RUSH_URL`
- `PUBLIC_SPIN_URL`

After resources exist, prefer GitHub OIDC/federated identity for App Service deployments. If an Azure-generated Static Web Apps deployment token is required, store it as a GitHub environment secret scoped to that one SWA. Never commit it to YAML. Add deployment jobs only after environments and approval rules exist.

## Deployment order

1. Deploy Backend App Service.
2. Verify `GET https://<api-host>/health`.
3. Connect a local Platform build to the public backend.
4. Deploy Retro Rush publicly.
5. Deploy the Platform Website publicly.
6. Deploy Spin the Bottle publicly.
7. Configure/rebuild all production public URLs.
8. Verify exact-origin CORS.
9. Verify SignalR from separate networks.
10. Deploy the AI Bot.
11. Optionally enable Azure SignalR.

## Pre-deployment gates

- Configure all public build URLs before producing deployable frontend artifacts; production clients fail clearly instead of using localhost.
- Keep `INTERNAL_SERVICE_KEY` out of browser builds. The current browser-to-bot design cannot securely send it. Before enabling a cost-bearing Gemini provider for an untrusted public audience, add an authenticated backend-to-bot proxy or an equivalent server-side access boundary. Demo mode does not require the Gemini credential.
- Verify CORS with the final three origins, including `/api/rooms`, `/api/rooms/{code}/join`, SignalR negotiate, WebSocket upgrade, refresh reconnect, and both games.
- Keep the backend instance count at one and expect active rooms to disappear on recycle/deploy.
