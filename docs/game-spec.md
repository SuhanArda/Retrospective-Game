# Implemented Game and Architecture Specification

## Product behavior

Retro Rush is a 6,800 × 720 horizontal course rendered at a responsive 16:9 viewport. One local runner and three named bots share the moving camera. A three-second countdown begins the match, followed by a three-minute run. The camera moves only right, accelerates from 45 to 118 pixels per second, and exposes a red elimination boundary 84 pixels from its left edge.

The course contains seven separated ground sections, thirteen elevated platforms, four progress checkpoints after spawn, three ability markers in map data, safe respawn coordinates, and a finish area. Map data is renderer-independent. Generated skyline, platform, runner, projectile, checkpoint, and finish visuals avoid third-party assets.

Movement uses Arcade Physics with horizontal acceleration/deceleration, a 330 px/s base maximum speed, a smaller collision body than the 44 × 52 sprite, coyote time, buffered jump input, and variable jump height. Gameplay numbers live in `gameplayConfig.ts`.

## State model

Matches explicitly use `LOADING`, `WAITING`, `COUNTDOWN`, `RUNNING`, `FINISHED`, and `ERROR`. Players use `ACTIVE`, `FALLEN`, `ANSWERING_QUESTION`, `RESPAWNING`, `INVULNERABLE`, `FINISHED`, and `DISCONNECTED`. Legal player transitions are declared in the domain layer and unit tested. The scene holds one player state value rather than overlapping state booleans.

Elimination disables only that runner. Local elimination raises a typed event containing one of 15 text, single-choice, or rating prompts. React validates and returns the response; the transport receives an answer intent; Phaser selects a checkpoint ahead of the danger edge and grants two seconds of protection. Bots simulate the same pause with deterministic timing.

## Abilities

Abilities use typed definitions and a reusable cooldown controller:

- Momentum increases the movement speed cap by 50% for three seconds and cannot stack.
- Nudge rocket travels in the facing direction, expires after 1.8 seconds, disappears on geometry/player collision, ignores its owner and protected states, and applies knockback only.
- Pass the mic opens a React target selector, checks active/non-protected eligibility, sends a transport command, shows a temporary indicator above the bot, and protects the target from repeat selection for 20 seconds.

The mock scene validates these locally. The production service must be authoritative.

## Ownership boundaries

React owns room/status chrome, launch UI, HUD, questions, target selection, results, announcements, and accessibility. Phaser owns the world, bodies, camera, bots, projectiles, generated textures, and visual effects. `GameEventBridge` carries typed events in both directions. No React component reaches into a Phaser scene.

`GameTransport` accepts join, input, ability, target, and answer intents and publishes typed server events. `MockGameTransport` makes the module backend-free. `SignalRGameTransport` deliberately supplies only the adapter boundary; final endpoints and DTOs have not been invented.

## Accessibility and presentation

All overlays use semantic dialogs, labels, fieldsets, live regions, visible focus states, high-contrast colors, and keyboard-operable buttons. Reduced-motion preferences collapse CSS animation timing. Sound is optional, generated, and mutable from the HUD. Copy treats elimination as a temporary course event and avoids competitive or work-performance judgment.

## Assumptions

- The host application can mount this React module into a responsive container; the MVP currently owns the viewport.
- The first .NET contract will distribute normalized world snapshots rather than Phaser objects.
- The host will decide named-versus-anonymous answer policy and provide its privacy copy.
- Ability pickups are represented in map data for backend progression work; MVP players start with all three abilities so each is immediately testable.
