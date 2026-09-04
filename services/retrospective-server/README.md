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
- `AiQuestions:BaseUrl`: AI-bot base URL. The environment-variable form is `AiQuestions__BaseUrl`; local Development defaults to `http://localhost:3002/`.
- `AiQuestions:InternalServiceKey`: backend-to-AI-bot authentication key. The environment-variable form is `AiQuestions__InternalServiceKey` and its value must exactly match the AI-bot's `INTERNAL_SERVICE_KEY`.
- `Rooms:DisconnectGraceSeconds`: disconnect grace window.
- `--urls`: local-only listen override. Azure App Service supplies the production binding through ASP.NET Core hosting configuration.

Production intentionally refuses to start without at least one allowed origin. Do not use `AllowAnyOrigin`: browser SignalR connections use credentials. App Service terminates public HTTPS; set `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true` so ASP.NET Core observes the forwarded scheme. The application does not force an HTTP-to-HTTPS redirect, avoiding an incorrect internal-port redirect behind the proxy.

If the AI-bot runs as a separate Render service, `http://localhost:3002/` is not its address from the backend container. Set `AiQuestions__BaseUrl=https://<AI_BOT_RENDER_HOST>/` on the backend and configure the same non-empty service key on both services. Gateway startup and request logs report the base URL, whether a key is configured, outbound status codes, connection failures, and authentication rejection without logging credentials or room data.
