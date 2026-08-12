# Services

## retrospective-server

The current production-oriented multiplayer authority. It provides REST room admission, authenticated SignalR rejoin, host-controlled room/game lifecycle, disconnect grace and host transfer, and authoritative Spin the Bottle results. See [its README](retrospective-server/README.md) and the [multiplayer architecture](../docs/online-multiplayer.md).

## retro-platform-api (legacy)

ASP.NET Core (.NET 10) API and SignalR hub. This is the authority for rooms:
it owns room codes, membership, capacity, the host role, and — importantly —
the outcome of a game vote. The browser no longer decides any of that.

```bash
npm run dev:api        # http://localhost:5280
npm run test:api
```

### Surface

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check for a deployment platform |
| `GET /api/rooms/{roomCode}` | Look a room up without opening a socket |
| `/hubs/room` | SignalR hub (below) |

Hub methods called by a client: `CreateRoom`, `JoinRoom`, `RejoinRoom`,
`GetRoom`, `LeaveRoom`, `BeginGameSelection`, `CastVote`, `ResolveVote`,
`ReturnToLobby`.

The hub pushes `RoomSnapshot` (the whole room, so clients replace rather than
merge) and `RoomClosed`.

### Things worth knowing

- **Rooms live in memory.** Restarting the service drops every room. That is a
  deliberate first step, not an oversight — swapping `RoomStore` for a
  database-backed implementation is the intended next move if rooms need to
  survive a restart.
- **The vote countdown runs server-side** (`RoomMaintenanceService`), so the
  result is identical for everyone even if the host closes their laptop.
- **A dropped connection keeps its seat for 30 seconds.** Reloading a page
  closes the socket, and ejecting people from their own room on every refresh
  was a bug worth designing out from the start. Clients come back with
  `RejoinRoom`.
- **CORS origins** default to the local Vite ports and can be overridden with
  the `AllowedOrigins` configuration array once the apps are deployed.

### Not done yet

- No persistence, no authentication.
- The game catalogue still lives in the web app; the client passes candidate
  game ids when opening a vote. Moving the catalogue here would close the last
  gap where a client could name games the server has never heard of.
- Real-time gameplay state (`games/retro-rush`) is not wired to this service —
  only the lobby and the vote are.
