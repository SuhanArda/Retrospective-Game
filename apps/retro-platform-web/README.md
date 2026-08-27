# Retro Platform Web

The main retrospective platform frontend. It preserves the original WebSite's React 19, Vite, React Router, bilingual theme-aware UI, reusable header, forms, cards, lobby, and responsive styling.

Run it from the monorepo root with `npm run dev:web`.

Canonical routes:

- `/` — landing page
- `/room/create` — create a room
- `/room/join` — join a room
- `/room/:roomCode` — room lobby
- `/room/:roomCode/games` — registry-driven game selection
- `/room/:roomCode/game/:gameId` — launch transition

Legacy `/create-room`, `/join-room`, and `/oda/...` links remain accepted.

## Render Static Site

Use `npm run build:web` from the repository root and publish
`apps/retro-platform-web/dist`. Because the app intentionally uses
`BrowserRouter`, an existing Render Static Site also needs this rule under
**Redirects/Rewrites**:

| Source | Destination | Action |
|---|---|---|
| `/*` | `/index.html` | `Rewrite` |

Use a rewrite, not a redirect, so the requested route remains in the address
bar for React Router. Render serves existing static files before applying the
wildcard, so `/assets/*`, the favicon, and other generated files remain direct
asset requests. `public/staticwebapp.config.json` and `vercel.json` configure
other hosts and do not configure a Render service.

Room behavior is provided through `RoomService`. The current `MockRoomService` stores frontend-only snapshots in this browser and cannot synchronize separate browsers or computers. The production implementation should replace the service with ASP.NET Core API and SignalR adapters without changing page components.
