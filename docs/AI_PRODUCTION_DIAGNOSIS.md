# Production AI investigation — 2026-09-07

**Follow-up:** The user subsequently confirmed Render Free cold start: manually waking the bot makes generation work. The [cold-start fix report](AI_COLD_START.md) supersedes this report's unresolved incident status and timeout values. The evidence below records the earlier investigation; its configuration/security/diagnostic fixes remain in place.

The live incident is **not yet conclusively diagnosed**. A production-capable defect is confirmed in the original backend: an absent `AiQuestions__BaseUrl` selects `http://localhost:3002/` even outside Development. That sends traffic to the backend container, not the separate Render bot. The patch removes that fallback outside Development. This is a verified code defect, **not proof that the deployed backend currently has that configuration**.

The user supplied only the bot URL. The production platform URL, backend URL, backend configuration/logs, deployed revision, and shared service key were unavailable. No production configuration was changed or deployment performed. The repository's local `ai-bot/.env` has empty Gemini and internal-service keys; it is not evidence of Render's settings.

## 1. Exact request chain

| Stage | Current file and method | Route / payload / conditions |
|---|---|---|
| Form | `apps/retro-platform-web/src/pages/CreateRoom.jsx`, `handleSubmit` | Controlled `contextPrompt` textarea. Room name/capacity and a signed-in user are required; topic is optional. |
| Room creation | `apps/retro-platform-web/src/services/SignalRRoomService.ts`, `createRoom`, `admit`, `connect` | `POST {VITE_API_URL}/api/rooms` with `{displayName,color,avatarId,roomName,maxParticipants,questionTimeSeconds,votingTimeSeconds}`. Then save returned session and await authenticated SignalR connection to `/hubs/room`. |
| Room authority | `services/retrospective-server/Program.cs`, POST handler; `Rooms/RoomManager.cs`, `Create` | Adds the room to the in-memory dictionary and assigns host before returning 201 admission containing `room`, `player`, `reconnectToken`, `roomCode`, `playerId`. |
| AI trigger | `CreateRoom.handleSubmit` | Unconditionally calls `prepareRoomQuestions` after successful room creation/admission. Passes `room.code`, host `player.id`/token, style, `contextPrompt.trim() || undefined`, optional file. Waits at most 2 seconds before navigating to the lobby; this does not cancel generation. |
| Browser AI POST | `apps/retro-platform-web/src/services/QuestionBotService.ts`, `prepareRoomQuestions` | `POST {VITE_API_URL}/api/rooms/{encodedCode}/ai/questions`; `X-Player-Id`, `X-Reconnect-Token`; JSON below. A file becomes `{name,mimeType,dataBase64}`. 45-second timeout; keepalive when no file. |
| Backend AI endpoint | `services/retrospective-server/Program.cs`, POST handler, `AuthorizeAiRequest` | Binds `Contracts/RoomContracts.cs::GenerateRoomQuestionsRequest`; requires host credentials. Unknown room 404, invalid credentials 401, non-host 403. `RoomManager.AuthorizeAiAccess` does not require an active game/session. |
| Source retention | `RoomManager.RememberOrRestoreAiQuestionSource` | Trims supplied source and retains it in room memory. Restores prior source only if the new request has no source. A newly created empty-topic room is still forwarded. |
| Gateway | `Rooms/AiQuestionGateway.cs`, `Generate`, `Forward` | `POST {AiQuestions:BaseUrl}/rooms/{normalizedCode}/questions`; adds actual backend room ID as `roomInstanceId`; uses `X-Internal-Service-Key`. Empty topic becomes `genel retrospektif`. 40-second HTTP timeout. Generation continues after browser disconnect via `CancellationToken.None`. |
| Bot HTTP | `ai-bot/src/server.ts`, `createServer` handler | Matches `^/rooms/([A-Z0-9]{6})/questions$`; verifies shared key using constant-time comparison; resolves uploaded report in memory; validates request and room envelope. Existing set + `replaceExisting:false` returns cache 200. Concurrent generation 409; same-room rate limit 429. |
| Providers | `services/roomQuestionProvider.ts::prepareQuestionsForRoom` → `resilientQuestionProvider.ts::PersistingQuestionGenerator.generate` → `questionProvider.ts::GeminiQuestionGenerator.generate` | Room lease protects close/replacement races. Selected provider comes from `loadConfig`. Bank is accessed after primary generation, not before Gemini. |
| Gemini | `services/questionGenerator.ts::generateQuestions` | Official `@google/genai` SDK's `sdk.models.generateContent({model,contents,config})`; system instruction, JSON response schema, temperature 0.55, abort signal, bounded retries. |
| Validation/persistence | `questionGenerator.ts::parseQuestions`, `validateAnswersAgainstSource`; `questionBank.ts::saveGeneratedQuestions` | Validated Gemini output is saved to the JSON bank, then committed to the room store. Failed primary generation uses bank → local supplement/fallback, except cancellation or a failed replacement of an existing set. |
| Return | Bot → gateway → platform | Fresh room set 201, cached set 200. Platform calls `parseRoomQuestionSet`. Gateway retains valid Gemini sets for backend game use and broadcasts waiting Imposter refresh where applicable. The existing backend intentionally does not retain `provider:"demo"` sets in `RoomManager.AiQuestionSet`; fallback HTTP responses remain intact. |

Actual platform AI payload for the supplied example:

```json
{"topic":"Sprint iletişimi ve geliştirme alanları","reportText":null,"reportFile":null,"language":"tr","style":"dengeli","count":20,"replaceExisting":false}
```

For an empty/whitespace prompt, only `topic` changes to `null`; the gateway forwards `topic:"genel retrospektif"`. The gateway adds `roomInstanceId` to the above payload. No `gameId` is needed. Bot direct generation uses `POST /questions/generate`, accepts this same source/style/count payload without a room envelope, and returns a generation response rather than a room set.

## 2–12. Production evidence and limits

| Required finding | Result |
|---|---|
| 2. Does frontend trigger generation? | Yes in current source; automated tests cover empty, whitespace, and supplied Turkish prompts. Actual deployed browser request remains unobserved. |
| 3. Does backend endpoint receive it? | Confirmed locally over real HTTP. Production unknown without backend URL/logs. |
| 4. Is gateway invoked? | Confirmed locally, including host authorization. Production unknown. |
| 5. Actual production BaseUrl behavior | Original code uses localhost for missing configuration in every environment. Actual Render variable not available. Updated code behavior is specified below. |
| 6. Does backend reach bot? | Local configured backend → bot succeeds. Direct production bot requests succeed at the HTTP layer. Production backend → bot is unverified. |
| 7. Does internal authentication succeed? | Local shared-key request succeeds. Live request **without** a key returns 401; matching production keys remain unverified. |
| 8. Is live provider Gemini or local? | Live `/health` returned HTTP 200 with `provider:"gemini"`, `activeRoomCount:1`, before edits/deployment. This rules out I at that observation time. A room count does not prove that its source was Gemini. Updated public health intentionally returns only `{status:"ok"}`; provider remains in startup/request logs. |
| 9. Is Gemini invoked? | Not proven for the reported production room. No authenticated production generation could be sent. |
| 10. Gemini API status/model | Unknown in production. Package range is `@google/genai:^2.15.0`; locally resolved SDK is 2.17.1. Code default model is `gemini-3.1-flash-lite`, overridden by `GEMINI_MODEL`. Render's actual model/key permissions were unavailable; no model was changed or claimed to be validated. |
| 11. Parsing/validation | Unit tests pass with controlled Gemini responses, including rejection cases. Production result unknown. |
| 12. QuestionBank fallback | Existing order preserved and tested: primary → bank → local supplementation/fallback. Production source unknown. Local HTTP smoke deliberately uses local provider, returning `provider:"demo"`. |

Live checks:

```text
GET https://retro-platform-ai-bot.onrender.com/health
HTTP 200 {"status":"ok","provider":"gemini","activeRoomCount":1}

2026-09-07T07:57:44.825Z
POST https://retro-platform-ai-bot.onrender.com/rooms/ABC234/questions
Content-Type: application/json
Body: {}
Internal service key: deliberately omitted
HTTP 401
```

The 401 confirms reachability and rejection of absent credentials. Authentication precedes route dispatch, so 401 alone does not prove the generation handler ran. If the deployed source matches this checkout, this recognized POST produces both arrival and authentication-failure logs. No secret guessing or bypass was attempted.

Vite's current `publicValue` requires explicit absolute HTTPS `VITE_API_URL` and all game URLs during production build. `roomServiceInstance.ts` only selects mock rooms when `VITE_ROOM_SERVICE=mock`; missing API URL does not implicitly select mock rooms. The older `docs/deployment.md` describes a legacy backend and its fallback description is not applicable. CSP is generated from the API's HTTPS and WSS origins. Our build used `https://api.example.invalid` and explicit game test URLs; its generated CSP contains that HTTPS/WSS origin. This verifies build-time handling, not the deployed bundle's actual URL. Preparation now strips trailing API slashes, matching the room client's behavior.

Preparation is not invoked when form validation fails, the user is absent, room creation fails, or awaited SignalR admission fails. File reading can fail before fetch. These are separate from an optional prompt being empty. The new admission/preparation diagnostics distinguish these boundaries without logging errors containing credentials.

## 13. Root causes and A–M diagnostic matrix

**Confirmed source defects:**

1. `Program.cs` previously selected localhost for a missing production `AiQuestions:BaseUrl`. The initialization log was inside lazy HttpClient configuration, so it was not a reliable startup log. A malformed URL could throw during dependency resolution before entering the AI handler. A base URL with a path prefix but no trailing slash could also resolve the outbound path incorrectly.
2. `CreateRoom.jsx` caught preparation failures and logged them only under `import.meta.env.DEV`; production users received no corresponding diagnostic. Failure during awaited room/SignalR admission occurred even earlier.
3. `server.ts` only logged arrivals for recognized generation POSTs. Wrong routes/methods could reach the bot, return 401/404, and produce no custom arrival log.

The first defect explains the reported symptom **if** production is missing the backend URL. It has not been established as the live incident's first broken link. The existing free-deployment guide explicitly omits AI deployment/configuration in its initial phase, making that configuration worth checking first; the guide is not evidence of the user's actual Render settings.

| Class | Evidence / current classification |
|---|---|
| A. Frontend never invokes preparation | No optional-topic skip in source. Possible for failed admission or a different deployed revision; live unknown. |
| B. Wrong backend URL | Current production build requires HTTPS configuration. Actual deployed bundle URL unknown. |
| C. Backend endpoint not hit | Live unknown; local endpoint verified. |
| D. Backend skips gateway | Source only stops before gateway on auth/room failures; no topic/game skip. Live unknown. |
| E. Backend BaseUrl missing/wrong | **Confirmed defect under missing/invalid configuration; reproduced locally.** Actual Render setting unknown. |
| F. Backend calls localhost | **Confirmed original behavior when E is missing or explicitly loopback.** Patched and regression-tested; actual production invocation unknown. |
| G. Internal authentication fails | Live missing-key probe correctly returns 401. This does not classify the normal backend request as G; key match unknown. |
| H. Route mismatch | Current source routes match. Old logging blind spot fixed. Deployed revision/path prefix unknown. |
| I. Local provider | Ruled out at the live health observation: provider was Gemini. |
| J. Gemini API/model error | Not established; no authenticated production request/result available. |
| K. Parsing/validation failure | Not established in production; validator tests pass. |
| L. Bank failure | Not established in production. Lazy initialization and storage-failure tests show it does not prevent primary generation. |
| M. Gemini succeeds | Not established in production. Health or HTTP 200/201 alone is not enough because fallback/cache can succeed. |

**Production classification remains unresolved; E/F are the concrete source-level findings, not an asserted production verdict.** To finish: obtain the backend/platform URLs, backend startup/request logs, matching-time ai-bot logs, and a safely available shared key or run the commands below locally. No authenticated backend → bot → Gemini → validated-20 trace was obtained in this session.

Additional findings left unchanged because they do not explain absent bot arrivals:

- UI permits a 1000-character prompt; bot input validation permits 500. Long prompts can receive 400 after arriving at the bot. The user's example is below both limits.
- Bot timeout is per attempt (default 30 seconds, up to 3 attempts), but backend timeout is 40 seconds and browser timeout is 45 seconds. Slow retries can outlive the gateway. No evidence established this for the incident.
- Validation requires exactly 20 unique question texts and answers, 10 work/non-fun and 10 entertainment/fun, categories `reflection|teamwork|improvement|fun`, 10–180-character questions ending in `?`, a 1–3-word answer of at most 48 characters, safe text/answer patterns, and valid four-option/index combinations when options exist. It rejects unrelated generic secret words against source. Language is supplied to the prompt; there is no independent language classifier, option-uniqueness check, or complete safety guarantee. Requirements were not weakened.
- QuestionBank does lazy loading, warns and continues on load/write errors, and preserves corrupt files when possible. Logging raw JSON parse errors could reveal stored excerpts; the patch emits error codes instead. Remaining silent catches only handle stale lease cleanup, missing temporary files, or promise-queue recovery; primary failures now have safe diagnostics before fallback.

## 14–15. Files changed and minimal fix

| Files | Change |
|---|---|
| `services/retrospective-server/Rooms/AiQuestionConfiguration.cs` (new), `Program.cs`, `Rooms/AiQuestionGateway.cs` | Resolve URL at startup; no production localhost default; reject invalid/credential-bearing/query/fragment URLs and loopback; preserve path prefixes; missing production key/URL returns 503 before outbound HTTP; safe startup, request/auth/binding, gateway and cache diagnostics. |
| `apps/retro-platform-web/src/pages/CreateRoom.jsx`, `src/services/QuestionBotService.ts` | Production-safe preparation and status logs, visible admission failure, no raw exception/secret logging; normalize trailing API slash. |
| `ai-bot/src/server.ts`, `src/services/questionGenerator.ts`, `src/services/questionBank.ts`, `src/services/resilientQuestionProvider.ts` | Log every non-health/non-preflight arrival using safe route templates, authentication and HTTP status; warn on local/legacy provider; validation counts and primary-failure reason; sanitized storage diagnostics; minimal public health. |
| `services/retrospective-server.Tests/AiQuestionGatewayTests.cs` (new), `ai-bot/src/server.test.ts` (new), `ai-bot/src/services/resilientQuestionProvider.test.ts`, both platform `CreateRoom.test.jsx` / `QuestionBotService.test.ts` | Regression tests for configuration, payloads, auth, route logging and secret redaction. |
| `scripts/diagnose-ai.ps1`, `scripts/ai-flow-smoke.mjs` (new) | Direct production commands and reproducible local HTTP integration. |
| `services/retrospective-server/README.md`, `docs/FREE_DEPLOYMENT.md`, this report | Correct production configuration and evidence/runbook. |

Minimal deployment fix **if E/F is confirmed**: set `AiQuestions__BaseUrl=https://retro-platform-ai-bot.onrender.com/` on the backend and `AiQuestions__InternalServiceKey` to exactly the bot's `INTERNAL_SERVICE_KEY`, then redeploy/restart the backend. Do not put either key in the frontend. The local patch makes missing configuration explicit while preserving room creation, security, SignalR, contracts, Gemini selection, bank/local fallback, and game behavior.

| Backend URL input | Original behavior | Patched behavior |
|---|---|---|
| Missing/blank | Localhost in every environment | Development localhost; otherwise logged `base_url_missing`, AI HTTP 503, no outbound request |
| Localhost/loopback | Attempt backend container's loopback | Allowed only in Development; otherwise `base_url_loopback`, 503 |
| Malformed/non-HTTP URL | May fail lazy client construction or send | `base_url_invalid`, 503; room API remains available |
| Valid deployed URL | Forward | Forward with same internal header |
| Missing trailing slash | Root usually works; path prefix can be dropped | Normalize trailing slash and preserve prefix |

## 16. Backend Render settings

```text
ASPNETCORE_ENVIRONMENT=Production
ASPNETCORE_FORWARDEDHEADERS_ENABLED=true
AllowedOrigins__0=<exact HTTPS platform origin>
AllowedOrigins__1=<exact HTTPS game origin; continue numbered entries for deployed games>
AiQuestions__BaseUrl=https://retro-platform-ai-bot.onrender.com/
AiQuestions__InternalServiceKey=<same secret as bot INTERNAL_SERVICE_KEY>
```

These are actual ASP.NET configuration names. Use the repository-root Docker build context and `services/retrospective-server/Dockerfile`; it publishes with .NET 10 and runs `dotnet retrospective-server.dll`. Render supplies `PORT`; the code binds `0.0.0.0:$PORT`. Health is `/health`. Only one instance fits the existing in-memory room architecture.

## 17. AI-bot Render settings

```text
NODE_ENV=production
AI_PROVIDER=gemini
GEMINI_API_KEY=<secret>
GEMINI_MODEL=<actual model supported for that production key>
INTERNAL_SERVICE_KEY=<same secret as backend AiQuestions__InternalServiceKey>
ALLOWED_ORIGINS=<exact HTTPS platform origin; comma-separated if multiple>
```

`GEMINI_MODEL` is optional in code with default `gemini-3.1-flash-lite`; that string has not been tested against the production key. `AI_PROVIDER` takes precedence over legacy `QUESTION_PROVIDER`; `demo` maps to `local`. Missing/barely-whitespace provider defaults to local, with a new production warning. Production missing Gemini key (when Gemini selected), missing internal key, or wildcard/missing origins prevents startup with an explicit error. The shared header is exactly `X-Internal-Service-Key` (Node reads its lowercase equivalent).

Optional actual settings: `AI_REQUEST_TIMEOUT_MS=30000`, `AI_MAX_RETRIES=2`, `AI_ROOM_RATE_LIMIT_MS=5000`, `MAX_REPORT_SIZE_MB=5`, `AI_QUESTION_BANK_MAX_ITEMS=1000`, `AI_QUESTION_BANK_PATH=./data/generated-question-bank.json`. Paths resolve relative to the process working directory. Render supplies `PORT`; code's standalone default is 3001 while the local `.env` uses 3002.

Repository root build: `npm ci --include=dev && npm run build:ai-bot`. Start: `npm --workspace ai-bot start`. Package engine is Node >=22.13.0; this session used Node 24.19.0. Health: `/health`. Provider objects are initialized before `server.listen`; bank file loading is lazy, so a bank read error does not block server startup/Gemini.

For durable bank storage, set `AI_QUESTION_BANK_PATH` under an actually mounted persistent disk, e.g. `/var/data/generated-question-bank.json` with mount `/var/data`. Render filesystems are otherwise ephemeral; only paths under the disk mount persist. [Render persistent disk documentation](https://render.com/docs/disks).

Render Free services can spin down after 15 idle minutes and take about a minute to restart, exceeding the gateway's 40-second timeout. Free services cannot attach persistent disks. These are possible operational contributors, not observed causes of this incident. [Render Free service documentation](https://render.com/docs/free).

## 18. Direct production ai-bot PowerShell test

Run from the repository root after setting the shared secret privately in `$env:INTERNAL_SERVICE_KEY`:

```powershell
.\scripts\diagnose-ai.ps1 -Target Bot -AiBotUrl 'https://retro-platform-ai-bot.onrender.com'
```

The script performs `/health`, then **POST `/questions/generate`** with the exact JSON above and `$headers = @{ 'X-Internal-Service-Key' = $env:INTERNAL_SERVICE_KEY }`. It bypasses frontend/backend and prints only status/provider/count. It fails if provider is not `gemini` or count is not 20, so a successful fallback is not mistaken for Gemini. It never prints secret values, generated question content, or error response bodies. The script uses UTF-8 request bytes for Turkish and rejects redirects. An authenticated generation can incur one normal model request and add generated questions to the bank.

## 19. Production backend integration command

Use an existing room's host credentials, privately supplied through `$env:RETRO_PLAYER_ID` and `$env:RETRO_RECONNECT_TOKEN`:

```powershell
.\scripts\diagnose-ai.ps1 -Target Backend -BackendUrl $env:RETRO_BACKEND_URL -RoomCode $env:RETRO_ROOM_CODE
```

`RETRO_*` here are **diagnostic-script inputs**, not new application/Render configuration variables. The backend/platform URLs were not supplied, so no deployed backend URL is invented. This sends POST `/api/rooms/{code}/ai/questions` with the existing host headers and same JSON. No authentication bypass or room mutation beyond the normal question-preparation request is introduced. `replaceExisting:false` preserves existing sets: use a newly created room without a set to observe fresh generation, or distinguish cache in bot logs. HTTP 200 from cache is not evidence of a new Gemini invocation.

Local reproducible check (real HTTP/backend/bot, explicitly **local provider**, no Gemini claim):

```powershell
npm --workspace ai-bot run build
dotnet build services/retrospective-server/retrospective-server.csproj
node scripts/ai-flow-smoke.mjs
```

It starts isolated processes with a test key, creates separate rooms for empty and Turkish prompts, verifies 201/20-question responses, missing-host-credentials 401 and malformed-body 400, and verifies an unconfigured Production backend still creates rooms but returns AI 503 with no outbound attempt. Processes are terminated after the check.

## 20. Expected successful production log chain

Illustrative only — **not captured from a real production Gemini generation**:

```text
[Platform AI] question preparation requested roomCode=ABC234 topicProvided=true
[Platform AI] requesting room questions roomCode=ABC234
[AI API] HTTP request received route=/api/rooms/:code/ai/questions
[AI API] request received roomCode=ABC234 topicProvided=True
[AI API] invoking AiQuestionGateway roomCode=ABC234
[AI Gateway] generation requested
[AI Gateway] calling ai-bot operation=generation baseUrl=https://retro-platform-ai-bot.onrender.com
[AI Request] received method=POST route=/rooms/:code/questions
[AI Request] authenticated=true route=/rooms/:code/questions provider=gemini
[AI] Gemini generation started model=<configured model>
[AI] Gemini request sent attempt=1
[AI] Gemini response received attempt=1 textPresent=true receivedCount=20
[AI] validation accepted receivedCount=20 validCount=20 rejectedCount=0
[AI] Gemini generation succeeded count=20
[QuestionBank] stored 20 new questions
[AI Request] completed source=gemini count=20
[AI Request] response method=POST route=/rooms/:code/questions status=201
[AI Gateway] ai-bot response operation=generation status=201
[AI API] question generation ready roomCode=ABC234 count=20
[AI API] HTTP response status=201
[Platform AI] response roomCode=ABC234 status=201
```

Storage count can be less than 20 when deduplicating. `source=question-bank`, `source=question-bank+local-fallback`, `source=local-fallback`, and `source=room-cache` identify alternatives without changing the question response contract. Provider completion logs occur before room commit; the subsequent HTTP status distinguishes stale-lease/cancellation errors from delivered success.

## 21. Verification results

| Check | Result |
|---|---|
| AI-bot tests | 50 passed, including real HTTP auth/unmatched-route/redaction test and existing Gemini parser/bank/fallback tests |
| AI-bot strict typecheck | Passed |
| AI-bot production build | Passed |
| `dotnet build services/retrospective-server/retrospective-server.csproj` | Passed, zero warnings/errors |
| Backend tests | 121 passed, including new gateway configuration/payload tests |
| Platform tests | 97 passed |
| Platform production build | Passed with explicit HTTPS test `VITE_*` values; deployed bundle not inspected |
| Root `npm run build` | Passed across all nine frontend/game builds |
| Root `npm run test` | Stops on two existing failures in `games/retro-rush/src/game/systems/ProceduralMapGenerator.test.ts` (lines 224 and 251: zero pickups where >20 expected); platform and Spin tests passed before that stage |
| Root `npm run lint` | Stops on existing `games/spin-the-bottle/app/FullscreenButton.tsx:20` set-state-in-effect error; platform has three existing fast-refresh warnings |
| Local HTTP flow | Passed: separate empty/topic rooms → backend → gateway → authenticated ai-bot → local 20-question sets; missing production BaseUrl explicitly 503, no outbound call |
| Production health / no-key auth | HTTP 200, provider Gemini at observation; diagnostic no-key POST HTTP 401 |
| Required real production Gemini flow | **Not completed: backend URL/logs and usable credentials unavailable** |

Initial Node tests were blocked by sandbox `spawn EPERM`; they were rerun successfully with the necessary execution permission. The backend test's generated unrelated vision fixture was restored to its original contents. Existing unrelated game failures were not modified.
