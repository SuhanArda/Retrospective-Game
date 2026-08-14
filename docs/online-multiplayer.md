# Online multiplayer foundation

## Run locally

From the repository root:

```bash
npm install
npm run dev:all
```

This starts the room server on `http://localhost:5281`, the platform on `5173`, Retro Rush on `5174`, Spin the Bottle on `5175`, and Rus Ruleti on `5176`. `npm run dev` remains the frontend-only workflow. The platform uses the real server by default; opt into the browser-only implementation with `VITE_ROOM_SERVICE=mock`.

## Authority and boundaries

```text
Platform / games
  -> REST create or join (server returns player id + reconnect token)
  -> shared realtime-client
  -> SignalR /hubs/room
  -> RoomManager (single authority)
       room membership + host id
       room phase + selected game
       active game-session id / round id / seed
       Spin the Bottle result
       Rus Ruleti cylinder + shot outcome
```

- `services/retrospective-server` is the room and game-session authority. Its `ConcurrentDictionary` is intentionally process-local for this milestone.
- `packages/platform-contracts` contains wire snapshots and launch/session types.
- `packages/realtime-client` owns SignalR connection, automatic reconnect, explicit token-based rejoin, and typed room/game events.
- `apps/retro-platform-web` keeps the existing page/service boundary. Real service mode uses REST for admission and SignalR for state changes.
- Games connect to the same room group and validate the active `gameSessionId`. Retro Rush keeps its existing gameplay transport; the shared client only coordinates room/session lifecycle. The server-provided Retro Rush seed is exposed at the app boundary as `data-map-seed`, ready for a later authoritative map migration.

## Identity, reconnect, and duplicate tabs

Room creation/join returns a random stable `playerId` and 256-bit reconnect token. The server stores only its SHA-256 hash and compares hashes in constant time. A SignalR `ConnectionId` is temporary and never identifies a participant.

On refresh or transport reconnect, the client calls `RejoinRoom(roomCode, playerId, reconnectToken)`. A disconnected seat remains reserved for 25 seconds. If it does not return, the player is removed and the oldest remaining participant becomes host. Explicit leave transfers host immediately. When the same identity connects twice, the newest connection replaces the older one; server mutations authorize only the current connection id.

Room codes are invite locators and are safe in URLs. Reconnect tokens are never put in URLs. Cross-origin game launches place a one-time credential envelope in `window.name`; the destination consumes, clears, validates, and saves it in that origin's `sessionStorage` before connecting. This avoids referrer/history/server-log leakage. Production deployments should also use HTTPS and avoid adding request-body logging around admission responses.

## Room and game lifecycle

The room phases are `LOBBY -> GAME_SELECTION -> STARTING_GAME -> PLAYING`. The current host alone can change phases, select/start a game, or return the whole room to game selection. All clients launch from the same authoritative snapshot through the existing registry. A non-host Back action is local; a host Back broadcasts `ReturnedToGameSelection` and every game client navigates back.

For Spin the Bottle, any attached participant may request a spin. The server selects the target, computes the cumulative final angle and duration, stores the latest result, and broadcasts one `SpinResult`; clients never choose their own online result. Standalone launch still uses the original local behavior.

For Rus Ruleti, the server owns the cylinder: chamber count, bullet position, and pointer are held server-side and deliberately excluded from `RussianRouletteStateSnapshot`, so no client can read a hit before firing. Only the current holder may `RequestFire`, never at themselves; the pointer advances on every shot, so the bullet is guaranteed within one cylinder rather than re-rolled per shot. A miss silently passes the gun to whoever was shot at. A hit puts the room in `QUESTION_ACTIVE` with a server-chosen question, and only that target may `CompleteFireQuestion` — which reloads the cylinder in secret and hands them the gun. Nobody is ever eliminated. Standalone launch keeps the original local bot behavior.

## REST and SignalR surface

| Surface | Purpose |
|---|---|
| `POST /api/rooms` | Create room and host admission |
| `POST /api/rooms/{code}/join` | Join before play starts |
| `GET /api/rooms/{code}` | Public non-secret snapshot |
| `GET /health` | Liveness |
| `/hubs/room` | Rejoin, leave, host lifecycle, reactions, spin, fire |

SignalR groups are deterministically named `room:{ROOM_CODE}`. State-changing hub methods resolve player and host authority from server state, never from client-provided `isHost` flags.

## LAN testing

Use the host machine's LAN address, for example `192.168.1.50`:

```powershell
$env:AllowedOrigins__0='http://192.168.1.50:5173'
$env:AllowedOrigins__1='http://192.168.1.50:5174'
$env:AllowedOrigins__2='http://192.168.1.50:5175'
$env:AllowedOrigins__3='http://192.168.1.50:5176'
dotnet run --project services/retrospective-server --urls http://0.0.0.0:5281
```

Set each frontend's `VITE_API_URL=http://192.168.1.50:5281`; set the platform game URLs and each game's `VITE_PLATFORM_URL` to the same LAN host. Start Vite/Vinext with host exposure as appropriate, allow ports `5173-5176` and `5281` through the local firewall, then open the platform from two devices. Never expose this HTTP development setup to the public internet.

## Verification

```bash
npm run test:server
npm run test:web
npm run test:retro-rush
npm run build
npm run lint
```

For manual acceptance, use two independent browser profiles: create in one, join in the other, verify both participant lists, start each game as host, verify the shared spin target/angle, refresh during play and reconnect, verify guest host actions are refused, close the host past the grace period to observe host transfer, then use host Back and confirm both return to selection.
