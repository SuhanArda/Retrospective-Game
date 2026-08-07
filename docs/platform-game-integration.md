# Platform and game integration

## Current frontend prototype

```text
Browser
  → Retro Platform Web
  → MockRoomService
  → Room lobby
  → Registry-driven game selection
  → GameLauncher
  → Retro Rush
  → Return to platform lobby
```

`RoomService` owns the frontend boundary used by pages. `MockRoomService` implements it with localStorage snapshots, a tab-scoped typed `PlatformSession`, and optional BroadcastChannel updates between same-origin tabs. It is development-only and does not synchronize separate browsers or computers.

The game registry describes available games and resolves their runtime URLs from typed Vite configuration. `GameLauncher` validates the selected registry entry, saves the non-sensitive launch context, and navigates in the same tab. During separate-port development the same non-sensitive fields are also carried in the launch URL because browser storage is origin-scoped; Retro Rush validates them and stores the resulting context under `retro-platform.game-session`. No token, credential, or secret is included.

Retro Rush falls back to its existing standalone mock identity when no valid launch context exists. Its platform return URL is controlled by `VITE_PLATFORM_URL`.

## Future ASP.NET Core and SignalR flow

```text
Browser
  → Platform Website
  → ASP.NET Core Room API
  → SignalR room
  → Game selection
  → Retro Rush
  → same SignalR room and game session
```

The backend will own room creation, room-code uniqueness, membership, capacity, host assignment, ready states, selected game, start authorization, reconnect, lifecycle, and the active game session. Replace `MockRoomService` with an `ApiRoomService`/`SignalRRoomService`; page components should continue consuming the same typed snapshots and errors.

Suggested client-to-server events:

- `JoinRoom`
- `LeaveRoom`
- `SetReady`
- `SelectGame`
- `StartGame`

Suggested server-to-client events:

- `RoomSnapshot`
- `PlayerJoined`
- `PlayerLeft`
- `ReadyChanged`
- `GameSelected`
- `GameStarting`
- `RoomClosed`

Retro Rush should eventually exchange its current transport-neutral intents and confirmed events through the same authenticated room/game-session identity. Result persistence belongs behind a future backend result service; it is intentionally not simulated here.
