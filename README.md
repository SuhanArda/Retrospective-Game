# Sabancı DX Retrospective Game Platform

This monorepo hosts browser games and the future applications, shared frontend packages, and backend services for a cooperative retrospective platform. The currently playable module is [Retro Rush](games/retro-rush/README.md), a React, TypeScript, Vite, and Phaser 3 platform game.

## Repository layout

- `games/` contains independently playable game clients.
- `apps/` is reserved for the main room, game-selection, and retrospective-session frontend.
- `packages/` is reserved for intentionally shared frontend code and contracts.
- `services/` is reserved for backend services, including the future ASP.NET Core API.
- `docs/` contains repository-wide documentation.

See [Repository structure](docs/repository-structure.md) for conventions and ownership boundaries.

## Work with Retro Rush

Use a current Node.js LTS release and run commands from the repository root:

```bash
npm install
npm run dev
npm run lint
npm run test
npm run build
```

The explicit workspace command is:

```bash
npm --workspace games/retro-rush run dev
```

Equivalent `build`, `test`, and `lint` commands are available through both the root scripts and the game workspace.

## Add a game later

Create it at `games/<game-name>/` with its own unique npm package name, README, source, public assets, tests, and build configuration. A game must build independently, must not import source directly from another game, and should consume deliberately extracted shared code through `packages/`. Add root convenience scripts only when they invoke real workspace scripts.
