# Sabancı DX Retrospective Game Platform

This monorepo contains the entry platform and independently runnable retrospective games.

## Repository layout

- `apps/retro-platform-web/` — the existing React/Vite Website, now the main create/join/lobby/game-selection application.
- `games/retro-rush/` — the existing React/TypeScript/Vite/Phaser game. It remains an independent application.
- `packages/platform-contracts/` — the small typed launch contract shared by the platform and games.
- `services/` — reserved for the future ASP.NET Core room API and SignalR hubs.
- `packages/` — shared frontend/domain boundaries that have multiple real consumers.
- `docs/` — repository-wide architecture and integration documentation.

## Local development

Use a current Node.js LTS release and run from the repository root:

```bash
npm install
npm run dev
```

The combined command starts:

- Platform Website: <http://localhost:5173>
- Retro Rush: <http://localhost:5174>

The applications can also be started separately:

```bash
npm run dev:web
npm run dev:retro-rush
```

Repository checks run both applications:

```bash
npm run lint
npm run test
npm run build
```

## Current user flow

Open the platform, create or join a room, enter the lobby, choose Retro Rush, and launch it in the same browser tab. Retro Rush receives the room/player launch context and shows **Return to Lobby** when it was opened by the platform. Opening Retro Rush directly still uses its standalone mock room and player.

Game endpoints are configuration-driven:

```dotenv
# apps/retro-platform-web
VITE_RETRO_RUSH_URL=http://localhost:5174

# games/retro-rush
VITE_PLATFORM_URL=http://localhost:5173
```

Production may instead use paths such as `/games/retro-rush/`.

## Mock room limitation

`MockRoomService` is for frontend development. Room snapshots use localStorage and same-origin tab updates use BroadcastChannel, so they do not synchronize separate browsers, devices, or users on different computers. ASP.NET Core and SignalR must replace this authority for production. See [Platform/game integration](docs/platform-game-integration.md).
