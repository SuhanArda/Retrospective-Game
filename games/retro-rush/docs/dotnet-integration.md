# ASP.NET Core / SignalR Integration Boundary

This document proposes responsibilities and message categories, not final hub names or a .NET implementation. Agree and version the actual contract before editing `SignalRGameTransport`.

## Message categories

Client-to-server intent should include room/session identity supplied by the authenticated connection, monotonic client sequence, and client timestamp where useful:

- join/leave room intent
- current directional and jump input
- ability use intent and facing/aim information
- approved ability target selection
- retrospective answer submission or optional skip
- readiness, heartbeat, and resync request

Server-to-client events should include a server sequence/tick and authoritative time:

- join accepted/rejected and initial room snapshot
- periodic player/world snapshots and important state transitions
- countdown/match started/match ended
- checkpoint accepted, elimination confirmed, question assigned, respawn approved
- ability accepted/rejected, cooldown state, projectile spawned/hit/expired
- eligible targets and targeted-question event
- answer accepted/rejected without broadcasting private content
- participant joined/left/disconnected/reconnected
- final ordered results and aggregate counts
- recoverable and terminal errors

DTOs must be transport-neutral TypeScript/.NET records: IDs, numbers, strings, enums, arrays, and timestamps. Do not transmit Phaser bodies, scene objects, colors as engine objects, or callbacks. Version envelopes and keep optional additive fields backward compatible.

## Authoritative responsibilities

ASP.NET Core must own room membership and answer ownership; validate input rate and ordering; simulate or validate positions; determine collisions, rocket hits, elimination, checkpoints, safe respawns, invulnerability, target eligibility, cooldowns, finish order, and results; and persist responses according to the platform privacy model. Clients never declare these outcomes.

The client may own rendering interpolation, predicted movement pending correction, camera presentation, particles, labels, local generated audio, button focus, validation hints, and reduced-motion presentation. These effects must not change game truth.

## Suggested connection lifecycle

1. The host obtains authentication/session context and room code outside this module.
2. Create the configured SignalR transport and subscribe before connecting.
3. Connect using the configured hub URL and supported credentials policy.
4. Send a join request with room code, display name, client version, and supported protocol version.
5. On acceptance, hydrate from the complete server snapshot and synchronize server time.
6. Send sequenced input at an agreed rate; render snapshots using a short interpolation buffer.
7. Send discrete ability, target, and answer intents once and correlate acknowledgements with command IDs.
8. Leave explicitly on a normal exit; tolerate abrupt disconnects server-side.

Do not put access tokens in URLs. Decide with the platform team whether the embedded game receives a short-lived token, same-origin cookie, or host-mediated connection factory.

## Reconnection

On transient loss, show `reconnecting`, stop sending input, and avoid predicting new authoritative events. Use SignalR automatic reconnection with capped backoff. After reconnecting, present the prior participant/session token and last received server sequence. The server should either return a full resync snapshot or explicitly reject the old session. Replace local state atomically, then resume input sequencing. If the player was answering, restore only the assigned question metadata; never infer whether an unacknowledged answer was stored—retry using an idempotency/command ID.

## Suggested room join payload boundary

A join request will likely need room code, display name or platform participant ID, client/protocol version, locale, and reconnect token when applicable. A response should provide participant ID, room/match state, server clock reference, level ID/version, normalized players, authoritative cooldowns, assigned question if any, and reconnect token. Authentication claims and answer ownership should come from server connection context rather than trusted payload fields.

## Contract mapping

Keep current TypeScript command names as client-domain concepts. Map them inside `SignalRGameTransport` to the finalized generated or hand-maintained wire DTOs. Validate inbound unknown data at the adapter edge before emitting domain events. Map wire enums deliberately and treat unknown values as protocol errors. The rest of the game must remain unaware of SignalR.

## Integration sequence

Implement and test in vertical slices: connection/join/full snapshot; input and snapshot interpolation; match lifecycle and reconnection; elimination/question/respawn; ability validation and projectiles; answer acknowledgement and privacy-safe persistence; final results. Add contract fixtures shared with .NET tests and exercise late, duplicate, out-of-order, and rejected messages.
