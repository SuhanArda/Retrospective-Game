import { isWallTile, type HideSeekTileGrid, type TilePoint } from './map';

/**
 * Grid-based recursive shadowcasting (symmetric), the classic
 * eight-octant algorithm (Björn Bergström, ported many times over — see
 * RogueBasin's "FOV using recursive shadowcasting"). Pure function of
 * (map, origin, radius); no player state, no rendering.
 *
 * This is the algorithm the server's authoritative `HideSeekVision.cs`
 * (Faz 3) must reproduce tile-for-tile — the parity fixture test compares
 * this file's output against that one's, so **do not** "simplify" the
 * math here without regenerating the fixture from the C# side too.
 */

// Per-octant coordinate transform: (dx, dy) in the algorithm's local octant
// space maps to (originX + dx*xx + dy*xy, originY + dx*yx + dy*yy).
const OCTANT_TRANSFORMS: readonly [xx: number, xy: number, yx: number, yy: number][] = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
  [0, -1, 1, 0],
  [-1, 0, 0, 1],
  [-1, 0, 0, -1],
  [0, -1, -1, 0],
  [0, 1, -1, 0],
  [1, 0, 0, -1],
];

function castLight(
  map: HideSeekTileGrid,
  originX: number,
  originY: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  xx: number,
  xy: number,
  yx: number,
  yy: number,
  onVisible: (x: number, y: number) => void,
): void {
  if (startSlope < endSlope) return;

  let nextStartSlope = startSlope;
  for (let distance = row; distance <= radius; distance++) {
    let dx = -distance - 1;
    const dy = -distance;
    let blocked = false;
    let newStart = 0;

    while (dx <= 0) {
      dx += 1;
      const mapX = originX + dx * xx + dy * xy;
      const mapY = originY + dx * yx + dy * yy;
      const leftSlope = (dx - 0.5) / (dy + 0.5);
      const rightSlope = (dx + 0.5) / (dy - 0.5);

      if (nextStartSlope < rightSlope) continue;
      if (endSlope > leftSlope) break;

      if (dx * dx + dy * dy <= radius * radius) {
        onVisible(mapX, mapY);
      }

      if (blocked) {
        if (isWallTile(map, mapX, mapY)) {
          newStart = rightSlope;
          continue;
        }
        blocked = false;
        nextStartSlope = newStart;
      } else if (isWallTile(map, mapX, mapY) && distance < radius) {
        blocked = true;
        castLight(map, originX, originY, distance + 1, nextStartSlope, leftSlope, radius, xx, xy, yx, yy, onVisible);
        newStart = rightSlope;
      }
    }

    if (blocked) break;
  }
}

/**
 * Every tile within `radiusTiles` of (originX, originY) that isn't behind a
 * wall, as `"x,y"` keys (always includes the origin tile itself). Tile
 * coordinates, not world/pixel coordinates.
 */
export function computeVisibleTiles(map: HideSeekTileGrid, originX: number, originY: number, radiusTiles: number): Set<string> {
  const visible = new Set<string>();
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
    visible.add(`${x},${y}`);
  };
  mark(originX, originY);
  for (const [xx, xy, yx, yy] of OCTANT_TRANSFORMS) {
    castLight(map, originX, originY, 1, 1.0, 0.0, radiusTiles, xx, xy, yx, yy, mark);
  }
  return visible;
}

export function isTileKeyVisible(visibleTiles: ReadonlySet<string>, x: number, y: number): boolean {
  return visibleTiles.has(`${x},${y}`);
}

/**
 * Bresenham's line algorithm between two tile centers, used only for
 * player-to-player visibility (never for the tile fog above — that's
 * `computeVisibleTiles`'s job). Returns every tile the straight line from
 * `from` to `to` passes through, `from` and `to` both included.
 */
export function bresenhamLine(from: TilePoint, to: TilePoint): TilePoint[] {
  const points: TilePoint[] = [];
  let x0 = from.x;
  let y0 = from.y;
  const dx = Math.abs(to.x - x0);
  const dy = -Math.abs(to.y - y0);
  const sx = x0 < to.x ? 1 : -1;
  const sy = y0 < to.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    points.push({ x: x0, y: y0 });
    if (x0 === to.x && y0 === to.y) break;
    const doubledErr = 2 * err;
    if (doubledErr >= dy) { err += dy; x0 += sx; }
    if (doubledErr <= dx) { err += dx; y0 += sy; }
  }
  return points;
}

/** True if no tile strictly between `from` and `to` (both endpoints excluded) is a wall. */
export function hasClearLineOfSight(map: HideSeekTileGrid, from: TilePoint, to: TilePoint): boolean {
  const line = bresenhamLine(from, to);
  for (let index = 1; index < line.length - 1; index++) {
    const point = line[index];
    if (isWallTile(map, point.x, point.y)) return false;
  }
  return true;
}

/**
 * Whether `target` is visible to an observer standing at `observer`:
 * within `radiusTiles` (Euclidean, tile units) *and* an unobstructed
 * straight line between the two tile centers. This is the rule the spec
 * gives for player-to-player visibility specifically — deliberately not
 * the same code path as `computeVisibleTiles`'s tile fog, even though in
 * practice the two mostly agree.
 */
export function isPlayerVisible(map: HideSeekTileGrid, observer: TilePoint, target: TilePoint, radiusTiles: number): boolean {
  const dx = target.x - observer.x;
  const dy = target.y - observer.y;
  if (Math.hypot(dx, dy) > radiusTiles) return false;
  return hasClearLineOfSight(map, observer, target);
}
