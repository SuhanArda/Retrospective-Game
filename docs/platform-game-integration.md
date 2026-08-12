# Platform and game integration

The platform launches registered games in the current tab. The server-created room snapshot supplies the selected game and active `gameSessionId`; every participant follows that same snapshot through `GameLauncher`.

Navigation URLs contain only non-secret routing data (`roomCode`, `gameId`, and `gameSessionId`). Stable player identity and the reconnect token cross local development origins through a one-time `window.name` envelope. The game consumes and clears that envelope immediately, validates it with `@retro-platform/contracts`, saves it to its own origin's `sessionStorage`, then attaches through `@retro-platform/realtime-client`.

Games launched directly have no envelope and preserve standalone behavior. Platform-launched games connect to the same SignalR room group as the website. Host authority always comes from fresh server snapshots; the advisory `isHost` field in launch context is used only before the first snapshot arrives.

Retro Rush retains its gameplay-specific transport and uses the shared client only for room/game-session lifecycle. Spin the Bottle uses the room connection for its server-authoritative spin result. See [Online multiplayer foundation](online-multiplayer.md) for the complete lifecycle, security model, endpoints, and LAN setup.
