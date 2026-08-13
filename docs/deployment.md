# Deployment

> **Legacy note:** this document describes the older `services/retro-platform-api` deployment experiment. It is not the current Azure target. Use [Azure deployment readiness](AZURE_DEPLOYMENT.md) for the `services/retrospective-server` architecture and production commands. Nothing in either document performs a deployment.

Two things get deployed separately: the room API (a long-running service) and
the web app (static files). The game, `games/retro-rush`, is also static and
follows the same pattern as the web app.

Nothing here is deployed yet. This is the runbook for doing it the first time.

## Order matters

Deploy the API first. The web app needs the API's final URL **at build time** —
Vite bakes `VITE_API_URL` into the bundle, so setting it afterwards means
rebuilding.

## 1. Room API

Any host that can run a Docker image works. `services/retro-platform-api/Dockerfile`
builds from the repository root:

```bash
docker build -f services/retro-platform-api/Dockerfile -t retro-api .
```

Environment variables:

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | Set by the host | Which port to listen on. The app binds `0.0.0.0:$PORT`. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated list of sites allowed to call the API. |

`ALLOWED_ORIGINS` must contain the deployed web app's origin, and the game's
origin if it is hosted separately:

```
ALLOWED_ORIGINS=https://your-site.vercel.app,https://your-game.vercel.app
```

Getting this wrong shows up as the browser refusing the connection while
`curl` works fine — CORS is enforced by the browser, not the server.

Health check path: `/health`.

## 2. Web app

Build command `npm run build:web`, output `apps/retro-platform-web/dist`.

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_URL` | Yes | The deployed API's base URL, e.g. `https://retro-api.onrender.com`. No trailing path. |
| `VITE_RETRO_RUSH_URL` | Yes | Where the game is hosted. |

Leaving `VITE_API_URL` unset is not a broken build — the app silently falls
back to the browser-only mock, where nobody can see anyone else. If a deployed
site behaves like everyone is alone in their own room, this is why.

## Content-Security-Policy

The page's CSP is generated from `VITE_API_URL` at build time
(`src/security/contentSecurityPolicy.ts`) so that `connect-src` names the API
and its `wss://` origin.

Do not add a `Content-Security-Policy` header at the host as well. A browser
given two policies enforces both, and a static `connect-src 'self'` would win
the intersection and block the API regardless of what the page allows. This is
why `vercel.json` and `public/_headers` deliberately carry every security
header *except* CSP.

## What to expect on a free tier

- The API sleeps after a period of inactivity and takes 30–60s to wake. The
  first person to open a room after a quiet spell will wait.
- **Rooms are held in memory, so a sleep or a restart deletes every room.**
  That is acceptable for a meeting-length session and is the reason
  `RoomStore` is deliberately isolated: swapping it for a database-backed
  implementation is the fix if rooms ever need to outlive a restart.

## Not covered

There is no authentication. Anyone with the URL can create a room and join any
room whose six-character code they know. That is fine for a team trying it out;
it is not fine for anything public or sensitive.
