# Retro Rush

Retro Rush is the first playable client for a cooperative, browser-based retrospective platform game. Four runners share a continuously advancing course. When the local player leaves the course, a short retrospective prompt creates a natural reflection break before a protected checkpoint respawn. The experience is deliberately encouraging: falling is a game event, never a judgment about work.

This repository contains only the embeddable browser game. Authentication, rooms, persistence, and the production ASP.NET Core multiplayer service are intentionally out of scope.

## Technology

- React 19 and TypeScript for application UI
- Phaser 3 Arcade Physics for rendering and gameplay
- Vite for development and production builds
- Vitest and Testing Library for automated tests
- ESLint and Prettier with strict TypeScript

All artwork is generated at runtime from original geometric shapes. Optional sounds are generated through Web Audio, so there are no copyrighted asset files.

## Run locally

Requires a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

Open the URL printed by Vite. Other checks:

```bash
npm run lint
npm run test
npm run build
```

## Controls

| Action | Keyboard |
| --- | --- |
| Move | `A` / `D` or left / right arrows |
| Jump | `W`, up arrow, or space |
| Momentum boost | `1` |
| Nudge rocket | `2` |
| Pass the mic | `3` |

The HUD ability buttons are also clickable and all React dialogs are keyboard accessible.

## Gameplay

Select **Start the run** for a three-second countdown. Reach the gold Retro Deck before the three-minute timer ends while staying ahead of the red camera boundary. Checkpoints update as runners advance. Leaving the course or crossing the boundary temporarily opens a reflection prompt for the local player; the other runners and camera continue. Submit a valid response to respawn at the newest safe checkpoint with about two seconds of protection.

Three abilities are available: a three-second speed boost (15-second cooldown), a knockback-only rocket (10 seconds), and a target selector that gives an eligible mock teammate a reflection prompt indicator (30 seconds). Protected, disconnected, answering, and finished players cannot be targeted. Rockets do not cause permanent damage.

The mock room is `DX-204`. Ada, Mert, and Ece are deterministic development bots. They run, jump imperfectly, can leave the course, and automatically complete simulated prompts before respawning. Answers remain in memory and appear on the results screen.

## Architecture

The source has four main boundaries:

- `domain` and `data` contain framework-free types, state transitions, rules, questions, ability definitions, and configuration.
- `game` contains Phaser scenes, camera/ability controllers, respawn selection, map data, physics, and effects.
- `ui` contains React-owned HUD, prompts, target selection, and results.
- `networking` defines typed intent messages and confirmed server events behind `GameTransport`.

`GameEventBridge` is the only React/Phaser communication surface. React emits start, answer, target, ability, and audio intents. Phaser emits immutable HUD snapshots and UI requests. `GameCanvas` owns exactly one Phaser instance per mount and destroys it on cleanup, including React development-mode remounts.

The level is a typed JSON-like definition separated into platforms, checkpoints, pickups, spawn, and finish geometry. It can be replaced by a loader that normalizes Tiled JSON into the same domain shape.

## Transport configuration

Mock mode is the default and needs no backend:

```env
VITE_TRANSPORT_MODE=mock
```

The future adapter boundary can be selected with:

```env
VITE_TRANSPORT_MODE=signalr
VITE_HUB_URL=https://configured-by-the-host.example/game-hub
VITE_API_BASE_URL=https://configured-by-the-host.example
```

The SignalR class is intentionally a non-connecting skeleton until DTO and hub contracts are agreed. URLs are configuration only and never embedded in game logic. See [docs/dotnet-integration.md](docs/dotnet-integration.md).

## Local authority and future server authority

For the playable demo, Phaser and `MockGameTransport` simulate movement, collisions, cooldowns, targeting, elimination, respawn, and results locally. In production, the browser must send timestamped input and ability/answer intent; ASP.NET Core must validate and publish authoritative position, hit, cooldown, eligibility, elimination, respawn, answer ownership, and result events. Visual interpolation, particles, labels, generated sound, and UI focus remain client-side.

## Known limitations

- Mock bots are local development helpers, not synchronized multiplayer AI.
- The SignalR adapter has no dependency or final hub method names yet.
- Arcade physics is client-simulated and does not include prediction/reconciliation.
- The level uses generated geometry; the schema is Tiled-ready but no Tiled importer is included.
- Mobile touch movement controls and production audio assets are outside this desktop/tablet MVP.
- In-memory responses disappear on refresh.

## Next steps

Agree a versioned, transport-neutral message contract with the .NET team, then implement `SignalRGameTransport` plus snapshot interpolation and reconciliation. Start with join/snapshot/input, follow with lifecycle and ability validation, and add reconnection tests before integrating answer persistence.
