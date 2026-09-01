import { HideSeekConfig } from './config';
import { isWalkable, type HideSeekTileGrid, type TilePoint } from './map';

export interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export function axisFromInput(input: MovementInput): { x: number; y: number } {
  return {
    x: (input.right ? 1 : 0) - (input.left ? 1 : 0),
    y: (input.down ? 1 : 0) - (input.up ? 1 : 0),
  };
}

/**
 * One step of the same axis-separated wall collision the server's
 * `HideSeekGame.Move` runs. Shared by the standalone local-authority path
 * and the online client-side prediction path, so there is exactly one place
 * in this codebase that decides how a step of movement behaves — not two
 * copies that could quietly drift apart from each other (they still have to
 * be kept in step with the server's C# copy by hand, same as the vision
 * algorithm, but at least this file isn't itself duplicated).
 */
export function stepMovement(
  grid: HideSeekTileGrid,
  position: TilePoint & { x: number; y: number },
  input: MovementInput,
  speedPxPerSec: number,
  dtSeconds: number,
  radius: number = HideSeekConfig.PLAYER_RADIUS,
): { x: number; y: number } {
  const axis = axisFromInput(input);
  const length = Math.hypot(axis.x, axis.y);
  if (length === 0) return { x: position.x, y: position.y };

  const distance = speedPxPerSec * dtSeconds;
  const dx = (axis.x / length) * distance;
  const dy = (axis.y / length) * distance;
  let { x, y } = position;
  if (dx !== 0) {
    const nextX = x + dx;
    if (isWalkable(grid, nextX, y, radius)) x = nextX;
  }
  if (dy !== 0) {
    const nextY = y + dy;
    if (isWalkable(grid, x, nextY, radius)) y = nextY;
  }
  return { x, y };
}
