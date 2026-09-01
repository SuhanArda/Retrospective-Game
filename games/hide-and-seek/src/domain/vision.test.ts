import { describe, expect, it } from 'vitest';
import { parseHideSeekMap, type HideSeekMapFile } from './map';
import { bresenhamLine, computeVisibleTiles, hasClearLineOfSight, isPlayerVisible, isTileKeyVisible } from './vision';

function buildMap(rows: readonly string[]): ReturnType<typeof parseHideSeekMap> {
  const file: HideSeekMapFile = {
    id: 'test',
    width: rows[0].length,
    height: rows.length,
    tileSize: 32,
    rows,
    seekerSpawn: { x: 0, y: 0 },
    hiderSpawns: [{ x: 0, y: 0 }],
  };
  return parseHideSeekMap(file);
}

describe('computeVisibleTiles', () => {
  it('sees every tile within radius in an open room', () => {
    const map = buildMap([
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
    ]);
    const visible = computeVisibleTiles(map, 4, 4, 3);
    // Straight cardinal neighbors within radius 3 are visible.
    expect(isTileKeyVisible(visible, 4, 4)).toBe(true);
    expect(isTileKeyVisible(visible, 4, 7)).toBe(true); // distance 3, due south
    expect(isTileKeyVisible(visible, 7, 4)).toBe(true); // distance 3, due east
    // Distance 4 is out of a radius-3 circle.
    expect(isTileKeyVisible(visible, 4, 8)).toBe(false);
    expect(isTileKeyVisible(visible, 8, 4)).toBe(false);
  });

  it('does not see past a wall directly in the line of sight', () => {
    const map = buildMap([
      '000000000',
      '000000000',
      '000000000',
      '000000000',
      '000010000',
      '000000000',
      '000000000',
      '000000000',
      '000000000',
    ]);
    // Row 4 is "0000" + "1" + "0000" — a single wall tile at (4,4), origin at (4,4)? use origin left of wall.
    const visible = computeVisibleTiles(map, 2, 4, 5);
    expect(isTileKeyVisible(visible, 3, 4)).toBe(true); // right in front, still visible
    expect(isTileKeyVisible(visible, 4, 4)).toBe(true); // the wall tile itself is visible (you can see a wall's face)
    expect(isTileKeyVisible(visible, 5, 4)).toBe(false); // directly behind the wall, blocked
    expect(isTileKeyVisible(visible, 6, 4)).toBe(false); // further behind, still blocked
  });

  it('does not see around a corner into a side room it does not have a sightline into', () => {
    const map = buildMap([
      '111111111',
      '100000001',
      '101111101',
      '101000101',
      '101000101',
      '101000101',
      '101111101',
      '100000001',
      '111111111',
    ]);
    // Origin in the open outer ring (top-left arm), the walled-off inner
    // room (rows 3-5, cols 3-5) has no doorway in this map, so none of its
    // floor tiles should ever be visible regardless of radius.
    const visible = computeVisibleTiles(map, 1, 1, 8);
    expect(isTileKeyVisible(visible, 4, 4)).toBe(false);
    expect(isTileKeyVisible(visible, 3, 3)).toBe(false);
  });

  it('is symmetric: if A sees B, B sees A, for tile-to-tile shadowcasting in an open room', () => {
    const map = buildMap([
      '00000',
      '00000',
      '01000',
      '00000',
      '00000',
    ]);
    const fromCorner = computeVisibleTiles(map, 0, 0, 6);
    const fromOpposite = computeVisibleTiles(map, 4, 4, 6);
    expect(isTileKeyVisible(fromCorner, 4, 4)).toBe(isTileKeyVisible(fromOpposite, 0, 0));
  });
});

describe('bresenhamLine / hasClearLineOfSight', () => {
  it('includes both endpoints', () => {
    const line = bresenhamLine({ x: 0, y: 0 }, { x: 3, y: 0 });
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line[line.length - 1]).toEqual({ x: 3, y: 0 });
  });

  it('reports blocked when a wall sits between the two points', () => {
    const map = buildMap([
      '00000',
      '00100',
      '00000',
    ]);
    expect(hasClearLineOfSight(map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(false);
  });

  it('reports clear when nothing sits between the two points', () => {
    const map = buildMap([
      '00000',
      '00000',
      '00000',
    ]);
    expect(hasClearLineOfSight(map, { x: 0, y: 1 }, { x: 4, y: 1 })).toBe(true);
  });
});

describe('isPlayerVisible', () => {
  const map = buildMap([
    '00000',
    '00100',
    '00000',
  ]);

  it('is false beyond the vision radius even with a clear line', () => {
    expect(isPlayerVisible(map, { x: 0, y: 0 }, { x: 4, y: 0 }, 2)) .toBe(false);
  });

  it('is true within radius with a clear line', () => {
    expect(isPlayerVisible(map, { x: 0, y: 0 }, { x: 2, y: 0 }, 4)).toBe(true);
  });

  it('is false within radius when a wall blocks the line', () => {
    expect(isPlayerVisible(map, { x: 0, y: 1 }, { x: 4, y: 1 }, 4)).toBe(false);
  });
});
