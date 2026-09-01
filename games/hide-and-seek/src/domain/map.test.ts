import { describe, expect, it } from 'vitest';
import { HideSeekConfig } from './config';
import { classicMap, isWallTile } from './map';

/**
 * Invariants over the bundled `classic.json` itself, not the shadowcasting
 * math (that's `vision.test.ts`) — the kind of thing that stays true by
 * luck until someone bumps a config number and nobody notices the map
 * didn't keep up. Mirrors `HideSeekMapTests.cs` on the server side, since
 * both read the exact same physical file.
 */
describe('classicMap', () => {
  it('has enough hider spawns for the maximum room size', () => {
    // MAX_PLAYERS includes the seeker, so this many hiders each need a
    // distinct spawn tile — a shortfall means HideSeekGame cycles the spawn
    // list and stacks two hiders on the exact same tile at game start.
    expect(classicMap.hiderSpawns.length).toBeGreaterThanOrEqual(HideSeekConfig.MAX_PLAYERS - 1);
  });

  it('has no duplicate hider spawn tiles', () => {
    const keys = classicMap.hiderSpawns.map((spawn) => `${spawn.x},${spawn.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every spawn sits on a floor tile', () => {
    for (const spawn of [classicMap.seekerSpawn, ...classicMap.hiderSpawns]) {
      expect(isWallTile(classicMap, spawn.x, spawn.y), `(${spawn.x},${spawn.y})`).toBe(false);
    }
  });
});
