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

Room behavior is provided through `RoomService`. The current `MockRoomService` stores frontend-only snapshots in this browser and cannot synchronize separate browsers or computers. The production implementation should replace the service with ASP.NET Core API and SignalR adapters without changing page components.
