# Retrospective Game Platform

This monorepo contains the entry platform and independently runnable retrospective games.

## Repository layout

- `apps/retro-platform-web/` — the existing React/Vite Website, now the main create/join/lobby/game-selection application.
- `games/retro-rush/` — the existing React/TypeScript/Vite/Phaser game. It remains an independent application.
- `packages/platform-contracts/` — the small typed launch contract shared by the platform and games.
- `packages/realtime-client/` — shared SignalR connection, reconnect, and room/game event client.
- `services/retrospective-server/` — ASP.NET Core room and game-session authority.
- `packages/` — shared frontend/domain boundaries that have multiple real consumers.
- `docs/` — repository-wide architecture and integration documentation.

## Local development

Use a current Node.js LTS release and run from the repository root:

```bash
npm install
npm run dev:all
```

The combined command starts:

- Platform Website: <http://localhost:5173>
- Retro Rush: <http://localhost:5174>
- Spin the Bottle: <http://localhost:5175>
- Room server: <http://localhost:5281>
- Demo AI question service: <http://localhost:3002>

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

## Multiplayer

The real room server is the default. `MockRoomService` remains an explicit `VITE_ROOM_SERVICE=mock` fallback for isolated frontend work and cannot synchronize separate browsers or devices. See [Online multiplayer foundation](docs/online-multiplayer.md) for architecture, security, lifecycle, and LAN setup.
