# Retrospective server

Production-oriented in-memory room authority for the platform's first online multiplayer slice.

```bash
npm run dev:server   # http://localhost:5281
npm run test:server
```

REST creates/joins rooms and returns a stable player id plus a cryptographic reconnect token. SignalR at `/hubs/room` authenticates that pair, joins `room:{ROOM_CODE}`, and broadcasts replaceable snapshots. Room codes are invite locators, not credentials.

The process is intentionally ephemeral: restarting it removes rooms. Disconnected seats remain for 25 seconds; the oldest remaining participant becomes host only after that grace period or an explicit leave. A second connection using the same credentials replaces the older connection.

Configuration:

- `AllowedOrigins`: exact browser origins allowed to use credentialed SignalR connections.
- `Rooms:DisconnectGraceSeconds`: disconnect grace window.
- `--urls`: listen address. For LAN testing use `--urls http://0.0.0.0:5281` and configure each frontend's `VITE_API_URL` with the host machine's LAN address.
