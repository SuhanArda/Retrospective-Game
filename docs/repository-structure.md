# Repository structure

This repository uses npm workspaces so independently buildable browser games can coexist with future platform applications and shared frontend packages while retaining one Git history and one root lockfile.

## Directory responsibilities

- `apps/` contains user-facing platform applications, such as the future room and game-selection frontend.
- `games/` contains independently playable game clients. New games belong at `games/<game-name>/`.
- `packages/` contains code intentionally shared by multiple frontend consumers.
- `services/` contains backend services and is outside the npm workspace set. The future ASP.NET Core API may live at `services/retro-platform-api/` and communicate with clients through versioned HTTP and SignalR contracts.
- `docs/` contains repository-wide documentation. Game-specific documentation stays with its game.

## Game convention

A future game should normally contain `package.json`, `README.md`, `src/`, `public/`, tests, and its game-specific configuration. Use lowercase kebab-case directory names and unique, descriptive npm package names. Each game must be independently buildable, expose a clean boundary for the platform host, and avoid importing source files directly from another game.

Shared code should be extracted into `packages/` only after a stable abstraction has more than one real consumer. Keeping game-specific rules local prevents premature coupling and lets games evolve independently. Consumers should depend on a shared workspace package through its public API rather than reaching into its source tree.
