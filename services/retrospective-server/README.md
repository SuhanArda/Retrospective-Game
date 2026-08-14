# Retrospective server

Production-oriented in-memory room authority for the platform's first online multiplayer slice.

```bash
npm run dev:server   # http://localhost:5281
npm run test:server
```

REST creates/joins rooms and returns a stable player id plus a cryptographic reconnect token. SignalR at `/hubs/room` authenticates that pair, joins `room:{ROOM_CODE}`, and broadcasts replaceable snapshots. Room codes are invite locators, not credentials.

The process is intentionally ephemeral: restarting it removes rooms. Disconnected seats remain for 25 seconds; the oldest remaining participant becomes host only after that grace period or an explicit leave. A second connection using the same credentials replaces the older connection.

Configuration:

- `AllowedOrigins`: exact browser origins allowed to use credentialed SignalR connections. Localhost values live only in `appsettings.Development.json`; production must set `AllowedOrigins__0`, `AllowedOrigins__1`, and so on.
- `Rooms:DisconnectGraceSeconds`: disconnect grace window.
- `--urls`: local-only listen override. Azure App Service supplies the production binding through ASP.NET Core hosting configuration.

Production intentionally refuses to start without at least one allowed origin. Do not use `AllowAnyOrigin`: browser SignalR connections use credentials. App Service terminates public HTTPS; set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so ASP.NET Core observes the forwarded scheme. The application does not force an HTTP-to-HTTPS redirect, avoiding an incorrect internal-port redirect behind the proxy.
