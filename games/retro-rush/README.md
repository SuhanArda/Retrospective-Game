# Retro Rush

Retro Rush is a cooperative browser platform game and the first playable module in the larger retrospective platform. Four runners share an advancing course; leaving the course opens a short, supportive retrospective prompt before the round restarts.

## Technology

React 19 and strict TypeScript own the application UI, Phaser 3 Arcade Physics owns simulation and rendering, Vite builds the client, and Vitest plus Testing Library cover behavior. Artwork is generated from original geometric shapes and optional sounds use Web Audio.

## Run from the workspace root

Use a current Node.js LTS release and npm:

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

The explicit development command is `npm --workspace games/retro-rush run dev`; replace `dev` with `build`, `test`, or `lint` for the other workspace commands.

## Controls

| Action | Keyboard |
| --- | --- |
| Move | `A` / `D` or left / right arrows |
| Jump | `W`, up arrow, or space |
| Shove nearby player | Left mouse button |
| Momentum boost | `1` |
| Nudge rocket | `2` |
| Pass the mic | `3` |

HUD ability buttons are clickable and React dialogs are keyboard accessible.

## Gameplay

Select **Start the run** for a three-second countdown. Keep moving through the endless generated trail while staying ahead of the camera boundary. An eliminated player discusses the displayed retro question verbally, then confirms it to reset every runner onto a newly seeded trail and start a fresh countdown.

The three abilities are a speed boost, a knockback-only homing rocket, and a target selector that gives an eligible mock teammate a prompt indicator. The mock room is `DX-204`; Ada, Mert, and Ece are deterministic development bots, and in-memory answers appear on the results screen.

Protected, disconnected, answering, and finished players cannot be targeted, and rockets never cause permanent damage. Nearby active runners collide physically and can be shoved away from the local player with a short cooldown and movement lock. Bots run and jump imperfectly and participate in both interactions.

## Architecture and integration

- `domain` and `data` contain framework-independent types, rules, questions, abilities, and typed configuration.
- `game` contains Phaser scenes, controllers, map data, physics, and effects.
- `ui` contains the React HUD, prompts, target selection, and results.
- `networking` defines typed intents and confirmed events behind `GameTransport`.

`GameEventBridge` is the only React/Phaser communication surface. The default `MockGameTransport` simulates authority locally. The SignalR adapter remains a non-connecting skeleton until contracts are agreed; `GameTransport` is the boundary through which the future ASP.NET Core service will own authoritative state. See [ASP.NET Core integration](docs/dotnet-integration.md).

`ProceduralMapGenerator` sequences a library of 12 deterministic, handcrafted chunks from a single round seed. Each template owns fixed platform topology, explicit main and optional routes, and platform-indexed pickup and decoration slots. Platforms use three 56-pixel vertical lanes; seeded variation is limited to small width, shrub-anchor, pickup-presence, ability, and decoration-variant choices. A validator checks template anchors and route reachability against the unchanged movement configuration before generation. The scene keeps chunks ahead of the camera and destroys chunk physics, terrain visuals, anchored props, and pickups behind it.

The default sequence begins with the wide start platform and `safe-flat`, then guarantees an early lane change and a gap/vertical section. Terrain-family history limits flat and other same-family streaks to two chunks, prevents consecutive recovery chunks, penalizes repeated terrain tags, and favors a lane-changing template after a prolonged lane run. Recovery is strongly weighted only after gap, vertical, directional, or technical sections; the following chunk is biased back toward varied terrain. Template IDs from the three-chunk recent history remain excluded. Set `proceduralMap.debugChunks` to `true` during development to show chunk boundaries, IDs, entry/exit anchors, platform indices, and route classifications. Debug rendering is development-only and disabled by default.

Mock mode creates one local map seed per round, shared by every runner in that scene. In production multiplayer, the ASP.NET Core + SignalR authority must distribute one authoritative round seed (or authoritative chunk sequence) to every room client. The **Back to Games** button uses the configured platform URL and current room launch context to return to `/room/{roomCode}/games`; it does not clear platform session storage.

Transport mode and endpoints are provided through `VITE_TRANSPORT_MODE`, `VITE_HUB_URL`, and `VITE_API_BASE_URL`; URLs are never embedded in game logic.

## Known limitations

Mock bots are local helpers, and Arcade physics does not yet implement network prediction or reconciliation. Mobile movement controls and production audio assets are outside the current MVP.

## Next integration step

Agree a versioned, transport-neutral message contract with the .NET team, then implement the SignalR transport, snapshot interpolation, and reconciliation. Start with join, snapshot, and input flows; follow with lifecycle and ability validation; then add reconnection coverage before integrating answer persistence.
