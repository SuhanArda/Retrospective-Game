import classicRaw from '../data/maps/classic.json';
import { HideSeekConfig } from './config';

export interface TilePoint {
  x: number;
  y: number;
}

/**
 * Everything the renderer and the movement/collision code need — nothing
 * about spawns. A live room's map, as received from the server's
 * `hideAndSeekGameStarted` payload, is exactly this shape; the bundled
 * standalone/dev copy (`HideSeekMap` below) is a superset that adds spawn
 * points, since only the no-server standalone path ever picks its own spawns.
 */
export interface HideSeekTileGrid {
  id: string;
  width: number;
  height: number;
  tileSize: number;
  /** `tiles[y][x]` is 0 (floor) or 1 (wall). */
  tiles: readonly (readonly number[])[];
}

export interface HideSeekTileGridFile {
  id: string;
  width: number;
  height: number;
  tileSize: number;
  /** One '0'/'1' digit string per row. */
  rows: readonly string[];
}

/** The bundled map file's shape — a tile grid file plus spawn points. */
export interface HideSeekMapFile extends HideSeekTileGridFile {
  seekerSpawn: TilePoint;
  hiderSpawns: readonly TilePoint[];
}

/** Parsed, ready-to-query shape for the bundled standalone/dev map. */
export interface HideSeekMap extends HideSeekTileGrid {
  seekerSpawn: TilePoint;
  hiderSpawns: readonly TilePoint[];
}

export function parseTileGrid(file: HideSeekTileGridFile): HideSeekTileGrid {
  if (file.rows.length !== file.height) {
    throw new Error(`hide-and-seek map "${file.id}": expected ${file.height} rows, got ${file.rows.length}`);
  }
  const tiles = file.rows.map((row, y) => {
    if (row.length !== file.width) {
      throw new Error(`hide-and-seek map "${file.id}": row ${y} has length ${row.length}, expected ${file.width}`);
    }
    return Array.from(row, (char) => (char === '1' ? 1 : 0));
  });
  return { id: file.id, width: file.width, height: file.height, tileSize: file.tileSize, tiles };
}

export function parseHideSeekMap(file: HideSeekMapFile): HideSeekMap {
  return { ...parseTileGrid(file), seekerSpawn: file.seekerSpawn, hiderSpawns: file.hiderSpawns };
}

/**
 * Bundled dev/standalone copy. In a live room, the canvas always renders
 * whatever `hideAndSeekGameStarted` sends from the server instead — see the
 * plan's "Harita: repoda tek fiziksel dosya" decision. This import only
 * backs local development (Faz 1-2 had no server at all) and the
 * standalone demo mode for opening the game outside of a room.
 */
export const classicMap: HideSeekMap = parseHideSeekMap(classicRaw as HideSeekMapFile);

export function isWallTile(grid: HideSeekTileGrid, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) return true;
  return grid.tiles[tileY][tileX] === 1;
}

export function worldToTile(grid: HideSeekTileGrid, worldX: number, worldY: number): TilePoint {
  return { x: Math.floor(worldX / grid.tileSize), y: Math.floor(worldY / grid.tileSize) };
}

export function tileCenterToWorld(grid: HideSeekTileGrid, tile: TilePoint): TilePoint {
  return { x: (tile.x + 0.5) * grid.tileSize, y: (tile.y + 0.5) * grid.tileSize };
}

export function mapWorldWidth(grid: HideSeekTileGrid): number {
  return grid.width * grid.tileSize;
}

export function mapWorldHeight(grid: HideSeekTileGrid): number {
  return grid.height * grid.tileSize;
}

/**
 * True if a circular player body of `radius` centered at (worldX, worldY)
 * overlaps no wall tile. Checked as four cardinal probe points rather than a
 * full circle-vs-tile sweep — plenty accurate at this tile size and cheap
 * enough to call twice per axis, every frame, for every player.
 */
export function isWalkable(grid: HideSeekTileGrid, worldX: number, worldY: number, radius: number = HideSeekConfig.PLAYER_RADIUS): boolean {
  const probes: TilePoint[] = [
    { x: worldX - radius, y: worldY },
    { x: worldX + radius, y: worldY },
    { x: worldX, y: worldY - radius },
    { x: worldX, y: worldY + radius },
  ];
  return probes.every((probe) => {
    const tile = worldToTile(grid, probe.x, probe.y);
    return !isWallTile(grid, tile.x, tile.y);
  });
}
