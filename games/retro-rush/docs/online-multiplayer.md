# Retro Rush online multiplayer

Retro Rush uses the existing `RoomHub`, authenticated `RoomRealtimeClient`, room reconnect token, and active `GameSession`. There is no second room or identity model. The room's stable `PlayerId` keys the Phaser entity map; room join order supplies spawn slot and skin index.

The backend keeps an in-memory Retro Rush state beneath `GameSession`. It owns the numeric round ID, map seed, shared phase, latest player snapshots, collected pickup IDs, active rockets, question owner, and interaction cooldowns. Mutations run under the existing room lock. A full snapshot is returned after attach/reconnect; delta events carry normal gameplay traffic.

Local Phaser physics remains responsive and authoritative for that client's movement. It sends semantic position/velocity/state snapshots at 20 Hz. Remote entities have non-simulated bodies and render from a 100 ms interpolation buffer; they are deliberately excluded from local player-body collision resolution so two competing physics simulations cannot inject impulses or non-finite values. Cross-player effects use server-validated shove and rocket events instead. Standalone mode retains the original dynamic player collision and bot simulation.

The procedural generator is unchanged. Online rounds construct it with the server map seed; standalone rounds retain the local seeded sequence. Chunk selection, platform variations, pickups, and decorations all consume `SeededRandom`, not frame-timed randomness.

Normal shove direction is calculated by the server from the latest attacker/target positions and pushes away from the attacker. Rocket identity and target are server-selected; only the owner requests a likely hit, and the authoritative hit event always contains the existing fixed LEFT knockback.

Online rooms do not create local bots. Bots remain available in standalone mode. Development builds expose `window.__RETRO_RUSH_DEBUG__` for the two-browser smoke test; production builds do not install it, and it never exposes reconnect credentials.

Current validation boundary: pickup collection validates current session/round/player state, an authored deterministic pickup-ID shape, supported ability, and first collection. The server does not duplicate the TypeScript infinite-map generator to independently reconstruct every future pickup coordinate. Rocket hits validate the stable active rocket, owner, target, round, and idempotency, but the first version does not simulate the homing trajectory on the server.
