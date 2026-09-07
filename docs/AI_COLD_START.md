# Render Free AI-bot cold-start fix

The user confirmed the incident: generation works after manually opening the ai-bot URL, but can fail while the Free service is asleep. The backend now wakes/checks the bot on demand before sending generation. The previous production URL validation, authentication, diagnostics, optional prompt, and fallback changes remain intact. This patch has been exercised locally; it has not been deployed to Render.

## 1. Previous timeout chain

| Boundary | Before | After |
|---|---|---|
| `CreateRoom.jsx` preparation grace | At most 2 seconds, then navigate to lobby | Unchanged; pending request continues |
| `QuestionBotService.ts` generation POST | 45 seconds | 135 seconds by default, configurable at build time |
| Browser question-set GET | 3 seconds | Unchanged |
| `Program.cs` gateway HttpClient | 40 seconds, including any wait for Render to wake | Separate readiness step first; the existing 40 seconds then applies to the generation HTTP request |
| Backend readiness | None | 90 seconds default total; individual health probe up to 10 seconds |
| Bot `AI_REQUEST_TIMEOUT_MS` | 30000 per Gemini attempt | Unchanged |
| Bot `AI_MAX_RETRIES` | 2 retries, at most 3 attempts with 250/500 ms backoff | Unchanged |

The backend's room-generation endpoint already uses `CancellationToken.None` after receiving the request body so browser navigation does not cancel preparation. The shared readiness task has its own deadline and observes application shutdown; cancelling an individual waiter does not cancel other rooms' shared wake task. Generation GET/DELETE behavior remains unchanged.

The existing Gemini retries can still exceed the 40-second generation timeout. This change deliberately separates hosting startup time from generation time; it does not change normal Gemini retries or their fallback behavior.

## 2. Why manually opening the URL helped

Render Free web services spin down after 15 minutes without inbound traffic. An incoming HTTP request initiates startup, which Render documents as taking about a minute. Manually opening the URL did that work before the backend's 40-second generation request. The new public health request initiates it automatically, with a separate budget. [Render Free service behavior](https://render.com/docs/free).

## 3. Files changed for this follow-up

- Backend: `Rooms/AiBotReadiness.cs` and `Rooms/AiQuestionOptions.cs` (new), `Rooms/AiQuestionGateway.cs`, `Program.cs`.
- Backend tests: `AiBotReadinessTests.cs` (new), `AiQuestionGatewayTests.cs` adapted to the readiness dependency.
- Platform: `services/QuestionPreparationState.ts` and `components/QuestionPreparationNotice.jsx` (new), `services/QuestionBotService.ts`, `pages/CreateRoom.jsx`, `pages/RoomLobby.jsx`, `i18n/translations.js`, `.env.example`, and corresponding service/page tests.
- Diagnostics/docs: `scripts/ai-flow-smoke.mjs`, `scripts/diagnose-ai.ps1`, server README, `docs/FREE_DEPLOYMENT.md`, historical investigation update, and this report.

The ai-bot code changes already present from the earlier investigation are retained; this follow-up does not change Gemini, provider selection, authentication, question schemas, or QuestionBank storage.

## 4. Readiness algorithm

1. Existing production URL/key guards run first. Missing/invalid/loopback production URLs or missing internal key still fail explicitly with 503 without any outbound request.
2. Generation awaits the singleton `AiBotReadiness` task. It sends anonymous `GET health` relative to the configured bot base URL; the existing health endpoint is intentionally public.
3. Readiness requires **HTTP 200 JSON with `status:"ok"`**. A 200 HTML loading page does not qualify. The response buffer is bounded to 64 KiB and redirects are not followed.
4. Each probe has a 10-second timeout inside the total 90-second default budget. Retry delays are 2, 4, 8, then 15 seconds capped. These delays follow the previous probe; they are not fixed wall-clock arrival times.
5. On success, send the original authenticated room-generation POST exactly once. On deadline exhaustion, return 504 without sending the POST; existing frontend/game fallback handling continues.

Logs report readiness start, the first waiting reason, readiness elapsed time, deadline/permanent failure, and generation start. There is no custom log per polling second. HTTP client diagnostics may additionally log each bounded probe.

## 5. Timeout configuration

Backend option: `AiQuestions__ColdStartTimeoutSeconds=90`, bound through the existing `AiQuestions` section using ASP.NET options. Valid range is 1–300 seconds; invalid values fail startup clearly.

Platform build option: `VITE_AI_PREPARATION_TIMEOUT_SECONDS=135`, valid range 45–600 seconds. Keep it at least `ColdStartTimeoutSeconds + 40 + 5`. For example, a 120-second wake budget needs at least 165 seconds in the browser. Rebuild the platform when changing this public Vite setting. The direct PowerShell diagnostic's HTTP deadline is now 150 seconds, covering the default backend budget plus generation.

## 6–7. Failure classification

| Failure during readiness | Behavior |
|---|---|
| Connection/refused/reset, DNS/network error, truncated connection (`Unknown`, `NameResolutionError`, `ConnectionError`, `ResponseEnded`) | Retry within readiness deadline |
| Individual health probe timeout | Retry within readiness deadline |
| HTTP 408, 502, 503, 504 | Retry within readiness deadline |
| HTTP 200 without the expected health JSON | Treat as not ready; retry within deadline |
| HTTP 400, 401, 403, 404 or other unlisted status | Fail immediately; no generation POST |
| TLS or other nontransient transport/configuration error | Fail immediately with safe error category |
| Overall readiness deadline | 504; no generation POST; existing fallback path |
| Any generation POST failure, including 401/404/503 or ambiguous timeout | Existing gateway handling; **never retried by readiness logic** |

`X-Internal-Service-Key` is still added to generation POSTs. Health requests carry no secret. A normal generation 401/403 still emits the existing shared-key authentication diagnostic. Gemini 404/model errors occur after readiness and are handled by the unchanged bot provider/fallback logic, not by a cold-start loop.

## 8–9. Duplicate generation and concurrent rooms

Only safe health GETs are retried. There is no POST retry after an ambiguous timeout. Bot room-cache behavior (`replaceExisting:false`), active-generation guard (409), rate limit (429), and room-instance generation leases are unchanged.

One in-process singleton holds the current wake task under a short lock. Concurrent callers await the same pending task and then send their respective single generation requests. One cancelled waiter does not cancel others. Completed wake results are not cached forever: a later room makes a fresh health check because the bot may have slept again. No distributed locking, timer-based keep-alive, frontend polling, or external uptime service was introduced.

## 10. Responsive room creation and preparation state

Room creation and authenticated realtime admission still complete independently of AI availability. The creation page shows preparation text during its existing maximum two-second grace period and then navigates to the lobby. A small lobby status follows the **original request promise**: preparing, ready, or fallback. Turkish preparing text is “Sorular hazırlanıyor... Bu biraz zaman alabilir.” English equivalents are also provided. Game choice/launch is not gated on preparation.

Status is local to the creating browser tab, contains no question data or credentials, and follows SPA navigation. It does not introduce persistent server state or restore pending UI after a full page reload. Late completion for an older room cannot overwrite a newer room's state.

The fallback order inside a reachable bot remains Gemini → generated QuestionBank → local supplement/fallback. If the bot never wakes, its filesystem bank is also unreachable: the backend returns an availability error and the existing games continue with their authoritative defaults. This patch does not claim to read a sleeping bot's bank.

## 11. Exact Render environment variables

Backend:

```text
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
AllowedOrigins__0=<exact HTTPS platform origin>
AllowedOrigins__1=<exact HTTPS game origin; continue numbered entries as needed>
AiQuestions__BaseUrl=https://retro-platform-ai-bot.onrender.com/
AiQuestions__InternalServiceKey=<shared secret>
AiQuestions__ColdStartTimeoutSeconds=90
```

AI-bot (unchanged):

```text
NODE_ENV=production
AI_PROVIDER=gemini
GEMINI_API_KEY=<secret>
GEMINI_MODEL=<currently configured model>
INTERNAL_SERVICE_KEY=<same shared secret>
ALLOWED_ORIGINS=<exact HTTPS platform origin; comma-separated if needed>
```

Render supplies `PORT` to both services. No production localhost fallback is permitted. `GEMINI_MODEL` remains optional in source with default `gemini-3.1-flash-lite`; no model change is part of this fix. Existing optional bot settings remain `AI_REQUEST_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_ROOM_RATE_LIMIT_MS`, `AI_QUESTION_BANK_PATH`, `AI_QUESTION_BANK_MAX_ITEMS`, and `MAX_REPORT_SIZE_MB`.

Frontend build: retain actual `VITE_API_URL` and all existing game URLs; optional `VITE_AI_PREPARATION_TIMEOUT_SECONDS=135`. Neither shared secret nor Gemini key belongs in `VITE_*` settings.

## 12. QuestionBank persistence — unchanged

The JSON bank still defaults to `./data/generated-question-bank.json`, resolved from the ai-bot working directory, and remains configurable through `AI_QUESTION_BANK_PATH`. Render Free local filesystem changes are lost on restart/redeploy/spin-down, and Free web services cannot attach persistent disks. The bank therefore does **not** provide durable cross-restart storage on this Free deployment. No storage redesign is included. [Render filesystem limitations](https://render.com/docs/free).

## 13. Real delayed-process simulation

```powershell
npm --workspace ai-bot run build
dotnet build services/retrospective-server/retrospective-server.csproj -c Release
node scripts/ai-flow-smoke.mjs --cold-start --release
```

This starts the actual Release backend, leaves the actual ai-bot process stopped for 12 seconds, begins a valid host request, then starts the bot. It uses the local provider and a test key to isolate cold-start behavior from Gemini credentials. The script asserts the backend was waiting before bot startup and that exactly one generation POST reaches the bot per room. Both empty and supplied Turkish prompts are exercised. Processes are stopped after the test.

Captured result:

```text
[Smoke] Backend running; ai-bot remains stopped for 12 seconds.
[AI Gateway] ai-bot readiness check started timeoutSeconds=90
[AI Gateway] ai-bot not ready; waiting for cold start reason=temporary_network_failure
[AI Gateway] ai-bot ready after 20.6s
[AI Gateway] generation request started
[Smoke] topicProvided=false status=201 count=20
[AI Gateway] ai-bot ready after 0.0s
[Smoke] topicProvided=true status=201 count=20
[Smoke] Cold start passed in 21.0s; one POST per room.
```

This proves actual backend → readiness → gateway → authenticated bot HTTP recovery from a stopped process. It is not a new live production Gemini verification. The user already supplied the production root-cause observation; this patch still requires normal deployment to take effect.

## 14. Test/build results

| Check | Result |
|---|---|
| Backend cold-start/configuration tests | 36 passed: awake, transient HTTP/network recovery, never ready, hanging health deadline, permanent failures, loading-page rejection, eight concurrent rooms, waiter cancellation, no POST retry, fresh later health checks, prior URL/key guards |
| Full backend Release test suite | 143 passed, 1 unrelated Tank Battle spawn-gap failure in unchanged `TankBattleRoomManagerTests.WorldWidthAndSafeTeamSpawnsScaleWithPlayerCount` (8 extra players); isolated rerun reproduces it |
| Backend Release build | Passed, zero warnings/errors |
| AI-bot tests | 50 passed, including existing Gemini parsing and bank/local fallback cases |
| AI-bot strict typecheck and production build | Passed |
| Platform tests | 100 passed, including two-second lobby navigation while pending and preparation-state updates |
| Platform/all nine production builds | Passed with explicit HTTPS test URLs, not deployed configuration |
| Root lint | Existing Spin the Bottle `FullscreenButton.tsx:20` set-state-in-effect error; platform has three existing fast-refresh warnings |
| Root tests | Existing two Retro Rush `ProceduralMapGenerator.test.ts` pickup-count failures; platform and Spin tests pass before that stage |
| Real delayed-ai-bot simulation | Passed in 21.0 seconds; first readiness 20.6s, next readiness 0.0s; one POST per room |

No game, SignalR, session-security, provider-selection, prompt-schema, or storage behavior was changed. Prior investigation edits remain in the working tree alongside this follow-up.
