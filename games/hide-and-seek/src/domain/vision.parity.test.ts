import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTileGrid, type HideSeekTileGrid } from './map';
import { computeVisibleTiles, isPlayerVisible } from './vision';

/**
 * Reads the exact same physical fixture file
 * `services/retrospective-server.Tests/HideSeek/HideSeekVisionFixtureGeneratorTests.cs`
 * regenerates on every `dotnet test` run — hundreds of scenarios computed by
 * the authoritative C# `HideSeekVision` against the real `classic.json` map,
 * with a fixed seed so the file is reproducible rather than flaky. This test
 * recomputes every one of them with this file's `computeVisibleTiles` /
 * `isPlayerVisible` and asserts an exact match. If this test and the C# one
 * disagree, the two languages' shadowcasting have drifted apart — that's
 * the one thing this whole game cannot tolerate (see the vision.ts header).
 */

interface TileVisibilityCase {
  originX: number;
  originY: number;
  radius: number;
  visible: [number, number][];
}

interface PlayerVisibilityCase {
  observerX: number;
  observerY: number;
  targetX: number;
  targetY: number;
  radius: number;
  visible: boolean;
}

interface VisionFixture {
  mapId: string;
  mapWidth: number;
  mapHeight: number;
  mapHash: string;
  seed: number;
  tileVisibility: TileVisibilityCase[];
  playerVisibility: PlayerVisibilityCase[];
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(currentDir, '../../../../packages/platform-contracts/test-fixtures/hide-seek-vision-cases.json');

function loadFixture(): VisionFixture | null {
  try {
    return JSON.parse(readFileSync(fixturePath, 'utf-8')) as VisionFixture;
  } catch {
    return null;
  }
}

/**
 * The fixture only carries the map's id/dimensions/hash (to catch a stale
 * fixture generated from an old map) — not the tile data itself, since that
 * would be a second copy of the map. This loads the real bundled map and
 * checks it actually matches what the fixture was generated from.
 */
function loadRealMapFromFixtureDimensions(loadedFixture: VisionFixture): HideSeekTileGrid {
  const classicRaw = JSON.parse(readFileSync(path.resolve(currentDir, '../data/maps/classic.json'), 'utf-8'));
  if (classicRaw.id !== loadedFixture.mapId || classicRaw.width !== loadedFixture.mapWidth || classicRaw.height !== loadedFixture.mapHeight) {
    throw new Error(
      'hide-seek-vision-cases.json was generated from a different map than classic.json currently is — ' +
      're-run `dotnet test services/retrospective-server.Tests` to regenerate the fixture.',
    );
  }
  return parseTileGrid(classicRaw);
}

const fixture = loadFixture();

describe.skipIf(!fixture)('vision parity against the C# HideSeekVision fixture', () => {
  it('fixture is non-trivial (guards against a silently-empty file passing everything)', () => {
    expect(fixture!.tileVisibility.length).toBeGreaterThan(0);
    expect(fixture!.playerVisibility.length).toBeGreaterThan(0);
  });

  it('matches every tile-visibility scenario exactly', () => {
    const map = loadRealMapFromFixtureDimensions(fixture!);
    for (const scenario of fixture!.tileVisibility) {
      const visible = computeVisibleTiles(map, scenario.originX, scenario.originY, scenario.radius);
      const expected = new Set(scenario.visible.map(([x, y]) => `${x},${y}`));
      const label = `origin=(${scenario.originX},${scenario.originY}) radius=${scenario.radius}`;
      expect(visible.size, label).toBe(expected.size);
      for (const key of expected) {
        expect(visible.has(key), `expected tile ${key} visible for ${label}`).toBe(true);
      }
    }
  });

  it('matches every player-visibility scenario exactly', () => {
    const map = loadRealMapFromFixtureDimensions(fixture!);
    for (const scenario of fixture!.playerVisibility) {
      const actual = isPlayerVisible(
        map,
        { x: scenario.observerX, y: scenario.observerY },
        { x: scenario.targetX, y: scenario.targetY },
        scenario.radius,
      );
      expect(actual, JSON.stringify(scenario)).toBe(scenario.visible);
    }
  });
});

// Keeps this file from silently reporting "no tests" in a fresh checkout
// before `dotnet test services/retrospective-server.Tests` has ever run.
describe.skipIf(Boolean(fixture))('vision parity fixture', () => {
  it('has not been generated yet — run `dotnet test services/retrospective-server.Tests` once', () => {
    expect(fixture).toBeNull();
  });
});
