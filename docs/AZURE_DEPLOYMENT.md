# Azure deployment readiness

This runbook prepares the repository for Azure and documents the deployment workflows. It does not create resources. Resource names are fixed below; the remaining angle-bracket placeholders are public hostnames, which are only known once the resources exist.

## Target resources

| Component | Source | Azure target | Resource name |
|---|---|---|---|
| Platform Website | `apps/retro-platform-web` | Azure Static Web Apps | `stapp-retro-game-web-dev-001` |
| Retro Rush | `games/retro-rush` | Azure Static Web Apps | `stapp-retro-game-rush-dev-001` |
| Spin the Bottle | `games/spin-the-bottle` | Azure App Service, Node.js | `app-retro-game-spin-dev-001` |
| Rus Ruleti | `games/rus-ruleti` | Azure Static Web Apps | `stapp-retro-game-rus-ruleti-dev-001` |
| Draw and Guess | `games/draw-and-guess` | Azure Static Web Apps | `stapp-retro-game-draw-dev-001` |
| Imposter | `games/imposter` | Azure Static Web Apps | `stapp-retro-game-imposter-dev-001` |
| Realtime backend | `services/retrospective-server` | Azure App Service, ASP.NET Core | `app-retro-game-api-dev-001` |
| AI Bot | `ai-bot` | Azure App Service, Node.js | `app-retro-game-bot-dev-001` |
| Optional realtime fan-out | backend integration | Azure SignalR Service | `<SIGNALR_RESOURCE>` |

Place all resources in `rg-innovation-dev`, on a dedicated App Service Plan named `plan-retro-game-dev-001`. `services/retro-platform-api` is a legacy service and is not part of this target architecture.

### Hosting plan

The two App Services (backend and Spin) go on their own App Service Plan, not onto an existing one. The plan needs Basic or higher for Always On and WebSockets, and its worker count must stay at 1 because `RoomManager` is process memory.

Do not co-locate these on a plan that is already near its memory ceiling. An App Service Plan shares one VM's CPU and RAM across every site on it, and on Linux a plan that exhausts memory restarts containers — which for this application means silently destroying every active room. Measure `MemoryPercentage` and `CpuPercentage` on a candidate plan over at least 24 hours before reusing it.

Budget from measurement, not from process size. On a dedicated B1 (1 vCPU, 1.75 GB) these two sites alone measured about 80 percent memory with no users connected, because the Linux container hosts and the SCM sidecar cost far more than the application processes do. B1 therefore has little headroom left for concurrent rooms, and B2 is the safer size for anything beyond demonstration use.

Basic tier has no deployment slots, so every deploy is a restart and drops active rooms. Standard or higher is required for a warm swap.

Use Node.js 22.13 or newer for Spin and the AI Bot. Use the .NET 10 runtime for the realtime backend. Do not upgrade or unify the frontend toolchains: Platform and Retro Rush use Vite 7.3.6; Spin uses Vinext 1.0.0-beta.6 with Vite 8.2.1.

## Environment and application settings

All `VITE_*` values are public build-time browser configuration. Never place keys, tokens, reconnect credentials, or connection strings in them.

| Variable | Used by | Local example | Production purpose | Secret? |
|---|---|---|---|---|
| `VITE_API_URL` | Platform and all five games | `http://localhost:5281` | `https://<api-host>`; base for REST and `/hubs/room` | No |
| `VITE_RETRO_RUSH_URL` | Platform | `http://localhost:5174` | `https://<retro-rush-host>` | No |
| `VITE_SPIN_THE_BOTTLE_URL` | Platform | `http://localhost:5175` | `https://<spin-host>` | No |
| `VITE_RUS_RULETI_URL` | Platform | `http://localhost:5176` | `https://<rus-ruleti-host>` | No |
| `VITE_DRAW_AND_GUESS_URL` | Platform | `http://localhost:5177` | `https://<draw-and-guess-host>` | No |
| `VITE_IMPOSTER_URL` | Platform | `http://localhost:5178` | `https://<imposter-host>` | No |
| `VITE_PLATFORM_URL` | All five games | `http://localhost:5173` | `https://<platform-host>` for Back to Games | No |
| `VITE_ROOM_SERVICE` | Platform | `real` | Keep `real`; `mock` is isolated UI development only | No |
| `VITE_TRANSPORT_MODE` | Retro Rush standalone configuration | `mock` | Set `signalr` in its production build | No |
| `AllowedOrigins__0` | Backend | `http://localhost:5173` from Development JSON | Exact `https://<platform-host>` | No |
| `AllowedOrigins__1` | Backend | `http://localhost:5174` from Development JSON | Exact `https://<retro-rush-host>` | No |
| `AllowedOrigins__2` | Backend | `http://localhost:5175` from Development JSON | Exact `https://<spin-host>` | No |
| `AllowedOrigins__3` | Backend | `http://localhost:5176` from Development JSON | Exact `https://<rus-ruleti-host>` | No |
| `AllowedOrigins__4` | Backend | `http://localhost:5177` from Development JSON | Exact `https://<draw-and-guess-host>` | No |
| `AllowedOrigins__5` | Backend | `http://localhost:5178` from Development JSON | Exact `https://<imposter-host>` | No |
| `ASPNETCORE_ENVIRONMENT` | Backend | `Development` from launch profile | `Production` | No |
| `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | Backend | not needed | `true` on Linux App Service so forwarded HTTPS is observed | No |
| `Azure__SignalR__ConnectionString` | Backend, optional later | unset | Azure SignalR SDK configuration after optional integration | Yes |
| `AI_PROVIDER` | AI Bot | `local` | `local` or `gemini` | No |
| `GEMINI_API_KEY` | AI Bot | `your-api-key-here` | Required when provider is `gemini` | Yes |
| `GEMINI_MODEL` | AI Bot | `gemini-2.5-flash-lite` | Provider model name | No |
| `PORT` | Spin and AI Bot | `3000` / `3002` | Assigned by App Service; do not hardcode it | No |
| `NODE_ENV` | AI Bot | `development` or unset | `production`, enabling fail-closed CORS validation | No |
| `ALLOWED_ORIGINS` | AI Bot | comma-separated local origins | Comma-separated exact HTTPS frontend origins | No |
| `INTERNAL_SERVICE_KEY` | AI Bot and backend | placeholder only | Must equal backend `AiQuestions__InternalServiceKey` | Yes |

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
| Rus Ruleti SWA | `/` | `npm run build:rus-ruleti` | `games/rus-ruleti/dist` |
| Draw and Guess SWA | `/` | `npm run build:draw-and-guess` | `games/draw-and-guess/dist` |
| Imposter SWA | `/` | `npm run build:imposter` | `games/imposter/dist` |
| Spin App Service | `/` | `npm run build:spin-the-bottle && npm run package:spin-the-bottle` | `artifacts/spin-the-bottle` (`dist/` plus a generated `package.json`) |
| Backend App Service | `/` | `dotnet publish services/retrospective-server -c Release -o <PUBLISH_DIR>` | `<PUBLISH_DIR>` |
| AI Bot App Service | `/` | `npm run build:ai-bot` | `ai-bot/dist` |

For an Azure Static Web Apps workflow that lets Oryx build from the monorepo, use `app_location: /`, the root build command shown above, and the exact repository-root-relative output location. If deploying the already-built artifact, point the deployment step at that `dist` directory and skip its build. The Platform build copies `public/staticwebapp.config.json` to the output root; its navigation fallback serves `index.html` for client routes while excluding asset/file requests. Retro Rush has no client-side route tree and needs no fallback.

## Production start commands

- Spin, App Service deployment: deploy `artifacts/spin-the-bottle` (produced by `npm run package:spin-the-bottle`), let App Service run `npm install --omit=dev`, and start with `npm start`. `vinext start` is the only production entrypoint: it serves the prior `vinext build`, honors `PORT`, and binds `0.0.0.0`. It is verified to serve SSR HTML, hashed `_next` chunks, and `public/` sprites from this package. Two constraints make the generated package necessary: `vinext` is a workspace devDependency, so a `dist`-only payload cannot start; and `vinext build` emits no self-contained server bundle. Do not use a static-file server because Spin has a server build.
- AI Bot, repository deployment: `npm --workspace ai-bot start`. From `ai-bot`: `npm start`. This runs `node dist/server.js`; run the build first. Production startup reads App Service settings and does not require a `.env` file.
- Backend, published output: `dotnet retrospective-server.dll`. On a compatible Windows App Service, the platform can infer the managed startup from the deployed project; on Linux, configure this explicit command if required. Kestrel uses App Service/ASP.NET hosting configuration rather than port 5281.

The root `npm run dev:all` remains local-only and starts the six frontends, the backend, and the optional local-mode AI Bot on ports 5173, 5174, 5175, 5176, 5177, 5178, 5281, and 3002. It requires neither Azure credentials nor a local AI `.env` file.

## Backend, CORS, HTTPS, and SignalR

Production startup fails closed when `AllowedOrigins` is empty. Configure all six exact HTTPS frontend origins (`AllowedOrigins__0` through `AllowedOrigins__5`). The policy uses `WithOrigins`, allows required headers/methods, and enables credentials; never combine credentialed SignalR with `AllowAnyOrigin`.

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

`playerId`, `displayName`, `isHost`, and the reconnect token are not in the navigation URL. No API key, authorization secret, or reconnect secret is placed in query parameters. All five games use the same shared contract. Returning to the Platform does not copy the game credential back, because the Platform retains its own origin-scoped session.

## In-memory limits

`RoomManager` and AI question packages are process memory only. An App Service restart, deployment restart, or process recycle removes active rooms/questions. Configure exactly one backend instance for the MVP. Multiple independent backend instances would disagree about room state; Azure SignalR alone does not solve this. No database, Redis, or distributed room manager is part of this deployment.

## GitHub Actions readiness

### Readiness workflows

Eight path-filtered `azure-*-build.yml` workflows perform clean builds/tests and upload artifacts. Changes to `packages/platform-contracts`, `packages/realtime-client`, or the root npm manifests trigger every affected frontend consumer. They contain no Azure login or deployment step.

### Deployment workflows

Three `deploy-*.yml` workflows perform the actual deployments. All three are `workflow_dispatch` only and target the `dev` GitHub environment, so branch protection and required reviewers gate them. They are deliberately not triggered by push: every deploy restarts a process that holds room state, so the timing has to be a human decision.

| Workflow | Deploys | Notes |
|---|---|---|
| `deploy-backend.yml` | `app-retro-game-api-dev-001` | Runs the .NET tests, asserts `numberOfWorkers` is 1 before publishing, then polls `/health` until it returns 200. |
| `deploy-spin.yml` | `app-retro-game-spin-dev-001` | Builds, runs `package:spin-the-bottle`, deploys the generated package with `npm start` as the startup command, then polls `/`. |
| `deploy-statics.yml` | the five Static Web Apps | A `target` input deploys one frontend or `all`. `fail-fast` is off so one failure does not cancel the rest. |

Define these non-secret repository/environment variables. `deploy-statics.yml` requires all seven for every target, because three games substitute localhost rather than failing when one is absent:

- `PUBLIC_API_URL`
- `PUBLIC_PLATFORM_URL`
- `PUBLIC_RETRO_RUSH_URL`
- `PUBLIC_SPIN_URL`
- `PUBLIC_RUS_RULETI_URL`
- `PUBLIC_DRAW_AND_GUESS_URL`
- `PUBLIC_IMPOSTER_URL`

App Service deployments authenticate with GitHub OIDC/federated identity, which needs these secrets and a federated credential on the app registration scoped to this repository and the `dev` environment:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

Each Static Web App has its own deployment token, stored as a separate environment secret so one token cannot publish to another site. Never commit a token to YAML.

- `AZURE_SWA_TOKEN_PLATFORM`
- `AZURE_SWA_TOKEN_RETRO_RUSH`
- `AZURE_SWA_TOKEN_RUS_RULETI`
- `AZURE_SWA_TOKEN_DRAW_AND_GUESS`
- `AZURE_SWA_TOKEN_IMPOSTER`

## Deployment order

1. Deploy Backend App Service.
2. Verify `GET https://<api-host>/health`.
3. Connect a local Platform build to the public backend.
4. Deploy Retro Rush publicly.
5. Deploy Rus Ruleti, Draw and Guess, and Imposter publicly.
6. Deploy the Platform Website publicly.
7. Deploy Spin the Bottle publicly.
8. Configure/rebuild all production public URLs.
9. Verify exact-origin CORS.
10. Verify SignalR from separate networks.
11. Deploy the AI Bot.
12. Optionally enable Azure SignalR.

## Pre-deployment gates

- Configure all public build URLs before producing deployable frontend artifacts. The Platform, Retro Rush, and Spin fail their build when a URL is absent. Rus Ruleti, Draw and Guess, and Imposter do not: `parse*RuntimeConfig` silently substitutes `http://localhost:5281` and `http://localhost:5173`, so a missing variable ships a build that cannot reach the backend and is blocked as mixed content over HTTPS. Their readiness workflows guard the variables explicitly; any deployment workflow must do the same.
- Keep `INTERNAL_SERVICE_KEY` and `GEMINI_API_KEY` out of browser builds. Browsers call only the authenticated ASP.NET room API; the backend-to-bot request carries the internal key.
- Verify CORS with all six final origins, including `/api/rooms`, `/api/rooms/{code}/join`, SignalR negotiate, WebSocket upgrade, refresh reconnect, and all games.
- Keep the backend instance count at one and expect active rooms to disappear on recycle/deploy.
