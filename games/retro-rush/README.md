# Retro Rush

Retro Rush is a cooperative browser platform game and the first playable module in the larger retrospective platform. Four runners share an advancing course; leaving the course opens a short, supportive retrospective prompt before a protected checkpoint respawn.

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
| Momentum boost | `1` |
| Nudge rocket | `2` |
| Pass the mic | `3` |

HUD ability buttons are clickable and React dialogs are keyboard accessible.

## Gameplay

Select **Start the run** for a three-second countdown. Reach the gold Retro Deck before the timer ends while staying ahead of the camera boundary. Checkpoints update as runners advance. A valid reflection response respawns the player at the newest safe checkpoint with temporary protection.

The three abilities are a speed boost, a knockback-only homing rocket, and a target selector that gives an eligible mock teammate a prompt indicator. The mock room is `DX-204`; Ada, Mert, and Ece are deterministic development bots, and in-memory answers appear on the results screen.

Protected, disconnected, answering, and finished players cannot be targeted, and rockets never cause permanent damage. Bots run and jump imperfectly, can leave the course, and automatically complete simulated prompts before respawning.

## Architecture and integration

- `domain` and `data` contain framework-independent types, rules, questions, abilities, and typed configuration.
- `game` contains Phaser scenes, controllers, map data, physics, and effects.
- `ui` contains the React HUD, prompts, target selection, and results.
- `networking` defines typed intents and confirmed events behind `GameTransport`.

`GameEventBridge` is the only React/Phaser communication surface. The default `MockGameTransport` simulates authority locally. The SignalR adapter remains a non-connecting skeleton until contracts are agreed; `GameTransport` is the boundary through which the future ASP.NET Core service will own authoritative state. See [ASP.NET Core integration](docs/dotnet-integration.md).

The level is a typed JSON-like definition with separate platform, checkpoint, pickup, spawn, and finish geometry. A future loader can normalize Tiled JSON into that same domain shape.

Transport mode and endpoints are provided through `VITE_TRANSPORT_MODE`, `VITE_HUB_URL`, and `VITE_API_BASE_URL`; URLs are never embedded in game logic.

## Known limitations

Mock bots are local helpers, answers disappear on refresh, and Arcade physics does not yet implement network prediction or reconciliation. Mobile movement controls and production audio assets are outside the current MVP.

## Next integration step

Agree a versioned, transport-neutral message contract with the .NET team, then implement the SignalR transport, snapshot interpolation, and reconciliation. Start with join, snapshot, and input flows; follow with lifecycle and ability validation; then add reconnection coverage before integrating answer persistence.
