# Tank Battle

Room-based, team-oriented artillery game for the retrospective platform.

## Runtime model

- React owns the HUD, results, question flow, and platform navigation.
- Phaser owns input and the generated pixel-art battlefield rendering.
- `GameEventBridge` is the UI/world boundary.
- `GameTransport` selects a local practice simulation or the authoritative SignalR room state.
- Online shots send only angle and power. The server creates the authoritative active projectile, then its timed-state loop applies the crater, damage, water eliminations, result, and losing-team question state once the projectile reaches its simulated impact.

## Controls

- `A` / `D` or arrow keys: face and move left/right; the cannon fires in that facing direction.
- Mouse: set the upward or downward angle and power guide.
- Left click: fire.

The game uses generated geometric visuals, so there are no external sprite dependencies. Tank and terrain drawing is isolated in `src/game/scenes/BattleScene.ts`; future sprite assets can replace those drawing methods without changing the room contracts or domain rules. Losing players answer the retrospective question aloud and confirm completion; the server then resets every connected client into the next authoritative round.
